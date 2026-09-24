package com.psych.terminal.net

import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * 原生上传：复用现有后端 POST /api/v1/assessments/submit。
 * 字段与浏览器路径完全一致：name / id_card / selections(JSON字符串) / duration_seconds /
 * effective_duration_seconds / paused_count，
 * 视频文件字段名 video，文件名 assessment.mp4，Content-Type video/mp4。
 *
 * 社区场景追加可选字段 sessionId / selfReportJson（航空流程传 null 时完全不发送，
 * 与原请求保持一致）；sessionId 存在时后端以支付会话为准绑定订单/用户/设备。
 */
object AssessmentUploader {

    data class Result(
        val ok: Boolean,
        val assessmentId: String? = null,
        val accessCode: String? = null,
        val httpCode: Int = 0,
        val error: String? = null,
        val responseBody: String? = null,
    )

    fun submit(
        baseUrl: String,
        name: String,
        idCard: String,
        selectionsJson: String,
        durationSeconds: Int,
        effectiveDurationSeconds: Int = 0,
        pausedCount: Int = 0,
        videoFile: File,
        sessionId: String? = null,
        selfReportJson: String? = null,
        subjectId: String? = null,
        gender: String? = null,
        age: String? = null,
        // 幂等令牌：同一次测评的重试复用同一 token，后端不重复建记录
        clientToken: String? = null,
        // 采集协议审计（可选；不传与旧请求完全一致）
        protocolVersion: String? = null,
        timelineVersion: String? = null,
        contentVersion: String? = null,
        schedulingNotesJson: String? = null,
    ): Result {
        val url = URL(baseUrl.trimEnd('/') + "/api/v1/assessments/submit")
        val boundary = "----psychBoundary${System.currentTimeMillis()}"
        return try {
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                doOutput = true
                doInput = true
                connectTimeout = 15_000
                readTimeout = 180_000
                setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
                setChunkedStreamingMode(0)
            }
            conn.outputStream.use {
                val fields = linkedMapOf(
                    "name" to name,
                    "id_card" to idCard,
                    "selections" to selectionsJson,
                    "duration_seconds" to durationSeconds.toString(),
                    "effective_duration_seconds" to effectiveDurationSeconds.toString(),
                    "paused_count" to pausedCount.toString(),
                )
                // 社区字段仅在存在时发送，航空提交的请求体与原先完全一致
                sessionId?.takeIf { it.isNotBlank() }?.let { fields["session_id"] = it }
                selfReportJson?.takeIf { it.isNotBlank() }?.let { fields["self_report"] = it }
                // 终端登录页四项：工号 + 性别/年龄（空值不发送，旧请求完全一致）
                subjectId?.takeIf { it.isNotBlank() }?.let { fields["subject_id"] = it }
                gender?.takeIf { it.isNotBlank() }?.let { fields["gender"] = it }
                age?.takeIf { it.isNotBlank() }?.let { fields["age"] = it }
                // 幂等令牌与采集协议审计（空值不发送）
                clientToken?.takeIf { it.isNotBlank() }?.let { fields["client_token"] = it }
                protocolVersion?.takeIf { it.isNotBlank() }?.let { fields["protocol_version"] = it }
                timelineVersion?.takeIf { it.isNotBlank() }?.let { fields["timeline_version"] = it }
                contentVersion?.takeIf { it.isNotBlank() }?.let { fields["content_version"] = it }
                schedulingNotesJson?.takeIf { it.isNotBlank() }?.let { fields["scheduling_notes"] = it }
                Multipart.write(
                    out = it,
                    boundary = boundary,
                    fields = fields,
                    fileField = "video",
                    fileName = "assessment.mp4",
                    fileContentType = "video/mp4",
                    file = videoFile,
                )
            }
            val code = conn.responseCode
            val body = (if (code in 200..299) conn.inputStream else conn.errorStream)
                ?.bufferedReader()?.use { it.readText() } ?: ""
            if (code in 200..299) {
                val json = runCatching { JSONObject(body) }.getOrNull()
                val id = json?.optString("id")
                val accessCode = json?.optString("access_code")
                Result(
                    ok = true,
                    assessmentId = id?.takeIf { it.isNotEmpty() },
                    accessCode = accessCode?.takeIf { it.isNotEmpty() },
                    httpCode = code,
                    responseBody = body,
                )
            } else {
                Result(ok = false, httpCode = code, error = "HTTP $code: ${body.take(300)}", responseBody = body)
            }
        } catch (e: Exception) {
            Result(ok = false, error = "上传异常: ${e.message}")
        }
    }
}
