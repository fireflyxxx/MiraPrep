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

### 选型记录（实现时定稿）
两家各走各的路，因为 GitHub 不签 ID Token：

**Google —— Identity Services（GIS）ID Token 流程**
- 前端 GIS 按钮直接拿到 Google 签名的 ID Token，`POST /api/v1/auth/oauth/google` body `{idToken}` → 返回与 `/auth/login` 同构的 `AuthResponse`。
- 不需要 authorize/callback 跳转端点、不需要 state/PKCE、也不需要 client_secret；Console 里只配 Authorized JavaScript origins，redirect URI 留空。
- 信任边界：`aud` / `iss` / `email_verified` 三项必校验。

**GitHub —— 标准授权码流程**
- 前端跳 `github.com/login/oauth/authorize`（scope `user:email`）→ GitHub 带 code 跳回**前端**回调页 `/auth/callback/github` → `POST /api/v1/auth/oauth/github` body `{code}`。
- 回调点在前端而非后端，令牌就不必经过 URL 传回，不会落进浏览器历史或 Referer。
- state 由前端生成、存 sessionStorage、回调页比对并一次性消费——攻击者写不了受害者的 sessionStorage，登录 CSRF 就此挡住，后端无需再存一份。
- 信任边界：只接受 primary 且 verified 的邮箱；换 token 失败时 GitHub **仍返回 200**，错误藏在响应体 `error` 字段，必须显式判。
- 用户关联：按 email 匹配已有账号则关联，否则建号（`is_first_login=true`）。
- 前端：`/auth` 的按钮发起流程，回调页处理令牌并按 `isFirstLogin` 分流。
- 密钥（client id/secret）从 env。

两条路最后汇到 `AuthService.linkOrCreateOAuthUser` + `issueTokens`，共用同一套关联/建号与登录态签发。因为两者只有这一段重合，没有抽 provider 接口。

## 涉及文件
- 后端 `auth/GoogleOAuthService.java`、`auth/GitHubOAuthService.java`、`auth/dto/GoogleLoginRequest.java`、`auth/dto/GitHubLoginRequest.java`、`auth/AuthController.java`（`/oauth/google`、`/oauth/github`）、`auth/AuthService.java`（新增公开的 `issueTokens` 与 `linkOrCreateOAuthUser`）、`application.yml`
- 前端 `src/app/auth/page.tsx`（GIS 按钮 + GitHub 按钮，删掉微信占位）、`src/app/auth/callback/github/page.tsx`（新回调页）、`src/lib/api/github-oauth.ts`、`src/lib/api/auth.ts`、`src/lib/api/endpoints.ts`、`next.config.ts`（CSP 放行 GIS 与两家头像域名）
- 部署 `frontend/Dockerfile`、`infra/docker-compose.prod.yml`、`infra/.env.prod.example`（`GOOGLE_CLIENT_ID`、`GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`）

## 验收标准
1. Google 与 GitHub 登录全流程通：授权 → 建号/关联 → 登录态。
2. 首次 OAuth 用户进 onboarding，老用户进 dashboard。
3. 已存在同 email 账号正确关联而非重复建号。
4. 密钥不入库/不硬编码。

## 验证方式
PR 贴：OAuth 登录全流程录屏/截图、新用户与老用户两种分流。

## 遗留/发现
- **CSP 是这次的隐藏坑**：`next.config.ts` 原来的 `script-src 'self'` 直接把 `accounts.google.com/gsi/client` 拦掉，按钮永远不出现且只在控制台报错。现已按 client id 是否配置有条件放行 script/style/frame/connect 四个来源。
- **`GOOGLE_CLIENT_ID` 必须是构建期变量**：CSP 由 `headers()` 生成，而 Next 在 build 时就把 `headers()` 结果烤进 routes-manifest，运行时再注入不生效。
- **OAuth 建号的用户没有可用密码**（`password_hash` 塞的是随机值），因此走不了「输密码删号」（`DELETE /users/me`）。要修得把 `password_hash` 改成可空列并给这类账号一条单独的删号/设密码路径 —— 属于账号绑定管理，另开任务。
- 微信登录占位按钮已按产品要求删除；微信登录本身未做。
- 改 `NEXT_PUBLIC_*` 第三方登录变量后**必须重启 dev server**：CSP 在服务启动时算出，只热更新前端代码会出现「按钮渲染了但脚本被 CSP 挡掉」的半吊子状态（本次实测踩到过）。
- Google 在中国大陆不可访问，`accounts.google.com/gsi/client` 会加载失败；国内用户为主时 GitHub 是更可靠的那条。
