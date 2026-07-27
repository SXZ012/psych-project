#!/usr/bin/env bash
# 高责任岗位心理测评系统 · 环境依赖诊断  (env_check.sh)
# 用法: bash scripts/env_check.sh
set -u
G='\033[0;32m'; R='\033[0;31m'; Y='\033[1;33m'; C='\033[0;36m'; N='\033[0m'
ok(){ printf "${G}[✓]${N} %s\n" "$1"; }
warn(){ printf "${Y}[!]${N} %s\n" "$1"; }
fail(){ printf "${R}[✗]${N} %s\n" "$1"; }
hr(){ printf -- "------------------------------------------------------------\n"; }

echo -e "${C}环境依赖诊断${N}  ($(date '+%Y-%m-%d %H:%M:%S'))"; hr

if command -v python3 >/dev/null 2>&1; then
  pyv=$(python3 -c 'import sys;print("%d.%d.%d"%sys.version_info[:3])' 2>/dev/null)
  if python3 -c 'import sys;sys.exit(0 if sys.version_info>=(3,10) else 1)' 2>/dev/null; then
    ok "Python3  $pyv   (满足 >=3.10)"
  else
    fail "Python3  $pyv   (需 >=3.10)"
  fi
else
  fail "Python3 未安装"
fi
command -v pip3 >/dev/null 2>&1 && ok "pip3 已安装 ($(pip3 --version 2>/dev/null | awk '{print $2}'))" || warn "pip3 缺失 → sudo apt install python3-pip"
python3 -c 'import venv' 2>/dev/null && ok "venv 模块可用" || warn "venv 缺失 → sudo apt install python3-venv"

if command -v git >/dev/null 2>&1; then ok "Git $(git --version | awk '{print $3}')"; else fail "Git 未安装"; fi

if command -v docker >/dev/null 2>&1; then
  ok "Docker $(docker --version 2>/dev/null | awk '{print $3}' | tr -d ,)"
  if docker info >/dev/null 2>&1; then ok "Docker 守护进程运行中"; else warn "Docker 守护进程未运行 → sudo service docker start"; fi
else
  fail "Docker 未安装"
fi

if docker compose version >/dev/null 2>&1; then
  ok "Docker Compose v2 插件 ($(docker compose version --short 2>/dev/null))"
elif command -v docker-compose >/dev/null 2>&1; then
  warn "旧版 docker-compose，建议迁移到 v2 插件"
else
  fail "Docker Compose 未安装"
fi

if command -v node >/dev/null 2>&1; then
  nv=$(node -v 2>/dev/null); major=${nv#v}; major=${major%%.*}
  if [ "${major:-0}" -ge 18 ]; then ok "Node.js $nv (满足 >=18 LTS)"; else warn "Node.js $nv (建议 >=18 LTS)"; fi
  command -v npm >/dev/null 2>&1 && ok "npm $(npm -v)" || warn "npm 缺失"
else
  warn "Node.js 未安装（前端构建需要，后端开发不依赖）"
fi
hr; echo "诊断完成。"
