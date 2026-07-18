# T-122 · 本地题库 + RAG 检索增强出题

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Backend-AI | M3 | 1.5d | T-031, T-101 | — |

## 背景
当前大纲生成（T-031）的 DOMAIN_ASSESSMENT 题目完全靠 LLM 现编，题目质量与覆盖面不可控。引入**本地题库 + RAG 检索**：按「岗位方向 + JD + 简历技能」从题库检索最相关的真题作为候选，注入 prompt 让 LLM 在真题基础上选择与改写（grounding），提升专业题的真实性与区分度。题库同时为后续 `/practice` 题库训练页（PRD §3.4.2，当前占位）预留数据与检索能力。

## 目标
本地题库数据 + 向量检索服务，接入大纲生成：DOMAIN_ASSESSMENT 阶段的题目须由「检索到的题库真题」参与生成。

## 范围
- **做**：题库 seed 数据（JSON）、embedding 索引构建与加载、元数据过滤 + 向量检索服务、接入 `outline.py` 的 DOMAIN_ASSESSMENT 出题 prompt、检索命中率与来源在日志中可观测。
- **不做**：`/practice` 题库训练页的前后端（后续任务，复用本任务的检索服务）；题库后台管理/爬取（seed 数据人工整理或 LLM 离线生成后人工审校）；BEHAVIORAL/SELF_INTRO 等非专业题阶段不走检索（LLM 生成已足够）。

## 技术规格
- **题库数据**：`backend/ai/data/question_bank.json`，每条：
  ```json
  {"id":"fe-001", "direction":"前端工程", "difficulty":"MEDIUM",
   "text":"谈谈虚拟列表的实现原理与性能边界", "focusPoints":["虚拟列表","性能优化"],
   "tags":["React","长列表"], "referenceNotes":"可选：参考要点，供批改/参考答案用"}
  ```
  方向枚举与落地页 8 个方向对齐（前端工程/后端开发/算法/产品经理/数据分析/数据科学/运营/市场），首批每方向 ≥ 30 题即可跑通。
- **技术栈：LangChain RAG 全家桶**——`HuggingFaceEmbeddings`（默认 `bge-small-zh-v1.5`，模型名从配置 `embedding_model` 读）+ **`Chroma`** 本地持久化向量库（`persist_directory=data/chroma`）。题目以 LangChain `Document` 入库：`page_content = text + tags`，`metadata = {id, direction, difficulty, focusPoints}`。
- **索引构建**：`scripts/build_question_index.py` 读 `question_bank.json` → 写 Chroma；题库文件 hash 存入 collection metadata，hash 变化时重建，否则启动直接加载。
- **检索服务** `app/services/question_bank.py`：
  - 基于 `vectorstore.as_retriever(search_kwargs={"k": top_k, "filter": {...}})` 封装 `retrieve(query: str, direction: str, difficulty: str|None, top_k: int = 8) -> list[Document]`
  - 流程：`direction`（必选）与 `difficulty`（可选，允许相邻档）走 Chroma metadata filter → 向量相似度取 top_k。
  - query 由「jobTitle + JD 关键句 + 简历 parsedJson 的技能/项目关键词」拼接；**简历与 JD 内容是不可信数据**，只作为检索 query 与 prompt 中被引用的数据，不作为指令（`DEVELOPMENT.md §7.5`）。
- **接入大纲生成**（改 `app/services/outline.py` / `app/prompts/outline.py`）：
  - DOMAIN_ASSESSMENT 题目生成前先 `retrieve(...)`，把 top_k 候选真题（含 focusPoints）注入 prompt，指示 LLM：优先从候选中选择并按简历/JD 改写措辞，可补充候选未覆盖的考察点；产出 schema 不变（对 T-030 回调契约零影响）。
  - 检索为空或失败时**降级为现状**（纯 LLM 生成），不阻塞大纲生成；降级记 warning 日志。
  - 大纲结果里被采用的题记录来源 id（日志/trace 层面即可，不改回调 schema）。
- **可观测**：每次大纲生成日志输出：检索 query 摘要、命中题 id 列表、最终采用数，供 T-123 复用。

## 涉及文件
- `backend/ai/data/question_bank.json`（seed）
- `backend/ai/scripts/build_question_index.py`（Chroma 索引构建）
- `app/services/question_bank.py`（retriever 封装）
- `app/services/outline.py`、`app/prompts/outline.py`（接入点：填 T-031 预留的候选题槽位）
- `app/config.py`（`embedding_model`、`chroma_persist_dir`）
- `tests/test_question_bank.py`

## 验收标准
1. 题库加载与索引构建成功；同一题库二次启动走缓存不重复编码。
2. 给定「前端工程 + React 简历」的 query，top_k 结果明显偏向前端/React 题（PR 贴检索对比样例）。
3. 大纲生成的 DOMAIN_ASSESSMENT 题目可追溯到题库来源 id（日志证据），且整体 schema 与回调契约不变。
4. 题库文件缺失/检索异常时大纲生成正常降级，不报 500。
5. 方向过滤生效：检索「产品经理」不会命中算法题。

## 验证方式
PR 贴：2 组不同方向的检索 top_k 对比、一次接入后的大纲输出（标注哪些题来自题库）、降级分支日志。

## 遗留/发现
