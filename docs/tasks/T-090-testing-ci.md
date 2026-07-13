# T-090 · 测试脚手架 + CI（三服务，前置执行）

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Infra | 横切 | 2d | T-002, T-003, T-005 | 后续所有业务任务复用此测试基线 |

## 背景
项目无测试与 CI。本任务在波次 1 建立三服务测试基线与 CI；不得拖到 M1 功能全部完成后再补，否则各联调任务只能依赖截图回归。

## 目标
建立测试约定与 CI：前端 lint+build+基础组件测试、Spring 单测+集成测试、FastAPI pytest；PR 触发流水线。

## 范围
- **做**：CI 配置（GitHub Actions 或团队所用）、各服务测试脚手架与有意义的基线用例、测试运行脚本、覆盖率报告、PR required checks；规定后续任务必须为新增数据/交互分支补测试。
- **不做**：不在本任务补齐现有所有页面的历史覆盖率；历史页面按后续被修改时补回归测试。

## 技术规格
- 前端：引入 Vitest + Testing Library + jsdom（可选 MSW），增加 `npm run test`/`test:coverage`；至少覆盖一个异步 hook、一个交互组件和一个错误分支，不写纯“能渲染”样例。
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
2. 前端至少覆盖异步 hook、交互、错误三类基线；Spring/FastAPI 各至少一个成功和一个失败/鉴权分支。
3. 依赖缓存生效，CI 时长可接受。

## 验证方式
PR 贴：CI 运行结果截图/链接、各服务 lint/build/test/coverage 输出；随后 T-011 起的业务任务必须直接复用该配置。

## 遗留/发现
