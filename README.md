# 高责任岗位与公益心理测评系统

面向航空飞行员、轨道交通、应急救援等高责任岗位的日常心理状态监测，同时兼顾社区、校园等公益心理健康筛查场景。

系统通过约 60 秒的“情绪诱发图片 + 即时单选题”交互采集用户反应和摄像头视频；后端异步调用合作方 V3 心理生理状态算法生成结构化结果，再由QwenPlus在不重算分数的前提下生成供管理员复核的专业报告。用户端不展示报告。

> 本项目定位为心理状态辅助筛查和趋势监测工具，不构成临床诊断。

## 当前状态

**Demo 阶段（用户提交链路已跑通，正在进行真实 V3 联调与真机采集验证）**：

- ✅ FastAPI + PostgreSQL + Redis + 结构化日志 + 环境变量管理
- ✅ 图题库 ORM + 随机会话调度 + 批量注入脚本（24 张 CC0 图 × 2 题 = 48 配对包）
- ✅ V3 Provider 抽象层（Mock/Real 零成本切换）
- ✅ V3结构化结果落库 + QwenPlus后台专业报告
- ✅ 被测者登录页（姓名+身份证校验）+ 知情同意书（8 条 PIPL 合规条款）
- ✅ 60 秒终端测评（Vue3 + Tailwind 单文件）
  - 知情同意 → 人脸检测 → 开场呼吸引导(5s) → 图片轮播(5×10s=50s) → 收尾(5s) → 视频上传
  - 全屏图片 + 毛玻璃选项 + TTS 语音引导 + 严格 60 秒时序
- ✅ 管理后台（5 Tab 完整 V3 报告 + 编辑/备注/状态流转 + 倒计时）
- ✅ 用户端完成页（提交成功后不展示报告，30秒无操作自动返回）
- ✅ 后台报告状态展示（提交/上传/分析/生成/完成/失败）
- ✅ 我方私有 OSS 视频备份 + 合作方上传状态独立记录；无我方 OSS 时保留本地临时副本

当前优先级：
1. 阶段 6：确认合作方 Token、上传/任务/轮询接口，完成真实 V3 联调；
2. 阶段 4：用手机或 USB 摄像头完成真人 60 秒采集和端到端验证；
3. 阶段 2：先导入 10–20 张图片验证图库映射，再批量导入 100 张正式图库；
4. 阶段 5：补齐持久化任务队列、重试/超时、权限、审计和临时文件清理；
5. 硬件盒子预计约一个月后到位，届时进行阶段 8 的触屏、摄像头、VPU、断网缓存和看门狗适配。

待完成：真实 V3 联调、生产级任务队列、正式 RBAC、FFmpeg 转码、云端部署、硬件适配和最终验收。

## 系统架构

```text
被测者 → /login（身份录入）
      → /demo（知情同意 → 人脸检测 → 60秒测评 → 视频提交 → 完成页）

管理后台 → /admin（管理员登录 → 报告列表 → 5Tab详情 → 编辑/备注/状态流转）

后端 FastAPI
  ├── 测评编排（视频接收 → V3分析 → QwenPlus后台报告 → 落库）
  ├── 图题调度（随机不重复 × 按图去重）
  ├── 后台管理（编辑信息 / 备注 / 状态流转）
  └── OSS 上传（我方私有备份 + 合作方V3 OSS）

V3 Provider（ABC 抽象）
  ├── Mock（回放 sample_result.json + 随机扰动）
  └── Real（httpx 异步，Token 鉴权，待凭证）

报告
  └── V3结构化结果 → QwenPlus专业化表达（不重算分数）→ 授权管理员查看
```

## 技术栈

- 后端：Python 3.12、FastAPI、SQLAlchemy 2.0 Async、Pydantic Settings
- 数据库与缓存：PostgreSQL 16、Redis 7
- 前端：Vue 3 Global Build（CDN）、Tailwind CSS（CDN）、原生浏览器 API
- AI：合作方V3心理生理状态算法、阿里云百炼QwenPlus（后台报告表达层）
- 对象存储：阿里云 OSS
- 基础设施：Docker Compose、Adminer
- 测试与质量：pytest、Ruff

## 页面入口

| 地址 | 说明 |
| --- | --- |
| `http://localhost:8000/login` | 被测者身份录入入口（姓名+身份证） |
| `http://localhost:8000/demo` | 终端测评页面（需先 /login 录入身份） |
| `http://localhost:8000/admin` | 测评管理后台（口令门禁） |
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
│  │  ├─ static/              # login.html / demo.html / admin.html（Vue3 单文件）
│  │  └─ main.py              # FastAPI 应用入口
│  └─ tests/
├─ scripts/
│  ├─ env_check.sh            # 环境诊断
│  └─ seed_image_bank.py      # 图题库导入（--fetch/--csv/--dir/--requestion）
├─ docker-compose.yml          # PG + Redis + Adminer
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

打开 `http://localhost:8000/login`，录入姓名和身份证号，进入 60 秒测评流程。

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

## Mock 与真实 V3

默认 Mock 模式：

```dotenv
PROVIDER_MODE=mock
```

Mock 回放 V3 fixture（sample_result.json，21 字段全覆盖），并对分数做小幅随机扰动。受测端会明确显示“演示数据”，仅用于验证流程和报告版式，不代表被测者的实际心理状态。

切换真实接口：

```dotenv
PROVIDER_MODE=real
V3_API_ROOT=https://example.com
V3_BASIC_TOKEN=xxx
V3_ALG_SERVICE_UUID=xxx
```

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
| 5 Tab 完整报告 | 总览 / 核心维度(6维) / 临床筛查 / 质量置信 / 时间线 |
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

- 阶段 5：Celery/Arq 任务队列 + WebSocket 时隙协议 + Alembic 迁移 + 加密/审计（阶段 6 联调稳定后推进）
- 阶段 6：真实 V3 联调（Token） + OSS timeline 转存（当前最高优先级）
- 阶段 7：阿里云 ECS + 公网 HTTPS
- 阶段 8：硬件盒子适配（预计硬件到位后实施：VPU 硬编 / 断网缓存 / 看门狗）
- 阶段 9：测试验收与交付

## 安全提示

- `.env` 已被 Git 忽略，禁止提交真实 API Key、Token、密码
- 管理后台为 Demo 级权限，不应直接暴露公网
- 身份证字段当前明文存储，生产前必须完成加密改造
