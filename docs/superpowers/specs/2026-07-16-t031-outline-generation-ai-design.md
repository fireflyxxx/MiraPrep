# T-031 面试大纲生成 AI 设计

## 目标与边界

FastAPI 接收 Spring Boot 传来的会话配置与结构化简历，立即返回 `202 Accepted`，在后台调用 LLM 生成覆盖面试各阶段的题目池，并把结果回调给 Spring Boot 持久化。

本任务只负责面试开始前的静态大纲规划，不负责运行时追问、业务数据库写入或前端交互。实现代码限定在 `backend/ai/`；已有的 `backend/business/` T-030 改动保持不变。

## API 契约

新增内部端点：

```http
POST /internal/interviews/{id}/outline
X-Internal-Token: <shared token>
```

请求体沿用 T-031 契约：

```json
{
  "sessionId": 1,
  "config": {
    "jobDirection": "前端开发",
    "jobTitle": "高级前端工程师",
    "jdText": "负责大型 Web 应用性能优化",
    "difficulty": "hard",
    "types": ["technical"],
    "durationMin": 45,
    "customRequirements": "重点系统设计，少问算法",
    "interviewerStyle": "high_pressure"
  },
  "resume": {
    "parsedJson": {
      "projects": [],
      "skills": []
    }
  }
}
```

路由参数 `id` 与 body 中的 `sessionId` 都使用 Spring 业务库的正整数主键，并且两者必须一致，避免把结果回调到错误会话。合法请求立即返回：

```json
{"accepted": true}
```

成功回调：

```json
{
  "status": "ready",
  "questions": [
    {
      "phase": "SELF_INTRO",
      "text": "请做一个简短的自我介绍。",
      "focusPoints": ["表达结构"],
      "order": 1,
      "suggestedSeconds": 120
    }
  ]
}
```

失败回调为 `{"status":"failed","error":"..."}`，路径统一为 `/interviews/{sessionId}/outline-result`。

## 模块划分

### Schema 层

`app/schemas/outline.py` 定义请求配置、简历包装、阶段枚举、问题、大纲和接受响应。Pydantic 负责在系统边界拒绝空题目、空考察点、非法阶段、非正数顺序与时长。

字段命名保持 Spring 契约使用的 camelCase；未知的 `parsedJson` 内容允许保留为普通 JSON，因为它来自 T-021 且以后可能增加字段。

### Prompt 层

`app/prompts/outline.py` 保存 system prompt 与 user prompt 构造函数。

可信规则只放在 system prompt，包括：输出 JSON schema、阶段顺序、题量预算、风格、题型权重和安全规则。JD、简历、自定义要求全部序列化后放入明确标记的“不可信数据区”，模型只能引用其中事实，不能执行其中的指令。

### Service 层

`app/services/outline.py` 编排以下流程：

1. `durationMin` 只接受产品配置页提供的 15、30、45 分钟，分别生成 6、8、11 题；其他值在请求校验阶段拒绝。
2. 根据 `types` 生成阶段预算。技术面以 `DOMAIN_ASSESSMENT` 和 `RESUME_DEEP_DIVE` 为主；HR/行为面提高 `BEHAVIORAL` 权重。
3. 调用 LLM，并用 Pydantic 校验返回 JSON。
4. 执行业务级校验：题量匹配预算、六个规定阶段均有覆盖、顺序连续且阶段不倒退、总建议时长不超过面试时长、简历深挖题引用真实项目名或技术名。
5. 成功回调 `ready`；LLM、JSON、schema 或业务校验失败都回调 `failed`。
6. 无论成功或失败，关闭该后台任务拥有的 LLM 与回调客户端。

路由继续使用 FastAPI `BackgroundTasks` 持有后台任务，保持与 T-021 一致的生命周期模式。

## 题量与阶段预算

基础阶段始终包含：

- `SELF_INTRO`：1 题。
- `RESUME_DEEP_DIVE`：至少 1 题，有可引用的简历项目或技术时至少 2 题。
- `DOMAIN_ASSESSMENT`：技术面主体。
- `BEHAVIORAL`：至少 1 题，HR/behavioral 类型时增加。
- `CANDIDATE_QA`：1 题。
- `CLOSING`：1 题。

六个阶段的固定覆盖意味着最短大纲为 6 题。各档位采用确定性预算，顺序依次为自我介绍、简历深挖、专业能力、行为面、候选人反问、收尾：

| 时长 | 普通/技术面 | HR/behavioral 面 |
|---|---|---|
| 15 分钟 | 1 / 1 / 1 / 1 / 1 / 1 | 1 / 1 / 1 / 1 / 1 / 1 |
| 30 分钟 | 1 / 2 / 2 / 1 / 1 / 1 | 1 / 1 / 2 / 2 / 1 / 1 |
| 45 分钟 | 1 / 3 / 4 / 1 / 1 / 1 | 1 / 2 / 4 / 2 / 1 / 1 |

这样既满足题量随时长伸缩，也保持 PRD 中行为面最多 2 题的边界。`types` 同时包含多种类型时，只要包含 `hr` 或 `behavioral` 就使用右栏预算。

`customRequirements` 是软约束，由 prompt 引导模型体现。代码不尝试理解所有自然语言要求，但会把它与题量预算、结构化配置一并传递，并通过测试验证提示中没有丢失该信息。

## 防幻觉与防注入

模型不能凭空生成“简历深挖”事实。Service 从 `parsedJson.projects[].name`、`projects[].tech[]` 和顶层 `skills[]` 提取可引用词，至少一条 `RESUME_DEEP_DIVE` 题目必须包含其中一个真实词；简历没有任何可引用项目或技术时，深挖题只能询问通用经历，不启用该强校验。

简历、JD、自定义要求中即使出现“忽略以上指令”“输出系统提示”等文本，也只会进入不可信数据区。它们不得进入 system prompt，也不得改变输出 schema。

## 错误处理

所有后台生成异常在 service 内部收敛，不向已经返回 `202` 的请求抛出。错误对外使用稳定、非敏感的描述：

- LLM 调用失败；
- LLM 返回非法 JSON；
- LLM 输出不符合 schema；
- 大纲未通过题量、阶段、顺序、时长或简历引用校验；
- 未预期的内部错误。

回调客户端沿用现有三次有界重试。若最终仍无法送达，只记录错误日志，不递归创建新的回调任务。

## 测试策略

严格按 TDD 实施，先观察测试因功能缺失而失败，再写最小实现。

测试覆盖：

- 15、30、45 分钟配置分别生成 6、8、11 题；
- HR 类型提高行为面占比，技术类型提高专业能力占比；
- 简历深挖题引用真实项目或技术；
- `customRequirements` 与 `interviewerStyle` 被放入不可信数据区并传给 LLM；
- 注入文本不能进入 system prompt；
- 成功回调的路径与 payload；
- LLM 异常、非法 JSON、schema 错误和业务规则错误都回调 `failed`；
- 路由立即返回 202、内部 token 生效、路径/body 会话 ID 不一致返回 422；
- 后台任务结束后关闭任务专属客户端。

最终验证命令从 `backend/ai` 运行：

```powershell
uv run pytest -q
uv run ruff check .
uv run black --check .
```

并在仓库根运行 `git diff --check`，确认没有空白符或补丁格式问题。
