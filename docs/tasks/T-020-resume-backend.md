# T-020 · 简历后端（上传对象存储 + CRUD + 触发解析）

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Backend-Spring | M1 | 1.5d | T-004, T-003 | T-022, T-030 |

## 背景
实现简历文件的上传、存储、管理，并触发 FastAPI 解析（T-021）。先读 PRD §3.4/§3.5 Step1、`DEVELOPMENT.md §7.5`。

## 目标
`POST /resumes`（multipart 上传到 MinIO/OSS，落库，异步触发解析）、简历库 CRUD、默认简历、签名 URL 下载。

## 范围
- **做**：上传（校验类型 PDF/DOCX、大小 ≤10MB）→ 存对象存储 → 建 `resume` 记录（`parse_status=pending`）→ 异步调用 FastAPI `/internal/resumes/parse`；解析结果由 FastAPI 回调落库；列表/详情/删除（软删）/重命名/设默认；返回签名下载 URL。
- **不做**：不做解析本身（T-021）；前端 UI（T-022）。

## 技术规格（前缀 `/api/v1`，均需登录）
- `POST /resumes`（multipart，字段 `file`）→ `{id, fileName, fileSize, pageCount?, parseStatus:"pending", isDefault, createdAt}`。类型/大小不符 `code=40001/40002`。
- `GET /resumes` → `{items:[{id,fileName,fileSize,pageCount,parseStatus,isDefault,createdAt}], total,...}`（分页，仅当前用户、未删）。
- `GET /resumes/{id}` → 含 `parsedJson`（解析成功后）与 `downloadUrl`（签名，短时效）。
- `DELETE /resumes/{id}` → 软删。
- `PATCH /resumes/{id}` body `{fileName?, isDefault?}` → 重命名/设默认（设默认时其余取消默认）。
- 内部回调：`POST /internal/resumes/{id}/parse-result`（供 FastAPI 调，带内部 token）body `{status:"success"|"failed", parsedJson?, pageCount?, error?}` → 更新记录。

对象存储：MinIO SDK（S3 兼容），bucket `miraprep`，key 形如 `resumes/{userId}/{uuid}.{ext}`，私有；下载走预签名 URL。

触发解析：异步（`@Async` 或消息/线程池），POST 到 FastAPI `AI_SERVICE_BASE_URL + /internal/resumes/parse` body `{resumeId, fileUrl 或 signedUrl, fileName, mimeType}`，带 `X-Internal-Token`；FastAPI 异步处理后回调上面的 parse-result。

## 涉及文件
- `resume/{ResumeController,ResumeService,ObjectStorageService}.java` + dto
- `resume/InternalResumeController.java`（parse-result 回调）
- `client/AiServiceClient.java`（调 FastAPI）
- `config/{StorageConfig,AsyncConfig}.java`

## 验收标准
1. 上传合法 PDF/DOCX 成功落库 + 存进 MinIO（Console 可见），返回 pending。
2. 非法类型/超限被拒，错误码正确。
3. 触发了 FastAPI 解析调用（可先 mock FastAPI 返回，回调 parse-result 后记录变 success 且有 parsedJson）。
4. 列表只含本人未删简历；删除软删；设默认互斥。
5. 下载签名 URL 可访问且过期后失效。
6. 内部回调无 token 被拒。

## 验证方式
PR 贴：上传/列表/详情/删除/设默认 curl + 输出、MinIO 中对象截图、解析回调后记录变化。

## 遗留/发现
