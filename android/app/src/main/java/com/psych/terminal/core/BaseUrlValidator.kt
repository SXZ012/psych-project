package com.psych.terminal.core

import java.net.URI

/**
 * 纯逻辑：BASE_URL 校验与归一（不依赖 Android，便于 JVM 单元测试）。
 *
 * - 允许输入完整页面地址（如 http://10.0.0.29:8000/login），自动截取 origin 作为 BASE_URL；
 * - Debug 构建（allowHttp=true）允许明文 HTTP；Release 必须 HTTPS；
 * - 任何情况下都不忽略 SSL 证书错误。
 */
object BaseUrlValidator {

    data class Result(val ok: Boolean, val normalized: String? = null, val error: String? = null)

    fun validate(input: String?, allowHttp: Boolean): Result {
        if (input.isNullOrBlank()) return Result(false, error = "后端地址为空")
        var u = input.trim()
        if (!u.startsWith("http://", ignoreCase = true) && !u.startsWith("https://", ignoreCase = true)) {
            u = "https://$u"
        }
        val uri = try {
            URI(u)
        } catch (e: Exception) {
            return Result(false, error = "地址格式无效：$u")
        }
        val scheme = uri.scheme?.lowercase() ?: return Result(false, error = "缺少协议")
        val host = uri.host ?: return Result(false, error = "缺少主机名")
        if (scheme != "http" && scheme != "https") return Result(false, error = "仅支持 http/https")
        if (scheme == "http" && !allowHttp) {
            return Result(false, error = "当前构建必须使用 HTTPS（明文 HTTP 仅限 Debug 联调）")
        }
        val port = uri.port.takeIf { it > 0 }
        val base = buildString {
            append(scheme).append("://").append(host)
            if (port != null) append(":").append(port)
        }
        return Result(true, normalized = base)
    }
}
