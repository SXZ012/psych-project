# 高责任岗位与公益心理测评系统

> 面向航空飞行员、轨道交通、应急救援等高责任岗位的日常心理状态监测，兼顾社区/校园公益心理健康筛查。
> 端云协同架构：工控一体机采集 → 后端编排 → V3 微表情算法 + QwenPlus 报告。

## 技术栈
- **后端**：Python 3.12 · FastAPI · SQLAlchemy 2.0 (async) · Alembic · Pydantic-Settings
- **存储/缓存**：PostgreSQL 16 · Redis 7（Docker Compose）
- **AI**：V3 心理生理状态评估算法（合作方，异步任务）+ QwenPlus（个性化报告解读）
- **前端**：工控一体机交互端（后续阶段）

## 路线（Demo）
当前走 **路线 B（Mock）**：`PROVIDER_MODE=mock`，MockV3Provider 回放 `ziliao/v3_report_sample.html` 的真实样例结果，业务全链路闭环、不依赖外部接口。切换路线 A（真实 API）仅需 `.env` 改 `PROVIDER_MODE=real` 并填入 V3 凭证。

## 目录结构
```
psych-project/
├── backend/
│   ├── app/
│   │   ├── core/config.py          # 配置 (V3/Qwen/OSS/DB)
│   │   ├── db/base.py              # SQLAlchemy 引擎/会话
│   │   ├── api/routes/             # health / assessments
│   │   ├── models/assessment.py    # 测评任务 + 结果
│   │   ├── schemas/assessment.py   # API Pydantic 模型
│   │   ├── services/
│   │   │   ├── assessment.py       # 测评任务编排
│   │   │   └── v3/                 # V3 Provider (mock/real) + 样例 fixture
│   │   └── main.py
│   └── tests/
├── ziliao/                         # 原始参考资料 (方案/V3指南/报告样例)
├── scripts/env_check.sh
├── docker-compose.yml              # PostgreSQL + Redis + Adminer
├── Makefile
└── .env.example
```

## 快速开始
```bash
make envcheck                       # 1. 环境诊断
python3 -m venv .venv && make install   # 2. 虚拟环境 + 依赖
cp .env.example .env                # 3. 配置（默认 Mock 模式可直接跑）
make up                             # 4. 启动 PostgreSQL + Redis
make dev                            # 5. 启动后端 → http://localhost:8000/docs
```

## 测评接口（Mock 闭环）
```bash
# 创建一次测评（后台自动跑 Mock 全流程：上传→建任务→轮询→落库）
curl -X POST localhost:8000/api/v1/assessments \
  -H 'Content-Type: application/json' \
  -d '{"subject_id":"pilot-001"}'

# 查状态与结果（几秒后 status=completed，result 含真实样例数据）
curl localhost:8000/api/v1/assessments/<id>
```

## 常用命令
| 命令 | 作用 |
|---|---|
| `make test` | 运行 pytest（含 V3 Mock 回放验证） |
| `make lint` / `make fmt` | ruff 检查 / 格式化 |
| `make db-shell` | 进入 psql |
| `make logs` / `make ps` | 容器日志 / 状态 |

## 开发阶段（依据方案）
1. ✅ 基础环境搭建（FastAPI + PostgreSQL + Redis + V3 Mock 集成）
2. ⬜ 协议定义与接口开发（WebSocket / 时隙数据包）
3. ⬜ 核心业务逻辑（60s 时序控制器、图题调度器、Qwen 报告生成）
4. ⬜ 图库与数据持久化（图片-题目-选项绑定、OSS 图片库）
5. ⬜ 端到端测试与优化
6. ⬜ 部署与交付验证
