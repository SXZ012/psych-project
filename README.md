# 高责任岗位与公益心理测评系统

面向航空飞行员、轨道交通、应急救援等高责任岗位的日常心理状态监测，同时兼顾社区、校园等公益心理健康筛查场景。

系统通过约 60 秒的“情绪诱发图片 + 即时单选题”交互采集用户反应和摄像头视频；后端异步调用合作方 V3 心理生理状态算法生成结构化结果，再由QwenPlus在不重算分数的前提下生成供管理员复核的专业报告。用户端不展示报告。

> 本项目定位为心理状态辅助筛查和趋势监测工具，不构成临床诊断。

## 当前状态

**真机端到端已通（Firefly RK3568 混合 APK + 真实 V3 + rPPG 可用），进入商用化阶段**：

- ✅ FastAPI + PostgreSQL + Redis + 结构化日志 + 环境变量管理
- ✅ 图题库 ORM + 随机会话调度 + 批量注入脚本（24 张 CC0 图 × 2 题 = 48 配对包）
- ✅ V3 Provider 抽象层（Mock/Real 零成本切换）
- ✅ 真实 V3 联调：上传、建任务、轮询、获取 `result`、下载 `timeline` 全链路验证通过
- ✅ V3 结构化结果落库 + QwenPlus 后台专业报告
- ✅ 被测者登录页（姓名+身份证+自带数字键盘）+ 知情同意书（8 条 PIPL 合规条款）
- ✅ 模块化测评端（Vue 3 + TypeScript + Vite，全资源本地化零外链）
  - 知情同意 → 人脸检测 → 开场引导(5s) → 图片轮播(5×10s=50s) → 收尾(5s) → 视频上传
  - 全屏图片 + 严格 60 秒时序；浏览器走 MediaRecorder，APK 走 Camera2/MediaCodec 硬编
- ✅ 混合 Android APK（Firefly IPC-M10R800-A3568J / RK3568 / Android 11 / arm64-v8a）
  - WebView 复用现有页面，原生 Camera2 采集 1080P RGB
  - MediaCodec 硬编 H.264（OMX.rk.video_encoder.avc，1920×1080@30fps，5Mbps）
  - MediaMuxer 输出无音频 MP4；CPU 占用 <5%（规格要求 <40%）
  - JS Bridge 同源校验、防重状态机、multipart 原生上传
  - 19 个单元测试通过（摄像头选择/编码器选择/URL 校验）
- ✅ rPPG 心率可用（1080P H.264 硬编后 physiology_available=true，实测 79bpm）
- ✅ 模块化管理后台（Vue 3 + TypeScript + Vite；V3.2 五页证据报告 + 编辑/备注/状态流转 + 结果无效标识）
- ✅ 视频上传前 ffprobe 质检（30–70s）+ ffmpeg 自动修复（WebM 无时长 → 无损 remux → H.264 MP4 兜底）
- ✅ V3 结果有效性校验（时长 0 / frame_count 负溢出 → 标记 invalid_result，不作正式报告）
- ✅ 我方私有 OSS 备份与合作方 V3 上传双路径独立；备份失败不阻断主流程
- ✅ 前端全资源本地化（Vue/Tailwind/字体/图片均从后端 static/ 加载，断网不白屏）
- ✅ 横屏终端适配（1280×800 主画布，沉浸式全屏，触控 ≥52px）
- ✅ 沉浸式启动屏（原生渲染，零白屏等待）

当前优先级（商用路线）：
1. 阶段 7：云端部署（阿里云 ECS + 域名 + HTTPS + Docker 化后端）
2. 阶段 5：生产级任务队列（Celery/Arq）+ 正式 RBAC + 数据加密
3. 阶段 8：APK Kiosk 模式 + 开机自启 + 看门狗 + 断网缓存
4. 阶段 9：监控告警 + 7×24 稳定性测试 + 正式图库 + UAT

待完成：云端部署、生产队列、RBAC、数据加密、Kiosk/看门狗/断网缓存、正式图库、验收测试。

## 系统架构

```text
被测者 → /login/（身份录入 → 知情同意 → 人脸检测 → 60秒测评 → 视频提交 → 完成页）

管理后台 → /admin/（管理员登录 → 报告列表 → V3.2五页详情 → 编辑/备注/状态流转）

后端 FastAPI
  ├── 测评编排（视频接收 → V3分析 → QwenPlus后台报告 → 落库）
  ├── 图题调度（随机不重复 × 按图去重）
  ├── 后台管理（编辑信息 / 备注 / 状态流转）
  └── OSS 上传（我方私有备份 + 合作方V3 OSS）

V3 Provider（ABC 抽象）
  ├── Mock（回放 sample_result.json + 随机扰动）
  └── Real（httpx 异步，Token 鉴权，已完成独立联调）

报告
  └── V3结构化结果 → QwenPlus专业化表达（不重算分数）→ 授权管理员查看
```

## 技术栈

- 后端：Python 3.12、FastAPI、SQLAlchemy 2.0 Async、Pydantic Settings
- 数据库与缓存：PostgreSQL 16、Redis 7
- 前端：Vue 3、TypeScript、Vite、Vue Router、Pinia、原生浏览器 API
- AI：合作方V3心理生理状态算法、阿里云百炼QwenPlus（后台报告表达层）
- 对象存储：阿里云 OSS
- 基础设施：Docker Compose、Adminer
- 测试与质量：pytest、Ruff

## 页面入口

| 地址 | 说明 |
| --- | --- |
| `http://localhost:8000/login/` | 被测者正式测评入口（姓名+身份证、知情同意、人脸确认、60秒测评） |
| `http://localhost:8000/admin/` | 正式测评管理后台（口令门禁、五页报告） |
| `http://localhost:8000/demo` | 兼容旧测评页地址，自动跳转到 `/login/` |
| `http://localhost:8000/docs` | Swagger API 文档 |
| `http://localhost:8000/health` | 服务及数据库健康检查 |
| `http://localhost:8080` | Adminer 数据库管理页面 |

## 目录结构

```text
psych-project/
├─ backend/
│  ├─ app/
│  │  ├─ api/routes/           # health / assessments / pairs / uploads / admin
│  │  ├─ core/                # 配置与日志
│  │  ├─ db/                  # SQLAlchemy 引擎和会话
│  │  ├─ models/              # Assessment + AssessmentResult + Image + Pair
│  │  ├─ schemas/             # Pydantic 请求/响应模型
│  │  ├─ services/
│  │  │  ├─ assessment.py     # 测评任务编排
│  │  │  ├─ scheduler.py      # 图题随机调度（按图去重）
│  │  │  ├─ v3/               # V3Provider(ABC) + Mock + Real
│  │  │  ├─ qwen/             # QwenPlus 客户端与报告 Prompt
│  │  │  └─ oss/              # 阿里云 OSS 客户端
│  │  ├─ static/              # 前端构建产物、图片与本地 MediaPipe 资源
│  │  └─ main.py              # FastAPI 应用入口
│  └─ tests/
├─ scripts/
│  ├─ env_check.sh            # 环境诊断
│  └─ seed_image_bank.py      # 图题库导入（--fetch/--csv/--dir/--requestion）
├─ docker-compose.yml          # PG + Redis + Adminer
├─ frontend/
│  ├─ terminal-web/            # 测评端 Vue 3 + TypeScript 源码
│  └─ admin-web/               # 管理后台与五页报告 Vue 3 + TypeScript 源码
├─ android/                    # Firefly 混合 APK（WebView + Camera2 + MediaCodec）
├─ .env.example
└─ README.md
```

## 快速开始

### 1. 创建环境

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .\.venv\Scripts\Activate.ps1
cd backend && pip install -e ".[dev]" && cd ..
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

Mock模式无需V3凭证即可运行。1.0保留QwenPlus生成后台专业报告；未配置百炼凭证时保留V3结构化结果并记录报告生成失败日志。

### 3. 启动基础设施

```bash
docker compose up -d
```

### 4. 启动后端

```bash
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --app-dir backend
```

### 5. 浏览器访问

打开 `http://localhost:8000/login/`，录入姓名和身份证号，进入 60 秒测评流程。旧的 `/demo` 地址仍可使用，会自动跳转到该入口。

#### Windows 10 + WSL2 的 localhost 转发

如果 WSL 重启后 `localhost:8000` 无法访问，在 Windows PowerShell 中运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\update-wsl-portproxy.ps1
```

脚本会自动读取 WSL 当前 IP 并更新端口转发，无需手工修改地址。首次运行时若希望以后登录 Windows 自动更新，可执行一次：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\update-wsl-portproxy.ps1 -InstallStartupTask
```

## 测评流程（60 秒严格时序）

```text
0-5s    开场引导（呼吸光晕 + 欢迎语音）
5-55s   图片轮播（5 张 × 10 秒，文学性单选选项）
55-60s  收尾（对勾淡出 + "评估完成"语音）
60s+    封装并上传视频、答题和反应时数据
        → 提交成功：显示“测评已完成”，用户端不展示报告
        → 后台异步执行V3分析并由QwenPlus生成专业报告
        → 后台管理员通过姓名或身份证号查询报告
        → 清除本机身份，下一位重新录入
```

> 摄像头在知情同意后**提前开启用于人脸定位**，但 `MediaRecorder` **仅在正式测评（开场引导）开始时启动、收尾后停止**，全程约 59–60 秒；本项目**不采集麦克风**（`getUserMedia({audio:false})`），不申请麦克风权限。停止前会 `requestData()` 并等待最后一个分片与 `stop` 事件完成再封装上传；实际录制时长过短（<30s）、无分片或文件过小时，前端不会当作成功提交。

## 视频上传校验与自动修复（ffprobe + ffmpeg）

真机浏览器 `MediaRecorder` 分片生成的 WebM 常缺少容器级时长（`duration`），会导致合作方 V3 读出 `duration_seconds=0.0`、`frame_count` 负溢出，进而 rPPG / Vibra 正式分段 / 抑郁焦虑筛查全部不可用。后端在上传合作方之前做质量门禁与自动修复（`backend/app/services/video/qa.py`）：

1. **ffprobe 门禁**：读取是否可解码视频流、容器时长、编码、宽高、帧率、文件大小；不要求音频流。合格区间 **30–70 秒**（合作方约 60s 最佳；下界硬拒 `<30s`；超过 70s 裁剪到 70s，确保最终文件不超过合作方上限）。
2. **自动修复**（不覆盖原文件）：时长缺失时先**无损重封装**（`ffmpeg -fflags +genpts -c copy`，最快）；仍无时长再**转标准 H.264 MP4**（`libx264 -an -movflags +faststart`，`-t 60` 兜底）。
3. **双 OSS**：合格或修复合格后的**同一最终视频**用于上传合作方 V3，并按现有配置同步备份到我方私有 OSS；两者状态（`partner_upload_status` / `backup_status`）各自独立记录，任一失败都有独立错误。我方 OSS 未启用时保留本地副本，不影响合作方主流程；原始问题文件保留供审计。
4. **不合格不上传**：无法修复到 30–70s 的视频不会上传合作方、不创建 V3 任务、不生成报告。
5. **V3 结果有效性校验**：合作方返回后检查 `input.duration_seconds`、`quality.video_duration_seconds`、`session_duration_seconds` 与 `frame_count`；若时长为 0 或 `frame_count` 为负，测评状态置为 `invalid_result`、`result_valid=false`，**不生成正式报告**，仅保留 V3 原始结果供排查（不依据 `sampled_frames/sample_fps` 推断时长）。

**失败排查**：`/admin/` 列表显示状态（`结果无效` / `失败`）与原因；对应数据库字段为 `error_code`、`error_message`、`video_status`（如 `qa_failed`）与 `video_qa_json`（含原始/修复后 ffprobe 参数、处理耗时、最终文件）。

## Mock 与真实 V3

默认 Mock 模式：

```dotenv
PROVIDER_MODE=mock
```

Mock 回放 V3.2 fixture（sample_result_v32.json，含 rPPG 质量门控、AU 标注图与眼动未采集状态），并对分数做小幅随机扰动。受测端会明确显示“演示数据”，仅用于验证流程和报告版式，不代表被测者的实际心理状态。

切换真实接口：

```dotenv
PROVIDER_MODE=real
V3_API_ROOT=https://example.com
V3_BASIC_TOKEN=xxx
V3_ALG_SERVICE_UUID=xxx
```

API Key 与算法服务 UUID 是两个不同配置，均需由合作方提供。密钥只写入本地
`.env`（已被 Git 忽略），不要写进代码、README、日志或截图。

在切换整个业务流程前，建议先运行独立联调工具：

```bash
cd backend

# 只检查配置，不上传文件、不创建远端任务
python scripts/v3_integration_test.py

# 真实联调：上传视频、创建任务、轮询并保存 result/timeline
python scripts/v3_integration_test.py --video ../data/videos/test.webm

# 本地超时后续取已有任务（不会重复上传或创建任务）
python scripts/v3_integration_test.py --task-id 3026
```

真实结果保存于 `data/v3-integration/`（已被 Git 忽略）。按 V3.2 文档，60 秒视频在合作方
CPU 上通常需要约 2–3 分钟；本项目实测60秒720P视频约193秒，程序默认每5秒轮询，
最长等待30分钟。超时会保留合作方 `task_id`，可继续查询而不重复上传。真实 `timeline`
临时地址会在任务完成后立即下载并持久化，避免约1小时后失效。rPPG 心率/HRV
仅在返回的 `rppg_quality_gate.physiology_available=true` 时可解释。正式业务
确认联调通过后，再将 `PROVIDER_MODE` 改为 `real`。

## 图题库管理

```bash
# 抓取 Demo 图片（picsum CC0）
python scripts/seed_image_bank.py --fetch 24

# 从本地目录导入
python scripts/seed_image_bank.py --dir path/to/images

# CSV 精确导入图题
python scripts/seed_image_bank.py --csv questions.csv

# 刷新题目（保留图片）
python scripts/seed_image_bank.py --requestion
```

图题选项仅用于增强认知参与和沉浸体验，不直接参与心理评分。

## API 概览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/health` | 服务和数据库健康状态 |
| `GET` | `/api/v1/pairs/session?count=5` | 获取 5 张不重复图的题会话 |
| `GET` | `/api/v1/pairs/next` | 获取下一条图题 |
| `POST` | `/api/v1/uploads/images` | 上传图片到 OSS |
| `POST` | `/api/v1/assessments/submit` | 接收姓名、身份信息、视频及答题数据 |
| `POST` | `/api/v1/assessments/{id}/resubmit` | 失败任务重新提交（幂等） |
| `GET` | `/api/v1/assessments` | 管理员登录后查询测评列表 |
| `GET` | `/api/v1/assessments/{id}` | 管理员登录后查询完整V3报告 |
| `POST` | `/api/v1/admin/login` | 创建管理员HttpOnly会话 |
| `PUT` | `/api/v1/admin/assessments/{id}/info` | 修改被测者基础信息 |
| `PATCH` | `/api/v1/admin/assessments/{id}/note` | 修改内部备注 |
| `PATCH` | `/api/v1/admin/assessments/{id}/review-status` | 更新跟进状态（待查看/跟进中/已结案） |

## 后台管理功能

| 功能 | 说明 |
| --- | --- |
| 口令门禁 | `ADMIN_PASSWORD` 登录 |
| V3.2 五页证据报告 | 心理生理状态总览 / AU面部动作 / rPPG生理节律 / Vibra微振动 / 眼动注意力 |
| 分层表达 | 管理结论优先展示，同时保留来源标记、审计值、质量门控和专业限制 |
| Timeline 证据 | 展示 AU 候选帧、rPPG 波形、Formal 12 分段和眼动采集数据；缺失数据不补算 |
| 编辑基础信息 | 姓名 / 部门工号 / 身份证（分数受保护不可改） |
| 内部备注 | 管理员回访记录（仅后台可见，不出现在用户报告） |
| 状态流转 | 待查看 → 跟进中 → 已结案（卡片左边框变色 + 侧栏计数联动） |
| 搜索筛选 | 按日期 / 姓名 / 工号 / 处理状态筛选 |

## 合规与隐私

- **知情同意书**：8 条 PIPL 合规条款（敏感个人信息单独同意、数据不公开、非诊断声明等）
- **身份证脱敏**：API默认只返回掩码值，管理员页面显示掩码；姓名可用于后台检索
- **报告阅后清除**：用户退出后清除本机身份缓存，下一位不会看到上一人报告
- **后台权限**：测评列表、详情及管理写接口均要求管理员HttpOnly会话
- **30 秒自动退出**：用户完成页无操作自动返回，避免下一位使用者看到身份状态

## 测试

```bash
cd backend
pytest -q
ruff check .
```

## 生产化路线（阶段 5-9）

- 阶段 5：Celery/Arq 任务队列 + WebSocket 时隙协议 + Alembic 迁移 + 加密/审计（当前优先级）
- 阶段 6：真实 V3 独立联调已完成；下一步进行真人采集的业务链路复测与我方 OSS 正式备份验证
- 阶段 7：阿里云 ECS + 公网 HTTPS
- 阶段 8：终端运行适配（横屏触控 / 摄像采集兼容 / 断网缓存 / 看门狗）
- 阶段 9：测试验收与交付

## 安全提示

- `.env` 已被 Git 忽略，禁止提交真实 API Key、Token、密码
- 管理后台为 Demo 级权限，不应直接暴露公网
- 身份证字段当前明文存储，生产前必须完成加密改造
