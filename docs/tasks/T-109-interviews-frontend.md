# T-109 · 我的面试联调（综合评级 + 能力维度 + 记录列表）

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Frontend | M1 | 1.5d | T-005, T-006, T-030, T-106, T-107 | — |

## 背景
`src/app/interviews/page.tsx` 已有综合评级、四条能力进度条和全部面试列表的视觉稿，但全部来自 `mock-data.ts`。后端统计统一为五维，记录列表由 T-030 提供。先读 PRD §3.4.1、T-030/T-106 契约。

## 目标
把 `/interviews` 切到真实综合评级、五维聚合和分页记录；不同会话/报告状态显示正确操作，不把尚未生成的报告链接成可访问页面。

## 范围
- **做**：复用 T-107 `useOverviewStats()` 渲染综合评级/总评/五维，扩展 `src/lib/api/interview.ts` 的分页列表 hook，状态徽章与 CTA 映射，分页，骨架、空态、错误重试、报告/继续面试跳转、移动端列表布局。
- **不做**：岗位/评级高级筛选和排序、历史趋势图、雷达图、跨场对比；这些留给后续迭代。不要在本任务改统计聚合口径。

## 技术规格
- 五维只使用冻结键 `professionalKnowledge/projectDepth/communicationLogic/adaptability/jobFit`，前端映射为「专业知识/项目深度/表达逻辑/临场应变/岗位匹配度」；删除现有独立四维常量。
- `GET /interviews?page&size&status?` 使用 T-030 的分页结构，保留当前页数据时显示下一页 loading，避免整页闪空。
- 行操作按状态确定：
  - `reportStatus=ready` → 「查看报告」跳 `/report/{sessionId}`，保留 `nav-forward`；
  - `status=ongoing` → 「继续面试」跳 `/interview/{sessionId}`；
  - `reportStatus=grading` → 显示「报告生成中」，不可伪造报告链接；
  - `aborted/failed/none` → 显示明确状态，不可点击到 404。
- `overallGrade=null` 或列表 `total=0` 时展示首次面试空态 + `/interview/setup` CTA；统计失败与列表失败独立重试。
- 将页面保留为轻量 Server wrapper，交互放 `InterviewsClient`；记录行在窄屏改为两列/纵向信息，禁止四列固定网格横向溢出。

## 涉及文件
- 修改 `src/app/interviews/page.tsx`（Server wrapper）
- 新增 `src/components/interviews/InterviewsClient.tsx`、`InterviewHistoryRow.tsx`
- 扩展 `src/lib/api/interview.ts`（list 类型 + query hook）
- 复用 `src/lib/api/stats.ts`（T-107）
- 无其他引用后移除 `mock-data.ts` 中 `interviewHistory`
- 新增页面/状态映射/分页测试

## 验收标准
1. 综合评级、总评与五维来自 `GET /stats/overview`，中文标签与冻结键一一对应。
2. 列表来自真实分页 API，题数、计划/实际用时、评级、会话与报告状态正确。
3. ready/ongoing/grading/aborted/failed 五类操作均符合状态规则，不产生无效报告链接。
4. 0 场、统计失败、列表失败、慢请求都有清晰且可恢复的 UI。
5. 分页不重复/漏项，桌面与移动布局无横向溢出和 CLS。
6. 状态映射、空态、错误重试、分页和跳转有测试；`lint`/`test`/`build` 通过，无 console 报错。

## 验证方式
用真实 API 或 MSW 覆盖 0 场、混合状态、两页数据、统计 500、列表 500、慢请求；PR 贴测试输出、网络请求和桌面/移动截图。

## 遗留/发现
