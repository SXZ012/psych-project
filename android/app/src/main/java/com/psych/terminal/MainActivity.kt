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
import android.os.Looper
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
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import com.psych.terminal.bridge.AndroidCameraBridge
import com.psych.terminal.core.BaseUrlValidator
import com.psych.terminal.hw.CameraEngine
import com.psych.terminal.hw.H264Recorder

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
    private lateinit var bridge: AndroidCameraBridge
    private var splashOverlay: android.widget.FrameLayout? = null

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
        buildUi()
        if (savedInstanceState == null) {
            ensurePermissionThenLoad()
        }
    }

    private fun buildUi() {
        root = FrameLayout(this).apply {
            setBackgroundColor(0xFFE8F0ED.toInt())
        }

        webView = WebView(this).apply {
            setBackgroundColor(0xFFE8F0ED.toInt())
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            settings.cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
            CookieManager.getInstance().setAcceptCookie(true)
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                    false // 站内跳转一律内部加载

                override fun onPageCommitVisible(view: WebView, url: String?) {
                    super.onPageCommitVisible(view, url)
                    // 首帧已经可见就立即露出网页，不再等待图片等资源全部结束。
                    runOnUiThread { hideSplash() }
                }

                override fun onPageFinished(view: WebView, url: String?) {
                    super.onPageFinished(view, url)
                    // 页面加载完成 → 淡出原生加载层，露出 WebView 内容
                    runOnUiThread { hideSplash() }
                }
            }
            webChromeClient = WebChromeClient()
        }

        previewContainer = FrameLayout(this).apply {
            visibility = View.INVISIBLE // 由页面 AndroidCamera.setPreviewLayout 控制显示/位置
            clipChildren = true
            clipToOutline = true
            background = GradientDrawable().apply {
                setColor(Color.BLACK)
                cornerRadius = 24f * resources.displayMetrics.density
            }
        }

        previewView = TextureView(this).apply {
            // 自拍预览镜像只影响屏幕显示，不影响送入编码器的原始视频。
            scaleX = -1f
            surfaceTextureListener = object : TextureView.SurfaceTextureListener {
                override fun onSurfaceTextureAvailable(st: SurfaceTexture, w: Int, h: Int) {
                    // 预览缓冲尽量对齐 1080P 输出，避免拉伸畸变
                    runCatching { st.setDefaultBufferSize(1920, 1080) }
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
                text = "心理健康测评系统"
                textSize = 22f
                setTextColor(0xFF24483B.toInt())
                typeface = android.graphics.Typeface.create(android.graphics.Typeface.SERIF, android.graphics.Typeface.BOLD)
                gravity = Gravity.CENTER
            }
            val sub = android.widget.TextView(this@MainActivity).apply {
                text = "正在加载…"
                textSize = 14f
                setTextColor(0xFF6C8B7D.toInt())
                gravity = Gravity.CENTER
                setPadding(0, 90, 0, 0)
            }
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
            hasCameraPermission = {
                checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
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

        // 1920x1080 预览按 center-crop 填满网页目标框，避免把人脸拉伸变形。
        val cameraAspect = 16.0 / 9.0
        val targetAspect = targetWidth.toDouble() / targetHeight.toDouble()
        val previewWidth: Int
        val previewHeight: Int
        if (targetAspect > cameraAspect) {
            previewWidth = targetWidth
            previewHeight = (targetWidth / cameraAspect).toInt()
        } else {
            previewHeight = targetHeight
            previewWidth = (targetHeight * cameraAspect).toInt()
        }
        previewView.layoutParams = FrameLayout.LayoutParams(
            previewWidth,
            previewHeight,
            Gravity.CENTER,
        )
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
        webView.loadUrl(v.normalized + "/login")
    }

    /** 页面加载完成后淡出原生加载层 */
    private fun hideSplash() {
        val splash = splashOverlay ?: return
        if (splash.visibility != View.VISIBLE) return
        splash.animate()
            .alpha(0f)
            .setDuration(120)
            .withEndAction {
                splash.visibility = View.GONE
                root.removeView(splash)
                splashOverlay = null
            }
            .start()
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
        // 从调试设置返回后刷新入口（BASE_URL 可能已修改）
        if (AppSettings.getBaseUrl(this) != null && webView.url.isNullOrBlank()) loadEntry()
    }

    override fun onDestroy() {
        bridge.release()
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
    private val border = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 2f * density
        color = Color.argb(190, 95, 226, 168)
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
