# 前端工程

本目录只包含心理测评系统的两个业务前端：

- `admin-web/`：管理后台与四页测评报告（Vue 3 + TypeScript + Vite）
- `terminal-web/`：Firefly 测评端（Vue 3 + TypeScript + Vite）

当前正式入口：管理端为 `/admin/`，测评端为 `/login/`。旧单页 HTML、兼容入口与历史模块化 URL 已移除。

## 管理端本地开发

```bash
cd frontend/admin-web
npm install
npm run dev
```

开发服务器默认代理 `/api` 到 `http://127.0.0.1:8000`。

## 管理端构建

```bash
npm run type-check
npm run build
```

构建产物输出到 `backend/app/static/admin/`。

## 测评端本地开发与构建

```bash
cd frontend/terminal-web
npm install
npm run dev
npm run build
```

测评端构建产物输出到 `backend/app/static/terminal/`。网页业务与界面调整只需重新构建并发布后端静态文件；Camera2、硬编码等原生能力仍由 Android 工程处理。

## 模块边界

- `terminal-web/src/components/`：身份录入、同意书、人脸确认、相机监控、引导、题目、结果页。
- `terminal-web/src/composables/`：测评时序、会话图片预加载、Android Bridge、浏览器相机、人脸检测与题目语音。
- `admin-web/src/pages/`：登录、测评列表、报告页。
- `admin-web/src/components/report/`：综合概览、方向筛查、核心状态、数据证据四页报告；数据证据页内部呈现 AU、rPPG、Vibra 和眼动模块。
- `admin-web/src/api/`、`stores/`、`router/`：接口访问、页面状态、路由。
