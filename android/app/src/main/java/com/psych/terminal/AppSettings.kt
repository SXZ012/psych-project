package com.psych.terminal

import android.content.Context
import android.content.SharedPreferences

/** 应用设置（BASE_URL / cameraId / 设备编号与密钥），存 SharedPreferences。 */
object AppSettings {
    private const val PREFS = "psych_terminal_settings"
    const val KEY_BASE_URL = "base_url"
    const val KEY_CAMERA_ID = "camera_id"
    const val KEY_DEVICE_ID = "device_id"
    const val KEY_DEVICE_TOKEN = "device_token"

    fun prefs(ctx: Context): SharedPreferences =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun getBaseUrl(ctx: Context): String? =
        prefs(ctx).getString(KEY_BASE_URL, null)?.trim()?.ifEmpty { null }

    fun setBaseUrl(ctx: Context, url: String) {
        prefs(ctx).edit().putString(KEY_BASE_URL, url.trim()).apply()
    }

    fun getCameraId(ctx: Context): String? =
        prefs(ctx).getString(KEY_CAMERA_ID, null)?.trim()?.ifEmpty { null }

    fun setCameraId(ctx: Context, id: String?) {
        prefs(ctx).edit().putString(KEY_CAMERA_ID, id?.trim()?.ifEmpty { null }).apply()
    }

    /** 设备编号：绑定后端场景(aviation/community)；为空表示未绑定，走存量航空终端行为。 */
    fun getDeviceId(ctx: Context): String? =
        prefs(ctx).getString(KEY_DEVICE_ID, null)?.trim()?.ifEmpty { null }

    fun setDeviceId(ctx: Context, id: String?) {
        prefs(ctx).edit().putString(KEY_DEVICE_ID, id?.trim()?.ifEmpty { null }).apply()
    }

    /** 设备密钥：随场景配置请求以 X-Device-Token 传递；后端只存哈希。 */
    fun getDeviceToken(ctx: Context): String? =
        prefs(ctx).getString(KEY_DEVICE_TOKEN, null)?.trim()?.ifEmpty { null }

    fun setDeviceToken(ctx: Context, token: String?) {
        prefs(ctx).edit().putString(KEY_DEVICE_TOKEN, token?.trim()?.ifEmpty { null }).apply()
    }
}
