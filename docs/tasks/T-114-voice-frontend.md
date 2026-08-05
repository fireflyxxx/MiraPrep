# T-114 · 前端语音模式（录音/声纹/实时转写/TTS 播放）

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Frontend | M2 | 2d | T-104, T-112, T-113 | — |

## 背景
面试页已有语音模式 UI（麦克风按钮、声纹动画）但走的是文字链路占位。本任务接 T-112（ASR）/T-113（TTS）的 WebSocket 语音链路。先读 PRD §3.6 语音模式 / §5.4。

## 目标
语音模式：录音采集 → WS 推流 → 实时转写回显（发送前可编辑）→ 提交回答；面试官 TTS 音频播放（可静音）；文字/语音随时切换、可混用。

## 范围
- **做**：`MediaRecorder`/`AudioWorklet` 采集（16k）、WS 连接（承载音频上行 + token/asr_partial/audio 下行）、实时声纹波形（现有动画驱动为真实音量）、实时 ASR 转写回显与发送前编辑、TTS 音频播放 + 静音开关、静音超时提示、文字/语音切换、移动端大号麦克风。
- **不做**：ASR/TTS 服务端（T-112/T-113）；文字链路（T-104 已有，本任务在其上叠加语音分支）。

## 技术规格
- 将 T-104 的 SSE（文字）与本任务的 WS（语音）统一到面试连接管理里；语音模式用 WS envelope（`DEVELOPMENT.md §7.2`）。
- 采集：`getUserMedia` + `MediaRecorder`（或 AudioWorklet 转 PCM16/16k），分帧 `{type:"audio"}` 上行。
- 转写：`asr_partial` 增量回显到输入区，`isFinal` 后允许编辑再「提交回答」。
- 播放：`audio` 帧解码播放（Web Audio），静音按钮控制；面试官说话时声波球动画。
- 权限/降级：无麦克风权限或不支持时优雅回退到文字模式并提示。
- 遵守 `prefers-reduced-motion`；移动端输入区底部全宽、麦克风加大。

## 涉及文件
- 扩展 `src/components/interview/InterviewClient.tsx`（语音分支）
- 新增 `src/lib/api/interview-ws.ts`（WS 客户端、音频编解码）
- 新增 `src/components/interview/{VoiceRecorder,Waveform,TTSPlayer}.tsx`

## 验收标准
1. 语音模式录音 → 实时转写回显 → 可编辑 → 提交，面试官续问正常。
2. 面试官 TTS 音频播放，静音开关生效。
3. 声纹波形反映真实音量；静音超时有提示。
4. 文字/语音随时切换、可在一场内混用。
5. 无权限/不支持时降级到文字并提示。
6. 移动端可用；`lint`/`build` 通过，无 console 报错。

## 验证方式
预览走通一段语音问答（需麦克风）；PR 贴录屏/分步截图与 WS 事件日志。

## 遗留/发现

**2026-08-05 验收**：6 条验收标准中 5 条通过，1 条部分通过。

- 修复：配置向导的「语音面试」开关此前被丢弃——`voiceEnabled` 建会话时传给了 Spring
  并落库，但面试页 `voiceMode` 永远从 `false` 起步，勾了也进文字模式。现在偏好经
  sessionStorage 传到面试页；语音链路被拒时会清掉偏好，避免刷新后反复撞同一个失败连接。
- 补测：`interview-ws.test.ts`（音频序号游标、断层回退、关闭码语义）、
  `VoiceRecorder.test.tsx`（100ms 分帧、停止时先冲尾包再 `audio_end`、8 秒静音提示）、
  `InterviewClient.test.tsx`（按配置进入语音模式、拒绝后降级）。
- **部分通过（AC3 声纹波形）**：波形组件本身没有独立用例，且本机浏览器面板拿不到麦克风，
  「波形反映真实音量」只验证到数据通路（`level` → 柱高/透明度），没有真人录音证据。
  需要一次带麦克风的人工走查补齐。
