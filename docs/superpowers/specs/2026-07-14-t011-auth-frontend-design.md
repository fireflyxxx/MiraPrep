# T-011 前端认证设计

> **历史快照**：本文记录任务实施时的设计，不代表当前目录或功能状态。当前状态见 [任务总表](../../tasks/README.md) 与 [历史文档说明](../README.md)。

## 目标与边界

把既有 `/auth` 页面接到 T-010 的认证接口，并让工作台及后续业务页面只对已登录用户开放。第三方登录、资料编辑和额度计费不在本次范围内。

## 方案

认证请求统一放在 `src/lib/api/auth.ts`：登录、注册和验证码使用 React Query mutation；`/users/me` 与 `/users/me/profile` 使用查询。登录或注册成功后保存 access token 与 refresh token；刷新页面时，守卫用 refresh token 换取新的 access token。

新增一个客户端 `AuthGuard`，由所有受保护页面的共享外壳使用。守卫初始化时先检查 access token；没有可用 token 时尝试刷新，失败才跳转 `/auth`。它覆盖 `/dashboard`、`/interviews`、`/practice`、`/interview/**`、`/report/**` 和 `/onboarding`，不在各个页面复制登录判断。

`/auth` 用 zod 做邮箱、密码、昵称和验证码校验。注册页调用发送验证码接口后进入 60 秒禁用倒计时。后端业务错误码映射为中文内联错误，并用 toast 补充反馈。成功响应中的 `user.isFirstLogin` 决定跳转 `/onboarding` 或 `/dashboard`。

工作台用户菜单查询真实用户和资料，显示昵称、邮箱以及 `jobDirection`（为空时使用通用文案）。退出登录会清除两类 token 与 React Query 缓存，再跳转 `/auth`；没有计费契约的额度区域改为明确的演示占位。

落地页导航订阅登录态：未登录保留“登录”，已登录显示“进入工作台”。

## 错误处理与测试

请求层保留既有 401 自动刷新逻辑，并扩展为在 refresh token 缺失或刷新失败时可靠地清理本地认证状态。表单错误不会触发页面跳转。

Vitest + Testing Library 覆盖：登录分流、未登录守卫重定向、登出清理 token 与 query cache、验证码倒计时与后端错误文案。最终执行 `npm run lint`、`npm test`、`npm run build`，修复全部失败项。
