plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.psych.terminal"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.psych.terminal"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"
        ndk {
            // 只保留 arm64-v8a（RK3568）
            abiFilters += "arm64-v8a"
        }
    }

    buildTypes {
        debug {
            // Debug 允许局域网 HTTP，由 debug 源集的 network_security_config 控制
        }
        release {
            isMinifyEnabled = false
        }
    }

    buildFeatures {
        buildConfig = true   // 代码中引用 BuildConfig.DEBUG / VERSION_NAME
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    // 刻意不引入 AndroidX/第三方库：全部使用 Android 官方平台 API，零额外依赖
    testImplementation("junit:junit:4.13.2")
}
