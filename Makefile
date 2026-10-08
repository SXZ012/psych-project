-include .env
POSTGRES_USER ?= psych
POSTGRES_DB ?= psych

.PHONY: help install up down ps logs dev test test-frontend build-frontend lint fmt check db-shell envcheck

help: ## 显示可用命令
	@echo "心理测评系统 - 常用命令"
	@echo "  make install   安装后端依赖 (到 .venv)"
	@echo "  make up        启动 PostgreSQL + Redis + Adminer"
	@echo "  make down      停止容器"
	@echo "  make ps        查看容器状态"
	@echo "  make logs      查看容器日志"
	@echo "  make dev       启动后端开发服务器 (uvicorn --reload, :8000)"
	@echo "  make test      运行 pytest"
	@echo "  make test-frontend  运行三个前端的回归测试"
	@echo "  make build-frontend 构建三个前端与共享 PDF 映射"
	@echo "  make check     检查代码格式、静态检查与前后端测试"
	@echo "  make lint      ruff 检查"
	@echo "  make fmt       ruff 格式化"
	@echo "  make db-shell  进入 psql"
	@echo "  make envcheck  环境依赖诊断"

install: ## 安装后端依赖
	cd backend && . ../.venv/bin/activate && pip install -e ".[dev]"

up: ## 启动基础设施容器
	docker compose up -d

down: ## 停止容器
	docker compose down

ps: ## 容器状态
	docker compose ps

logs: ## 容器日志
	docker compose logs -f --tail=100

dev: ## 启动后端开发服务器
	cd backend && . ../.venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

test: ## 运行测试
	cd backend && . ../.venv/bin/activate && pytest -q

test-frontend: ## 前端回归测试
	npm --prefix frontend/terminal-web test
	npm --prefix frontend/admin-web test
	npm --prefix frontend/community-web test

build-frontend: ## 构建全部业务前端（保留当前测试场景切换）
	npm --prefix frontend/terminal-web run build
	npm --prefix frontend/admin-web run build
	npm --prefix frontend/community-web run build

lint: ## ruff 检查
	cd backend && . ../.venv/bin/activate && ruff check . ../scripts

fmt: ## ruff 格式化
	cd backend && . ../.venv/bin/activate && ruff format . ../scripts

check: lint test test-frontend ## 完整代码验证
	cd backend && . ../.venv/bin/activate && ruff format --check . ../scripts
	npm --prefix frontend/terminal-web run type-check
	npm --prefix frontend/admin-web run type-check
	npm --prefix frontend/community-web run type-check

db-shell: ## 进入 psql
	docker compose exec db psql -U $(POSTGRES_USER) -d $(POSTGRES_DB)

envcheck: ## 环境依赖诊断
	bash scripts/env_check.sh
