# T-091 · 可观测：会话级 trace + Token 成本统计

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Backend-AI | 横切 | 1d | T-040 | — |

## 背景
PRD §6.5 要求会话级 trace（每场面试的 LLM 调用链）与 Token 成本统计。

## 目标
为 AI 服务加结构化 trace 与 Token/成本统计，按会话聚合，可查询/导出。

## 范围
- **做**：每次 LLM/ASR/TTS 调用记录（会话 id、阶段、模型、输入/输出 token、耗时、成本估算）、按会话聚合、日志/指标输出（结构化日志或接入 OpenTelemetry）、成本统计查询。
- **不做**：不做完整 APM 平台；先保证数据可采集可查。

## 技术规格
- 在 T-003 的 LLM 客户端封装里统一埋点：记录 `sessionId, phase, model, promptTokens, completionTokens, latencyMs, costUsd`。
- 成本估算：按模型价格表（从 claude-api 文档核对当期价格，配置化）计算。
- 聚合：按 `sessionId` 汇总一场面试的总 token/成本/调用数；可暴露 `GET /internal/sessions/{id}/trace`（内部）。
- 输出：结构化日志（带 `request_id`/`session_id`）+ 可选 OpenTelemetry span。

## 涉及文件
- 扩展 `app/clients/llm.py`（埋点）
- 新增 `app/services/trace.py`、`app/routers/internal.py`（trace 查询）

## 验收标准
1. 每场面试可查到完整 LLM 调用链与 token/成本汇总。
2. 成本估算与模型价格一致（配置化）。
3. 日志结构化、可按 session 检索。

## 验证方式
PR 贴：一场面试的 trace 输出与成本汇总。

## 遗留/发现
