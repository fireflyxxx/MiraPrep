# T-002 · Spring Boot 业务服务脚手架

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Backend-Spring | M1 | 1d | T-001 | T-004, T-010, T-020, T-030, T-103, T-106 |

## 背景
业务服务是全系统的「事实来源」与持久化层（见 `DEVELOPMENT.md §2` 职责边界）。本任务只搭骨架与横切基建，不含业务逻辑。

## 目标
在 `backend/business/` 初始化可运行的 Spring Boot 工程，含配置、健康检查、OpenAPI、统一响应包裹、全局异常处理、CORS、内部鉴权拦截器骨架。

## 范围
- **做**：工程初始化、依赖、`application.yml`（多 profile：local/prod）、健康端点、统一响应 `ApiResponse<T>`、全局 `@RestControllerAdvice`、业务异常基类与错误码枚举、CORS 配置、`/internal/*` 的内部 token 校验过滤器（空实现校验逻辑即可）、springdoc Swagger。
- **不做**：不写认证/简历/面试等业务（各自任务）；不建业务表（T-004）。

## 技术规格
- 构建工具：**Gradle (Kotlin DSL)**（团队统一，如需 Maven 在此任务内定并记录）。Java 21，Spring Boot 3.3+。
- 依赖：`spring-boot-starter-web`、`-data-jpa`、`-validation`、`-security`（先放行全部，认证在 T-010 收紧）、`mysql-connector-j`、`spring-boot-starter-data-redis`、`flyway-core` + `flyway-mysql`、`springdoc-openapi-starter-webmvc-ui`、`lombok`。
- 包结构：`com.miraprep`，下设 `config / common(response,exception,error) / web(interceptor,filter) / health`。
- 统一响应见 `DEVELOPMENT.md §7.1`：`ApiResponse<T>{code,message,data}`，提供 `ok(data)` / `fail(errorCode)` 工厂。
- 全局异常：捕获 `BusinessException`（带 `ErrorCode`）、`MethodArgumentNotValidException`（400 参数错误）、兜底 `Exception`（500，不泄露堆栈）。
- `ErrorCode` 枚举：`code(int) + httpStatus + defaultMessage`，先放通用几项（`INVALID_PARAM=40000`、`UNAUTHORIZED=40100`、`FORBIDDEN=40300`、`NOT_FOUND=40400`、`INTERNAL=50000`）。
- 内部鉴权过滤器：对 `/api/v1/internal/**` 校验 header `X-Internal-Token == env AI_INTERNAL_TOKEN`，不通过返回 403。
- 健康检查：`GET /api/v1/health` 返回 `{status:"UP", ...}`；Actuator 可选。
- CORS：允许 `NEXT_PUBLIC` 前端来源（local `http://localhost:3000`）。

## 涉及文件
- `backend/business/build.gradle.kts`、`settings.gradle.kts`、`gradlew*`、`src/main/resources/application.yml`（+`application-local.yml`）
- `src/main/java/com/miraprep/BusinessApplication.java`
- `common/response/ApiResponse.java`、`common/exception/{BusinessException,GlobalExceptionHandler}.java`、`common/error/ErrorCode.java`
- `web/filter/InternalTokenFilter.java`、`config/{SecurityConfig,CorsConfig,OpenApiConfig}.java`
- `health/HealthController.java`

## 验收标准
1. `./gradlew bootRun` 起在 `:8080`，`GET /api/v1/health` 返回统一响应包裹的 UP。
2. Swagger UI 可访问（`/swagger-ui.html` 或 springdoc 默认路径）。
3. 抛 `BusinessException(INVALID_PARAM)` 时返回体是 `{code:40000,message,data:null}` 且 HTTP 400。
4. 访问 `/api/v1/internal/ping`（可加一个临时测试端点）不带 `X-Internal-Token` 返回 403，带正确 token 通过。
5. 连接 T-001 的 MySQL/Redis 成功（启动无连接报错）。

## 验证方式
PR 贴：`bootRun` 日志、`curl /api/v1/health`、参数错误示例、内部 token 403/200 两种 curl。

## 遗留/发现
