# MiraPrep 业务服务

Spring Boot 服务是用户、简历、面试会话和报告等业务数据的事实来源。它负责持久化与鉴权，通过内部 REST 调用 FastAPI AI 服务。

## 本地运行

Windows PowerShell：

```powershell
Set-Location backend/business
.\gradlew.bat bootRun
```

macOS、Linux 或 CI：

```bash
cd backend/business
./gradlew bootRun
```

健康检查为 `GET http://localhost:8080/api/v1/health`，OpenAPI 文档位于 `http://localhost:8080/swagger-ui.html`。

## 开发检查

```powershell
Set-Location backend/business
.\gradlew.bat clean check bootJar
```

`check` 会运行 JUnit 5 与 MockMvc 测试；数据库相关集成测试使用 H2 的 MySQL 兼容模式，不依赖开发机上的 MySQL。JaCoCo HTML 覆盖率报告生成到 `build/reports/jacoco/test/html/index.html`。

新增或修改成功、失败、鉴权及数据分支时，应同步补充相应测试。
