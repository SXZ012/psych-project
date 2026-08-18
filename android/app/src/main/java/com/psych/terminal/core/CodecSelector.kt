package com.psych.terminal.core

/**
 * 纯逻辑：H.264 硬件编码器选择（不依赖 Android，便于 JVM 单元测试）。
 *
 * RK3568 的硬件编码器形如 OMX.rk.video_encoder.avc / c2.rk.avc.encoder；
 * Google 软件编码器形如 OMX.google.h264.encoder / c2.android.avc.encoder。
 * 若最终只能选到软件编码器，必须明确报错/警告，不允许显示为硬编码成功。
 */
object CodecSelector {

    private val SOFTWARE_MARKERS = listOf(
        "OMX.google", "c2.android", "c2.google", "c2.soft", "sw.avc",
    )

    data class CodecChoice(val name: String?, val isHardware: Boolean, val reason: String)

    fun select(candidates: List<String>): CodecChoice {
        val hw = candidates.firstOrNull { name ->
            SOFTWARE_MARKERS.none { name.contains(it, ignoreCase = true) }
        }
        if (hw != null) return CodecChoice(hw, true, "已选择硬件 AVC 编码器：$hw")

        val sw = candidates.firstOrNull()
        return CodecChoice(
            sw,
            false,
            "未找到硬件 AVC 编码器，仅剩软件编码器（$sw）。硬编要求未满足，将明确报错而非静默使用",
        )
    }
}
