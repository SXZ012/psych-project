package com.psych.terminal.hw

import android.media.MediaCodec
import android.media.MediaCodecList
import android.media.MediaFormat
import android.media.MediaMuxer
import android.view.Surface
import com.psych.terminal.core.CodecSelector
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/**
 * H.264 硬编码 + MP4 封装（无音频轨）。
 *
 * - 优先选择硬件 AVC 编码器（RK3568: OMX.rk.video_encoder.avc / c2.rk.avc.encoder）；
 *   只剩 Google 软件编码器时明确返回失败，不冒充硬编成功。
 * - MediaCodec 输入使用 Surface（COLOR_FormatSurface），供 Camera2 直接写入。
 * - MediaMuxer 输出 MPEG_4，仅一路视频轨，不创建音频轨。
 */
class H264Recorder {

    data class StartResult(
        val ok: Boolean,
        val inputSurface: Surface? = null,
        val codecName: String? = null,
        val isHardware: Boolean = false,
        val error: String? = null,
    )

    data class StopResult(
        val ok: Boolean,
        val filePath: String? = null,
        val fileSizeBytes: Long = 0,
        val durationMs: Long = 0,
        val error: String? = null,
    )

    companion object {
        const val MIME = MediaFormat.MIMETYPE_VIDEO_AVC   // "video/avc"
        const val TARGET_BITRATE = 5_000_000              // 5Mbps（建议区间 4~6Mbps）
        const val IFRAME_INTERVAL_SEC = 1f                // I帧间隔 1~2s
    }

    // —— 运行态（每次录制重建）——
    private var codec: MediaCodec? = null
    private var muxer: MediaMuxer? = null
    private var outputFile: File? = null
    private var startedAtMs = 0L
    private var videoTrack = -1
    private val stopping = AtomicBoolean(false)
    private val muxerStarted = AtomicBoolean(false)
    private val sawEos = AtomicBoolean(false)
    private val drainError = AtomicReference<String?>(null)
    private val drainDone = AtomicReference(CountDownLatch(1))

    /** 列出设备上支持 AVC 编码的编码器名（供选择与诊断） */
    fun availableEncoderNames(): List<String> {
        val list = MediaCodecList(MediaCodecList.REGULAR_CODECS)
        return list.codecInfos
            .filter { it.isEncoder && it.supportedTypes.any { t -> t.equals(MIME, true) } }
            .map { it.name }
    }

    fun start(outputFile: File, width: Int, height: Int, fps: Int, bitrate: Int = TARGET_BITRATE): StartResult {
        if (codec != null) return StartResult(false, error = "编码器已在运行，拒绝重复 start")

        val choice = CodecSelector.select(availableEncoderNames())
        if (!choice.isHardware || choice.name == null) {
            return StartResult(false, codecName = choice.name, isHardware = false, error = choice.reason)
        }
        return try {
            val c = MediaCodec.createByCodecName(choice.name)
            val fmt = MediaFormat.createVideoFormat(MIME, width, height).apply {
                setInteger(
                    MediaFormat.KEY_COLOR_FORMAT,
                    android.media.MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface,
                )
                setInteger(MediaFormat.KEY_BIT_RATE, bitrate)
                setInteger(MediaFormat.KEY_FRAME_RATE, fps)
                setFloat(MediaFormat.KEY_I_FRAME_INTERVAL, IFRAME_INTERVAL_SEC)
            }
            c.configure(fmt, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            val surface = c.createInputSurface()
            c.start()
            val m = MediaMuxer(outputFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)

            codec = c
            muxer = m
            this.outputFile = outputFile
            videoTrack = -1
            stopping.set(false)
            muxerStarted.set(false)
            sawEos.set(false)
            drainError.set(null)
            startedAtMs = System.currentTimeMillis()
            drainDone.set(CountDownLatch(1))
            startDrain(c, m)

            StartResult(ok = true, inputSurface = surface, codecName = choice.name, isHardware = true)
        } catch (e: Exception) {
            runCatching { codec?.stop() }
            runCatching { codec?.release() }
            runCatching { muxer?.release() }
            codec = null
            muxer = null
            StartResult(false, codecName = choice.name, isHardware = false, error = "编码器启动失败: ${e.message}")
        }
    }

    private fun startDrain(c: MediaCodec, m: MediaMuxer) {
        Thread({
            val info = MediaCodec.BufferInfo()
            try {
                while (true) {
                    val idx = c.dequeueOutputBuffer(info, 10_000)
                    if (idx == MediaCodec.INFO_TRY_AGAIN_LATER) continue
                    if (idx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                        // 必须先收到输出格式，再启动 muxer
                        videoTrack = m.addTrack(c.outputFormat)
                        m.start()
                        muxerStarted.set(true)
                        continue
                    }
                    if (idx >= 0) {
                        val buf = c.getOutputBuffer(idx)
                        if (buf != null && info.size > 0 &&
                            info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG == 0
                        ) {
                            buf.position(info.offset)
                            buf.limit(info.offset + info.size)
                            if (muxerStarted.get()) m.writeSampleData(videoTrack, buf, info)
                        }
                        c.releaseOutputBuffer(idx, false)
                        if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) break
                    }
                }
            } catch (e: Exception) {
                drainError.set("编码drain异常: ${e.message}")
            } finally {
                runCatching { if (muxerStarted.get()) m.stop() }
                runCatching { m.release() }
                runCatching { c.stop() }
                runCatching { c.release() }
                drainDone.get().countDown()
            }
        }, "h264-drain").start()
    }

    /** 发送 EOS 并等待封装完成。线程安全，可与 start 不同线程调用。 */
    fun stop(): StopResult {
        val c = codec ?: return StopResult(ok = false, error = "编码器未在运行")
        val file = outputFile
        val startMs = startedAtMs
        val eosErr = try {
            c.signalEndOfInputStream()
            null
        } catch (e: Exception) {
            "发送EOS失败: ${e.message}"
        }
        stopping.set(true)
        val finished = drainDone.get().await(10, TimeUnit.SECONDS)
        codec = null
        muxer = null
        outputFile = null
        val duration = System.currentTimeMillis() - startMs
        val drainErrMsg = drainError.get()
        if (!finished) {
            runCatching { c.stop() }
            runCatching { c.release() }
            return StopResult(false, error = "封装超时未完成${eosErr?.let { "；$it" } ?: ""}")
        }
        if (drainErrMsg != null) {
            return StopResult(false, filePath = file?.absolutePath, durationMs = duration, error = drainErrMsg)
        }
        if (file == null || !file.exists()) {
            return StopResult(false, durationMs = duration, error = "输出文件不存在")
        }
        return StopResult(true, filePath = file.absolutePath, fileSizeBytes = file.length(), durationMs = duration)
    }
}
