# psych-terminal（混合 Android APK）

WebView + Camera2 + MediaCodec 混合 APK：网页层加载模块化 `/login/` 流程，
原生层用 Firefly（RK3568）内置 RGB 摄像头做 **1080P H.264 硬编码**，生成**无音频 MP4**
并直接 multipart 上传现有后端 `POST /api/v1/assessments/submit`。

## 架构

```
WebView（模块化 terminal-web 构建产物）
   └── window.AndroidCamera（JS Bridge，同源校验）
         ├── Camera2（RGB 彩色前置优先，排除 MONO/IR 灰度；Debug 页可手动指定 cameraId）
         ├── MediaCodec（硬件 AVC：OMX.rk/c2.rk 优先；只剩 Google 软件编码器时明确报错）
         ├── MediaMuxer（MPEG_4，仅视频轨，无音频）
         └── 原生 multipart 上传（MP4 不经过 JS、不转 Base64）
```

- minSdk 26 / targetSdk 34 / 仅 `arm64-v8a` / Kotlin；人脸检测使用随 APK 分发的 ML Kit 模型，不依赖 Google Play 服务、云端或现场下载。
- 不申请 `RECORD_AUDIO`，不录音，MP4 无音频轨。
- 普通浏览器里的 MediaRecorder 路线保留为回退（terminal-web 自动探测 `window.AndroidCamera`）。

## 构建与安装

1. 安装 Android Studio（含 JDK17 + SDK），首次向导装好 SDK。
2. 用 Android Studio 打开本目录（`psych-project/android/`），等待 Gradle Sync。
3. `Build → Build APK(s)`，或安装 Gradle 8.2 后运行 `gradle -p android assembleDebug`（项目未包含 Gradle Wrapper）。
4. 安装到设备（adb 已在仓库 `tools/platform-tools/`）：
   ```
   tools/platform-tools/adb.exe install -r app/build/outputs/apk/debug/app-debug.apk
   ```
5. 首次启动 → 右上角 ⚙ → 填 BASE_URL（Debug 允许 `http://IP:端口`）→ 保存 → 返回；APK 自动打开 `${BASE_URL}/login/`。

## 部署模型（重要）

| 变更类型 | 是否需要重打 APK |
|---|---|
| 网页（terminal-web/admin-web）与后端更新 | **不需要**——重新构建前端并发布静态文件即可，APK 只是个壳 |
| BASE_URL / cameraId 调整 | 不需要——Debug 设置页改 |
| 原生逻辑（Camera2/MediaCodec/桥）变化 | **需要**重新打包安装 |

## 诊断

`AndroidCamera.getRecordingStatus()` 返回 JSON：cameraId、选择依据、分辨率/帧率（是否降级）、
codec 名称与是否硬编、码率、起止时间、时长、文件大小/路径、最近错误、已上传 assessment_id。
Logcat 过滤 `h264-drain` / `cam-bg` 线程与 `CameraEngine`/`H264Recorder` 标签。

## 音频说明

当前题干、开始音、偏离提醒与完成提示由网页层播放预生成音频，在测评准备阶段加载。
航空由 `useAviationFlow.ts` 与 `AudioCoordinator` 调度，社区由 `useCommunityFlow.ts` 与 `CommunityVoice` 调度。
切题和退出会停止旧语音；倒计时数字不朗读。音频播放不申请录音权限，MP4 始终无音频轨。

原生 `speakPrompt()` 是设备支持系统 TTS 时的回退；未安装 TTS 引擎的设备不能依赖该方法。
`playIntroAudio()/playOutroAudio()` 是旧接口保留项，返回 `not_configured`；
`stopPromptAudio()` 用于停止原生 TTS，不负责网页播放器。

## 已知边界

- RGB/IR 判别依据 Camera2 `COLOR_FILTER_ARRAY=MONO`；无法可靠区分时强制 Debug 页手动指定，不静默猜测。
- 预览隐藏用 INVISIBLE（保留 SurfaceTexture），GONE 会销毁预览输出。
- APK 模式下由原生 Camera2 + 离线 ML Kit 做人脸检测与位置门禁；浏览器回退模式下由本地 MediaPipe 处理，不依赖外网。
- Activity 后台时录制会继续；被系统杀死则录像中止（看门狗/自启在后续阶段）。
