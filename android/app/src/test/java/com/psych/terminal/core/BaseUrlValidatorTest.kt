package com.psych.terminal.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BaseUrlValidatorTest {

    @Test
    fun `https 地址通过并归一为 origin`() {
        val r = BaseUrlValidator.validate("https://api.example.com:8443/login", allowHttp = false)
        assertTrue(r.ok)
        assertEquals("https://api.example.com:8443", r.normalized)
    }

    @Test
    fun `带路径的登录页地址自动截取 origin`() {
        val r = BaseUrlValidator.validate("http://10.0.0.29:8000/login", allowHttp = true)
        assertTrue(r.ok)
        assertEquals("http://10.0.0.29:8000", r.normalized)
    }

    @Test
    fun `Debug 构建允许明文 HTTP`() {
        val r = BaseUrlValidator.validate("http://10.0.0.29:8443", allowHttp = true)
        assertTrue(r.ok)
        assertEquals("http://10.0.0.29:8443", r.normalized)
    }

    @Test
    fun `Release 构建拒绝明文 HTTP`() {
        val r = BaseUrlValidator.validate("http://10.0.0.29:8443", allowHttp = false)
        assertFalse(r.ok)
        assertTrue(r.error!!.contains("HTTPS"))
    }

    @Test
    fun `无协议时默认补 https 并校验`() {
        val r = BaseUrlValidator.validate("api.example.com", allowHttp = false)
        assertTrue(r.ok)
        assertEquals("https://api.example.com", r.normalized)
    }

    @Test
    fun `空地址与非法地址被拒绝`() {
        assertFalse(BaseUrlValidator.validate(null, allowHttp = true).ok)
        assertFalse(BaseUrlValidator.validate("   ", allowHttp = true).ok)
        assertFalse(BaseUrlValidator.validate("http://", allowHttp = true).ok)
    }
}
