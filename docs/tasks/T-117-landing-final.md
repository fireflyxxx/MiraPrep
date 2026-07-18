# T-117 · 落地页完整版（FAQ 手风琴 + 滚动动画 + 信任数据）

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Frontend | M3 | 1d | T-006 | — |

## 背景
落地页（`src/app/page.tsx`）已有 Hero/功能/流程/CTA/Footer，但 PRD §3.1 还要求：信任数据条滚动数字、Bento Grid、报告样例展示、FAQ 手风琴、滚动驱动淡入动画。本任务补全为完整版。

## 目标
补齐落地页缺失模块并加滚动进入动画，达到 PRD §3.1 完整结构；LCP < 2s。

## 范围
- **做**：信任/数据条（滚动数字动画）、功能区 Bento Grid（不等宽卡片）、报告样例展示（浏览器 mock 窗口内脱敏报告 demo）、FAQ 手风琴、滚动驱动 fade/slide-in（IntersectionObserver 或 Framer `whileInView`）、已登录用户「登录」变「进入工作台」（若 T-011 未做则在此补）。
- **不做**：不改整体品牌视觉基调；不接后端（落地页纯静态/展示）。

## 技术规格
- 动画时长 ≤400ms、不阻塞阅读（PRD §3.1）；遵守 reduced-motion。
- Bento Grid：CSS Grid 不等宽；卡片 hover 上浮 + 边框高亮（已有类似样式可复用）。
- FAQ：用 shadcn Accordion（T-006）或自实现，键盘可达。
- 性能：图片优化、懒加载、控制首屏 JS，保证 LCP < 2s（PRD §6.5）。
- 复用现有 `LandingNav`、Logo、过渡。

## 涉及文件
- 修改 `src/app/page.tsx`（补模块）
- 新增 `src/components/landing/{FaqAccordion, StatBar, ReportShowcase, RevealOnScroll}.tsx`

## 验收标准
1. 落地页含 PRD §3.1 全部模块（Hero/信任数据/Bento/流程/报告样例/FAQ/CTA/Footer）。
2. 滚动进入动画顺滑、不阻塞、reduced-motion 降级。
3. FAQ 手风琴可展开、键盘可达。
4. 已登录访问 `/` 导航显示「进入工作台」。
5. Lighthouse LCP < 2s（贴报告）；`lint`/`build` 通过。

## 验证方式
PR 贴：完整落地页截图（分段）、滚动动画录屏、Lighthouse 性能截图。

## 遗留/发现
