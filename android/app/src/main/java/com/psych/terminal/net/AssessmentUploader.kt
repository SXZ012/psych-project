package com.psych.terminal.net

import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * 原生上传：复用现有后端 POST /api/v1/assessments/submit。
 * 字段与浏览器路径完全一致：name / id_card / selections(JSON字符串) / duration_seconds，
 * 视频文件字段名 video，文件名 assessment.mp4，Content-Type video/mp4。
 */
object AssessmentUploader {

    data class Result(
        val ok: Boolean,
        val assessmentId: String? = null,
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
        videoFile: File,
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
                Multipart.write(
                    out = it,
                    boundary = boundary,
                    fields = linkedMapOf(
                        "name" to name,
                        "id_card" to idCard,
                        "selections" to selectionsJson,
                        "duration_seconds" to durationSeconds.toString(),
                    ),
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
                val id = runCatching { JSONObject(body).optString("id") }.getOrNull()
                Result(ok = true, assessmentId = id?.takeIf { it.isNotEmpty() }, httpCode = code, responseBody = body)
            } else {
                Result(ok = false, httpCode = code, error = "HTTP $code: ${body.take(300)}", responseBody = body)
            }
        } catch (e: Exception) {
            Result(ok = false, error = "上传异常: ${e.message}")
        }
    }
}
