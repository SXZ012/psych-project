# 航空测评流程架构与视觉交接文档

> 2026-09 自定节奏与一体化产品升级（aviation-self-paced-v1）。
> 航空终端现包含“开始测评 / 查询报告”双入口；社区仍保持独立的扫码、
> 支付与手机报告流程。两种场景共用采集、任务与设备基础设施，不混用身份和报告模板。

## 零、一体化终端闭环

```
航空首页
├─ 开始测评 → 身份 → 同意 → 就位 → 三题预训练 → 60秒采集
│            → 服务端持久化测评与任务 → 一次性查询码 → 返回首页
├─ 查询报告 → 员工编号 + 查询码 → 处理中 / 已完成 / 需处理 / 采集无效
└─ 左上角五击 → 工作人员认证 → 设备与任务面板
```

- 合作方分析通常需要 3—4 分钟，终端提交成功后立即可供下一人使用。
- 查询码只在 POST body 中传输；服务端仅保存加 pepper 的 SHA-256 摘要。
- 后台任务写入 `processing_tasks`，开发可内嵌 worker，生产使用独立
  `python -m app.worker`；数据库租约与退避支持重启恢复。
- 正式设备由 `device_id` 绑定 aviation 或 community。普通用户不选择场景。

## 一、产品流程（已实现）

```
身份确认 → 知情同意+素材预加载 → 人脸就位 → 三道预训练（可跳过）
→ 开始提示+3秒倒计时 → 60秒自定节奏连续图题 → 采集完成
→ 数据整理 → 保存提交（失败可幂等重试） → 完成退出（清空终端个人信息）
```

- **正式阶段固定时长、不固定题数**：60 秒从"录制实际启动成功"起算（单调时钟），
  做得快不提前结束、做得慢不被催题；界面不展示"第几题/共几题"。
- 点击选项立即锁定反馈，约 200ms 后切下一题；有固定"暂时跳过"；
  跳过/未完成/已选择分别记录，不自动代选。
- 收尾调度（试验配置）：剩余 >10s 出常规题；4–10s 新题优先收尾题池；≤4s 完成当前题后进入收尾页。
- 题池耗尽 → 收尾页 + `pool_exhausted_at_ms=…` 审计记录（不重复题、不伪造、不卡住）。
- 采集失效（确认出框）→ 播完整失效说明 → 重新就位重开；**预训练完成状态保留**。

## 二、架构职责与文件索引

```
frontend/terminal-web/src/
├── aviation/                      # 纯逻辑控制器（不依赖 Vue，可单测）
│   ├── types.ts                   # 阶段/事件/题目/就位/音频/提交 全部类型
│   ├── config.ts                  # 试验配置集中（切题节奏/收尾窗口/题池/倒计时…）
│   ├── messages.ts                # 全部提示文案集中（改文案只动这里）
│   ├── FlowController.ts          # 阶段状态机：转换表唯一事实来源，非法转换一律拒绝
│   ├── QuestionScheduler.ts       # 自定节奏调度：题池/实例令牌/防误触/收尾/冻结
│   ├── AudioCoordinator.ts        # 语音优先级(失效>位置>提示>题目)/防重叠/取消三态
│   ├── audioPlayers.ts            # HTMLAudioElement 真实播放器（预载超时/无加速）
│   ├── FaceReadiness.ts           # 就位四态(ok/warn/fail/error)+稳定门槛+过期
│   ├── SubmissionService.ts       # 提交/幂等(client_token)/状态区分
│   ├── questionPool.ts            # 题库拉取/校验/划分/素材预载
│   └── cameraSink.ts              # 浏览器预览视频源动态重绑（provide/inject）
├── capture/
│   ├── CaptureController.ts       # 60s 连续采集判定（未改动，13 项测试守护）
│   └── protocol.ts                # 采集协议常量（合作方约束+待确认阈值标注）
├── composables/
│   ├── useAviationFlow.ts         # 编排胶水：创建控制器、桥接 DOM/摄像头/计时器
│   ├── useCameraSink.ts           # 预览组件注册视频元素
│   └── useBrowserCamera.ts        # 流+录制+attach/detach（修阶段切换黑屏）
└── components/                    # 纯展示组件（props 进、事件出）
```

### 关键机制速查

| 机制 | 实现位置 | 说明 |
|---|---|---|
| 60s 计时零点 | `useAviationFlow.startCapture` | 录制器 start 成功后才 `controller.start()` |
| 时长计算 | `CaptureController.elapsedMs` | 单调时钟差，绝不累计定时次数 |
| 防重复封存 | `CaptureController` 状态机 + `FlowController` 转换表 | 单向终态；迟到回调被拒 |
| 防旧题误选 | `QuestionScheduler.select/skip(instanceId,…)` | 事件带题目实例标识 |
| 切题回调取消 | `scheduler.update(elapsed)` 由采集时钟驱动 | 停驱即冻结，无 setTimeout 挂起 |
| 语音恢复只限当前题 | `AudioCoordinator.isQuestionCurrent` | 提醒结束后校验实例仍有效 |
| 失效说明完整播放 | `playInvalidExplanation` critical | `stopAll()` 不打断，仅整场 dispose |
| 提交幂等 | `SubmissionService.begin()` + 后端 client_token | 网络失败重试不重复建记录 |
| 检测过期 | `FaceReadiness.tickStale/refresh` | ready 不得静默维持 |

## 三、后端契约变更（全部向后兼容，旧终端不受影响）

| 变更 | 位置 | 说明 |
|---|---|---|
| `GET /api/v1/pairs/aviation/pool?count=N` | `pairs.py` + `scheduler.get_aviation_pool` | 按 **pair** 去重（旧 `/session` 按维度+图片去重，40 题库只回 6 题）；图片优先不重复，不足用图片复用题补足；社区 `/session` 规则不变 |
| `POST /submit` 新增可选字段 | `assessments.py` | `client_token`（幂等）、`content_version`、`scheduling_notes`；带 token 重试命中已有记录→更新+重跑任务，返回 200 |
| `assessments.client_token` 列 | `models/assessment.py` + `main.py` 启动迁移 | `VARCHAR(64)` 唯一索引；已在测试库/开发库自动补列 |
| resubmit 逻辑抽共享 | `_retry_existing_assessment` | 管理端 `/resubmit`（仍需管理员）与终端 token 重试共用，行为不变 |
| 审计字段落库 | `selections_data.capture_quality` | `protocol_version/timeline_version/interruptions/interrupted_ms/content_version/scheduling_notes` |

提交数据结构：`selections[]` 现含 **全部展示题目**，每条带 `outcome`（selected/skipped/unanswered）、`role`（regular/tail）；旧字段（question_id/picked/answered_ms）不变，报告兼容。

## 四、Android 原生路径

- `AssessmentUploader.submit` + `AndroidCameraBridge.submitAssessment`：
  透传 `client_token/protocol_version/question_protocol_version/content_version/scheduling_notes`（空值不发送，与旧请求逐字节一致）。
- 原生重试语义：网络失败保留 MP4 可重试；VideoQAFailed 清理文件需重新采集（既有行为）。
- `compileDebugKotlin` 通过；**真机端到端（真实录像+提交）待验**（见第六节）。

## 五、视觉协作者接手入口

### 组件契约（可整体替换，保持 props/events 即可）

| 阶段 | 组件 | 关键 props | 事件 |
|---|---|---|---|
| 身份 | `identity/IdentityForm.vue` | — | `submit(identity)` |
| 同意 | `consent/ConsentPanel.vue` | `assetsReady/assetsError/progress` | `confirm/retryAssets` |
| 就位 | `camera/FaceCheck.vue` | `readiness/notice/native` | `start` |
| 预训练 | `assessment/PracticeStage.vue` | `step/card/index/total/faceLevel…` | `selectDemo(id,option)/startCountdown/skipAll` |
| 倒计时 | `assessment/CountdownStage.vue` | `countdown` | — |
| 正式 | `assessment/QuestionStage.vue` | `card/remainingSec/progressPct/interrupting…` | `select(instanceId,optionId)/skip(instanceId)` |
| 图题卡 | `assessment/ImageQuestion.vue` | `instance/selected/skipped/skippable` | `select/skip`（带 instanceId） |
| 预览 | `camera/CameraMonitor.vue` | `message/state/expanded` | —（内部自注册 cameraSink） |
| 反馈 | `feedback/*.vue` | 见组件 | `restart/retry/finish/activity` |

`SchedulerCard` 三态：`question`（等待作答）/ `feedback`（已锁定，含 outcome）/ `closing`（收尾页）。

### 样式入口

- **设计令牌**：`src/styles/terminal.css` 顶部 `:root{…}` —— 尺寸/间距/字号/颜色/动效
  （`--fs-*` 字号、`--tx-*` 文本、`--aq-*` 图题卡、`--cm-*` 顶部预览、`--fc-*` 就位页、`--motion-*`）。
  组件内一律 `var(--x, fallback)`，改令牌即全局生效。
- **文案**：`src/aviation/messages.ts`（全部提示文案，含 `audioCueFiles` 文件名清单）。
- **内容配置**：题库图片/题干/音频来自后端 `content.json`（`backend/app/static/assets/aviation/`），
  通过 `/api/v1/pairs/aviation/pool` 下发；`imageAlt`/`audioUrl` 由 `questionPool.ts` 映射。
- **演示入口**：`/login/?demo=1` 阶段画廊（22 屏，mock 数据，不录像不提交）；
  `?sim=1` 全流程模拟（合成人脸、无录像、无提交）。**正式入口 `/login/` 默认真实模式。**

### 动效约束

动画只表现状态（反馈高亮/进度条/呼吸圈），一切业务时长由时钟驱动；
进度条 `transition: width .1s linear` 仅平滑显示，不做计时。

## 六、验证结果与已知限制

### 已验证

- **单元测试**：前端 57/57；后端 80 passed、1 skipped。覆盖自定节奏、
  提交幂等、持久任务关联、报告凭证、正常轮询与错误限频，并回归社区链路。
- **类型检查/构建**：`vue-tsc -b` 0 错误；`vite build` 产物已部署 `backend/app/static/terminal/`。
- **Android**：此前版本的 `gradle compileDebugKotlin` 通过；本轮新增原生查询码
  回传后尚未重新编译（仓库当前缺少 Gradle wrapper，需在 Android Studio 或标准 Gradle 环境验证）。
- **真机（RK3568, WebView）sim 全流程**：登录→同意(素材预载 1.3–1.9s)→就位→预训练三题(含双击锁定)
  →倒计时→60s 正式（5 答+1 跳过，无题号计数）→自然封存→完成退出。
  截图 `artifacts/self-paced-*.png`；驱动脚本 `scripts/terminal-self-paced-qa.mjs`。

### 待合作方确认（未确认前不宣称已验证）

- `detectionDebounceMs=300`（防抖窗口≠容忍窗口）、`staleDetectionMs=2000`、
  `sustainedAlertMs=2000`、`readyStableMs=2000`（`capture/protocol.ts` 已标注）。
- 收尾调度参数（`tailFromMs/closingFromMs/tailPoolSize`）为产品试验配置（`aviation/config.ts`）。
- 题池上限 24、最低 10：当前题库 40 题下的运维参数。

### 待真机验证（本轮未做，不得视为已通过）

1. **真实录像端到端**：原生 startRecording→60s→stopRecording→原生 submitAssessment→
   后端收件→QA 门禁→报告生成（含 client_token 幂等实测）。
2. 浏览器路径真实录像+真实提交（MediaRecorder webm → /submit）。
3. 真实人脸偏离→失效→重开（保留预训练状态）真机回归。
4. 上传失败→重试原视频（双路径）实测。
5. 上电/断网等现场异常回归。

### 已知限制

- 原生提交后端 QA 拒绝时删除本地 MP4（既有行为）；浏览器路径视频存内存，页面关闭即失
  （提交失败重试期间不要关页面——界面已有"请勿关闭"提示）。
- `?sim=1`/`?demo=1` 是开发入口，不进正式数据；真机验证后请以 `/login/` 正常地址运行。
- 极端连点（>5 次/秒）在题池耗尽后停留在收尾页——这是按规则的兜底而非卡死。
