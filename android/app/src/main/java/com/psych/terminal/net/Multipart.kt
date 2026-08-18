package com.psych.terminal.net

import java.io.File
import java.io.OutputStream

/** 极简 multipart/form-data 写入（不引入第三方库）。 */
object Multipart {
    private val CRLF = "\r\n".toByteArray()
    private val DASHDASH = "--".toByteArray()

    fun write(
        out: OutputStream,
        boundary: String,
        fields: Map<String, String>,
        fileField: String,
        fileName: String,
        fileContentType: String,
        file: File,
    ) {
        val b = boundary.toByteArray()
        for ((k, v) in fields) {
            out.write(DASHDASH); out.write(b); out.write(CRLF)
            out.write("Content-Disposition: form-data; name=\"$k\"".toByteArray(Charsets.UTF_8))
            out.write(CRLF); out.write(CRLF)
            out.write(v.toByteArray(Charsets.UTF_8)); out.write(CRLF)
        }
        out.write(DASHDASH); out.write(b); out.write(CRLF)
        out.write(
            "Content-Disposition: form-data; name=\"$fileField\"; filename=\"$fileName\""
                .toByteArray(Charsets.UTF_8)
        )
        out.write(CRLF)
        out.write("Content-Type: $fileContentType".toByteArray(Charsets.UTF_8))
        out.write(CRLF); out.write(CRLF)
        file.inputStream().use { it.copyTo(out, 64 * 1024) }
        out.write(CRLF)
        out.write(DASHDASH); out.write(b); out.write(DASHDASH); out.write(CRLF)
        out.flush()
    }
}
