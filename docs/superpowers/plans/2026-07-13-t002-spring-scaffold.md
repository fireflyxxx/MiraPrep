# T-002 Spring Boot 业务服务脚手架 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `backend/business` 落地可运行、可测试的 Spring Boot 业务服务脚手架，提供统一响应、异常处理、CORS、内部令牌保护、健康检查和 Swagger。

**Architecture:** Gradle Wrapper 构建 Java 21 的 Spring Boot 3.3+ 单模块应用；Web 层的公共响应与异常映射集中在 `common` 包，安全配置与仅保护 `/api/v1/internal/**` 的过滤器集中在 `config`、`web` 包。测试使用 MockMvc 验证 HTTP 契约，运行时以环境变量对接 T-001 的 MySQL 和 Redis。

**Tech Stack:** Java 21、Spring Boot 3.3+、Gradle Kotlin DSL、Spring MVC/Security/Validation/JPA/Redis、Flyway、springdoc-openapi、JUnit 5、MockMvc。

---

## 文件结构

- 创建：`backend/business/settings.gradle.kts` — Gradle 项目名称。
- 创建：`backend/business/build.gradle.kts` — Java 21、Spring 依赖、测试和格式化任务。
- 创建：`backend/business/gradlew`、`gradlew.bat`、`gradle/wrapper/*` — 固定 Gradle 版本的构建入口。
- 创建：`backend/business/src/main/resources/application.yml` — 通用环境变量绑定和本地默认配置。
- 创建：`backend/business/src/main/resources/application-local.yml` — `local` profile 配置。
- 创建：`backend/business/src/main/java/com/miraprep/**` — 应用、配置、通用 HTTP 契约、过滤器和健康端点。
- 创建：`backend/business/src/test/java/com/miraprep/BusinessApplicationIntegrationTest.java` — 端到端 HTTP 契约测试。
- 修改：`backend/business/.env.example` — 与实际配置一一对应的变量说明。
- 修改：`backend/business/.gitkeep` — 在目录拥有真实文件后删除。

### Task 1: 初始化可重复的 Gradle 工程

**Files:**
- Create: `backend/business/settings.gradle.kts`
- Create: `backend/business/build.gradle.kts`
- Create: `backend/business/gradlew`, `backend/business/gradlew.bat`, `backend/business/gradle/wrapper/gradle-wrapper.jar`, `backend/business/gradle/wrapper/gradle-wrapper.properties`
- Modify: `backend/business/.gitkeep` (delete)

- [ ] **Step 1: 用 Gradle 8.10.2 生成 Wrapper，并锁定 Java 21 toolchain**

Run from `backend/business`:

```powershell
gradle wrapper --gradle-version 8.10.2
```

Write `settings.gradle.kts`:

```kotlin
rootProject.name = "miraprep-business"
```

Write `build.gradle.kts` with Spring Boot `3.3.13`, Java 21 toolchain, and these dependencies: web, validation, security, data-jpa, data-redis, Flyway core/mysql, MySQL runtime, springdoc `2.6.0`, Lombok, configuration processor, and `spring-boot-starter-test`/`spring-security-test` for tests. Configure `tasks.test { useJUnitPlatform() }`.

- [ ] **Step 2: 验证构建工具可用**

Run:

```powershell
.\gradlew.bat --version
```

Expected: Gradle `8.10.2` and a Java `21` runtime/toolchain are reported. If the computer only exposes Java 25, install or point `JAVA_HOME` to JDK 21 before proceeding; do not silently compile on Java 25 because T-002 locks Java 21.

- [ ] **Step 3: 验证空工程编译**

Run:

```powershell
.\gradlew.bat test
```

Expected: `BUILD SUCCESSFUL`, with zero tests discovered.

- [ ] **Step 4: Commit**

```powershell
git add backend/business
git commit -m "build: initialize Spring business service"
```

### Task 2: 写 HTTP 契约的失败测试

**Files:**
- Create: `backend/business/src/test/java/com/miraprep/BusinessApplicationIntegrationTest.java`

- [ ] **Step 1: 写四个端到端测试**

Use `@SpringBootTest`, `@AutoConfigureMockMvc`, `@ActiveProfiles("test")`, and `MockMvc`. Set dynamic properties so JPA does not connect to a real database during HTTP contract tests (`spring.flyway.enabled=false`, `spring.datasource.url=jdbc:h2:mem:miraprep`, `spring.jpa.hibernate.ddl-auto=none`, `spring.data.redis.repositories.enabled=false`, `app.internal-token=test-internal-token`). Add H2 as test runtime dependency.

The tests assert:

```java
mockMvc.perform(get("/api/v1/health"))
    .andExpect(status().isOk())
    .andExpect(jsonPath("$.code").value(0))
    .andExpect(jsonPath("$.message").value("ok"))
    .andExpect(jsonPath("$.data.status").value("UP"));

mockMvc.perform(get("/api/v1/test/business-error"))
    .andExpect(status().isBadRequest())
    .andExpect(jsonPath("$.code").value(40000))
    .andExpect(jsonPath("$.message").value("invalid parameter"))
    .andExpect(jsonPath("$.data").doesNotExist());

mockMvc.perform(get("/api/v1/test/validated").param("value", ""))
    .andExpect(status().isBadRequest())
    .andExpect(jsonPath("$.code").value(40000));

mockMvc.perform(get("/api/v1/internal/ping"))
    .andExpect(status().isForbidden())
    .andExpect(jsonPath("$.code").value(40300));

mockMvc.perform(get("/api/v1/internal/ping").header("X-Internal-Token", "test-internal-token"))
    .andExpect(status().isOk())
    .andExpect(jsonPath("$.data.status").value("UP"));
```

- [ ] **Step 2: 运行并确认它因缺失应用代码失败**

Run:

```powershell
.\gradlew.bat test --tests com.miraprep.BusinessApplicationIntegrationTest
```

Expected: compilation failure because `BusinessApplication` and the endpoints do not exist. Fix only test setup mistakes until this is the precise cause.

### Task 3: 实现统一 HTTP 契约并使其测试转绿

**Files:**
- Create: `backend/business/src/main/java/com/miraprep/BusinessApplication.java`
- Create: `backend/business/src/main/java/com/miraprep/common/response/ApiResponse.java`
- Create: `backend/business/src/main/java/com/miraprep/common/error/ErrorCode.java`
- Create: `backend/business/src/main/java/com/miraprep/common/exception/BusinessException.java`
- Create: `backend/business/src/main/java/com/miraprep/common/exception/GlobalExceptionHandler.java`
- Create: `backend/business/src/main/java/com/miraprep/health/HealthController.java`
- Create: `backend/business/src/main/java/com/miraprep/web/TestController.java`

- [ ] **Step 1: 实现最小的统一响应与错误类型**

`ApiResponse<T>` 的字段为 `int code`、`String message`、`T data`，并提供：

```java
public static <T> ApiResponse<T> ok(T data) {
  return new ApiResponse<>(0, "ok", data);
}

public static <T> ApiResponse<T> fail(ErrorCode errorCode) {
  return new ApiResponse<>(errorCode.code(), errorCode.defaultMessage(), null);
}
```

`ErrorCode` 定义 `INVALID_PARAM(40000, BAD_REQUEST, "invalid parameter")`、`UNAUTHORIZED(40100, UNAUTHORIZED, "unauthorized")`、`FORBIDDEN(40300, FORBIDDEN, "forbidden")`、`NOT_FOUND(40400, NOT_FOUND, "not found")`、`INTERNAL(50000, INTERNAL_SERVER_ERROR, "internal server error")`。

- [ ] **Step 2: 实现异常映射、健康端点和仅测试端点**

`GlobalExceptionHandler` 对 `BusinessException` 使用其枚举的 HTTP 状态；对 `MethodArgumentNotValidException` 使用 `INVALID_PARAM`；对未知 `Exception` 使用 `INTERNAL`，日志只记录服务端异常，响应中不含堆栈。`HealthController` 返回 `ApiResponse.ok(Map.of("status", "UP"))`。`TestController` 只在 test profile 下加载，分别抛业务异常和触发 `@NotBlank` 参数校验。

- [ ] **Step 3: 重新运行失败测试并确认转绿**

Run:

```powershell
.\gradlew.bat test --tests com.miraprep.BusinessApplicationIntegrationTest
```

Expected: 除内部 token 两个断言外，其余健康、业务异常、参数校验测试通过；若它们失败，依据断言调整最小实现，而不弱化断言。

### Task 4: 实现安全、内部令牌与 CORS

**Files:**
- Create: `backend/business/src/main/java/com/miraprep/config/SecurityConfig.java`
- Create: `backend/business/src/main/java/com/miraprep/config/CorsConfig.java`
- Create: `backend/business/src/main/java/com/miraprep/web/filter/InternalTokenFilter.java`
- Create: `backend/business/src/main/java/com/miraprep/web/InternalPingController.java`
- Modify: `backend/business/src/main/java/com/miraprep/common/exception/GlobalExceptionHandler.java`

- [ ] **Step 1: 实现只匹配内部 URL 的令牌过滤器**

Extend `OncePerRequestFilter`; `shouldNotFilter` returns true unless the URI begins with `/api/v1/internal/`. Compare the `X-Internal-Token` header with the configuration property using constant-time comparison. On mismatch set HTTP 403 and write `ApiResponse.fail(ErrorCode.FORBIDDEN)` as JSON with `ObjectMapper`; do not continue the filter chain.

- [ ] **Step 2: 配置无状态安全链和 CORS**

`SecurityFilterChain` disables CSRF, sets `SessionCreationPolicy.STATELESS`, permits all requests for this scaffold, and inserts `InternalTokenFilter` before `UsernamePasswordAuthenticationFilter`. `CorsConfigurationSource` permits configured origins, `GET/POST/PUT/PATCH/DELETE/OPTIONS`, `Authorization` and `Content-Type` plus `X-Internal-Token`, and allows credentials only when origins are explicit.

- [ ] **Step 3: 提供内部 ping 端点并运行完整契约测试**

`GET /api/v1/internal/ping` returns `ApiResponse.ok(Map.of("status", "UP"))`. Run:

```powershell
.\gradlew.bat test --tests com.miraprep.BusinessApplicationIntegrationTest
```

Expected: five assertions all pass, proving missing/wrong internal token returns the agreed JSON 403 and correct token passes.

- [ ] **Step 4: Commit**

```powershell
git add backend/business/src/main backend/business/src/test
git commit -m "feat: add business API foundation"
```

### Task 5: 配置运行时依赖、OpenAPI 与真实启动验收

**Files:**
- Create: `backend/business/src/main/java/com/miraprep/config/OpenApiConfig.java`
- Create: `backend/business/src/main/resources/application.yml`
- Create: `backend/business/src/main/resources/application-local.yml`
- Modify: `backend/business/.env.example`

- [ ] **Step 1: 补全配置和 OpenAPI 元数据**

Set application name `miraprep-business`, port `8080`, MySQL datasource variables `DB_URL/DB_USER/DB_PASSWORD`, Redis variables `REDIS_HOST/REDIS_PORT`, `spring.jpa.hibernate.ddl-auto=validate`, and Flyway enabled only when migrations exist. Bind `app.cors.allowed-origins` (default `http://localhost:3000`) and `app.internal-token` (from `AI_INTERNAL_TOKEN`, without a production default). Define OpenAPI title `MiraPrep Business API`, version `v1`, and server `/api/v1`.

- [ ] **Step 2: 验证完整自动化测试与静态构建**

Run:

```powershell
.\gradlew.bat clean test bootJar
```

Expected: `BUILD SUCCESSFUL`, no failing tests, and `build/libs` contains the executable JAR.

- [ ] **Step 3: 启动 T-001 基础设施并进行真实 HTTP 验收**

Copy examples to local ignored files only if they do not already exist, set identical non-placeholder MySQL/MinIO/internal-token values, then run:

```powershell
Set-Location ..\..\infra; docker compose up -d
Set-Location ..\backend\business; .\gradlew.bat bootRun --args='--spring.profiles.active=local'
```

In a second PowerShell window run:

```powershell
Invoke-RestMethod http://localhost:8080/api/v1/health
Invoke-WebRequest -SkipHttpErrorCheck http://localhost:8080/api/v1/internal/ping
Invoke-RestMethod -Headers @{ 'X-Internal-Token' = '<same AI_INTERNAL_TOKEN>' } http://localhost:8080/api/v1/internal/ping
```

Expected: health returns code `0` and status `UP`; missing token returns HTTP `403`/code `40300`; correct token returns code `0`; `http://localhost:8080/swagger-ui/index.html` serves Swagger UI.

- [ ] **Step 4: Commit and inspect final diff**

```powershell
git add backend/business
git commit -m "feat: configure business service runtime"
git status --short
git diff HEAD~3..HEAD --check
```

Expected: no unintended files, no whitespace errors, and no committed `.env`.
