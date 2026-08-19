package com.psych.terminal.hw

import android.graphics.ImageFormat
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.view.Surface
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import java.util.concurrent.atomic.AtomicBoolean

/** Camera2 低分辨率分析支路：只输出人脸数量和归一化位置，不保存图像。 */
class NativeFaceAnalyzer {
    data class Result(val count: Int, val xCenter: Double = 0.0, val yCenter: Double = 0.0, val width: Double = 0.0, val height: Double = 0.0)
    interface Listener { fun onResult(result: Result); fun onError(message: String) }

    private val thread = HandlerThread("face-analysis").also { it.start() }
    private val handler = Handler(thread.looper)
    private val reader = ImageReader.newInstance(640, 480, ImageFormat.YUV_420_888, 2)
    private val busy = AtomicBoolean(false)
    private val detector = FaceDetection.getClient(
        FaceDetectorOptions.Builder()
            .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
            .setMinFaceSize(0.10f)
            .build(),
    )
    @Volatile var listener: Listener? = null
    @Volatile var rotationDegrees: Int = 0

    val surface: Surface get() = reader.surface

    init {
        reader.setOnImageAvailableListener({ source ->
            val image = source.acquireLatestImage() ?: return@setOnImageAvailableListener
            if (!busy.compareAndSet(false, true)) { image.close(); return@setOnImageAvailableListener }
            val input = InputImage.fromMediaImage(image, rotationDegrees)
            detector.process(input)
                .addOnSuccessListener { faces ->
                    if (faces.isEmpty()) listener?.onResult(Result(0))
                    else {
                        val face = faces.maxByOrNull { it.boundingBox.width() * it.boundingBox.height() }!!
                        val box = face.boundingBox
                        val iw = input.width.coerceAtLeast(1).toDouble()
                        val ih = input.height.coerceAtLeast(1).toDouble()
                        listener?.onResult(Result(faces.size, box.centerX() / iw, box.centerY() / ih, box.width() / iw, box.height() / ih))
                    }
                }
                .addOnFailureListener { listener?.onError("人脸检测异常：${it.message ?: "未知错误"}") }
                .addOnCompleteListener { image.close(); busy.set(false) }
        }, handler)
    }

    fun close() {
        reader.setOnImageAvailableListener(null, null)
        detector.close()
        reader.close()
        thread.quitSafely()
    }
}
