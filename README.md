# 高责任岗位与公益心理测评系统

面向航空飞行员、轨道交通、应急救援等高责任岗位的日常心理状态监测，同时兼顾社区、校园等公益心理健康筛查场景。

系统通过约 60 秒的“情绪诱发图片 + 即时单选题”交互采集用户反应，并预留摄像头视频分析链路；后端调用合作方 V3 心理生理状态算法生成结构化结果，再由 QwenPlus 将专业指标转成面向用户的自然语言报告。

> 本项目定位为心理状态辅助筛查和趋势监测工具，不构成临床诊断。

## 当前状态

**Demo 阶段（阶段 1-4 完成，进度 53%）**：

- ✅ FastAPI + PostgreSQL + Redis + 结构化日志 + 环境变量管理
- ✅ 图题库 ORM + 随机会话调度 + 批量注入脚本（24 张 CC0 图 × 2 题 = 48 配对包）
- ✅ V3 Provider 抽象层（Mock/Real 零成本切换）
- ✅ QwenPlus 个性化报告生成 + 结构化结果落库
- ✅ 被测者登录页（姓名+身份证校验）+ 知情同意书（8 条 PIPL 合规条款）
- ✅ 60 秒终端测评（Vue3 + Tailwind 单文件）
  - 知情同意 → 人脸检测 → 开场呼吸引导(5s) → 图片轮播(5×10s=50s) → 收尾(5s) → 报告
  - 全屏图片 + 毛玻璃选项 + TTS 语音引导 + 严格 60 秒时序
- ✅ 管理后台（5 Tab 完整 V3 报告 + 编辑/备注/状态流转 + 倒计时）
- ✅ 用户报告（V3 对齐版：数据质量 / 状态总览 / 核心指标 / 风险提示 / 行动建议 / 使用边界）
  - 优先轮询并展示本次测评的真实结构化结果
  - Mock Provider 或接口降级时醒目标注“演示数据”，避免被误认为真实结论
  - 核心指标按五档状态展示；临床相关分值明确标注为算法 0–100 参考分
  - 180 秒无操作自动退出，滚动、触摸和按键会重置计时

待完成：真实视频录制上传与 V3 联调、Alembic 迁移、任务队列、云端部署、硬件适配。

## 系统架构

```text
被测者 → /login（身份录入）
      → /demo（知情同意 → 人脸检测 → 60秒测评 → 报告）

管理后台 → /admin（口令门禁 → 报告列表 → 5Tab详情 → 编辑/备注/状态流转）

后端 FastAPI
  ├── 测评编排（创建 → V3分析 → Qwen报告 → 落库）
  ├── 图题调度（随机不重复 × 按图去重）
  ├── 后台管理（编辑信息 / 备注 / 状态流转）
  └── OSS 上传（presigned URL）

V3 Provider（ABC 抽象）
  ├── Mock（回放 sample_result.json + 随机扰动）
  └── Real（httpx 异步，Token 鉴权，待凭证）

Qwen 报告
  └── V3 结构化结果 → QwenPlus → 面向用户的单屏评分卡
```

## 技术栈

- 后端：Python 3.12、FastAPI、SQLAlchemy 2.0 Async、Pydantic Settings
- 数据库与缓存：PostgreSQL 16、Redis 7
- 前端：Vue 3 Global Build（CDN）、Tailwind CSS（CDN）、原生浏览器 API
- AI：合作方 V3 心理生理状态算法、阿里云百炼 QwenPlus
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

Mock 模式无需 V3 凭证即可运行。需要 Qwen 报告或 OSS 图库时，请在 `.env` 中填写相应凭证。

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
60s+    等待 V3 任务完成并展示 6 部分对齐报告
        → 真实接口成功：展示本次真实结构化结果
        → Mock/接口降级：醒目标注“演示数据”
        → 180 秒无操作自动返回登录页（操作时重置）
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
| `POST` | `/api/v1/assessments` | 创建测评（name+id_card 必填） |
| `GET` | `/api/v1/assessments` | 查询测评列表 |
| `GET` | `/api/v1/assessments/{id}` | 查询测评详情与完整 V3 报告 |
| `POST` | `/api/v1/admin/login` | 校验管理口令 |
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
- **身份证脱敏**：列表显示 `前6位********后4位`
- **报告阅后清除**：用户退出后清除本机身份缓存，下一位不会看到上一人报告
- **180 秒无操作自动退出**：阅读、滚动、触摸或按键会重置计时，兼顾隐私保护与完整阅读

## 测试

```bash
cd backend
pytest -q
ruff check .
```

## 生产化路线（阶段 5-9）

- 阶段 5：Celery/Arq 任务队列 + WebSocket 时隙协议 + Alembic 迁移 + 加密/审计
- 阶段 6：真实 V3 联调（Token） + OSS timeline 转存
- 阶段 7：阿里云 ECS + 公网 HTTPS
- 阶段 8：硬件盒子适配（VPU 硬编 / 断网缓存 / 看门狗）
- 阶段 9：测试验收与交付

## 安全提示

- `.env` 已被 Git 忽略，禁止提交真实 API Key、Token、密码
- 管理后台为 Demo 级权限，不应直接暴露公网
- 身份证字段当前明文存储，生产前必须完成加密改造
