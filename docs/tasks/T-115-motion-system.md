# T-115 · Framer Motion 动效体系 + reduced-motion

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Frontend | M2 | 1d | T-006 | T-116（可复用其规范） |

## 背景
PRD §4.5 要求统一动效规范（时长/缓动/清单）。项目已有 CSS 关键帧与 View Transitions；本任务引入 Framer Motion 并沉淀可复用的动效原语。

## 目标
引入 Framer Motion，建立统一的动效常量与可复用组件（页面/卡片/列表进入、数字滚动、骨架过渡），全局遵守 `prefers-reduced-motion`。

## 范围
- **做**：安装 framer-motion、定义动效 token（时长/缓动常量）、封装 `FadeIn`/`SlideUp`/`Stagger`/`CountUp` 等原语、卡片 hover 上浮 2px、列表进入 stagger、与现有 View Transitions 分工（View Transitions 管「页面间」，Framer 管「页面内元素」）、统一 reduced-motion 降级。
- **不做**：不重做已有 View Transitions（保留）；具体页面的仪式动效在 T-116。

## 技术规格
- 动效常量对齐 PRD §4.5：micro 150–200ms、page-in 250–350ms、ceremony 600–900ms；`ease-out` / `spring(300,30)`。
- `prefers-reduced-motion`：提供 hook（如 `useReducedMotionSafe`），reduced 时所有位移动画降级为纯淡入淡出。
- 明确分层：不要让 Framer 的页面级动画与 `RouteTransition`（View Transitions）打架——Framer 只做进入视口/交互态。

## 涉及文件
- 新增 `src/lib/motion/{constants.ts, primitives.tsx, use-reduced-motion.ts}`
- 按需在 dashboard/report 等页面替换手写动画为原语（小范围）

## 验收标准
1. framer-motion 集成，动效常量统一可复用。
2. 卡片 hover、列表 stagger、数字滚动等原语可用并在至少一页应用。
3. reduced-motion 下全部降级为淡入淡出。
4. 与 View Transitions 无冲突；`lint`/`build` 通过。

## 验证方式
PR 贴：原语 demo、reduced-motion 前后对比、集成页面截图。

## 遗留/发现

**2026-08-05 验收**：四条验收标准通过；`lint` / `build` / 158 个前端用例全绿。

- 修复：`CountUp` 混用了 `performance.now()` 与 rAF 回调时间戳，两者时钟一旦不同源
  就会算出负进度，把数字甩到目标值之外（在测试环境里稳定复现，值跳到 -826430）。
  改成以第一帧时间戳为起点。
- 修复：后台标签页里 rAF 一帧都不调度，动画停在 0 上——评级页真实浏览器里显示成
  「本次得分 0 / 100」。现在无法动画时直接显示真实数字。
- 补测：`primitives.test.tsx` 覆盖非 reduced-motion 分支（此前全局 setup 把所有用例
  钉在 reduced-motion 上，真正会动的那条路径零覆盖）。
- 说明：`FadeIn` / `SlideUp` 原语目前无调用点，`Stagger`/`StaggerItem`/`MotionCard`/
  `CountUp` 已在工作台与评级页落地。
