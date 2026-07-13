# T-052 · 前端评级页 + 报告页联调

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Frontend | M1 | 1.5d | T-005, T-006, T-051, T-060 | T-073（动效增强）, T-084 |

## 背景
`interview/[sessionId]/result/page.tsx` 与 `components/report/ReportClient.tsx` 目前用 mock。本任务接 T-051 的报告/评级数据，并加雷达图。先读 PRD §3.7/§3.8。

## 目标
评级页与报告页从真实 API 渲染；报告含五维雷达图、逐题详情卡（展开）、参考答案、建议、追问链、耗时。

## 范围
- **做**：评级页接 `GET /reports/{sessionId}`（评级徽章、总分、关键数据、亮点/不足）、报告页接同接口（摘要区 + 雷达图 + 逐题卡）、雷达图用 Recharts、逐题卡展开/收起接真实数据、评级色按 token（T-006）、加载骨架屏、错误/空态、partial 报告标注。
- **不做**：PDF 导出/分享/历史对比（T-081/082）；重练此题（T-084，留占位入口）；揭晓仪式动效增强（T-073，本任务先用现有过渡）。

## 技术规格
- 评级页字段对齐 T-051 `GET /reports/{sessionId}`；结果页现有环形评级、stats grid 复用，数据换真实。
- 报告页：摘要区（评级/总分/岗位/日期/配置回显）、五维雷达（Recharts `RadarChart`，可叠加历史均值——复用 T-060 的 `useOverviewStats`，读取 `dimensionScores`）、逐题卡（题目/我的回答/单题分颜色条/耗时对比/参考答案可展开/追问链缩进时间线/改进建议）。
- 评级色用 T-006 的 `grade-*` token。数字用 `tabular-nums`。
- 骨架屏（PRD §4.6，禁止 CLS）。
- 保留现有报告页展开/收起与过渡。

## 涉及文件
- 修改 `src/app/interview/[sessionId]/result/page.tsx`（改为 client 或 server 取数 + client 交互）
- 大改 `src/components/report/ReportClient.tsx`（接真实数据 + 雷达 + 逐题结构）
- 新增 `src/components/report/RadarChart.tsx`（Recharts 封装）
- 新增 `src/lib/api/report.ts`（getReport hook）
- 逐步移除 `mock-data.ts` 中报告相关

## 验收标准
1. 评级页/报告页从真实报告渲染，字段完整正确。
2. 五维雷达图正确渲染并可与历史均值对比。
3. 逐题卡展开显示我的回答/参考答案/建议/追问链/耗时对比（超时标橙）。
4. partial 报告有「部分完成」标注。
5. 加载有骨架、无 CLS；错误/空态友好。
6. `lint`/`build` 通过，无 console 报错。

## 验证方式
预览用真实报告数据走通评级→报告；PR 贴截图（含雷达图、展开卡）与网络请求。

## 遗留/发现
