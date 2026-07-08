# T-022 · 前端简历库 + 上传 + 解析预览卡

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Frontend | M1 | 1d | T-005, T-020 | T-032（配置向导 Step1 复用） |

## 背景
面试配置向导 Step1（`src/app/interview/setup/page.tsx` 内）与工作台简历入口目前用 mock。本任务接 T-020 的简历 API。先读 PRD §3.4 简历库 / §3.5 Step1。

## 目标
真实上传简历（拖拽/点击）、展示上传解析进度、解析成功后展示「简历解析预览卡」、简历库列表单选/删除/设默认，全部接后端。

## 范围
- **做**：上传组件（拖拽高亮 + 点击、类型/大小前端校验）、上传中/解析中进度态（轮询 `GET /resumes/{id}` 直到 `parseStatus` 变化）、解析预览卡（展示 basics/education/experience/projects/skills，可确认）、简历库列表（单选、删除、设默认、重命名）、空态、错误与重试。
- **不做**：不改后端；解析失败的手动修正字段可先只读展示 + 重试（完整可编辑修正列后续迭代）。

## 技术规格
- 用 T-005 client；上传用 `multipart/form-data` POST `/resumes`；上传后轮询 `GET /resumes/{id}`（间隔 ~1.5s，最多 N 次）直至 `parseStatus in [success,failed]`。
- 解析预览卡字段对齐 T-021 的 `parsedJson` schema。
- 配置向导 Step1 的现有 UI（拖拽区、简历卡片、附加文件区）复用，替换其 mock 数据源为真实列表。
- 保持现有视觉与交互动画；解析中用现有声纹 loading 动画。

## 涉及文件
- 修改 `src/app/interview/setup/page.tsx`（Step1 部分接真实数据）
- 新增 `src/components/resume/{ResumeUpload,ResumeCard,ParsePreviewCard}.tsx`
- 新增 `src/lib/api/resume.ts`（list/upload/get/delete/patch hooks + 轮询）
- 逐步从 `mock-data.ts` 移除 `resumes`（若别处仍引用则保留到迁移完）

## 验收标准
1. 真实上传 PDF/DOCX，进度→解析中→解析预览卡展示结构化内容。
2. 非法类型/超大在前端即拦并提示。
3. 简历库单选、设默认、删除、重命名生效并与后端一致。
4. 解析失败展示原因 + 重试入口。
5. 空态（无简历）友好展示。
6. `lint`/`build` 通过，无 console 报错。

## 验证方式
预览走通上传→解析→选择全流程；PR 贴分步截图与网络请求。

## 遗留/发现
