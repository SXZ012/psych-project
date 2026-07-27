-include .env
POSTGRES_USER ?= psych
POSTGRES_DB ?= psych

.PHONY: help install up down ps logs dev test lint fmt db-shell envcheck

help: ## 显示可用命令
	@echo "心理测评系统 - 常用命令"
	@echo "  make install   安装后端依赖 (到 .venv)"
	@echo "  make up        启动 PostgreSQL + Redis + Adminer"
	@echo "  make down      停止容器"
	@echo "  make ps        查看容器状态"
	@echo "  make logs      查看容器日志"
	@echo "  make dev       启动后端开发服务器 (uvicorn --reload, :8000)"
	@echo "  make test      运行 pytest"
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

lint: ## ruff 检查
	cd backend && . ../.venv/bin/activate && ruff check .

fmt: ## ruff 格式化
	cd backend && . ../.venv/bin/activate && ruff format .

db-shell: ## 进入 psql
	docker compose exec db psql -U $(POSTGRES_USER) -d $(POSTGRES_DB)

envcheck: ## 环境依赖诊断
	bash scripts/env_check.sh
