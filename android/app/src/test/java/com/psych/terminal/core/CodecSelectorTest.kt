package com.psych.terminal.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CodecSelectorTest {

    @Test
    fun `选中RK硬件编码器`() {
        val c = CodecSelector.select(listOf("OMX.google.h264.encoder", "OMX.rk.video_encoder.avc"))
        assertEquals("OMX.rk.video_encoder.avc", c.name)
        assertTrue(c.isHardware)
    }

    @Test
    fun `c2 软件编码器被识别为非硬件`() {
        val c = CodecSelector.select(listOf("c2.android.avc.encoder", "OMX.google.h264.encoder"))
        assertFalse(c.isHardware)
        assertEquals("c2.android.avc.encoder", c.name)
        assertTrue(c.reason.contains("软件"))
    }

    @Test
    fun `仅有软件编码器时不冒充硬编成功`() {
        val c = CodecSelector.select(listOf("OMX.google.h264.encoder"))
        assertFalse(c.isHardware)
        assertTrue(c.reason.contains("明确报错"))
    }

    @Test
    fun `c2点rk命名的硬件编码器通过`() {
        val c = CodecSelector.select(listOf("c2.rk.avc.encoder"))
        assertEquals("c2.rk.avc.encoder", c.name)
        assertTrue(c.isHardware)
    }

    @Test
    fun `空候选列表返回null且非硬件`() {
        val c = CodecSelector.select(emptyList())
        assertNull(c.name)
        assertFalse(c.isHardware)
    }
}
