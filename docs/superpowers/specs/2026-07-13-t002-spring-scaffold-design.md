# T-002 Spring Boot 业务服务脚手架设计

## 目标与边界

在 `backend/business` 创建一个 Java 21、Spring Boot 3.3+、Gradle Kotlin DSL 的业务服务。它提供项目后续所有业务 API 共用的运行、配置、安全和错误处理基础；不包含认证、数据库业务表或简历/面试等领域逻辑。

服务监听 `8080`，所有业务端点以 `/api/v1` 开头。后续 Spring 侧业务数据会在这里持久化；FastAPI 只能通过受内部令牌保护的 `/api/v1/internal/**` 调用它。

## 组件设计

- `BusinessApplication`：应用启动入口。
- `config`：
  - `SecurityConfig` 暂时允许普通 API 匿名访问，并将 `/api/v1/internal/**` 接入内部令牌过滤器；认证规则留给 T-010 收紧。
  - `CorsConfig` 读取 `app.cors.allowed-origins`，本地默认允许 `http://localhost:3000`。
  - `OpenApiConfig` 定义 MiraPrep API 的基础信息，springdoc 暴露 Swagger UI。
- `health/HealthController`：`GET /api/v1/health` 以统一响应返回 `{ status: "UP" }`。
- `common/response/ApiResponse<T>`：所有成功响应使用 `{ code: 0, message: "ok", data }`；提供 `ok` 与 `fail` 工厂方法。
- `common/error/ErrorCode`：定义 `INVALID_PARAM`、`UNAUTHORIZED`、`FORBIDDEN`、`NOT_FOUND`、`INTERNAL`，各自包含业务码、HTTP 状态和默认提示语。
- `common/exception`：`BusinessException` 携带错误码；`GlobalExceptionHandler` 将业务异常、参数校验异常和未知异常转换成不泄露堆栈的统一响应。
- `web/filter/InternalTokenFilter`：仅处理 `/api/v1/internal/**`。请求头 `X-Internal-Token` 必须与环境变量 `AI_INTERNAL_TOKEN` 相同，否则以 `FORBIDDEN` 的 JSON 响应返回 403。
- `web/InternalPingController`：仅用于验证内部过滤器，`GET /api/v1/internal/ping` 在令牌有效时返回统一的 `{ status: "UP" }`。

## 配置与运行

`application.yml` 用环境变量提供默认值：数据库、Redis、CORS 来源和 `AI_INTERNAL_TOKEN`。`application-local.yml` 只承载本地开发覆写。默认 JPA 不自动改表（`ddl-auto: validate`），Flyway 启用但在尚无迁移前不执行迁移；连接参数对齐 T-001 的 MySQL/Redis。

提交 `.env.example`，不提交真实 `.env`。项目使用 Gradle Wrapper，开发者可在 `backend/business` 执行 `./gradlew bootRun`。

## 错误响应约定

| 情形 | HTTP | 响应 code | message |
|---|---:|---:|---|
| 成功 | 200 | 0 | `ok` |
| 业务参数错误 | 400 | 40000 | `invalid parameter` |
| Bean Validation 参数错误 | 400 | 40000 | `invalid parameter` |
| 内部令牌缺失或错误 | 403 | 40300 | `forbidden` |
| 未捕获异常 | 500 | 50000 | `internal server error` |

## 测试与验收

先用 Spring Boot 的集成测试写出以下行为，再实现生产代码：

1. 健康端点 HTTP 200，且 JSON 为统一响应并包含 `data.status = UP`。
2. 测试控制器抛出 `BusinessException(INVALID_PARAM)` 时返回 400、`40000` 和 `data: null`。
3. 违反 `@Valid` 约束时返回 400、`40000`，不返回框架默认错误体。
4. 内部 ping 未提供/提供错误令牌时返回 403、`40300`；提供正确令牌时返回 200。
5. 启动上下文时能连接 T-001 的 MySQL、Redis；实际 `bootRun`、health curl、Swagger 页面和两种内部 ping curl 均可复现。

## 非目标与风险

- 不创建 Flyway 业务迁移、不创建 JPA 实体、不实现 JWT 登录。
- `InternalPingController` 仅为脚手架验收端点；后续真实内部回调端点可复用相同过滤器。
- 若本机缺 Java 21 或 Docker 服务未启动，先明确记录环境阻塞，不以关闭数据库/Redis 健康检查来伪造通过。
