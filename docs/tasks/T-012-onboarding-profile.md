# T-012 · Onboarding 写用户资料（联调）

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Full-stack | M1 | 0.5d | T-010, T-011 | — |

## 背景
`/onboarding` 页面（2 步：岗位方向+经验、技术栈）目前只在本地 state 里选，完成后 `router.push('/dashboard')`，不落库。本任务把它接到 `PUT /users/me/profile`（T-010 已提供）。先读 PRD §3.3。

## 目标
Onboarding 完成/跳过时把配置保存到后端；工作台后续可读取；「跳过」也正确置 `isFirstLogin=false` 以免重复弹引导。

## 范围
- **做**：前端 onboarding 两步的选择项提交 `PUT /users/me/profile`；「完成」保存全部，「跳过」保存空档但仍标记已过引导；保存中按钮 loading；失败 toast 重试。若后端 profile 字段与前端选项不完全对齐，做映射适配。
- **不做**：不改后端接口（T-010 已定）；工作台读取展示在 T-107。

## 技术规格
- 复用 T-010 契约 `PUT /users/me/profile` body `{jobDirection, techStacks[], experienceLevel, status?, targetCompany?, preferences?}`。
- 前端 onboarding 现有选项：岗位方向（frontend/backend/pm/data）、经验（0/1-3/3-5/5+）、技术栈标签、目标公司输入。映射到 profile 字段。
- 「跳过」：调用一个「标记引导完成」的最小保存（可 `PUT /users/me/profile` 传已有/空值，后端会置 `isFirstLogin=false`）。
- 保存成功后 `router.push('/dashboard')`（保留现有 `nav-modal-out` 过渡）。

## 涉及文件
- 修改 `src/app/onboarding/page.tsx`（提交逻辑、loading、错误处理）
- 复用/扩展 `src/lib/api/user.ts`（`useUpdateProfile` hook）
- 如后端字段需微调，改 `T-010` 对应实现并**同步更新 T-010 文件**（契约变更需通知）

## 验收标准
1. 完成 onboarding 后 DB `user_profile` 有对应记录，`user.isFirstLogin=false`。
2. 「跳过」后再次登录不再强制弹引导（`isFirstLogin=false`）。
3. 保存失败有 toast 且可重试，不误跳转。
4. `lint`/`build` 通过。

## 验证方式
预览走通「完成」与「跳过」两条路径；PR 贴 DB 记录与网络请求证据。

## 遗留/发现
