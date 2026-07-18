# T-104 · 前端面试进行页接 SSE（文字模式）

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Frontend | M1 | 2d | T-005, T-040（+T-103 恢复） | T-114（语音在此之上叠加） |

## 背景
`src/components/interview/InterviewClient.tsx` 目前用本地 `questions` 数组模拟问答，无真实对话。本任务接 T-040 的 SSE 流式对话（文字模式）。先读 PRD §3.6、`DEVELOPMENT.md §7.2`。

## 目标
面试页接实时流：面试官问题流式打字呈现，用户提交文字回答，阶段指示随后端 `phase_change` 更新，支持断线重连与刷新恢复，结束跳评级页。

## 范围
- **做**：SSE 订阅与 envelope 处理（token 流式渲染、phase_change 更新阶段、interview_end 跳转）、提交回答 `POST /answer`、聊天流 UI（面试官左/用户右、自动滚动 + 「回到最新」）、阶段指示条（PRD 阶段）、「正在思考」占位、断线重连（按 seq）、刷新恢复（拉 `GET /messages`）、结束二次确认、`beforeunload` 防误触、现有「回看」抽屉接真实历史。
- **不做**：语音模式（T-114，本任务保留 UI 但走文字链路，语音按钮可禁用/占位）；批改与报告（T-105/T-108）。

## 技术规格
- 连接 `NEXT_PUBLIC_AI_STREAM_URL` 的 SSE（T-040 契约）；提交回答走 `POST /interviews/{id}/answer`。
- envelope 处理：`token`→追加到当前面试官气泡（打字机）；`phase_change`→更新顶部阶段；`interview_end`→`router.push('/interview/{id}/result',{transitionTypes:['nav-reveal']})`。
- 断线：监听 error/close，指数退避重连，重连时上报已收最大 `seq` 续传；本地保留未确认回答。
- 刷新恢复：进页面先 `GET /interviews/{id}/messages` 重建历史，再订阅增量。
- 现有 UI（声波球、进度点、语音/文字切换、回看抽屉、录音按钮）尽量复用；文字模式为主链路。
- 保留现有过渡与动画；移动端底部输入区适配（PRD §4.6）。

## 涉及文件
- 大改 `src/components/interview/InterviewClient.tsx`（接 SSE、状态、恢复、重连）
- 新增 `src/lib/api/interview-stream.ts`（SSE 客户端封装、answer、messages）
- `src/app/interview/[sessionId]/page.tsx`（把真实 sessionId 传入，已是 async params）

## 验收标准
1. 进入真实会话后面试官问题流式出现，提交回答后进入下一轮，阶段随后端推进。
2. 断网/刷新后能恢复到当前进度不丢历史。
3. 「回看」抽屉显示真实已答问答；自动滚动与「回到最新」正常。
4. 结束（后端 interview_end 或手动结束二次确认）后跳评级页。
5. `beforeunload` 提醒生效；移动端输入区可用。
6. `lint`/`build` 通过，无 console 报错。

## 验证方式
预览走通一场文字面试（含刷新恢复、手动结束）；PR 贴分步截图 + SSE 事件日志。

## 遗留/发现
