# T-006 · 前端设计 token 化 + shadcn/ui + 深色模式

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Frontend | M1 | 2d | — | T-052, T-060, T-061, T-073, T-074, T-080 |

## 背景
现有页面里颜色/圆角/间距大量是内联硬编码（如 `#f97316`、`#0a0a0a`、`bg-[#fafafa]`）。PRD §4 要求语义化 token、深色模式、shadcn/ui 组件体系。本任务把设计体系正规化，但**保持现有视觉不回退**。先读 PRD §4 全节。

## 目标
建立 Tailwind v4 语义 token（`background/surface/border/foreground/muted/primary/success/warning/danger` + 评级色），接入 `next-themes` 深色模式与 shadcn/ui 基础组件，把现有页面的高频硬编码色替换为 token（渐进式，先覆盖工作台/报告/评级等应用内页面）。

## 范围
- **做**：在 `globals.css` 的 `@theme` 定义语义 token（含深浅两套，用 `prefers-color-scheme` + `.dark` class）、接 `next-themes`（跟随系统 + 手动切换）、初始化 shadcn/ui（Button/Input/Dialog/Tabs/Select/Toast/Skeleton/Card 等基础件）、提供 `ThemeToggle` 组件、把应用内页面（dashboard/interviews/practice/report/result/setup）和 `DashboardShell` 的核心硬编码色迁到 token。
- **不做**：不重排版面、不改交互逻辑；面试进行页的深色主题细节留给 T-073；落地页大改留给 T-080（本任务只做 token 化不动结构）。

## 技术规格
- 色板取 PRD §4.2（注意：PRD 的品牌主色写的是靛蓝紫 `#6366F1`，但**现有设计稿与已实现页面用的是橙色 `#f97316` 系**。以「已实现的橙色」为准，把 `primary` 定义为橙色系；在 PR 里记录该冲突与决定，供产品确认）。
- Tailwind v4：token 定义在 `@theme`，深色覆盖用 `@media (prefers-color-scheme: dark)` + `next-themes` 的 `data-theme`/`.dark`。保证「主题切换」与「View Transitions」不冲突（现有 `RouteTransition` 已存在）。
- 评级色 token：`grade-s/a/b/c/d`。
- shadcn/ui：按 Tailwind v4 兼容方式初始化（注意 shadcn 对 v4 的配置差异，先查其文档）。
- 字体：项目已在 `layout.tsx` 用 Space Grotesk + Noto Sans SC；数字型数据加 `tabular-nums`（PRD §4.3）。
- 遵守 `prefers-reduced-motion`（已有 CSS 兜底，勿破坏）。

## 涉及文件
- 修改 `src/app/globals.css`（`@theme` token、深色变量）
- 修改 `src/app/layout.tsx`（`ThemeProvider`）
- 新增 `src/components/ui/*`（shadcn 生成）、`src/components/ThemeToggle.tsx`
- 渐进修改 `src/components/dashboard/DashboardShell.tsx`、`src/app/{dashboard,interviews,practice}/page.tsx`、`report/*`、`interview/[sessionId]/result/page.tsx`、`interview/setup/page.tsx`（色值 → token）
- `components.json`（shadcn 配置）

## 验收标准
1. `npm run build`/`lint` 通过。
2. 深浅模式切换正常，跟随系统 + 手动切换；切换无闪烁、无布局跳动。
3. 迁移后的页面在浅色模式视觉与现状一致（对比截图无回退）；深色模式可用、无对比度问题。
4. shadcn 基础组件可用（至少 Button/Dialog/Tabs/Toast/Skeleton 有 demo 验证）。
5. 现有 10 页面在两种主题下都能正常渲染，`DashboardShell` 菜单与 View Transitions 不受影响。

## 验证方式
PR 贴：浅色/深色各页面截图对比、主题切换录屏或分步截图、`lint`/`build` 结果。

## 遗留/发现
- 品牌主色冲突（PRD 靛蓝 vs 实现橙色）——记录决定与理由。
