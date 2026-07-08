# T-005 · 前端 API 客户端层 + React Query + 鉴权 token

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Frontend | M1 | 1d | T-001 | 所有前端联调任务（011/022/032/042/052/060） |

## 背景
前端目前全用 `src/lib/mock-data.ts`，无任何网络层。本任务建立统一的 API 客户端、数据请求（React Query）、鉴权 token 处理与自动刷新，作为后续所有联调的地基。先读 `DEVELOPMENT.md §3/§6/§7.1`。

## 目标
提供 `src/lib/api/` 下的 fetch 封装、类型定义、React Query Provider 与通用 hooks 工厂、token 存储与 401 自动刷新逻辑；不改动现有页面 UI，仅提供能力。

## 范围
- **做**：`apiClient`（基于 `fetch`，注入 base URL、`Authorization`、统一解包 `ApiResponse`、错误抛出）、`QueryProvider`（挂进 root layout）、token 存取（access 内存 + refresh 存 httpOnly cookie 优先；若纯前端先用 `localStorage` 并注释安全权衡）、401 刷新队列、环境变量读取、通用错误 → toast 的桥接（toast 组件可用占位，T-006 提供正式版）。
- **不做**：不接具体业务接口（各联调任务做）；不删 `mock-data.ts`（各任务迁移时再逐步删）。

## 技术规格
- 依赖：`@tanstack/react-query`、`zod`（响应校验，可选但推荐）。
- `NEXT_PUBLIC_API_BASE_URL`（Spring）与 `NEXT_PUBLIC_AI_STREAM_URL`（FastAPI）从 env 读，封装成 `endpoints.ts`。
- `apiClient<T>(path, opts)`：
  - 自动加 `Authorization: Bearer <access>`（有则）；
  - 解析后端统一包裹：`code===0` 取 `data`，否则抛 `ApiError{code,message}`；
  - HTTP 401 → 触发 refresh（`/auth/refresh`），刷新成功重放原请求；刷新失败清 token 并跳 `/auth`；
  - 并发 401 合并为单次 refresh（队列/单例 promise）。
- React Query：`QueryClient`（合理 `staleTime`、`retry` 策略），`QueryProvider` 客户端组件挂到 `app/layout.tsx`。
- 提供类型：`ApiResponse<T>`、`Paginated<T>`、`ApiError`。
- 提供 `useAuthToken()`（读写 token）与 `logout()`。

## 涉及文件
- 新增 `src/lib/api/{client.ts, endpoints.ts, types.ts, auth-token.ts, query-provider.tsx}`
- 修改 `src/app/layout.tsx`：包一层 `QueryProvider`（注意 SSR/client 边界，Provider 是 `"use client"`）
- 新增 `frontend/.env.local`（本地）与确保 `.env.example` 有对应键

## 验收标准
1. `npm run build` 与 `npm run lint` 通过。
2. 用一个临时页面/测试调用 `apiClient` 打到 T-002 的 `/health`，成功解包。
3. 模拟 401（可临时 mock）触发刷新流程；刷新失败跳 `/auth`。
4. React Query DevTools（dev）可见，Provider 生效。
5. 现有 8 个页面不受影响（回归：预览走通、无 console 报错）。

## 验证方式
PR 贴：临时联通 `/health` 的证据、401 刷新流程说明、`lint`/`build` 结果。

## 遗留/发现
