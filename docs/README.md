# MiraPrep 文档导航

> 最近维护：2026-07-24

这里是项目文档的统一入口。阅读状态或准备开发时，优先使用下表中的“当前文档”；`superpowers/` 下的文件是任务实施时留下的历史设计快照，不代表当前进度。

## 当前文档

| 文档 | 用途 | 状态来源 |
|---|---|---|
| [产品需求文档](MiraPrep-PRD.md) | 产品范围、页面体验、评分与目标架构 | 产品契约 |
| [工程开发总纲](DEVELOPMENT.md) | 实际架构、本地环境、服务边界、验证约定 | 工程契约 |
| [任务拆分与状态](tasks/README.md) | 任务依赖、优先级、DONE/REVIEW/TODO | **任务状态唯一入口** |
| [学习模式](tasks/LEARNING.md) | 学习型任务的协作与讲解约定 | 协作约定 |
| [前端 README](../frontend/README.md) | 前端联调范围、环境变量和检查命令 | 服务说明 |
| [Spring README](../backend/business/README.md) | 业务 API、配置和测试 | 服务说明 |
| [FastAPI README](../backend/ai/README.md) | AI 服务、内部接口和测试 | 服务说明 |

## 历史文档

[历史计划与设计说明](superpowers/README.md) 收录早期任务的实现计划和设计快照。它们用于追溯决策，不应覆盖当前代码、任务状态表或服务 README。

## 状态判定规则

1. 任务状态以 [tasks/README.md](tasks/README.md) 为准。
2. `DONE` 表示实现已进入当前代码基线并有回归证据；`REVIEW` 表示实现已存在但仍待提交、发布或真实环境验收；`TODO` 表示尚未完成。
3. 页面“已实现”需区分视觉实现与真实数据联调；PRD 和根 README 会显式标注。
4. 当前运行方式、依赖版本与测试命令以代码和各服务 README 为准；历史计划里的版本、目录状态与复选框仅反映当时上下文。

## 维护约定

- 完成或推进任务时，同时更新任务文件中的“实施状态”和 [任务总表](tasks/README.md)。
- 改变接口、环境变量、依赖版本或启动方式时，同步更新对应服务 README 与 [DEVELOPMENT.md](DEVELOPMENT.md)。
- 改变产品范围、页面数据来源或评级契约时，同步更新 [MiraPrep-PRD.md](MiraPrep-PRD.md)。
- 历史计划原则上不改写正文；若事实已被后续任务取代，只补醒目的历史说明。
