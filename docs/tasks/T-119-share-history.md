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

**存储选型**：分享是「一份报告最多一个有效链接」，所以只在 `report` 表加了 `share_token`
和 `shared_at` 两列（`V5__add_report_share_token.sql`），没有单独建 `report_share` 表。
独立表只有在需要多 token、过期时间或分享审计时才划算，那些都不在本任务范围内。
`share_token` 为 NULL 表示分享关闭，唯一索引允许多行 NULL，语义正好对上。

**吊销语义**：关闭分享不是打标记，而是把 token 置空。再次开启会生成**全新** token，
老链接永久失效——只有这样「撤回」才是真的撤回。重复开启则是幂等的，不会把已经发出去的
链接换掉。

**脱敏在服务端做，分三层**（`ShareService.redact`）：

1. 整块丢弃只对本人有意义、又最容易夹带隐私的字段：签名音频地址（私有对象的临时通行证）、
   JD 原文、自定义要求、会话 id。
2. 把本人的已知身份逐个替换掉：账号邮箱、昵称，以及简历解析结果里的
   `basics.name / email / phone`。替换前按长度倒序排，否则「张三」先被替换后
   「张三丰」就再也匹配不到了。
3. 通用正则兜底扫邮箱、中国手机号、身份证号——LLM 复述候选人自我介绍时会把它们带出来。

少于 2 个字的昵称不参与替换：像「我」这种昵称全局替换会把正文打成马赛克。

踩到的四个坑：

1. **H2 不支持一条 `ALTER TABLE` 里加多列**。生产用 MySQL 能跑，但测试用的内存库直接
   语法错误，整个 Spring 上下文起不来。每条 `ALTER` 拆开写，两边都认。
2. **`NoResourceFoundException` 以前会变成 500**。分享链接被截断（`/public/reports/`
   后面什么都没有）是外部访客真实会踩到的路径，以前掉进全局兜底分支返回 500，日志里还
   多一条假的「服务器错误」。已在 `GlobalExceptionHandler` 里明确映射成 404——这是全站
   受益的修复，不只是分享页。
3. **MockMvc 默认按 ISO-8859-1 解码响应体**，断言中文时全是乱码。要
   `getContentAsString(StandardCharsets.UTF_8)`。
4. **公开页不能带登录凭证**。前端 `usePublicReport` 显式用 `anonymous: true` +
   `skipAuthRefresh: true`：否则访客本地那个过期 token 会触发统一客户端的刷新逻辑，
   把人踢去 `/auth`——那是一个纯公开页面最不该有的行为。

**前端结构**：把报告正文从 `ReportClient` 抽成导出的 `ReportBody`，本人页和公开页共用
同一份渲染，避免复制 200 行 JSX。差异只有两处：公开页不传 `trend`（历史趋势是分享者的
个人数据，不该跟着链接流出去），以及后端已把音频等字段脱敏成 null。

**历史折线**：只统计完整报告（`partial = false`）——中途放弃的场次分数不可比，混进折线
会让趋势失真。只有一场时不画线，改为一句提示：一个点连不成趋势，画出来反而像在暗示什么。

**未做（不在本任务范围）**：分享链接没有有效期和访问次数限制（吊销是手动的）；公开页没
做 SEO/OG 卡片；没有分享访问量统计。

### 二轮验收补漏（2026-08-08）

第一轮验收是照着验收标准逐条打钩，只证明了「它能用」。第二轮换成构造敌意数据去撞——把
邮箱、手机号、昵称塞进报告的**每一个**字符串字段，再配上 emoji、SMP 生僻字、制表符和
超长英文词——撞出两个真问题。

1. **`focusPoints` 完全绕过脱敏，公开页直接泄 PII。** 它是 `ReportResponse.Question`
   里唯一没过 `clean()` 的字符串字段：正文、参考答案、追问、摘要全被打成 `[已隐藏]`，
   只有考察点标签把邮箱和手机号原样印在公开页上。**这不是造出来的场景**——考察点由大模型
   生成，而大纲提示词明确要求 `RESUME_DEEP_DIVE 只能引用数据区简历中真实存在的项目名、
   技术或技能`，等于系统性地把它往简历原文上引。验收标准 2「不泄露 PII」当时实际是不成立的。
   修复是一行 `cleanAll(question.focusPoints(), identities)`。

2. **`redactFollowUp` 只认「map 的值」和「列表里的字符串元素」，列表里放 map 就静默漏。**
   目前 AI 侧 `FollowUpReview` 和业务侧 `FollowUpReviewResult` 都是封闭 schema，这条路
   走不通，属于潜伏坑；但追问链本来就是大模型产出的自由 JSON，业务侧不解释它的结构，
   脱敏也就不该去猜它有几层。已改成整棵树递归 `redactTree`——比原来的三分支写法还短。
   因为当前 API 造不出嵌套结构，这条没有配套集成测试，只有敌意 fixture 的手工验证。

顺带撞出**一整类全局问题**：上面「踩到的四个坑」第 2 条给 `NoResourceFoundException` 补了
404 映射，说是「全站受益的修复」——但那是一类问题里只补了一个。实测同样掉进 500 兜底的
还有：公开分享链接上的非 GET 方法（应 405）、路径参数类型不匹配、Long 溢出、畸形与空请求体
（应 400）。第一条尤其难受：分享链接是发给外人的，别人拿浏览器插件、链接预览或者手滑一个
POST 撞上来，就在错误日志里留一条假的 ERROR——真出故障时日志得是可信的。

已把 `GlobalExceptionHandler` 改成继承 `ResponseEntityExceptionHandler`，只覆写
`handleExceptionInternal` 给父类算好的状态码套上统一 JSON 信封。**净删掉两个手写 handler**
（`MethodArgumentNotValidException`、`NoResourceFoundException` 父类都管），覆盖面从
「探到的这 4 种」扩到 Spring MVC 全部标准异常。新增 `ErrorCode.METHOD_NOT_ALLOWED(40500)`。
一个特判要留着：`MaxUploadSizeExceededException` 父类判 413，而前端一直按 400/40002 处理，
在 `handleExceptionInternal` 里掰回来，保住 `ResumeApiIntegrationTest` 里的既有契约。

**知道但没改，附理由**：

- 公开视图仍然返回 `questionId`。前端拿它当 React key 和锚点，置空要连着改前端；它只是
  自增 id，配合公开视图里其他信息推不出什么。
- `findHistory` 没有分页上限。查的是用户自己的数据，量由自己的场次数决定。
- 开启分享是 check-then-act（读到 token 为 null 才生成），理论上有竞态。6 路并发复现不出来，
  唯一索引兜底，最坏后果是某个请求返回一个库里不存在的 token，重开弹窗即自愈——为它加行锁
  不划算。

## 验收记录（2026-08-08，本地真实链路）

- 后端：新增 `ReportShareApiIntegrationTest`（5 个用例，覆盖开关生命周期、幂等、吊销后
  老链接失效、匿名只读、脱敏、越权 403、不存在 404、截断链接 404、历史趋势过滤与排序、
  OpenAPI 收录）；`./gradlew clean check bootJar` 全绿（81 tests）。
- 数据库：真实 MySQL 上 `flyway_schema_history` 记录 V5 成功，`report` 表已有
  `share_token`（UNI）与 `shared_at`。
- 跨进程 curl：开启 → `shareUrl` 正确；匿名 `GET /public/reports/{token}` → `200`；
  重复开启 → 同一 token；关闭 → 老链接 `404`；乱编 token → `404 40400`；
  截断链接 → `404 40400`（修复前是 500）。公开响应实测 `sessionId / jdText /
  customRequirements / audioUrl` 全为 null。
- 浏览器全流程：报告页点「分享」→ 开关开启 → 复制链接 → **新标签页清空 localStorage**
  后打开公开页，正文完整、只调 `/public/reports/{token}` 一个接口、不带 Authorization、
  页面上没有分享/导出/历史趋势任何本人专属入口 → 回原标签页关闭分享 → 公开页刷新显示
  「链接已失效」且**没有跳去 /auth** → 再次开启拿到的是新 token，老 token 仍然 404。
- 历史折线：同岗位 3 场（68 → 76 → 84）按时间正序渲染，空心圈标出本场。
- 前端：195 个测试、eslint、`tsc --noEmit`、`next build` 全绿；新增
  `ShareDialog.test.tsx`（4）、`PublicReportClient.test.tsx`（2）、`HistoryTrend.test.tsx`（4）。
  ⚠️ 截图未取到：本次会话浏览器面板未显示，无法合成帧；以上均为无障碍树 + 网络请求证据。

### 二轮验收（2026-08-08，敌意数据）

见上面「二轮验收补漏」。修复后的复验，全部在重启后的真实服务上重打：

- 后端：先写红测试再修，`publicViewIsAnonymousReadOnly...` 与新增的
  `clientMistakesOnPublicAndOwnerEndpointsAreFourHundredsNotFiveHundreds` 都先失败过；
  修完 `./gradlew check` 全绿（100 tests）。脱敏那条是把 fixture 的 `focusPoints`
  换成带 PII 的内容，让原有断言自己去接。
- 跨进程：`POST/DELETE /public/reports/{token}` → `405 40500`；`/reports/abc/export`、
  Long 溢出、畸形与空 body → `400 40000`；截断链接仍是 `404 40400`（未回归）。
  重启后的新日志里 `Unhandled server exception` **0 条**。
- 敌意 fixture 匿名拉公开视图，整棵 JSON 树扫描：邮箱、手机号、昵称残留全为 0；
  `focusPoints` → `['候选人 [已隐藏] 的项目经验', ...]`，嵌套 map 里的 PII 也被洗掉，
  而「候选人 … 的项目经验」这类非隐私文字原样保留，没有过度打码。
- 浏览器：清空 localStorage 后匿名打开公开页，页面文本里邮箱 0 个、手机号 0 个、昵称 0 次。
- 顺带确认 T-118 的字形降级扛得住：emoji、SMP 生僻字（`𠀀𪛖`）、制表符、100+ 字母的英文
  长词一起喂进导出，`200 application/pdf`，7 个字符正确降级成 `□`，没有 500。
