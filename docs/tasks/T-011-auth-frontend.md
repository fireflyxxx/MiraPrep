# T-011 · 前端接入认证（/auth 联调 + 路由守卫）

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Frontend | M1 | 1d | T-005, T-010 | T-012, 及所有需登录页面的真实访问 |

## 背景
`/auth` 页面（`src/app/auth/page.tsx`）目前点击直接 `router.push` 到 dashboard/onboarding，无真实登录。本任务接 T-010 的认证 API。先读 `DEVELOPMENT.md §7.1`、PRD §3.2。

## 目标
`/auth` 登录/注册真实调用后端；成功后按 `isFirstLogin` 决定去 `/onboarding` 还是 `/dashboard`；实现路由守卫（未登录访问受保护页跳 `/auth`）；表单校验与错误反馈。

## 范围
- **做**：登录/注册表单接 API（用 T-005 的 client + React Query mutation）、验证码发送与 60s 倒计时、密码强度提示、邮箱格式校验、错误内联 + toast、登录后跳转分流、受保护路由守卫、已登录访问 `/` 时导航「登录」变「进入工作台」（PRD §3.1）。
- **不做**：第三方登录按钮仅保留占位（T-083 实现）；onboarding 数据保存在 T-012。

## 技术规格
- 用 T-005 的 `apiClient` + React Query。登录/注册用 `useMutation`；成功写入 token（`useAuthToken`），跳转按响应 `user.isFirstLogin`。
- 路由守卫：Next App Router 下可用「客户端守卫组件」或在受保护 layout 里校验 token；未登录 `redirect('/auth')`。受保护路由：`/dashboard`、`/interview/**`、`/report/**`、`/onboarding`。
- 表单校验用 `zod` + 现有 UI；错误来自后端 `ApiError.code`（40101 凭证错误等）映射为中文文案，触发输入框 red 边 + shake（PRD §3.2）。
- 验证码：点击「发送验证码」调 `/auth/send-code`，按钮进入 60s 倒计时禁用。
- 保持现有页面视觉与 View Transitions 不变。

## 涉及文件
- 修改 `src/app/auth/page.tsx`（接 API、校验、跳转分流）
- 新增 `src/lib/api/auth.ts`（register/login/refresh/sendCode/me hooks）
- 新增守卫：`src/components/AuthGuard.tsx` 或 `src/app/(protected)/layout.tsx`（按实现选型）
- 修改 `src/components/landing/LandingNav.tsx`（已登录态切换「进入工作台」）

## 验收标准
1. 真实注册/登录成功并持久化登录态（刷新不掉线，靠 refresh）。
2. 首次注册用户跳 `/onboarding`，老用户跳 `/dashboard`。
3. 未登录直接访问 `/dashboard` 被重定向到 `/auth`。
4. 凭证错误显示正确中文错误 + 输入框反馈；验证码 60s 倒计时生效。
5. 已登录访问 `/` 时导航显示「进入工作台」。
6. `lint`/`build` 通过，无 console 报错。

## 验证方式
在预览里走通：注册→onboarding、登录→dashboard、错误分支、守卫重定向；PR 贴分步截图与网络请求证据。

## 遗留/发现
