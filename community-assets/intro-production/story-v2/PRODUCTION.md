# 《给自己一分钟》连续动画制作

状态：用户确认采用无需外部账号的本地二维角色动画。第一版 15 秒样片使用 SVG 分层角色、关节旋转、步态、表情和连续镜头；风格为简洁平面插画，与先前手绘概念图不同。现有生产播放引用保留。

样片源码：src/story-v2/ContinuousSample.tsx。合成 ID：ContinuousSample，450 帧，30fps，1920×1080。

导出：npx remotion render src/index.ts ContinuousSample output/sample-continuous-15s.mp4 --codec=h264 --crf=18 --audio-codec=aac --concurrency=4

初版待用户审看动作与美术方向，再扩展后续 45 秒。以下图生视频提示词作为未来可选路线保留，不是本版依赖。

## 第一阶段：15 秒样片

同一位约 35 岁的中国女性，短黑发、鼠尾草绿开衫、米色内搭、陶土色长裤、帆布肩包。温暖手绘二维动画风格。地点固定为带木质玄关台和绿植的公寓门口，门在画面右侧。保持人物、衣服、空间、光照一致。

| 镜头 | 时间 | 连续动作 | 摄影 |
|---|---|---|---|
| A | 0–5s | 整理肩包，伸手拿起台上的手机，低头看消息 | 全景缓慢推向中景，人物动作自然 |
| B | 5–10s | 延续拿手机姿势，向右侧门口走两步，停下，将视线从手机移开 | 同方向跟拍，保持动作与轴线连续 |
| C | 10–15s | 手机放低，轻轻闭眼吸气、呼气，肩膀落下，再睁眼 | 面部中近景，微妙表情，保持头发与衣物稳定 |

沿用 public/audio/01-morning.mp3（0.5s 入）和 02-pause.mp3（7.5s 入），不重新生成旁白。正式剪辑时检查实际音频尾部与镜头长度，禁止截断语句。

## 图生视频提示词

A: Warm hand-painted 2D animated film. The same adult Chinese woman adjusts her canvas shoulder bag, reaches for the phone on the wooden entry console and picks it up, glances down with mildly tense eyebrows. Natural hands and weight transfer. Gentle camera push from wide to medium. Preserve reference identity, wardrobe, architecture and warm morning lighting. One continuous five-second shot. No cuts, morphing, text or extra characters.

B: Continue exactly from previous ending pose. The same woman holding her phone walks two natural steps toward the apartment door on screen right, then stops and looks away from the phone. Gentle tracking camera, same screen direction. Keep identity, bag, hands and doorway geometry consistent. One continuous five-second shot. No scene changes, floating feet, duplicated limbs or exaggerated distress.

C: Continue from the stopped pose at the same doorway. Medium close-up. She lowers the phone, softly closes her eyes, slowly inhales then exhales; shoulders settle, eyes gently reopen. Subtle relief, not a sudden cure or broad smile. Almost locked camera, hand-painted cinematic animation. Preserve identity and lighting. One continuous five-second shot. No morphing, text or camera jumps.

## 后续 45 秒

15–26s 走入社区，情绪天气意象随行；26–37s 树下坐下、喝水、收起手机；37–46s 与邻居交流；46–54s 进入服务中心并走近终端；54–60s 镜头进入屏幕、衔接操作示范。沿用原 03–07 旁白，逐镜头检查节奏。

## 验收与交付

- 动作必须发生在人物身上，不能用静态推拉替代走路、呼吸和停步。
- 逐镜核对脸、发型、服装、手指、脚步、肩包和空间连续性。
- 先验收 15 秒样片，再制作其余镜头；现有生产播放引用保留。
- 输出独立版本 sample-continuous-15s.mp4；最终 continuous-60s.mp4。1920×1080，16:9，30fps，H.264/AAC。
- 完整旁白、中文字幕、音乐轻压旁白；自然结束后进入实际操作示范。
- 待接入用户指定且可访问的图生视频服务后，使用逐镜头关键帧生成动作片段，再在现有 Remotion 工程合成。
