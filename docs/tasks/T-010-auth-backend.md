# T-010 · 认证后端（注册/登录/刷新/验证码 + JWT）

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Backend-Spring | M1 | 1.5d | T-004 | T-011, T-012, T-083 |

## 背景
实现用户认证与资料读写。这是所有需登录接口的前置。先读 `DEVELOPMENT.md §7.1/§7.5`、PRD §3.2/§3.3。

## 目标
提供注册、登录、刷新、验证码接口与 JWT 签发/校验；`GET/PUT /users/me`、`GET/PUT /users/me/profile`。用 Spring Security 保护除白名单外的接口。

## 范围
- **做**：AuthController/Service、JWT 工具、密码 bcrypt、Spring Security 配置（JWT 过滤器、白名单）、User/UserProfile 的读写、验证码发送（可先接口打通 + 控制台打印/mock 邮件）、限流（登录、发码）。
- **不做**：第三方 OAuth（T-083）；前端联调（T-011）。

## 技术规格（API 契约，前缀 `/api/v1`）
统一响应包裹见 `DEVELOPMENT.md §7.1`。

- `POST /auth/register` body `{email, password, nickname?, code}` → `{accessToken, refreshToken, user:{id,email,nickname,isFirstLogin}}`。校验邮箱格式、密码强度（≥8）、验证码。
- `POST /auth/login` body `{email, password}` → 同上结构。失败 `code=40101`（凭证错误）。
- `POST /auth/refresh` body `{refreshToken}` → `{accessToken, refreshToken}`（可轮换 refresh）。失效 `code=40102`。
- `POST /auth/send-code` body `{email, scene:"register"|"reset"}` → `{}`（60s 内重复请求 `code=42901`）。
- `GET /users/me`（需登录）→ `{id,email,nickname,avatar,isFirstLogin}`。
- `PUT /users/me` body `{nickname?,avatar?}` → 更新后的 user。
- `GET /users/me/profile` → `{jobDirection,techStacks[],experienceLevel,status,targetCompany,preferences}`（无则返回空档）。
- `PUT /users/me/profile` body 同上字段 → 保存并将 `user.isFirstLogin=false`。

JWT：access TTL 15min、refresh TTL 14d（从 env）；claims 含 `sub=userId`；HS256（秘钥 env）。refresh 可存 Redis 以支持吊销。

Security：白名单 `/auth/**`、`/api/v1/health`、`/swagger*`、`/internal/**`（内部 token 另管）；其余需 Bearer。JWT 过滤器解析并塞 `SecurityContext`。

限流：登录/发码按 IP + email 维度（Redis 计数），超限 `code=42900`。

## 涉及文件
- `auth/{AuthController,AuthService,JwtService,VerificationCodeService}.java`
- `auth/dto/*`（Register/Login/Refresh/… Request/Response）
- `user/{UserController,UserService,UserProfileService}.java` + dto
- `config/SecurityConfig.java`（更新 T-002 的放行为 JWT 保护）
- `web/filter/JwtAuthFilter.java`
- `common/util/PasswordEncoderConfig.java`

## 验收标准
1. 注册→登录→带 token 访问 `/users/me` 全链路通。
2. 错误凭证、过期 token、无 token 分别返回正确 code 与 HTTP 状态。
3. refresh 能换新 access；旧 refresh 轮换后失效。
4. `PUT /users/me/profile` 后 `isFirstLogin` 变 false。
5. 发码 60s 限流、登录暴力限流生效。
6. 密码以 bcrypt 存储（DB 里不可见明文）。

## 验证方式
PR 贴：完整 curl 脚本（注册/登录/refresh/me/profile + 各错误分支）与输出，DB 中 password_hash 截图。

## 遗留/发现
