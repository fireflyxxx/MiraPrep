# T-011 · 前端认证（/auth 联调 + 路由守卫 + 工作台用户菜单）

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Frontend | M1 | 1.5d | T-005, T-010 | T-012, T-107, T-120, 及所有需登录页面的真实访问 |

## 背景
`/auth` 页面目前点击直接跳 dashboard/onboarding，无真实登录；`DashboardShell` 的昵称、邮箱、岗位、退出登录也仍为 mock。任务接 T-010 的认证 API，并统一保护工作台区新增的 `/interviews`、`/practice` 路由。先读 `DEVELOPMENT.md §7.1`、PRD §3.2/§3.4。

## 目标
`/auth` 登录/注册真实调用后端；成功后按 `isFirstLogin` 决定去 `/onboarding` 还是 `/dashboard`；实现完整路由守卫；用户菜单展示真实账号资料并能真正退出登录。

## 范围
- **做**：登录/注册表单接 API（用 T-005 的 client + React Query mutation）、验证码发送与 60s 倒计时、密码强度提示、邮箱格式校验、错误内联 + toast、登录后跳转分流、受保护路由守卫、`GET /users/me`/profile 查询、`DashboardShell` 真实昵称/邮箱/岗位、真实 logout、已登录访问 `/` 时导航「登录」变「进入工作台」。
- **不做**：第三方登录按钮仅保留占位（T-120）；onboarding 写入由 T-012 完成；账户设置/通知偏好仍为占位；本月额度没有后端计费契约，M1 必须隐藏或明确标为演示数据，不得伪装成真实额度。

## 技术规格
- 用 T-005 的 `apiClient` + React Query。登录/注册用 `useMutation`；成功写入 token（`useAuthToken`），跳转按响应 `user.isFirstLogin`。
- 路由守卫：Next App Router 下可用统一守卫组件或受保护 layout；未登录跳 `/auth`。受保护路由至少包括 `/dashboard`、`/interviews`、`/practice`、`/interview/**`、`/report/**`、`/onboarding`，不要逐页复制判断逻辑。
- `DashboardShell` 用 `GET /users/me` 展示 nickname/email，用 profile 的 `jobDirection` 映射岗位文案（空档显示通用文案）；退出时调用统一 `logout()` 清理 token/query cache 后跳 `/auth`。
- 表单校验用 `zod` + 现有 UI；错误来自后端 `ApiError.code`（40101 凭证错误等）映射为中文文案，触发输入框 red 边 + shake（PRD §3.2）。
- 验证码：点击「发送验证码」调 `/auth/send-code`，按钮进入 60s 倒计时禁用。
- 保持现有页面视觉与 View Transitions 不变。

## 涉及文件
- 修改 `src/app/auth/page.tsx`（接 API、校验、跳转分流）
- 新增 `src/lib/api/auth.ts`（register/login/refresh/sendCode/me hooks）
- 新增守卫：`src/components/AuthGuard.tsx` 或 `src/app/(protected)/layout.tsx`（按实现选型）
- 修改 `src/components/landing/LandingNav.tsx`（已登录态切换「进入工作台」）
- 修改 `src/components/dashboard/DashboardShell.tsx`（真实用户资料、退出登录、额度占位处理）
- 新增相应的 auth/guard 组件测试

## 验收标准
1. 真实注册/登录成功并持久化登录态（刷新不掉线，靠 refresh）。
2. 首次注册用户跳 `/onboarding`，老用户跳 `/dashboard`。
3. 未登录直接访问 `/dashboard`、`/interviews`、`/practice`、`/interview/**`、`/report/**` 均被重定向到 `/auth`。
4. 凭证错误显示正确中文错误 + 输入框反馈；验证码 60s 倒计时生效。
5. 用户菜单展示真实 nickname/email/岗位；退出后 token 与 query cache 清空并回到 `/auth`。
6. 无真实额度契约时不展示容易被误认为真实的 `3 / 5` 数据。
7. 守卫、登录分流、logout 至少各有一个组件/逻辑测试；`lint`/`test`/`build` 通过，无 console 报错。

## 验证方式
在预览里走通：注册→onboarding、登录→dashboard、两个新增路由的守卫、用户菜单、logout、错误分支；PR 贴测试输出、分步截图与网络请求证据。

## 遗留/发现
