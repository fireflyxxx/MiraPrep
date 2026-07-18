# T-118 · 报告 PDF 导出

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Full-stack | M3 | 1d | T-106 | — |

## 背景
报告页有「导出 PDF」按钮但未实现。PRD §3.8 要求导出 PDF。先读 PRD §3.8/§6.3。

## 目标
`GET /reports/{sessionId}/export` 生成 PDF；前端触发下载。

## 范围
- **做**：后端 PDF 生成（服务端渲染报告为 PDF）、下载接口、前端按钮触发下载；PDF 含摘要区、雷达、逐题详情。
- **不做**：分享链接/历史对比（T-119）。

## 技术规格
- 后端 `GET /api/v1/reports/{sessionId}/export`（需登录、校验归属）→ `application/pdf` 流（或返回签名 URL）。
- 生成方式二选一并记录：①服务端 HTML 模板 → PDF（如 OpenHTMLToPDF / Playwright headless）；②前端生成（不推荐，排版难控）。推荐服务端，保证排版一致、含中文字体。
- 内容对齐 `GET /reports/{sessionId}` 数据（评级/总分/五维/逐题/建议）。中文字体需内嵌。
- 前端：按钮调接口，得到 blob/URL 后触发下载，loading 态。

## 涉及文件
- 后端 `report/ReportExportService.java` + Controller 方法 + PDF 模板资源（中文字体）
- 前端修改 `src/components/report/ReportClient.tsx`（导出按钮接接口）

## 验收标准
1. 导出的 PDF 内容完整、排版正确、中文正常显示。
2. 非本人 403、不存在 404。
3. 前端点击可下载，含 loading 与失败提示。

## 验证方式
PR 贴：导出的 PDF 样例（脱敏）、前端下载流程截图。

## 遗留/发现
