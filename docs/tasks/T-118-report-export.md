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

**生成方式（已记录）**：选了「服务端 PDFBox 直接绘制」，没有走 HTML 模板 → PDF。原因：
① 雷达图用 HTML/CSS 画不出来，走模板就得再引入 SVG 渲染引擎（batik 很重），而 PDFBox
画多边形只要几行；② 少一层模板引擎就少一层依赖。代价是排版坐标要自己算，集中在
`ReportExportService.Canvas` 里。

**中文字体**：`backend/business/src/main/resources/fonts/NotoSansSC-Regular.ttf`（SIL OFL，
约 9.8 MB），随 jar 发布，PDFBox 只把用到的字形子集嵌进 PDF，所以成品 PDF 只有几十 KB。
该文件由 Noto Sans SC 可变字体处理而来，可复现：

```bash
fonttools varLib.instancer NotoSansSC-VF.ttf wght=400 -o static.ttf
fonttools subset static.ttf --output-file=NotoSansSC-Regular.ttf \
  --unicodes="U+0020-007E,U+00A0-00FF,U+2000-206F,U+2190-21FF,U+2200-22FF,U+2460-24FF,U+25A0-25FF,U+3000-303F,U+3400-4DBF,U+4E00-9FFF,U+FE30-FE4F,U+FF00-FFEF" \
  --no-hinting --drop-tables+=GSUB,GPOS,GDEF,DSIG,vhea,vmtx,VORG --name-IDs='*' --recalc-bounds
```

踩过的三个坑，都记在这里免得下次重来：

1. **PDFBox 2.x 不能嵌 CFF 轮廓的 OTF**（`True Type fonts using CFF outlines are not
   supported`）。思源/Noto 的 `.otf` 一律不能用，必须是 TrueType 轮廓的 `.ttf`。
2. **子集里不能同时保留「重复字形」的 Unicode 区段**。第一版留了 CJK 部首补充
   （U+2E80–2EFF）和兼容汉字（U+F900–FAFF），它们和常规汉字共用字形，导致 PDF 的
   ToUnicode 反查歧义——显示正常，但复制出来「风」变成部首「⻛」。去掉这两段即可。
3. **H2 和 MySQL 的 DECIMAL 精度不一样**。单测里总分是 `82`，真实 MySQL 取出来是
   `82.00`，PDF 上就成了「总分 82.00 / 100」。已用 `stripTrailingZeros()` 收口，并在
   集成测试里加了 `doesNotContain("82.00")` 兜住。

**其他实现说明**：
- 字体里没有的字符（emoji、生僻字）会让 PDFBox 直接抛异常。导出前逐字探测，探不过就
  换成占位方块「□」，宁可缺一个字也不让下载 500。
- 断行做了中文避头尾（标点不落在行首）；西文长单词仍可能被从中间切断，报告正文以中文
  为主，暂不做西文断词。
- 导出复用 `ReportService.get()`，所以归属校验、404 与页面看到的数据天然一致。

**未做（不在本任务范围）**：分享链接与历史对比（T-119）；PDF 里没有放语音回放和签名
音频链接（PDF 不是交互载体，签名 URL 也会过期）。

## 验收记录（2026-08-08，本地真实链路）

- 后端：`ReportStatsApiIntegrationTest` 新增 PDF 导出用例（内容断言 + 403 + 404 + 报告未生成
  时 404 + OpenAPI 收录）；`./gradlew clean check bootJar` 全绿。
- 跨进程：真实 MySQL + 运行中的 Spring，`GET /api/v1/reports/36/export` → `200`
  `application/pdf`，68 586 字节，`Content-Disposition: attachment;
  filename="MiraPrep-report-36.pdf"`；未带 token → `401`；不存在的会话 → `404 40400`。
- 前端：`useExportReport` 与 `ReportClient` 的下载/加载态/失败提示均有 Vitest 覆盖；
  185 个前端测试、eslint、`tsc --noEmit` 全绿。
- 浏览器：`/report/36` 点击「导出 PDF」，`OPTIONS` + `GET /reports/36/export` 均 `200`，
  控制台无新增报错（仅 React Query devtools 的 chunk 404，与本任务无关）。
  ⚠️ 截图未取到：本次会话的浏览器面板未显示，无法合成帧。
- PDF 样例（脱敏，已在 gitignore 的 `output/`）：`output/T-118-export-live.pdf`（真实链路）、
  `output/T-118-report-sample.pdf`（多题翻页样例）。
