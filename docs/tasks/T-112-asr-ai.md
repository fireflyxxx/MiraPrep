# T-112 · ASR：WebSocket 流式语音转写

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Backend-AI | M2 | 2d | T-040, T-101 | T-114 |

## 背景
语音模式下，前端采集音频流式推送，FastAPI 流式转写实时回显。先读 PRD §5.4 ASR、`DEVELOPMENT.md §7.2`。

## 目标
在面试 WebSocket 上支持音频帧上行 + 流式 ASR 部分转写下行（`asr_partial`），最终文本并入回答流。

## 范围
- **做**：WebSocket `/ws/interview/{sessionId}`（承载音频上行 + 面试官 token/TTS/asr_partial 下行）、ASR 网关抽象（先接一家：Whisper 或云流式 ASR）、部分/最终转写事件、与 T-040 对话链路衔接（转写文本作为用户回答提交）、断线重连按 seq。
- **不做**：TTS（T-113）；前端录音 UI（T-114）。

## 技术规格
- WS envelope（`DEVELOPMENT.md §7.2`）：上行 `{type:"audio", payload:{chunk(base64/bin), format:"pcm16/16k"}}`；下行 `{type:"asr_partial", payload:{text, isFinal}, seq}`。
- ASR 抽象 `app/services/asr/base.py` + 一个实现，配置 `ASR_PROVIDER` 可切。目标转写延迟 < 800ms（PRD §6.5）。
- 最终转写（`isFinal`）+ 用户确认后，作为回答进入 T-040 对话流。
- 音频可选留存用于报告回放（设置里可关，PRD §5.4）；存对象存储由 Spring 侧签发（本任务只产出音频引用或交回调）。
- 复用 T-101 迁移后的 LangGraph 运行时与会话态（checkpointer），不重复实现对话逻辑。**ASR 网关本身不迁 LangChain**——它是流媒体管道，与 LLM 编排无关，保持独立抽象层。

## 涉及文件
- `app/routers/interview_ws.py`（WS，含音频上行 + 各类下行）
- `app/services/asr/{base.py, <provider>.py}`
- 扩展 `app/services/interview_agent.py` 衔接语音回答

## 验收标准
1. WS 建连后推送音频流，实时收到 `asr_partial`（含 isFinal），延迟满足目标。
2. 最终转写文本能作为回答进入面试对话，面试官正常续问。
3. 断线重连按 seq 续传，不丢音频段。
4. ASR provider 可通过配置切换（抽象生效）。

## 验证方式
PR 贴：用测试音频/脚本推流的转写事件序列、端到端「语音→回答→面试官续问」证据。

## 遗留/发现
