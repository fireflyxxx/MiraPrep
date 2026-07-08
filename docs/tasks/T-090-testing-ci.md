# T-090 · 测试策略 + CI（三服务）

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Infra | 横切 | 1.5d | T-002, T-003, T-005 | — |

## 背景
项目无测试与 CI。本任务建立三服务的最小测试基线与 CI 流水线，穿插在各阶段执行（越早越好）。

## 目标
建立测试约定与 CI：前端 lint+build+基础组件测试、Spring 单测+集成测试、FastAPI pytest；PR 触发流水线。

## 范围
- **做**：CI 配置（GitHub Actions 或团队所用）、各服务测试脚手架与示例用例、测试运行脚本、覆盖率门槛（起步可低）。
- **不做**：不追求全量覆盖，先立框架 + 关键路径样例。

## 技术规格
- 前端：`npm run lint` + `npm run build` 必过；引入 Vitest + Testing Library，给 1–2 个组件/工具函数样例测试。
- Spring：JUnit5 + MockMvc；给 Auth 或 Health 的集成测试样例；用 Testcontainers 或内存库跑 DB 相关。
- FastAPI：`pytest` + `httpx` AsyncClient；给 health/internal 鉴权样例测试；LLM 调用用 mock。
- CI：矩阵化三服务，PR 触发；缓存依赖；失败阻断合并。
- 约定写入 `DEVELOPMENT.md`「完成定义」已有，补测试运行命令到各服务 README。

## 涉及文件
- `.github/workflows/ci.yml`（或对应 CI）
- `frontend/` 测试配置 + `src/**/*.test.ts(x)` 样例
- `backend/business/src/test/**` 样例
- `backend/ai/tests/**` 样例

## 验收标准
1. PR 触发 CI，三服务的 lint/build/test 全跑并可阻断。
2. 每服务至少 1 个有意义的样例测试通过。
3. 依赖缓存生效，CI 时长可接受。

## 验证方式
PR 贴：CI 运行结果截图/链接、各服务测试通过输出。

## 遗留/发现
