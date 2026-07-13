# T-060 · 工作台首页联调（问候 + 统计 + 简历模块组合）

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Frontend | M1 | 1d | T-005, T-006, T-011, T-022, T-051 | T-052, T-061 |

## 背景
`src/app/dashboard/page.tsx` 当前展示 mock 问候、累计面试、最高评级，并组合「我的简历」模块。面试记录已经迁移到独立 `/interviews`，不再属于本页。先读 PRD §3.4。

## 目标
工作台首页接真实用户与统计数据，复用 T-022 的简历模块；为统计、简历两个区域分别提供稳定的加载、空数据和失败恢复体验。

## 范围
- **做**：接 `GET /stats/overview`（累计面试、最高评级、最近面试时间）、按本地时间和真实 nickname 生成问候、根据最近面试时间生成激励文案、组合 T-022 的共享简历模块、统计骨架、零场状态、局部错误与重试、工作台移动端可访问性回归。
- **不做**：不在工作台展示面试记录、综合评级、五维雷达或筛选；这些属于 T-061/T-052。简历上传/CRUD 行为由 T-022 负责。本月额度没有真实契约时不接假数据。

## 技术规格
- 新增 `src/lib/api/stats.ts`，冻结 `StatsOverview` 类型并提供 `useOverviewStats()`；T-052/T-061 后续复用，禁止各自重复声明统计响应。
- 当前 `page.tsx` 是 Server Component；React Query 和本地时钟放进独立 `DashboardClient` 客户端组件，不要为了一个 hook 把整个路由树改成 client，也不要在服务端用 `new Date().getHours()` 生成用户本地问候。
- 问候分段：`05:00–11:59` 早上好，`12:00–17:59` 下午好，其余晚上好；用 fake timers 覆盖 05/12/18 点边界。
- `lastInterviewAt=null` 时显示首次 CTA；有值时按用户本地日期计算“距上次 N 天”，不得继续写死 3 天。
- 统计失败不能拖垮简历模块；每个区域独立展示错误和重试。骨架尺寸匹配最终卡片，避免 CLS。
- `DashboardShell` 在 `<md` 下不能让工作台、我的面试、题库训练三个入口全部消失；若 T-006/T-011 尚未解决，补最小移动导航并记录截图。

## 涉及文件
- 修改 `src/app/dashboard/page.tsx`（Server wrapper，只负责页面入口与组合）
- 新增 `src/components/dashboard/DashboardClient.tsx`（统计、问候、三态）
- 按需修改 `src/components/dashboard/DashboardShell.tsx`（仅补 `<md` 下最小导航；用户数据逻辑仍归 T-011）
- 复用 `src/components/resume/*`（T-022），不重复实现简历请求
- 新增 `src/lib/api/stats.ts`（overview 类型 + hook）
- 新增 `DashboardClient`/统计 hook 测试

## 验收标准
1. 累计面试、最高评级、最近面试文案来自真实 API；0 场时不显示伪造评级或日期。
2. 问候使用真实 nickname 和浏览器本地时间，05/12/18 点边界正确且无 hydration 文本跳变。
3. 工作台复用 T-022 简历组件；上传/删除后无需刷新即可同步。
4. 统计 loading/empty/error/success 四态可验证，错误可重试且不影响简历区域。
5. 桌面和移动宽度均可进入三个工作台区路由，无 CLS。
6. 统计与问候分支有组件/逻辑测试；`lint`/`test`/`build` 通过，无 console 报错。

## 验证方式
用真实 API 或 MSW 分别验证 0 场、正常数据、统计 500、慢请求；在 05/12/18 点和桌面/移动宽度截图。PR 贴测试输出、网络请求与截图。

## 遗留/发现
