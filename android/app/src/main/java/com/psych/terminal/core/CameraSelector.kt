package com.psych.terminal.core

/**
 * 纯逻辑：摄像头候选与 RGB 选择策略（不依赖 Android 类，便于 JVM 单元测试）。
 *
 * 目标：在 RGB+IR 双目设备（如 Firefly IPC-M10R800-A3568J）上可靠选中 RGB 彩色前置摄像头，
 * 绝不误选 IR 灰度摄像头；无法可靠区分时要求 Debug 页手动指定，不静默猜测。
 */
data class CameraCandidate(
    val id: String,
    /** 0=front 1=back 2=external，对齐 CameraCharacteristics.LENS_FACING */
    val facing: Int,
    /** 传感器 COLOR_FILTER_ARRAY 为 MONO → 疑似 IR/灰度，排除 */
    val isMonoOrIr: Boolean,
    val sizes: List<Pair<Int, Int>>,
    /** AE 目标帧率范围 [min,max] */
    val fpsRanges: List<Pair<Int, Int>>,
    val hardwareLevel: Int = 0,
    val sensorResolution: String? = null,
) {
    val maxArea: Long get() = sizes.maxOfOrNull { it.first.toLong() * it.second } ?: 0L
    val supports1080p: Boolean get() = sizes.any { it.first == TARGET_W && it.second == TARGET_H }

    companion object {
        const val TARGET_W = 1920
        const val TARGET_H = 1080
    }
}

object CameraSelector {
    const val FACING_FRONT = 0
    const val FACING_BACK = 1
    const val FACING_EXTERNAL = 2

    const val TARGET_FPS = 30

    data class Choice(
        val cameraId: String?,
        val reason: String,
        /** true = 无法可靠自动选择，必须到 Debug 设置页手动指定 cameraId */
        val ambiguous: Boolean,
    )

    fun select(candidates: List<CameraCandidate>, preferredId: String? = null): Choice {
        if (candidates.isEmpty()) return Choice(null, "未枚举到任何摄像头", ambiguous = true)

        preferredId?.takeIf { it.isNotBlank() }?.let { pid ->
            candidates.firstOrNull { it.id == pid }?.let {
                return Choice(it.id, "Debug 设置手动指定 cameraId=$pid", ambiguous = false)
            }
        }

        val rgb = candidates.filter { !it.isMonoOrIr }
        if (rgb.isEmpty()) {
            return Choice(
                null,
                "所有摄像头均疑似 IR/MONO 灰度传感器，无法自动选择，请到调试设置手动指定",
                ambiguous = true,
            )
        }

        val front = rgb.filter { it.facing == FACING_FRONT }
        val pool = if (front.isNotEmpty()) front else rgb
        val facingNote = if (front.isNotEmpty()) "前置RGB" else "无前置RGB，回退可用RGB"

        val best = pool.sortedWith(
            compareByDescending<CameraCandidate> { it.supports1080p }.thenByDescending { it.maxArea }
        ).first()

        val monoCount = candidates.count { it.isMonoOrIr }
        val monoNote = if (monoCount > 0) "（已排除 $monoCount 个疑似IR/灰度摄像头）" else ""
        return Choice(
            best.id,
            "自动选择：$facingNote，支持1080p=${best.supports1080p}$monoNote",
            ambiguous = false,
        )
    }

    data class SizeChoice(val size: Pair<Int, Int>?, val degraded: Boolean, val note: String)

    /** 优先精确 1920x1080；不支持时取面积最接近者并【明确标记降级】，绝不静默 */
    fun pickSize(sizes: List<Pair<Int, Int>>): SizeChoice {
        if (sizes.isEmpty()) return SizeChoice(null, true, "无可用分辨率")
        sizes.firstOrNull { it.first == CameraCandidate.TARGET_W && it.second == CameraCandidate.TARGET_H }
            ?.let { return SizeChoice(it, false, "精确 1920x1080") }
        val closest = sizes.minByOrNull {
            Math.abs(it.first.toLong() * it.second - CameraCandidate.TARGET_W.toLong() * CameraCandidate.TARGET_H)
        } ?: return SizeChoice(null, true, "无可用分辨率")
        return SizeChoice(
            closest,
            true,
            "不支持 1920x1080，降级为 ${closest.first}x${closest.second}（已记录，非静默）",
        )
    }

    /** 优先选覆盖 30fps 的 AE 范围；否则取上限最高者 */
    fun pickFps(ranges: List<Pair<Int, Int>>): Pair<Int, Int>? {
        if (ranges.isEmpty()) return null
        ranges.firstOrNull { it.first <= TARGET_FPS && it.second >= TARGET_FPS }?.let { return it }
        return ranges.maxByOrNull { it.second }
    }
}
