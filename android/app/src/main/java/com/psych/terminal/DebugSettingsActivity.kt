package com.psych.terminal

import android.app.Activity
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import com.psych.terminal.core.BaseUrlValidator
import com.psych.terminal.core.CameraSelector
import com.psych.terminal.hw.CameraEngine

/**
 * Debug 设置页：BASE_URL 配置 + cameraId 手动选择（RGB/IR 无法自动区分时的兜底）。
 * 设置存 SharedPreferences，改完返回主界面自动生效。
 */
class DebugSettingsActivity : Activity() {

    private lateinit var urlInput: EditText
    private lateinit var deviceIdInput: EditText
    private lateinit var deviceTokenInput: EditText
    private lateinit var cameraGroup: RadioGroup
    private var candidates = mutableListOf<com.psych.terminal.core.CameraCandidate>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val pad = (resources.displayMetrics.density * 16).toInt()
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad, pad, pad)
        }

        root.addView(text("终端调试设置", 20f, bold = true))
        root.addView(text("后端地址（BASE_URL）", 14f))

        urlInput = EditText(this).apply {
            hint = if (BuildConfig.DEBUG) "例：http://10.0.0.29:8000/login" else "例：https://api.example.com"
            setText(AppSettings.getBaseUrl(this@DebugSettingsActivity) ?: "")
        }
        root.addView(urlInput, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        root.addView(
            text(
                if (BuildConfig.DEBUG) "Debug 构建：允许局域网明文 HTTP，可带 /login 路径（自动截取）"
                else "Release 构建：必须 HTTPS，禁止明文与忽略证书错误",
                12f,
            ),
        )

        val saveUrl = Button(this).apply {
            text = "校验并保存地址"
            setOnClickListener {
                val v = BaseUrlValidator.validate(urlInput.text.toString(), allowHttp = BuildConfig.DEBUG)
                if (v.ok && v.normalized != null) {
                    AppSettings.setBaseUrl(this@DebugSettingsActivity, v.normalized)
                    Toast.makeText(this@DebugSettingsActivity, "已保存：${v.normalized}", Toast.LENGTH_LONG).show()
                } else {
                    Toast.makeText(this@DebugSettingsActivity, "无效：${v.error}", Toast.LENGTH_LONG).show()
                }
            }
        }
        root.addView(saveUrl)

        root.addView(text("", 10f))
        root.addView(text("设备场景绑定", 14f))

        deviceIdInput = EditText(this).apply {
            hint = "例：community-dev-01（留空表示不绑定）"
            setText(AppSettings.getDeviceId(this@DebugSettingsActivity) ?: "")
        }
        root.addView(deviceIdInput, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        deviceTokenInput = EditText(this).apply {
            hint = "设备密钥（后端未配置密钥校验时可留空）"
            setText(AppSettings.getDeviceToken(this@DebugSettingsActivity) ?: "")
        }
        root.addView(deviceTokenInput, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        root.addView(
            text(
                "绑定后由后端按设备配置进入航空或社区场景；留空保持现有航空终端行为，" +
                    "场景以后端为准，终端无法自行指定。绑定信息仅在启动时一次性传给页面。",
                12f,
            ),
        )

        val saveDevice = Button(this).apply {
            text = "保存设备绑定"
            setOnClickListener {
                AppSettings.setDeviceId(this@DebugSettingsActivity, deviceIdInput.text.toString())
                AppSettings.setDeviceToken(this@DebugSettingsActivity, deviceTokenInput.text.toString())
                Toast.makeText(this@DebugSettingsActivity, "设备绑定已保存，重启终端后生效", Toast.LENGTH_LONG).show()
            }
        }
        root.addView(saveDevice)

        root.addView(text("", 10f))
        root.addView(text("摄像头选择（RGB 彩色优先，避免误选 IR 灰度）", 14f))

        cameraGroup = RadioGroup(this)
        root.addView(cameraGroup, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))

        // “自动”选项
        RadioButton(this).apply {
            id = View_generateId()
            text = "自动选择（推荐：前置RGB，排除 MONO/IR）"
            tag = AUTO_TAG
            cameraGroup.addView(this)
        }
        try {
            candidates.addAll(CameraEngine(this).enumerate())
        } catch (e: Exception) {
            root.addView(text("摄像头枚举失败：${e.message}", 12f))
        }
        val auto = CameraSelector.select(candidates, AppSettings.getCameraId(this))
        candidates.forEach { c ->
            RadioButton(this).apply {
                id = View_generateId()
                val facing = when (c.facing) {
                    CameraSelector.FACING_FRONT -> "前置"
                    CameraSelector.FACING_BACK -> "后置"
                    else -> "外接"
                }
                val mono = if (c.isMonoOrIr) "，疑似IR/灰度(MONO)" else ""
                val p1080 = if (c.supports1080p) "，支持1080p" else ""
                text = "cameraId=${c.id}：${facing}${mono}${p1080}，传感器${c.sensorResolution ?: "?"}"
                tag = c.id
                cameraGroup.addView(this)
            }
        }
        // 回显当前选择
        val savedCamera = AppSettings.getCameraId(this)
        val checkedTag: String = savedCamera ?: AUTO_TAG
        for (i in 0 until cameraGroup.childCount) {
            val rb = cameraGroup.getChildAt(i) as? RadioButton ?: continue
            if (rb.tag == checkedTag) {
                cameraGroup.check(rb.id)
                break
            }
        }
        root.addView(text("自动选择结果：${auto.reason}", 12f))

        val saveCam = Button(this).apply {
            text = "保存摄像头选择"
            setOnClickListener {
                val rb = cameraGroup.findViewById<RadioButton>(cameraGroup.checkedRadioButtonId)
                val tag = rb?.tag as? String
                if (tag == null || tag == AUTO_TAG) {
                    AppSettings.setCameraId(this@DebugSettingsActivity, null)
                    Toast.makeText(this@DebugSettingsActivity, "已恢复自动选择", Toast.LENGTH_SHORT).show()
                } else {
                    AppSettings.setCameraId(this@DebugSettingsActivity, tag)
                    Toast.makeText(this@DebugSettingsActivity, "已指定 cameraId=$tag", Toast.LENGTH_SHORT).show()
                }
            }
        }
        root.addView(saveCam)

        val done = Button(this).apply {
            text = "完成，返回终端"
            setOnClickListener { finish() }
        }
        root.addView(done)

        val scroll = ScrollView(this).apply { addView(root) }
        setContentView(scroll)
    }

    private fun text(s: String, sizePx: Float, bold: Boolean = false): TextView =
        TextView(this).apply {
            text = s
            textSize = sizePx
            gravity = Gravity.START
            if (bold) paint.isFakeBoldText = true
        }

    private fun View_generateId(): Int = android.view.View.generateViewId()

    companion object {
        private const val AUTO_TAG = "__auto__"
        private val MATCH_PARENT = ViewGroup.LayoutParams.MATCH_PARENT
        private val WRAP_CONTENT = ViewGroup.LayoutParams.WRAP_CONTENT
    }
}
