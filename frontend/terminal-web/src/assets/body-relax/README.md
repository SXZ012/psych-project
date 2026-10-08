# 身体放松音频与背景

- `community-assets/relax/body-relax-120.mp3`：页面实际播放的压缩音频，包含六段预生成中文女声与自然停顿，现场播放不调用 TTS。
- `body-relax-120.wav`：120 秒、22050 Hz、单声道 PCM 制作母带，保留用于后续编辑，不随前端构建发布。由 `scripts/generate_body_relax_audio.py` 使用项目已有 CosyVoice v3 flash / longanhuan 生成。
- `guide.json`：原创引导文案、界面提示与时间点，均由同一脚本生成。时间点为 0 / 23 / 44 / 65 / 86 / 108 秒。
- `community-assets/relax/body-lake.webp`：复用项目 Android 启动页已有的湖畔背景，没有新增外部图片依赖。

内容参考了 NHS 的身体感受觉察与自然坐姿方向，非逐字翻译或官方疗程：
https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/how-to-meditate-for-beginners/
https://www.cuh.nhs.uk/patient-information/relaxation/

当前作为日常休闲放松体验，不生成评分或医疗结论。播放器先完整加载为 Blob，再允许开始；以音频 currentTime 驱动提示，暂停、切后台、结束和离开页面均停音。加载失败提供重试。

运行时背景和压缩音频统一发布到 OSS，通过 `/static/assets/community/relax/` 加载；WAV 制作母带与引导时间点继续保留在源码中。播放器完整预加载后开始，退出时释放临时音频。更新运行时素材后运行公共素材迁移，校验并登记数据库文件索引。
