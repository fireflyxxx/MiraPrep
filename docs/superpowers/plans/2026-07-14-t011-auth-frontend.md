# T-011 前端认证 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将真实认证 API、持久化登录态、统一路由守卫与真实用户菜单接入前端。

**Architecture:** 在 `lib/api` 增加认证契约与请求函数；在客户端保存 access/refresh token 并在守卫中刷新。所有受保护页面通过一个可复用的客户端守卫组件包裹，用户菜单和落地页通过同一登录态订阅更新。

**Tech Stack:** Next.js App Router、React 19、TypeScript、Zod、TanStack React Query、Vitest、Testing Library。

---

### Task 1: 认证数据与 token 生命周期

**Files:**
- Create: `frontend/src/lib/api/auth.ts`
- Create: `frontend/src/lib/api/auth.test.ts`
- Modify: `frontend/src/lib/api/auth-token.ts`
- Modify: `frontend/src/lib/api/endpoints.ts`
- Modify: `frontend/src/lib/api/client.ts`

- [ ] **Step 1: 写失败的认证 token 与请求测试**

```ts
it("stores both issued tokens and refreshes with the stored refresh token", async () => {
  saveAuthTokens({ accessToken: "access", refreshToken: "refresh" });
  await refreshSession();
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/auth/refresh"), expect.objectContaining({ body: JSON.stringify({ refreshToken: "refresh" }) }));
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/lib/api/auth.test.ts`
Expected: FAIL，因为 `saveAuthTokens` 与 `refreshSession` 尚不存在。

- [ ] **Step 3: 实现最小认证 API**

```ts
export async function login(input: LoginInput) {
  return apiClient<AuthResponse>(endpoints.login, { method: "POST", body: JSON.stringify(input), skipAuthRefresh: true });
}

export async function refreshSession() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new ApiError(40102, "登录已过期", 401);
  const response = await apiClient<RefreshResponse>(endpoints.refresh, { method: "POST", body: JSON.stringify({ refreshToken }), skipAuthRefresh: true });
  saveAuthTokens(response);
  return response;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- src/lib/api/auth.test.ts`
Expected: PASS。

### Task 2: 统一受保护路由守卫

**Files:**
- Create: `frontend/src/components/AuthGuard.tsx`
- Create: `frontend/src/components/AuthGuard.test.tsx`
- Modify: `frontend/src/components/dashboard/DashboardShell.tsx`
- Modify: `frontend/src/app/onboarding/page.tsx`
- Modify: `frontend/src/app/interview/setup/page.tsx`
- Modify: `frontend/src/components/interview/InterviewClient.tsx`
- Modify: `frontend/src/components/report/ReportClient.tsx`

- [ ] **Step 1: 写失败的守卫重定向测试**

```tsx
it("redirects an anonymous visitor to auth after refresh fails", async () => {
  vi.mocked(refreshSession).mockRejectedValue(new ApiError(40102, "登录已过期", 401));
  render(<AuthGuard><p>private</p></AuthGuard>);
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/auth"));
  expect(screen.queryByText("private")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/components/AuthGuard.test.tsx`
Expected: FAIL，因为 `AuthGuard` 尚不存在。

- [ ] **Step 3: 实现守卫并包裹所有受保护入口**

```tsx
export default function AuthGuard({ children }: { children: ReactNode }) {
  const { token } = useAuthToken();
  const router = useRouter();
  const [ready, setReady] = useState(Boolean(token));
  useEffect(() => { if (!token) refreshSession().catch(() => router.replace("/auth")).finally(() => setReady(true)); }, [router, token]);
  return ready && token ? children : null;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- src/components/AuthGuard.test.tsx`
Expected: PASS。

### Task 3: 登录、注册、验证码与分流

**Files:**
- Modify: `frontend/src/app/auth/page.tsx`
- Create: `frontend/src/app/auth/page.test.tsx`

- [ ] **Step 1: 写失败的登录分流测试**

```tsx
it("sends a first-time user to onboarding after successful registration", async () => {
  vi.mocked(register).mockResolvedValue(authResponse({ isFirstLogin: true }));
  render(<AuthPage />);
  await userEvent.click(screen.getByRole("button", { name: "注册" }));
  await userEvent.click(screen.getByRole("button", { name: "创建账号" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/onboarding", expect.anything()));
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/app/auth/page.test.tsx`
Expected: FAIL，因为表单尚未提交真实 mutation。

- [ ] **Step 3: 实现表单行为**

```ts
const authSchema = z.object({ email: z.email("请输入正确的邮箱地址"), password: z.string().min(8, "密码至少需要 8 位") });
const mutation = useMutation({ mutationFn: isRegister ? register : login, onSuccess: (result) => { saveAuthTokens(result); router.push(result.user.isFirstLogin ? "/onboarding" : "/dashboard", { transitionTypes: result.user.isFirstLogin ? ["nav-modal-in"] : ["nav-forward"] }); } });
```

- [ ] **Step 4: 运行登录页面测试确认通过**

Run: `npm test -- src/app/auth/page.test.tsx`
Expected: PASS，涵盖验证码 60 秒禁用、错误中文文案和两条跳转分支。

### Task 4: 真实用户菜单、退出与落地页登录态

**Files:**
- Modify: `frontend/src/components/dashboard/DashboardShell.tsx`
- Modify: `frontend/src/components/landing/LandingNav.tsx`
- Create: `frontend/src/components/dashboard/DashboardShell.test.tsx`

- [ ] **Step 1: 写失败的退出测试**

```tsx
it("clears authentication and cached user data before returning to auth", async () => {
  render(<DashboardShell><p>content</p></DashboardShell>, { wrapper: queryClientWrapper });
  await userEvent.click(screen.getByRole("button", { name: /退出登录/ }));
  expect(clearAuthTokens).toHaveBeenCalledOnce();
  expect(queryClient.getQueryData(["user", "me"])).toBeUndefined();
  expect(replace).toHaveBeenCalledWith("/auth");
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- src/components/dashboard/DashboardShell.test.tsx`
Expected: FAIL，因为菜单仍是 mock 且退出链接不清理状态。

- [ ] **Step 3: 实现真实菜单与退出**

```tsx
const { data: user } = useMeQuery();
const { data: profile } = useProfileQuery();
const handleLogout = () => { clearAuthTokens(); queryClient.clear(); router.replace("/auth"); };
```

- [ ] **Step 4: 运行菜单测试确认通过**

Run: `npm test -- src/components/dashboard/DashboardShell.test.tsx`
Expected: PASS；昵称、邮箱、岗位回退文案和登出均可验证。

### Task 5: 回归验证与调试

**Files:**
- Modify: 仅修复前四个任务验证暴露的前端文件。

- [ ] **Step 1: 运行静态检查**

Run: `npm run lint`
Expected: 退出码 0。

- [ ] **Step 2: 运行全量前端测试**

Run: `npm test`
Expected: 全部 Vitest 用例通过。

- [ ] **Step 3: 运行生产构建**

Run: `npm run build`
Expected: Next.js build 成功，无 TypeScript 或路由错误。
