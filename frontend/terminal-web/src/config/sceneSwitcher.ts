/**
 * 测试场景切换开关（航空/社区双流程现场核验用）。
 *
 * 可见性只由构建期环境变量 VITE_ENABLE_SCENE_SWITCHER 决定：
 * - `npm run build`（--mode test，联调构建）→ .env.test 置 true → 终端右下角显示切换按钮；
 * - `npm run build:prod`（生产构建）→ .env.production 置 false → 按钮编译期即不可见，
 *   不依赖人工删代码，也不受后端 /health 环境字段影响。
 * 管理员认证后的场景切换（StaffGate → enterCommunity/exitToAviation）不受此开关约束。
 */
export const SCENE_SWITCHER_ENABLED = import.meta.env.VITE_ENABLE_SCENE_SWITCHER === 'true'
