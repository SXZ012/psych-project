package com.psych.terminal

import android.content.Context
import android.content.SharedPreferences

/** 应用设置（BASE_URL / cameraId 覆盖），存 SharedPreferences。 */
object AppSettings {
    private const val PREFS = "psych_terminal_settings"
    const val KEY_BASE_URL = "base_url"
    const val KEY_CAMERA_ID = "camera_id"

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
}
