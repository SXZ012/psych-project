package com.psych.terminal.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CameraSelectorTest {

    private fun rgb1080p(id: String, facing: Int = CameraSelector.FACING_FRONT) = CameraCandidate(
        id = id, facing = facing, isMonoOrIr = false,
        sizes = listOf(1920 to 1080, 1280 to 720, 640 to 480),
        fpsRanges = listOf(15 to 30, 30 to 30),
    )

    private fun irMono(id: String, facing: Int = CameraSelector.FACING_FRONT) = CameraCandidate(
        id = id, facing = facing, isMonoOrIr = true,
        sizes = listOf(640 to 480, 320 to 240),
        fpsRanges = listOf(15 to 30),
    )

    @Test
    fun `双目设备选中前置RGB而非IR灰度`() {
        val choice = CameraSelector.select(listOf(rgb1080p("0"), irMono("1")))
        assertEquals("0", choice.cameraId)
        assertFalse(choice.ambiguous)
        assertTrue(choice.reason.contains("排除 1 个疑似IR"))
    }

    @Test
    fun `手动指定 cameraId 优先于自动选择`() {
        val choice = CameraSelector.select(listOf(rgb1080p("0"), rgb1080p("2")), preferredId = "2")
        assertEquals("2", choice.cameraId)
        assertTrue(choice.reason.contains("手动指定"))
    }

    @Test
    fun `全部疑似IR时要求手动指定而非静默猜测`() {
        val choice = CameraSelector.select(listOf(irMono("0"), irMono("1")))
        assertNull(choice.cameraId)
        assertTrue(choice.ambiguous)
    }

    @Test
    fun `无前置时回退可用RGB并说明`() {
        val choice = CameraSelector.select(
            listOf(rgb1080p("0", CameraSelector.FACING_BACK), irMono("1", CameraSelector.FACING_FRONT))
        )
        assertEquals("0", choice.cameraId)
        assertTrue(choice.reason.contains("回退"))
    }

    @Test
    fun `优先支持1080p的候选`() {
        val small = CameraCandidate(
            id = "9", facing = CameraSelector.FACING_FRONT, isMonoOrIr = false,
            sizes = listOf(640 to 480), fpsRanges = listOf(15 to 30),
        )
        val choice = CameraSelector.select(listOf(small, rgb1080p("3")))
        assertEquals("3", choice.cameraId)
    }

    @Test
    fun `分辨率策略优先精确1080p`() {
        val c = CameraSelector.pickSize(listOf(1920 to 1080, 1280 to 720))
        assertEquals(1920 to 1080, c.size)
        assertFalse(c.degraded)
    }

    @Test
    fun `不支持1080p时明确降级而非静默`() {
        val c = CameraSelector.pickSize(listOf(1280 to 720, 640 to 480))
        assertEquals(1280 to 720, c.size)
        assertTrue(c.degraded)
        assertTrue(c.note.contains("降级"))
    }

    @Test
    fun `帧率策略优先覆盖30fps的范围`() {
        assertEquals(15 to 30, CameraSelector.pickFps(listOf(10 to 15, 15 to 30)))
        assertEquals(15 to 60, CameraSelector.pickFps(listOf(10 to 15, 15 to 60)))
        assertNull(CameraSelector.pickFps(emptyList()))
    }
}
