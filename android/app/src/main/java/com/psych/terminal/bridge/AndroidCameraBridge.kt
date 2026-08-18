package com.psych.terminal.bridge

import android.content.Context
import android.net.Uri
import android.webkit.JavascriptInterface
import android.view.Surface
import com.psych.terminal.AppSettings
import com.psych.terminal.BuildConfig
import com.psych.terminal.core.CameraCandidate
import com.psych.terminal.core.CameraSelector
import com.psych.terminal.hw.CameraEngine
import com.psych.terminal.hw.H264Recorder
import com.psych.terminal.net.AssessmentUploader
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.atomic.AtomicReference

/**
 * JavaScript Bridge：网页通过 window.AndroidCamera.* 调用原生采集/编码/上传。
 *
 * - 安全：敏感方法先做来源校验——仅当 WebView 当前页面 host 与配置的 BASE_URL host
 *   一致时放行，外部页面无法调用原生接口。
 * - 防重：状态机 IDLE→PREVIEWING→RECORDING→STOPPING→READY→UPLOADING→UPLOADED，
 *   重复 start/stop/submit 一律拒绝。
 * - 异步操作通过 evaluateJavascript 调用网页传入的回调函数名通知结果。
 * - MP4 始终留在应用私有目录，原生负责 multipart 上传，不转 Base64。
 * - 音频：playIntroAudio/playOutroAudio/stopPromptAudio 仅预留（not_configured），
 *   本轮不实现、不加载任何音频文件、不申请 RECORD_AUDIO。
 */
class AndroidCameraBridge(
    private val context: Context,
    private val engine: CameraEngine,
    private val recorder: H264Recorder,
    private val postJs: (String) -> Unit,
    private val currentUrl: () -> String?,
    private val previewSurfaceProvider: () -> Surface?,
    private val previewLayoutSetter: (visible: Boolean, leftPct: Double, topPct: Double, widthPct: Double, heightPct: Double) -> Unit,
    private val hasCameraPermission: () -> Boolean,
) {

    enum class State { IDLE, PREVIEWING, RECORDING, STOPPING, READY, UPLOADING, UPLOADED }

    private val state = AtomicReference(State.IDLE)

    // 选择结果缓存
    private var candidates: List<CameraCandidate> = emptyList()
    private var selectedChoice: CameraSelector.Choice? = null
    private var chosenSize: CameraSelector.SizeChoice? = null
    private var chosenFps: Pair<Int, Int>? = null

    // 诊断信息（最近一次录制）
    private var pendingFile: File? = null
    private var diagCodecName: String? = null
    private var diagIsHardware = false
    private var diagBitrate = H264Recorder.TARGET_BITRATE
    private var recStartMs = 0L
    private var recStopMs = 0L
    private var lastError: String? = null
    private var uploadedId: String? = null

    private var pendingPreviewCb: String? = null

    init {
        engine.listener = object : CameraEngine.Listener {
            override fun onPreviewReady(cameraId: String, width: Int, height: Int, fpsMin: Int, fpsMax: Int) {
                state.set(State.PREVIEWING)
                val cb = pendingPreviewCb
                pendingPreviewCb = null
                fire(
                    cb,
                    JSONObject()
                        .put("ok", true)
                        .put("cameraId", cameraId)
                        .put("width", width)
                        .put("height", height)
                        .put("fpsMin", fpsMin)
                        .put("fpsMax", fpsMax),
                )
            }

            override fun onSessionUpdated(recording: Boolean) {
                // 会话重建（录制开始/停止）在各自流程中回调，这里仅记录
            }

            override fun onError(message: String) {
                lastError = message
                val cb = pendingPreviewCb
                if (cb != null) {
                    pendingPreviewCb = null
                    fire(cb, JSONObject().put("ok", false).put("error", message))
                }
            }
        }
    }

    // ================== 基础 ==================

    @JavascriptInterface
    fun isAvailable(): String = JSONObject()
        .put("available", true)
        .put("mode", "hybrid")
        .put("appVersion", BuildConfig.VERSION_NAME)
        .toString()

    // ================== 摄像头能力 ==================

    @JavascriptInterface
    fun getCameraCapabilities(): String {
        if (!ensureSelection()) {
            return JSONObject().put("ok", false).put("error", lastError ?: "摄像头枚举失败").toString()
        }
        val sel = selectedChoice!!
        val size = chosenSize!!
        val fps = chosenFps!!
        val arr = JSONArray()
        candidates.forEach { c ->
            arr.put(
                JSONObject()
                    .put("cameraId", c.id)
                    .put(
                        "facing",
                        when (c.facing) {
                            CameraSelector.FACING_FRONT -> "front"
                            CameraSelector.FACING_BACK -> "back"
                            else -> "external"
                        },
                    )
                    .put("isMonoOrIr", c.isMonoOrIr)
                    .put("supports1080p", c.supports1080p)
                    .put("sensorResolution", c.sensorResolution ?: "")
                    .put("sizes", JSONArray(c.sizes.take(12).map { "${it.first}x${it.second}" })),
            )
        }
        return JSONObject()
            .put("ok", true)
            .put("candidates", arr)
            .put(
                "selected",
                JSONObject()
                    .put("cameraId", sel.cameraId ?: "")
                    .put("reason", sel.reason)
                    .put("ambiguous", sel.ambiguous),
            )
            .put(
                "size",
                JSONObject()
                    .put("width", size.size?.first ?: 0)
                    .put("height", size.size?.second ?: 0)
                    .put("degraded", size.degraded)
                    .put("note", size.note),
            )
            .put("fps", JSONArray(listOf(fps.first, fps.second)))
            .toString()
    }

    // ================== 预览 ==================

    @JavascriptInterface
    fun startPreview(callback: String) {
        if (!guard(callback)) return
        if (!hasCameraPermission()) {
            fire(callback, err("缺少 CAMERA 权限，请在系统设置授予"))
            return
        }
        val s = state.get()
        if (s == State.RECORDING || s == State.STOPPING) {
            fire(callback, err("录制中不允许重新开预览"))
            return
        }
        if (!ensureSelection()) {
            fire(callback, err(lastError ?: "无法选择摄像头"))
            return
        }
        val cameraId = selectedChoice!!.cameraId ?: run {
            fire(callback, err("摄像头选择不明确：${selectedChoice!!.reason}，请到调试设置手动指定 cameraId"))
            return
        }
        val size = chosenSize!!.size ?: run {
            fire(callback, err("无可用分辨率"))
            return
        }
        pendingPreviewCb = callback
        state.set(State.IDLE)
        engine.startPreview(cameraId, previewSurfaceProvider(), size, chosenFps!!)
    }

    @JavascriptInterface
    fun stopPreview(callback: String) {
        if (!guard(callback)) return
        val s = state.get()
        if (s == State.RECORDING || s == State.STOPPING) {
            fire(callback, err("录制中不允许停止预览"))
            return
        }
        pendingPreviewCb = null
        engine.stopRecording() // 幂等：清掉可能残留的编码 Surface
        engine.release()
        state.set(State.IDLE)
        fire(callback, JSONObject().put("ok", true))
    }

    // ================== 录制 ==================

    @JavascriptInterface
    fun startRecording(callback: String) {
        if (!guard(callback)) return
        if (!state.compareAndSet(State.PREVIEWING, State.RECORDING)) {
            fire(callback, err("当前状态 ${state.get()} 不允许开始录制（需先 startPreview，且不可重复开始）"))
            return
        }
        val size = chosenSize?.size
        val fps = chosenFps
        if (size == null || fps == null) {
            state.set(State.PREVIEWING)
            fire(callback, err("缺少分辨率/帧率信息"))
            return
        }
        val file = File(videoDir(), "assessment_${System.currentTimeMillis()}.mp4")
        val start = recorder.start(file, size.first, size.second, fps.second, diagBitrate)
        if (!start.ok) {
            state.set(State.PREVIEWING)
            lastError = start.error
            fire(callback, err(start.error ?: "编码器启动失败"))
            return
        }
        diagCodecName = start.codecName
        diagIsHardware = start.isHardware
        recStartMs = System.currentTimeMillis()
        recStopMs = 0
        uploadedId = null
        engine.startRecording(start.inputSurface!!)
        fire(
            callback,
            JSONObject()
                .put("ok", true)
                .put("codecName", start.codecName)
                .put("isHardware", start.isHardware)
                .put("bitrate", diagBitrate)
                .put("width", size.first)
                .put("height", size.second)
                .put("fps", fps.second),
        )
    }

    @JavascriptInterface
    fun stopRecording(callback: String) {
        if (!guard(callback)) return
        if (!state.compareAndSet(State.RECORDING, State.STOPPING)) {
            fire(callback, err("当前状态 ${state.get()} 不允许停止录制（未在录制或正在停止）"))
            return
        }
        Thread {
            engine.stopRecording()   // 先停取流，再发 EOS 并等封装完成
            val r = recorder.stop()
            recStopMs = System.currentTimeMillis()
            if (r.ok) {
                pendingFile = File(r.filePath!!)
                state.set(State.READY)
                postResult(callback) {
                    JSONObject()
                        .put("ok", true)
                        .put("filePath", r.filePath)
                        .put("fileSizeBytes", r.fileSizeBytes)
                        .put("durationMs", r.durationMs)
                }
            } else {
                lastError = r.error
                state.set(State.PREVIEWING)
                postResult(callback) { err(r.error ?: "录制失败") }
            }
        }.start()
    }

    @JavascriptInterface
    fun getRecordingStatus(): String {
        val size = chosenSize?.size
        val fps = chosenFps
        return JSONObject()
            .put("state", state.get().name.lowercase())
            .put("cameraId", selectedChoice?.cameraId ?: "")
            .put("selectionReason", selectedChoice?.reason ?: "")
            .put("width", size?.first ?: 0)
            .put("height", size?.second ?: 0)
            .put("fps", fps?.second ?: 0)
            .put("codecName", diagCodecName ?: "")
            .put("isHardware", diagIsHardware)
            .put("bitrate", diagBitrate)
            .put("startedAtMs", recStartMs)
            .put("stoppedAtMs", recStopMs)
            .put(
                "durationMs",
                if (recStartMs > 0) (if (recStopMs > 0) recStopMs else System.currentTimeMillis()) - recStartMs else 0,
            )
            .put("fileSizeBytes", pendingFile?.length() ?: 0)
            .put("filePath", pendingFile?.absolutePath ?: "")
            .put("lastError", lastError ?: "")
            .put("uploadedAssessmentId", uploadedId ?: "")
            .toString()
    }

    // ================== 上传（复用现有 /submit） ==================

    @JavascriptInterface
    fun submitAssessment(payloadJson: String, callback: String) {
        if (!guard(callback)) return
        if (!state.compareAndSet(State.READY, State.UPLOADING)) {
            fire(callback, err("当前状态 ${state.get()} 不允许提交（需先完成 stopRecording，且不可重复提交）"))
            return
        }
        val file = pendingFile
        if (file == null || !file.exists()) {
            state.set(State.READY)
            fire(callback, err("没有待上传的 MP4（可能尚未录制或已被清理）"))
            return
        }
        val baseUrl = AppSettings.getBaseUrl(context)
        if (baseUrl == null) {
            state.set(State.READY)
            fire(callback, err("BASE_URL 未配置，请到调试设置填写后端地址"))
            return
        }
        val payload = try {
            JSONObject(payloadJson)
        } catch (e: Exception) {
            state.set(State.READY)
            fire(callback, err("payload 不是有效 JSON: ${e.message}"))
            return
        }
        val name = payload.optString("name", "").trim()
        if (name.isEmpty()) {
            state.set(State.READY)
            fire(callback, err("payload.name 不能为空（后端必填）"))
            return
        }
        val idCard = payload.optString("id_card", "")
        val selections = payload.optJSONArray("selections") ?: JSONArray()
        val duration = payload.optInt("duration_seconds", 60)

        Thread {
            val r = AssessmentUploader.submit(
                baseUrl = baseUrl,
                name = name,
                idCard = idCard,
                selectionsJson = selections.toString(),
                durationSeconds = duration,
                videoFile = file,
            )
            if (r.ok) {
                uploadedId = r.assessmentId
                pendingFile = null
                // 上传成功后清理本地 MP4；失败一律保留以便重试/审计
                runCatching { file.delete() }
                state.set(State.UPLOADED)
                postResult(callback) {
                    JSONObject()
                        .put("ok", true)
                        .put("assessment_id", r.assessmentId ?: "")
                        .put("httpCode", r.httpCode)
                }
            } else {
                lastError = r.error
                state.set(State.READY) // 文件保留，可重试
                postResult(callback) {
                    JSONObject()
                        .put("ok", false)
                        .put("error", r.error ?: "上传失败")
                        .put("httpCode", r.httpCode)
                }
            }
        }.start()
    }

    // ================== 预览层布局（显示/隐藏/区域，百分比） ==================

    @JavascriptInterface
    fun setPreviewLayout(visible: Boolean, leftPct: Double, topPct: Double, widthPct: Double, heightPct: Double) {
        previewLayoutSetter(
            visible,
            leftPct.coerceIn(0.0, 100.0),
            topPct.coerceIn(0.0, 100.0),
            widthPct.coerceIn(0.0, 100.0),
            heightPct.coerceIn(0.0, 100.0),
        )
    }

    // ================== 音频接口：仅预留，本轮不实现 ==================

    @JavascriptInterface
    fun playIntroAudio(): String = audioNotConfigured()

    @JavascriptInterface
    fun playOutroAudio(): String = audioNotConfigured()

    @JavascriptInterface
    fun stopPromptAudio(): String = audioNotConfigured()

    private fun audioNotConfigured(): String = JSONObject()
        .put("status", "not_configured")
        .put("note", "音频播放将在混合APK硬编码验证完成后单独实施（不使用 speechSynthesis，不申请 RECORD_AUDIO）")
        .toString()

    // ================== 生命周期 ==================

    /** Activity.onPause：录制中保持会话；否则释放相机 */
    fun onHostPause() {
        if (state.get() != State.RECORDING && state.get() != State.STOPPING) {
            engine.release()
        }
    }

    /** Activity.onResume：若页面要求预览（状态 PREVIEWING），静默恢复 */
    fun onHostResume() {
        if (state.get() == State.PREVIEWING && hasCameraPermission()) {
            val cameraId = selectedChoice?.cameraId ?: return
            val size = chosenSize?.size ?: return
            engine.startPreview(cameraId, previewSurfaceProvider(), size, chosenFps ?: (15 to 30))
        }
    }

    fun release() {
        engine.release()
        state.set(State.IDLE)
    }

    // ================== 内部 ==================

    /** 枚举并选择（自动 + Debug 手动覆盖）。失败写 lastError。 */
    private fun ensureSelection(): Boolean {
        if (selectedChoice?.ambiguous == false && candidates.isNotEmpty()) return true
        return try {
            candidates = engine.enumerate()
            val manual = AppSettings.getCameraId(context)
            val choice = CameraSelector.select(candidates, manual)
            selectedChoice = choice
            val target = candidates.firstOrNull { it.id == choice.cameraId }
            if (target == null) {
                lastError = choice.reason
                false
            } else {
                chosenSize = CameraSelector.pickSize(target.sizes)
                chosenFps = CameraSelector.pickFps(target.fpsRanges) ?: (15 to 30)
                if (chosenSize?.size == null) {
                    lastError = "所选摄像头无可用分辨率"
                    false
                } else {
                    if (chosenSize!!.degraded) lastError = chosenSize!!.note // 明确降级，不静默
                    true
                }
            }
        } catch (e: Exception) {
            lastError = "摄像头枚举异常: ${e.message}"
            false
        }
    }

    /** 来源校验：仅允许 BASE_URL 同源页面调用原生接口 */
    private fun guard(callback: String?): Boolean {
        val base = AppSettings.getBaseUrl(context)
        if (base == null) {
            fire(callback, err("BASE_URL 未配置"))
            return false
        }
        val pageHost = currentUrl()?.let { runCatching { Uri.parse(it).host }.getOrNull() }
        val baseHost = runCatching { Uri.parse(base).host }.getOrNull()
        if (pageHost == null || baseHost == null || pageHost != baseHost) {
            fire(callback, err("origin_not_allowed：仅允许后端页面调用原生接口（page=$pageHost base=$baseHost）"))
            return false
        }
        return true
    }

    private fun videoDir(): File {
        val dir = File(context.getExternalFilesDir(null) ?: context.filesDir, "videos")
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    private fun fire(cb: String?, json: JSONObject) {
        if (cb.isNullOrBlank()) return
        postResult(cb) { json }
    }

    private fun postResult(cb: String?, build: () -> JSONObject) {
        val json = build()
        postJs("try{${cb}(${json})}catch(e){console.error('[bridge]回调异常',e)}")
    }

    private fun err(message: String): JSONObject = JSONObject().put("ok", false).put("error", message)
}
