# T-119 · 报告分享链接 + 历史对比

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Full-stack | M3 | 1.5d | T-106 | — |

## 背景
PRD §3.8 要求：生成分享链接（默认关闭，开启后脱敏）；同岗位多次面试得分折线对比。

## 目标
分享链接的生成/访问（脱敏公开只读）+ 历史对比（同岗位得分趋势折线）。

## 范围
- **做**：分享 token 生成/关闭、公开只读报告页（脱敏姓名等）、历史对比接口（同岗位多场得分）、前端分享开关 + 折线图。
- **不做**：PDF 导出（T-118）。

## 技术规格（`/api/v1`）
- `POST /reports/{sessionId}/share` body `{enabled:bool}` → `{shareToken?, shareUrl?}`（开启生成 token，关闭吊销）。
- `GET /public/reports/{shareToken}` → 脱敏报告（去除姓名/邮箱等 PII），公开无需登录，只读。
- `GET /stats/history?jobDirection=&jobTitle=` → `{points:[{date,score,grade,sessionId}]}` 同岗位历史。
- 脱敏：`basics.name/email/phone` 等在公开视图移除或打码；`raw_text_excerpt` 不外泄。
- 前端：报告页分享开关（Dialog 展示链接 + 复制）、历史对比折线（Recharts，复用 T-108 图表风格）。

## 涉及文件
- 后端 `report/ShareService.java`、`PublicReportController.java`、`stats/StatsService.java`（history 方法）
- 前端 `src/components/report/{ShareDialog, HistoryTrend}.tsx`，`src/app/public/reports/[token]/page.tsx`

## 验收标准
1. 开启分享得到可访问的公开链接，内容已脱敏；关闭后链接失效。
2. 公开页无需登录、只读、不泄露 PII。
3. 历史对比折线正确展示同岗位多场趋势。
4. 非本人不能开关他人报告分享。

## 验证方式
PR 贴：分享开关→公开访问（脱敏）→关闭失效 流程、历史折线截图。

## 遗留/发现
