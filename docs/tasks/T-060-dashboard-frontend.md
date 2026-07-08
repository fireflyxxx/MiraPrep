# T-060 · 前端工作台联调（统计+记录+骨架+空态）

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Frontend | M1 | 1d | T-005, T-051 | — |

## 背景
`src/app/dashboard/page.tsx` 目前用 mock 的统计与记录列表。本任务接真实统计与面试记录 API。先读 PRD §3.4。

## 目标
工作台的统计卡、面试记录列表接真实数据；加骨架屏与空态；问候语随时间变化。

## 范围
- **做**：接 `GET /stats/overview`（累计场次、最高/最近评级、练习时长、雷达可选在工作台展示）、接 `GET /interviews`（记录列表，评级徽章、状态、点击进报告）、骨架屏、空态（无记录时插画 + CTA）、问候语按当前时间（早/下午/晚上好）、简历库入口显示数量。
- **不做**：雷达图组件本身由 T-052 提供（可复用）；记录筛选/排序可做基础版，高级筛选后续迭代。

## 技术规格
- 统计卡数据来自 `GET /stats/overview`（T-051 契约）。
- 记录列表来自 `GET /interviews?page&size`（T-030 契约，含 grade）；点击跳 `/report/{sessionId}`（保留 `nav-forward` 过渡）。
- 空态组件复用统一空态（PRD §4.6）；骨架屏禁止 CLS。
- 问候语：按 `new Date().getHours()` 分段。
- 现有侧边栏、横幅、卡片布局与过渡保留。

## 涉及文件
- 修改 `src/app/dashboard/page.tsx`（取数、骨架、空态、问候语）
- 新增 `src/lib/api/stats.ts`（overview hook）、复用 `src/lib/api/interview.ts`（list hook）
- 复用 `src/components/report/RadarChart.tsx`（如工作台展示雷达）
- 移除 `mock-data.ts` 中 `interviewHistory` 引用

## 验收标准
1. 统计卡与记录列表来自真实 API，数字正确。
2. 无数据时展示空态 + CTA；有数据正常。
3. 加载有骨架、无 CLS。
4. 问候语随时间变化正确。
5. 记录点击进入对应真实报告。
6. `lint`/`build` 通过，无 console 报错。

## 验证方式
预览分别在「有数据/无数据」下截图；PR 贴网络请求与截图。

## 遗留/发现
