package com.psych.terminal.hw

import android.content.Context
import android.graphics.SurfaceTexture
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CameraMetadata
import android.hardware.camera2.CaptureRequest
import android.hardware.camera2.params.StreamConfigurationMap
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.util.Range
import android.view.Surface
import com.psych.terminal.core.CameraCandidate
import com.psych.terminal.core.CameraSelector

/**
 * Camera2 引擎：枚举（含 RGB/IR 判别数据）、预览与录制会话管理。
 *
 * - 预览与录制共用同一 CameraDevice；录制时把 MediaCodec 输入 Surface
 *   一起加进 capture session（预览 Surface + 编码 Surface 双输出）。
 * - 只使用 RGB 彩色摄像头，绝不误选 IR 灰度（由 CameraSelector 保证，失败则要求手动指定）。
 * - 不申请/使用麦克风，无音频轨。
 */
class CameraEngine(context: Context) {

    interface Listener {
        fun onPreviewReady(cameraId: String, width: Int, height: Int, fpsMin: Int, fpsMax: Int)
        fun onSessionUpdated(recording: Boolean)
        fun onError(message: String)
    }

    private val appContext = context.applicationContext
    private val cameraManager = appContext.getSystemService(Context.CAMERA_SERVICE) as CameraManager
    private val mainHandler = Handler(Looper.getMainLooper())

    private var thread: HandlerThread? = null
    private var handler: Handler? = null
    private var device: CameraDevice? = null
    private var session: CameraCaptureSession? = null
    private var previewSurface: Surface? = null
    private var analysisSurface: Surface? = null
    private var encoderSurface: Surface? = null
    private var chosenFps: Pair<Int, Int> = 15 to 30

    var listener: Listener? = null

    // —— 枚举与 RGB/IR 判别数据 ——

    fun enumerate(): List<CameraCandidate> {
        val list = mutableListOf<CameraCandidate>()
        for (id in cameraManager.cameraIdList) {
            val cs = cameraManager.getCameraCharacteristics(id)
            val facing = cs.get(CameraCharacteristics.LENS_FACING) ?: CameraSelector.FACING_BACK
            // 单色/IR 传感器判别：REQUEST_AVAILABLE_CAPABILITIES 含 MONOCHROME（API 24+）
            val caps = cs.get(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES)
            val isMono = caps != null && caps.contains(CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_MONOCHROME)
            val map = cs.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP) as? StreamConfigurationMap
            val sizes = (map?.getOutputSizes(SurfaceTexture::class.java) ?: emptyArray())
                .map { it.width to it.height }
                .filter { it.first in 1..4096 && it.second in 1..4096 }
            val fps = (cs.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES) ?: emptyArray())
                .map { it.lower to it.upper }
            val level = cs.get(CameraCharacteristics.INFO_SUPPORTED_HARDWARE_LEVEL) ?: 0
            val pix = cs.get(CameraCharacteristics.SENSOR_INFO_PIXEL_ARRAY_SIZE)
            val sensorRes = pix?.let { "${it.width}x${it.height}" }
            list.add(
                CameraCandidate(
                    id = id,
                    facing = facing,
                    isMonoOrIr = isMono,
                    sizes = sizes,
                    fpsRanges = fps,
                    hardwareLevel = level,
                    sensorResolution = sensorRes,
                )
            )
        }
        return list
    }

    // —— 打开 / 预览 / 录制 ——

    fun startPreview(cameraId: String, surface: Surface?, size: Pair<Int, Int>, fps: Pair<Int, Int>) {
        closeDevice()
        previewSurface = surface
        chosenFps = fps
        if (thread == null) {
            val t = HandlerThread("cam-bg").also { it.start() }
            thread = t
            handler = Handler(t.looper)
        }
        try {
            cameraManager.openCamera(cameraId, object : CameraDevice.StateCallback() {
                override fun onOpened(camera: CameraDevice) {
                    device = camera
                    rebuildSession(recording = false) {
                        listener?.onPreviewReady(cameraId, size.first, size.second, fps.first, fps.second)
                    }
                }

                override fun onDisconnected(camera: CameraDevice) {
                    camera.close()
                    if (device === camera) device = null
                }

                override fun onError(camera: CameraDevice, error: Int) {
                    camera.close()
                    if (device === camera) device = null
                    listener?.onError("摄像头打开失败 code=$error (cameraId=$cameraId)")
                }
            }, handler)
        } catch (e: SecurityException) {
            listener?.onError("缺少 CAMERA 权限: ${e.message}")
        } catch (e: Exception) {
            listener?.onError("摄像头打开异常: ${e.message}")
        }
    }

    /** 录制：把编码器输入 Surface 加入会话（预览+编码双输出） */
    fun startRecording(encoder: Surface) {
        encoderSurface = encoder
        rebuildSession(recording = true)
    }

    /** 停止录制：移除编码 Surface，回到纯预览 */
    fun stopRecording() {
        encoderSurface = null
        rebuildSession(recording = false)
    }

    fun setPreviewSurface(surface: Surface?) {
        previewSurface = surface
    }

    fun setAnalysisSurface(surface: Surface?) {
        analysisSurface = surface
    }

    private fun rebuildSession(recording: Boolean, onReady: (() -> Unit)? = null) {
        val camera = device ?: run {
            listener?.onError("相机未打开，无法配置会话")
            return
        }
        val h = handler ?: return
        val targets = mutableListOf<Surface>()
        previewSurface?.let { targets.add(it) }
        analysisSurface?.let { targets.add(it) }
        encoderSurface?.let { targets.add(it) }
        if (targets.isEmpty()) {
            listener?.onError("无可用输出 Surface（预览与编码均缺失）")
            return
        }
        runCatching { session?.close() }
        session = null
        try {
            camera.createCaptureSession(
                targets,
                object : CameraCaptureSession.StateCallback() {
                    override fun onConfigured(s: CameraCaptureSession) {
                        session = s
                        startRepeating(camera, s, targets)
                        listener?.onSessionUpdated(recording)
                        onReady?.invoke()
                    }

                    override fun onConfigureFailed(s: CameraCaptureSession) {
                        listener?.onError("会话配置失败（targets=${targets.size} recording=$recording）")
                    }
                },
                h,
            )
        } catch (e: Exception) {
            listener?.onError("创建会话异常: ${e.message}")
        }
    }

    private fun startRepeating(camera: CameraDevice, s: CameraCaptureSession, targets: List<Surface>) {
        try {
            val builder = camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW)
            targets.forEach { builder.addTarget(it) }
            builder.set(
                CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE,
                Range(chosenFps.first, chosenFps.second),
            )
            s.setRepeatingRequest(builder.build(), null, handler)
        } catch (e: Exception) {
            listener?.onError("启动取流失败: ${e.message}")
        }
    }

    private fun closeDevice() {
        runCatching { session?.close() }
        session = null
        runCatching { device?.close() }
        device = null
        encoderSurface = null
    }

    fun release() {
        closeDevice()
        previewSurface = null
        thread?.quitSafely()
        thread = null
        handler = null
    }

    companion object {
        /** Camera2 文档：COLOR_FILTER_ARRAY 0 = MONO（IR/灰度传感器） */
        const val CFA_MONO = 0
    }
}
