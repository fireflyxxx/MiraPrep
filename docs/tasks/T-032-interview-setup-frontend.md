# T-032 · 前端面试配置向导联调 + 大纲过场

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Frontend | M1 | 1d | T-005, T-022, T-030 | — |

## 背景
`src/app/interview/setup/page.tsx` 是 3 步向导（简历/岗位难度/补充要求），目前全 mock，「开始面试」直接跳 `/interview/demo`。本任务接 T-030 创建真实会话并做大纲生成过场。先读 PRD §3.5。

## 目标
向导收集配置 → `POST /interviews` 创建会话 → 过场页轮询 `outlineStatus` → ready 后跳 `/interview/{sessionId}`。Step1 简历部分复用 T-022 组件。

## 范围
- **做**：三步配置状态收集与校验、Step2 补齐 PRD 要求（JD 文本域、面试类型多选、难度）、Step3（补充要求、面试官风格、语音开关）、提交创建会话、过场页（「面试官正在阅读你的简历…」进度动画 + 轮询）、ready 后带真实 sessionId 跳转、失败处理。
- **不做**：面试进行页本身（T-042）；简历上传组件（T-022 提供，复用）。

## 技术规格
- 提交 body 对齐 T-030 `POST /interviews`：`{resumeId, jobDirection, jobTitle?, jdText?, difficulty, types[], durationMin, customRequirements?, interviewerStyle, voiceEnabled}`。
- 现有 UI 缺的字段要补：JD 粘贴文本域、面试类型多选、面试官风格卡片、语音开关（PRD §3.5 Step2/3）。
- 过场：创建成功拿到 `sessionId` 后进入过场态，轮询 `GET /interviews/{id}/status`（~1.5s）直至 `outlineStatus=ready`→`router.push('/interview/'+sessionId, {transitionTypes:['nav-forward']})`；`failed` 则报错可重试。
- 保留现有 stepper UI、底部固定操作栏与过渡动画。

## 涉及文件
- 修改 `src/app/interview/setup/page.tsx`（补字段、接 API、过场轮询）
- 新增 `src/lib/api/interview.ts`（createInterview / getStatus hooks）
- 新增/复用过场组件（可用现有声纹动画）

## 验收标准
1. 走完三步创建真实会话，过场轮询到 ready 后进入 `/interview/{真实sessionId}`。
2. 提交 body 含全部配置字段（JD、类型、风格、语音开关）。
3. 大纲失败时过场页报错且可重试/返回。
4. Step1 复用真实简历库（T-022），选中项正确带入。
5. `lint`/`build` 通过，无 console 报错，过渡动画正常。

## 验证方式
预览走通配置→过场→进入面试页；PR 贴分步截图与创建请求 body。

## 遗留/发现
