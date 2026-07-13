# T-022 · 前端简历库联调（工作台模块 + 配置向导复用）

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Frontend | M1 | 1.5d | T-005, T-020 | T-032（配置向导 Step1 复用）, T-060（工作台组合） |

## 背景
面试配置向导 Step1（`src/app/interview/setup/page.tsx` 内）与工作台简历入口目前用 mock。本任务接 T-020 的简历 API。先读 PRD §3.4 简历库 / §3.5 Step1。

## 目标
真实上传简历并展示解析进度/预览；用同一套简历组件同时替换工作台「我的简历」模块和配置向导 Step1 的 mock，避免两套列表行为分叉。

## 范围
- **做**：上传组件（拖拽高亮 + 点击、类型/大小前端校验）、上传中/解析中进度态（轮询 `GET /resumes/{id}` 直到 `parseStatus` 变化）、解析预览卡、简历库列表（单选、查看、删除、设默认、重命名）、工作台「添加简历/查看/用它面试」真实行为、配置向导选择行为、空态、错误与重试。
- **不做**：不改后端；解析失败的手动修正字段可先只读展示 + 重试（完整可编辑修正列后续迭代）。

## 技术规格
- 用 T-005 client；上传用 `multipart/form-data` POST `/resumes`；上传后轮询 `GET /resumes/{id}`（间隔 ~1.5s，最多 N 次）直至 `parseStatus in [success,failed]`。
- 解析预览卡字段对齐 T-021 的 `parsedJson` schema。
- 抽出共享 `ResumeList`/`ResumeCard`，工作台和配置向导只组合不同操作区；列表查询、上传轮询和 mutation 不得各写一份。
- 工作台「用它面试」跳 `/interview/setup?resumeId={id}`（或等价共享状态），配置向导进入后预选对应简历。
- 保持现有视觉与交互动画；解析中用现有声纹 loading 动画。

## 涉及文件
- 修改 `src/app/interview/setup/page.tsx`（Step1 部分接真实数据）
- 修改 `src/app/dashboard/page.tsx`（接入共享简历模块，不在页内重复实现请求）
- 新增 `src/components/resume/{ResumeUpload,ResumeList,ResumeCard,ParsePreviewCard}.tsx`
- 新增 `src/lib/api/resume.ts`（list/upload/get/delete/patch hooks + 轮询）
- 逐步从 `mock-data.ts` 移除 `resumes`（若别处仍引用则保留到迁移完）

## 验收标准
1. 真实上传 PDF/DOCX，进度→解析中→解析预览卡展示结构化内容。
2. 非法类型/超大在前端即拦并提示。
3. 简历库单选、设默认、删除、重命名生效并与后端一致。
4. 解析失败展示原因 + 重试入口。
5. 工作台与配置向导显示同一份实时数据；上传/删除/重命名后两处 query cache 一致。
6. 工作台「用它面试」进入向导后正确预选对应简历；无简历时两处空态符合各自场景。
7. 上传校验、轮询成功/失败、cache 更新和预选参数有测试；`lint`/`test`/`build` 通过，无 console 报错。

## 验证方式
分别从工作台与配置向导走通上传→解析→查看/选择全流程；PR 贴测试输出、分步截图与网络请求。

## 遗留/发现
