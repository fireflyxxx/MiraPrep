# T-120 · 第三方登录（GitHub / Google OAuth）

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Full-stack | M3 | 1d | T-010, T-011 | — |

## 背景
`/auth` 页已有「微信登录 / GitHub」按钮占位。PRD §3.2 要求 v1.0 至少一种第三方登录（GitHub / Google）。

## 目标
实现至少一种 OAuth 登录（推荐 GitHub），打通「授权 → 后端换取用户 → 签发 JWT → 前端登录态」。

## 范围
- **做**：后端 OAuth 回调（换 code 取用户信息、按 email 关联或建号、签发 JWT）、前端发起授权与回调处理、首次 OAuth 用户走 onboarding。
- **不做**：微信登录（可留占位）；账号绑定管理（后续迭代）。

## 技术规格
- 后端 `GET /auth/oauth/{provider}/authorize` → 重定向授权页（或前端直接拿 client_id 发起）；`GET /auth/oauth/{provider}/callback?code=` → 换 token、取用户、关联/建号、签发 JWT，重定向回前端并带令牌（或前端调 `POST /auth/oauth/{provider}` body `{code}` → 返回 JWT）。选一种方式并记录。
- 用户关联：按 email 匹配已有账号则关联，否则建号（`is_first_login=true`）。
- 前端：`/auth` 的 GitHub 按钮发起流程，回调页处理令牌并按 `isFirstLogin` 分流。
- 密钥（client id/secret）从 env。

## 涉及文件
- 后端 `auth/OAuthController.java`、`auth/OAuthService.java`（provider 抽象 + GitHub 实现）
- 前端修改 `src/app/auth/page.tsx`（按钮接流程）、新增回调处理页/逻辑

## 验收标准
1. GitHub OAuth 全流程通：授权 → 建号/关联 → 登录态。
2. 首次 OAuth 用户进 onboarding，老用户进 dashboard。
3. 已存在同 email 账号正确关联而非重复建号。
4. 密钥不入库/不硬编码。

## 验证方式
PR 贴：OAuth 登录全流程录屏/截图、新用户与老用户两种分流。

## 遗留/发现
