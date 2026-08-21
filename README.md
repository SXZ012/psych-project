# 高责任岗位心理状态辅助测评系统

面向航空飞行员、轨道交通、应急救援等高责任岗位的日常心理状态辅助筛查与趋势监测，也可扩展至校园、社区等公益心理健康场景。

系统通过约 60 秒的航空情境图题交互采集答题行为与正面人脸视频。后端异步调用合作方 V3.2 心理生理状态算法生成结构化结果，再由 Qwen Plus 在不修改专业分数和分类的前提下生成通俗、受约束的报告摘要，供授权管理人员查看和跟进。

> 本项目用于心理状态辅助筛查，不构成临床诊断、岗位胜任结论或飞行适航结论。

## 当前状态

项目已完成 Firefly RK3568 混合 APK、真实 V3.2 接口和管理报告的端到端验证，当前处于功能完善与商用化准备阶段。

### 已完成

- FastAPI、PostgreSQL、Redis、SQLAlchemy 异步后端
- Vue 3 + TypeScript + Vite 模块化测评端和管理后台
- 身份录入、知情同意、人脸定位、60 秒测评与完成页
- Firefly Android 11 混合 APK
  - Camera2 采集前置 RGB 摄像头
  - MediaCodec 硬件编码 1920×1080、30fps、H.264
  - MP4 不采集麦克风和音频轨
  - WebView 复用在线业务页面
- 真实 V3.2 全链路：视频上传、任务创建、轮询、结果和时间轴获取
- V3.2 结构化结果落库与四页管理报告
- Qwen Plus 受约束摘要：只解释合作方结果，不重算分数、不生成诊断
- 航空情境草案题库：5 类题型、每类 4 张真实航空图片，共 20 张
- 5 段预生成题目语音，同类图片复用同一段语音，现场不依赖云端 TTS
- 我方私有 OSS 备份与合作方分析上传相互独立
- 管理员查看、搜索、备注、信息编辑与状态流转
- 前端资源本地化、1280×800 横屏触控适配和原生启动屏
- 正式入口与构建目录统一：`/login/` 对应 `static/terminal/`，`/admin/` 对应 `static/admin/`
- 代码质量验证：后端 Ruff 检查通过、pytest 26 项通过（1 项真实接口测试按配置跳过），两套前端生产构建通过

### 待完成

- 航空心理学合作方对题库内容、维度和表达进行正式审定
- 阿里云 ECS、域名、HTTPS 和生产环境部署
- 正式 RBAC、敏感字段加密、审计与密钥管理
- 生产级异步任务队列和监控告警
- APK Kiosk 模式、开机自启、看门狗和断网补传
- 多轮真机稳定性测试、异常恢复测试和用户验收

## 系统流程

```text
被测者
  → /login/
  → 身份录入 → 知情同意 → 人脸定位
  → 60 秒航空情境测评与视频采集
  → 提交视频和答题行为 → 完成页

后端
  → 保存测评记录 → 上传合作方 V3.2
  → 轮询分析任务 → 保存结构化结果与时间轴
  → 生成受约束报告摘要

管理员
  → /admin/ → 查看列表与四页报告
  → 添加备注并更新跟进状态
```

摄像头在知情同意后开启，用于人脸定位；只有检测到单人面部并保持在引导框内，才允许开始测评。正式录像仅在测评开始后启动，在约 60 秒流程结束时停止。项目不采集麦克风，不申请录音权限。

## 报告结构

管理报告以合作方 V3.2 结构化结果为唯一专业数据来源。Qwen Plus 只负责受约束的语言整理，不修改数值、档位、分类和参考信息。

| 页面 | 内容 |
| --- | --- |
| 综合概览 | 汇总数据有效性、核心状态、方向筛查结果和本次重点 |
| 方向筛查 | 展示抑郁、焦虑方向的合作方分类及解释边界 |
| 核心状态 | 展示压力负荷、疲劳/恢复负荷、生理唤醒线索和视觉注意力 |
| 数据证据 | 展示数据质量以及 AU、Vibra、rPPG、眼动等辅助证据 |

数据证据页内部按 AU、Vibra、rPPG 和眼动四类来源组织，仍属于同一个报告页面，不再作为独立报告页重复展示。

报告遵守以下原则：

- 抑郁和焦虑只作为方向筛查，不等同于临床诊断
- AU、Vibra、rPPG 和眼动是辅助证据，单项偏高或偏低不直接形成风险结论
- 缺失或未达到质量要求的数据明确标注，不补算、不虚构
- 不使用一次视频结果判断人格、攻击性、岗位胜任或飞行适航

## 航空情境题库

当前航空情境草案包含 5 类题型，每类维护 4 张真实航空图片。单次测评从每类随机抽取 1 张，共展示 5 道题。

| 类型 | 场景 |
| --- | --- |
| 注意分配 | 仪表监控与多信息变化 |
| 工作负荷 | 时间压力下的任务处理 |
| 情境意识 | 运行条件与预期发生偏差 |
| 程序与安全意识 | 时间紧张时的程序复核 |
| 机组沟通 | 判断不一致时的协同决策 |

资源位置：

- `backend/app/static/assets/aviation/content.json`
- `backend/app/static/assets/aviation/sources.json`
- `backend/app/static/assets/aviation/audio/`

当前题目为内容与交互草案，不参与合作方 V3.2 心理指标计算，也不能表述为已经完成航空心理学效度验证的正式量表。

```bash
# 启用航空情境题库
python scripts/seed_aviation_bank.py

# 重新生成五段本地题目语音
python scripts/generate_aviation_audio.py
```

## 项目结构

```text
psych-project/
├─ backend/
│  ├─ app/
│  │  ├─ api/routes/          # 测评、图题、管理和健康检查接口
│  │  ├─ core/                # 配置与日志
│  │  ├─ db/                  # 数据库连接与会话
│  │  ├─ models/              # 测评、结果和图题模型
│  │  ├─ schemas/             # 请求与响应模型
│  │  ├─ services/
│  │  │  ├─ assessment.py    # 测评任务编排
│  │  │  ├─ scheduler.py     # 图题会话调度
│  │  │  ├─ v3/              # V3.2 Mock/Real Provider
│  │  │  ├─ qwen/            # 受约束报告摘要
│  │  │  └─ oss/             # 对象存储
│  │  ├─ static/              # 前端构建产物和本地静态资源
│  │  └─ main.py             # FastAPI 入口
│  └─ tests/
├─ frontend/
│  ├─ terminal-web/           # 测评端 Vue 3 + TypeScript
│  └─ admin-web/              # 管理后台 Vue 3 + TypeScript
├─ android/                   # WebView + Camera2 + MediaCodec 混合 APK
├─ scripts/                   # 环境、题库、语音和部署辅助脚本
├─ data/                      # 本地运行数据
├─ docker-compose.yml
├─ .env.example
└─ README.md
```

## 技术栈

- 后端：Python 3.12、FastAPI、SQLAlchemy 2.0 Async、Pydantic Settings
- 数据库与缓存：PostgreSQL 16、Redis 7
- 前端：Vue 3、TypeScript、Vite、Vue Router、Pinia
- Android：Kotlin、WebView、Camera2、MediaCodec、MediaMuxer
- 算法与表达：合作方 V3.2、阿里云百炼 Qwen Plus
- 存储：阿里云 OSS
- 基础设施：Docker Compose、Adminer
- 质量工具：pytest、Ruff、vue-tsc、Vite

## 页面入口

| 地址 | 说明 |
| --- | --- |
| `http://localhost:8000/login/` | 正式测评入口 |
| `http://localhost:8000/admin/` | 管理后台与报告中心 |
| `http://localhost:8000/docs` | Swagger API 文档 |
| `http://localhost:8000/health` | 服务和数据库健康检查 |
| `http://localhost:8080` | Adminer 数据库管理 |

## 本地启动

项目主要在 WSL2 中运行。

```bash
# Python 环境
python -m venv .venv
source .venv/bin/activate
cd backend
pip install -e ".[dev]"
cd ..

# 环境变量
cp .env.example .env

# PostgreSQL、Redis、Adminer
docker compose up -d

# 后端
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --app-dir backend
```

前端构建：

```bash
npm --prefix frontend/terminal-web install
npm --prefix frontend/terminal-web run build

npm --prefix frontend/admin-web install
npm --prefix frontend/admin-web run build
```

前端构建产物由后端托管，正式入口保持 `/login/` 和 `/admin/` 不变。

如果 WSL 重启后 Windows 或局域网设备无法访问后端，在 Windows PowerShell 中运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\update-wsl-portproxy.ps1
```

## V3.2 配置

Mock 模式用于本地界面和流程验证：

```dotenv
PROVIDER_MODE=mock
```

真实 V3.2：

```dotenv
PROVIDER_MODE=real
V3_API_ROOT=https://example.com
V3_BASIC_TOKEN=xxx
V3_ALG_SERVICE_UUID=xxx
```

Mock 数据必须明确标识为演示数据，不代表被测者真实心理状态。正式报告只使用真实 V3.2 结果。真实密钥只保存在本地 `.env`，不得写入代码、README、日志或截图。

## API 概览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/health` | 服务和数据库健康状态 |
| `GET` | `/api/v1/pairs/session?count=5` | 获取本次图题会话 |
| `POST` | `/api/v1/assessments/submit` | 提交身份、视频和答题行为 |
| `POST` | `/api/v1/assessments/{id}/resubmit` | 重新提交失败任务 |
| `GET` | `/api/v1/assessments` | 查询测评列表 |
| `GET` | `/api/v1/assessments/{id}` | 查询测评详情和报告 |
| `POST` | `/api/v1/admin/login` | 管理员登录 |
| `PUT` | `/api/v1/admin/assessments/{id}/info` | 修改基础信息 |
| `PATCH` | `/api/v1/admin/assessments/{id}/note` | 修改内部备注 |
| `PATCH` | `/api/v1/admin/assessments/{id}/review-status` | 更新跟进状态 |

## 更新方式

- 测评页面、管理后台和普通业务逻辑：重新构建前端或重启后端，APK 通常无需重装
- Camera2、MediaCodec、WebView Bridge 等 Android 原生代码：重新构建并安装 APK
- 题库：更新配置和静态资源后重新导入
- 报告表达：修改管理前端或 Qwen 受约束摘要规则，不修改合作方原始结果

## 测试

```bash
cd backend
pytest -q
ruff check .

cd ../frontend/terminal-web
npm run build

cd ../admin-web
npm run build
```

Android 单元测试和 APK 构建方式见 `android/README.md`。

当前最近一次验证结果：后端 `26 passed, 1 skipped`，Ruff 无错误；管理端和测评端均已通过 `vue-tsc` 与 Vite 生产构建。

## 合规与安全

- 知情同意覆盖敏感个人信息、视频采集、用途、保存和非诊断声明
- 身份证在管理接口和页面中默认脱敏显示
- 测评完成后清除终端身份状态，用户端不展示报告
- 管理接口要求管理员会话
- `.env`、视频、报告原始数据和真实凭证禁止提交 Git
- 正式公网部署前必须完成 HTTPS、RBAC、敏感字段加密、审计和备份策略
