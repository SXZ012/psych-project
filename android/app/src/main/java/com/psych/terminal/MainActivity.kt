package com.psych.terminal

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.SurfaceTexture
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.AttributeSet
import android.view.Gravity
import android.view.Surface
import android.view.TextureView
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceError
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import com.psych.terminal.bridge.AndroidCameraBridge
import com.psych.terminal.core.BaseUrlValidator
import com.psych.terminal.hw.CameraEngine
import com.psych.terminal.hw.H264Recorder
import com.psych.terminal.hw.NativeFaceAnalyzer

/**
 * 混合终端主界面：FrameLayout 组合 WebView（现有网页）+ TextureView（原生摄像头预览）。
 * 网页更新只需改后端/页面，无需重装 APK；仅原生逻辑变化才需要重新打包。
 */
class MainActivity : Activity() {

    private lateinit var root: FrameLayout
    private lateinit var webView: WebView
    private lateinit var previewContainer: FrameLayout
    private lateinit var previewView: TextureView
    private lateinit var previewGuide: PreviewGuideView

    private lateinit var engine: CameraEngine
    private lateinit var recorder: H264Recorder
    private lateinit var faceAnalyzer: NativeFaceAnalyzer
    private lateinit var bridge: AndroidCameraBridge
    private var splashOverlay: android.widget.FrameLayout? = null
    private var splashMessage: android.widget.TextView? = null
    private val launchHandler = Handler(Looper.getMainLooper())
    private var pageReady = false
    private var launchRetried = false
    // 最近一次 loadEntry 实际使用的 BASE_URL；onResume 检测调试页改动后触发重载
    private var lastLoadedBaseUrl: String? = null
    private val launchWatchdog = Runnable {
        if (pageReady) return@Runnable
        if (!launchRetried) {
            launchRetried = true
            setSplashMessage("加载较慢，正在自动重试…")
            loadEntry()
        } else {
            // 不再无限转圈：保留原生页并给出可操作提示，避免用户误以为系统仍在正常加载。
            setSplashMessage("页面暂未加载，请检查网络后重新打开终端")
        }
    }

    private var previewSurface: Surface? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // 输入姓名/身份证时缩小 WebView 可视区，避免系统键盘直接盖住输入框。
        window.setSoftInputMode(
            WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE or
                WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_HIDDEN,
        )
        // 沉浸式全屏（终端 kiosk）：隐藏状态栏/导航栏，WebView 获得完整 1280x800 视口
        window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            or View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION)
        engine = CameraEngine(this)
        recorder = H264Recorder()
        faceAnalyzer = NativeFaceAnalyzer()
        engine.setAnalysisSurface(faceAnalyzer.surface)
        buildUi()
        if (savedInstanceState == null) {
            ensurePermissionThenLoad()
        }
    }

    private fun buildUi() {
        root = FrameLayout(this).apply {
            // 与采集准备页一致的浅雾青底色，避免原生层在首帧或预览切换时露出黑边。
            setBackgroundColor(0xFF8BADB1.toInt())
        }

        webView = WebView(this).apply {
            setBackgroundColor(0xFF8BADB1.toInt())
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            settings.cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
            CookieManager.getInstance().setAcceptCookie(true)
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                    false // 站内跳转一律内部加载

                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    super.onReceivedError(view, request, error)
                    if (request.isForMainFrame && !pageReady) {
                        setSplashMessage("网络连接异常，正在自动重试…")
                    }
                }

                // 不在 onPageCommitVisible/onPageFinished 移除启动层：这两个回调可能
                // 早于 Vue 的首帧绘制，偶发露出 WebView 的黑色合成帧。由页面挂载后
                // 调用 AndroidCamera.notifyPageReady() 统一完成首屏切换。
            }
            webChromeClient = WebChromeClient()
        }

        previewContainer = FrameLayout(this).apply {
            visibility = View.INVISIBLE // 由页面 AndroidCamera.setPreviewLayout 控制显示/位置
            clipChildren = true
            clipToOutline = true
            background = GradientDrawable().apply {
                // TextureView 尚未出第一帧时也保持与页面融合，不能使用黑色占位。
                setColor(0xFF7FA3A8.toInt())
                cornerRadius = 24f * resources.displayMetrics.density
            }
        }

        previewView = TextureView(this).apply {
            // 自拍预览镜像只影响屏幕显示，不影响送入编码器的原始视频。
            scaleX = -1f
            surfaceTextureListener = object : TextureView.SurfaceTextureListener {
                override fun onSurfaceTextureAvailable(st: SurfaceTexture, w: Int, h: Int) {
                    // 与旧单页 getUserMedia(640x480) 一致：显示预览固定为 4:3。
                    // 1080P/30fps 仍由独立的 MediaCodec Surface 录制，不受这里影响。
                    runCatching { st.setDefaultBufferSize(640, 480) }
                    previewSurface = Surface(st)
                    engine.setPreviewSurface(previewSurface)
                }

                override fun onSurfaceTextureSizeChanged(st: SurfaceTexture, w: Int, h: Int) = Unit
                override fun onSurfaceTextureDestroyed(st: SurfaceTexture): Boolean {
                    previewSurface?.release()
                    previewSurface = null
                    engine.setPreviewSurface(null)
                    return true
                }

                override fun onSurfaceTextureUpdated(st: SurfaceTexture) = Unit
            }
        }
        previewGuide = PreviewGuideView(this)
        previewContainer.addView(
            previewView,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
                Gravity.CENTER,
            ),
        )
        previewContainer.addView(
            previewGuide,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )

        root.addView(
            webView,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT),
        )
        root.addView(
            previewContainer,
            FrameLayout.LayoutParams(0, 0, Gravity.TOP or Gravity.START),
        )

        // —— 原生加载层：零延迟渲染，WebView 初始化期间用户看到它而非白屏 ——
        splashOverlay = android.widget.FrameLayout(this).apply {
            background = getDrawable(R.drawable.launch_background)
            val titleView = android.widget.TextView(this@MainActivity).apply {
                text = "AI视觉心理评估终端"
                textSize = 22f
                setTextColor(0xFFF0FAFF.toInt())
                typeface = android.graphics.Typeface.create(android.graphics.Typeface.SERIF, android.graphics.Typeface.BOLD)
                gravity = Gravity.CENTER
            }
            val sub = android.widget.TextView(this@MainActivity).apply {
                text = "正在加载…"
                textSize = 14f
                setTextColor(0xFFB8D2E1.toInt())
                gravity = Gravity.CENTER
                setPadding(0, 90, 0, 0)
            }
            splashMessage = sub
            val col = android.widget.LinearLayout(this@MainActivity).apply {
                orientation = android.widget.LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                addView(titleView)
                addView(sub)
            }
            addView(
                col,
                FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                ),
            )
        }
        root.addView(
            splashOverlay,
            FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT),
        )

        setContentView(root)

        // Debug 构建开启 WebView 远程调试（chrome://inspect / CDP），便于真机排查网页层问题
        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true)
        }

        bridge = AndroidCameraBridge(
            context = this,
            engine = engine,
            recorder = recorder,
            faceAnalyzer = faceAnalyzer,
            postJs = { js -> runOnUiThread { webView.evaluateJavascript(js, null) } },
            currentUrl = {
                // WebView 方法只允许主线程调用；桥线程里需同步切回主线程取值
                if (Looper.myLooper() == Looper.getMainLooper()) {
                    webView.url
                } else {
                    var url: String? = null
                    val latch = java.util.concurrent.CountDownLatch(1)
                    runOnUiThread {
                        url = webView.url
                        latch.countDown()
                    }
                    latch.await(2, java.util.concurrent.TimeUnit.SECONDS)
                    url
                }
            },
            previewSurfaceProvider = { previewSurface },
            previewLayoutSetter = { visible, l, t, w, h ->
                runOnUiThread { applyPreviewLayout(visible, l, t, w, h) }
            },
            previewGuideSetter = { status -> runOnUiThread { previewGuide.setStatus(status) } },
            hasCameraPermission = {
                checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
            },
            pageReadyNotifier = {
                runOnUiThread {
                    // Vue 已连续绘制两帧后，再等待 WebView 合成器确认该视觉状态已提交。
                    // 不能仅靠 post 或淡出动画：RK3568 上底层黑帧偶尔仍会在 alpha 过渡时透出。
                    webView.postVisualStateCallback(
                        SystemClock.uptimeMillis(),
                        object : WebView.VisualStateCallback() {
                            override fun onComplete(requestId: Long) {
                                runOnUiThread { removeSplashImmediately() }
                            }
                        },
                    )
                }
            },
        )
        webView.addJavascriptInterface(bridge, "AndroidCamera")
    }

    private fun applyPreviewLayout(
        visible: Boolean,
        leftPct: Double,
        topPct: Double,
        widthPct: Double,
        heightPct: Double,
    ) {
        val rw = root.width.coerceAtLeast(1)
        val rh = root.height.coerceAtLeast(1)
        val targetWidth = (rw * widthPct / 100.0).toInt().coerceAtLeast(1)
        val targetHeight = (rh * heightPct / 100.0).toInt().coerceAtLeast(1)
        val lp = FrameLayout.LayoutParams(
            targetWidth,
            targetHeight,
            Gravity.TOP or Gravity.START,
        )
        lp.leftMargin = (rw * leftPct / 100.0).toInt()
        lp.topMargin = (rh * topPct / 100.0).toInt()
        previewContainer.layoutParams = lp

        // 显示预览固定为 4:3，匹配旧单页的 640x480 摄像头预览。
        val cameraAspect = 4.0 / 3.0
        val targetAspect = targetWidth.toDouble() / targetHeight.toDouble()
        // TextureView 本身始终保持 4:3，再由外层容器裁掉超出的部分。
        // 这样在 4:3 监控小窗或偏竖的人脸框中都只会裁边，不会拉伸人物。
        val previewWidth: Int
        val previewHeight: Int
        if (targetAspect < cameraAspect) {
            previewHeight = targetHeight
            previewWidth = (targetHeight * cameraAspect).toInt().coerceAtLeast(targetWidth)
        } else {
            previewWidth = targetWidth
            previewHeight = (targetWidth / cameraAspect).toInt().coerceAtLeast(targetHeight)
        }
        previewView.layoutParams = FrameLayout.LayoutParams(
            previewWidth,
            previewHeight,
            Gravity.CENTER,
        )
        previewView.setTransform(null)
        previewView.scaleX = -1f
        previewContainer.invalidateOutline()
        // INVISIBLE 保留 SurfaceTexture；GONE 会销毁导致会话丢预览输出
        previewContainer.visibility = if (visible) View.VISIBLE else View.INVISIBLE
    }

    private fun ensurePermissionThenLoad() {
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.CAMERA), REQ_CAMERA)
        }
        loadEntry()
    }

    private fun loadEntry() {
        val base = AppSettings.getBaseUrl(this)
        lastLoadedBaseUrl = base
        if (base == null) {
            Toast.makeText(this, "请先在调试设置中配置后端地址（BASE_URL）", Toast.LENGTH_LONG).show()
            startActivity(Intent(this, DebugSettingsActivity::class.java))
            return
        }
        val v = BaseUrlValidator.validate(base, allowHttp = BuildConfig.DEBUG)
        if (!v.ok || v.normalized == null) {
            Toast.makeText(this, "BASE_URL 无效：${v.error}", Toast.LENGTH_LONG).show()
            startActivity(Intent(this, DebugSettingsActivity::class.java))
            return
        }
        // 正式测评入口：模块化 Vue 前端直接挂载在 /login/。
        // 绑定了设备编号时一次性通过 URL 传给页面（页面消费后写入本地并从地址栏清除）；
        // 未绑定的存量航空设备不带参数，页面保持航空终端行为。
        val entry = StringBuilder(v.normalized).append("/login/")
        val deviceId = AppSettings.getDeviceId(this)
        if (!deviceId.isNullOrBlank()) {
            entry.append("?device_id=").append(android.net.Uri.encode(deviceId))
            val deviceToken = AppSettings.getDeviceToken(this)
            if (!deviceToken.isNullOrBlank()) {
                entry.append("&device_token=").append(android.net.Uri.encode(deviceToken))
            }
        }
        webView.loadUrl(entry.toString())
        launchHandler.removeCallbacks(launchWatchdog)
        launchHandler.postDelayed(launchWatchdog, if (launchRetried) 10_000L else 8_000L)
    }

    private fun setSplashMessage(message: String) {
        runOnUiThread { splashMessage?.text = message }
    }

    /**
     * WebView 已确认有可见合成帧后，原子移除原生加载层。
     * 刻意不用 alpha 动画：动画期间底层若晚一帧合成，会形成一次黑屏闪烁。
     */
    private fun removeSplashImmediately() {
        val splash = splashOverlay ?: return
        if (splash.visibility != View.VISIBLE) return
        splash.visibility = View.GONE
        root.removeView(splash)
        splashOverlay = null
        pageReady = true
        launchHandler.removeCallbacks(launchWatchdog)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        // 沉浸式全屏在焦点变化后会被系统清除，需重新应用
        if (hasFocus) {
            window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION)
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_CAMERA && grantResults.firstOrNull() != PackageManager.PERMISSION_GRANTED) {
            Toast.makeText(this, "未授予摄像头权限，无法进行测评采集", Toast.LENGTH_LONG).show()
        }
    }

    override fun onPause() {
        bridge.onHostPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        bridge.onHostResume()
        // 从调试设置返回后刷新入口：首次进入页面还没加载，或调试页里改过
        // BASE_URL（旧页面仍指向旧后端，不重载会一直连不上/连错源）
        val current = AppSettings.getBaseUrl(this)
        if (current != null && (webView.url.isNullOrBlank() || current != lastLoadedBaseUrl)) loadEntry()
    }

    override fun onDestroy() {
        launchHandler.removeCallbacks(launchWatchdog)
        bridge.release()
        faceAnalyzer.close()
        webView.destroy()
        super.onDestroy()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    companion object {
        private const val REQ_CAMERA = 1001
    }
}

/** 原生预览位于 WebView 上层，因此在原生层重绘人物安全区。 */
private class PreviewGuideView @JvmOverloads constructor(
    context: android.content.Context,
    attrs: AttributeSet? = null,
) : View(context, attrs) {
    private val density = resources.displayMetrics.density
    private var status: String = "warning"
    private val border = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 2f * density
        color = Color.argb(170, 255, 255, 255)
    }

    fun setStatus(value: String) {
        status = value
        border.color = when (value) {
            "ok" -> Color.argb(230, 95, 226, 168)
            "error" -> Color.argb(230, 248, 113, 113)
            else -> Color.argb(170, 255, 255, 255)
        }
        invalidate()
    }
    private val outerBorder = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 2f * density
        color = Color.argb(120, 255, 255, 255)
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val inset = outerBorder.strokeWidth / 2f
        canvas.drawRoundRect(
            inset,
            inset,
            width - inset,
            height - inset,
            24f * density,
            24f * density,
            outerBorder,
        )
        canvas.drawOval(
            width * 0.18f,
            height * 0.10f,
            width * 0.82f,
            height * 0.86f,
            border,
        )
    }
}
