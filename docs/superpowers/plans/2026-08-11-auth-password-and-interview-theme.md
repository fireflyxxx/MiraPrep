# Auth Password and Interview Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow registration with an eight-character alphanumeric password and make the interview UI follow MiraPrep's system-aware light/dark theme.

**Architecture:** Keep password validation aligned at the two public boundaries: Zod in the Next.js form and Bean Validation in Spring. Keep theme ownership at the existing root `next-themes` provider (`data-theme="light|dark"`); the interview component supplies light defaults plus `dark:` overrides and owns no theme state.

**Tech Stack:** Next.js 16, React 19, Zod 4, Tailwind CSS 4, Vitest/Testing Library, Spring Boot 3, Jakarta Bean Validation, JUnit/MockMvc.

**Repository constraint:** Work in the current checkout, preserve unrelated T-121 changes, and do not commit, push, create branches, or create worktrees.

---

### Task 1: Frontend registration password boundary

**Files:**
- Modify: `frontend/src/app/auth/page.test.tsx`
- Modify: `frontend/src/app/auth/page.tsx`

- [ ] **Step 1: Make the successful registration test exercise the new eight-character boundary**

In `page.test.tsx`, change the successful registration password to exactly eight characters containing letters and numbers:

```ts
await user.type(screen.getByLabelText("密码"), "pass1234");
```

Add a seven-character mixed password case:

```ts
await user.type(screen.getByLabelText("密码"), "abc1234");
expect((await screen.findAllByText("密码至少 8 位，且必须同时包含字母和数字")).length).toBeGreaterThan(0);
expect(register).not.toHaveBeenCalled();
```

Keep the existing no-number test as a separate case, using at least eight characters, to prove composition validation still applies.

- [ ] **Step 2: Run the focused frontend test and verify RED**

Run from `frontend/`:

```powershell
npm test -- src/app/auth/page.test.tsx
```

Expected: the exact-eight-character registration test fails because the current schema requires 12 characters, and the old message does not satisfy the new assertion.

- [ ] **Step 3: Lower only the registration length boundary and synchronize feedback**

In `page.tsx`, use one shared message in the registration schema and strength helper:

```ts
const registerPasswordMessage = "密码至少 8 位，且必须同时包含字母和数字";

const registerSchema = loginSchema.extend({
  password: z
    .string()
    .min(8, registerPasswordMessage)
    .max(128, "密码不能超过 128 位")
    .regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, registerPasswordMessage),
  nickname: z.string().trim().min(1, "请输入昵称").max(100, "昵称不能超过 100 个字符"),
  code: z.string().length(6, "请输入 6 位验证码"),
});
```

Update `passwordStrength` to use `password.length < 8` and return `registerPasswordMessage` when length or composition is invalid. Do not change `loginSchema`.

- [ ] **Step 4: Run the focused frontend test and verify GREEN**

Run `npm test -- src/app/auth/page.test.tsx`. Expected: all `AuthPage` tests pass.

---

### Task 2: Spring registration password boundary

**Files:**
- Modify: `backend/business/src/test/java/com/miraprep/AuthApiIntegrationTest.java`
- Modify: `backend/business/src/test/java/com/miraprep/AuthEdgeCaseTest.java`
- Modify: `backend/business/src/main/java/com/miraprep/auth/dto/RegisterRequest.java`

- [ ] **Step 1: Add a successful eight-character registration request**

In `AuthApiIntegrationTest`, add:

```java
@Test
void registrationAcceptsEightCharacterPasswordWithLettersAndNumbers() throws Exception {
    mockMvc.perform(post("/api/v1/auth/register")
                    .contentType("application/json")
                    .content("""
                            {"email":"%s","password":"pass1234",
                             "nickname":"Learner","code":"123456"}
                            """.formatted(uniqueEmail())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(0));
}
```

Keep `AuthEdgeCaseTest.registerRejectsPasswordShorterThanEightChars`, using `abc1234` as the seven-character password. Keep the existing letter-only and digit-only rejections.

- [ ] **Step 2: Run the focused Spring tests and verify RED**

From `backend/business/`:

```powershell
$env:JAVA_HOME='C:\Users\firef\AppData\Local\MiraPrep\tools\temurin-21'
.\gradlew.bat test --tests com.miraprep.AuthApiIntegrationTest --tests com.miraprep.AuthEdgeCaseTest --no-daemon
```

Expected: the new test returns HTTP 400 because `RegisterRequest` still has `@Size(min = 12)`.

- [ ] **Step 3: Lower the Spring registration boundary**

In `RegisterRequest.java`, change only:

```java
@Size(min = 8, max = 128)
```

Retain the existing `@Pattern` requiring at least one letter and one digit.

- [ ] **Step 4: Run the focused Spring tests and verify GREEN**

Repeat the focused Gradle command. Expected: both test classes pass.

---

### Task 3: Theme-adaptive interview surface

**Files:**
- Modify: `frontend/src/components/interview/InterviewClient.test.tsx`
- Modify: `frontend/src/components/interview/InterviewClient.tsx`

- [ ] **Step 1: Change the theme contract test before production styling**

Replace fixed-dark assertions with:

```ts
const shell = screen.getByTestId("interview-shell");
expect(shell).not.toHaveAttribute("data-theme", "interview-dark");
expect(shell).toHaveClass("bg-white", "text-[#171717]", "dark:bg-[#0d0f12]", "dark:text-[#f7f7f5]");

const composer = screen.getByTestId("floating-answer-composer");
expect(composer).toHaveAttribute("data-surface", "adaptive");
expect(screen.getByTestId("interview-header")).toHaveClass("bg-white/95", "dark:bg-[#111318]/95");
expect(screen.getByTestId("answer-composer-surface")).toHaveClass("bg-white/95", "dark:bg-[#17191f]/92");
```

- [ ] **Step 2: Run the focused interview test and verify RED**

Run `npm test -- src/components/interview/InterviewClient.test.tsx` from `frontend/`.

Expected: assertions fail because the shell and composer are explicitly dark and the new surface test IDs do not exist.

- [ ] **Step 3: Convert fixed dark colors to light defaults with dark overrides**

Use this shell contract:

```tsx
<div
  data-testid="interview-shell"
  className="flex h-dvh min-h-[620px] flex-col overflow-hidden bg-white text-[#171717] [color-scheme:light] dark:bg-[#0d0f12] dark:text-[#f7f7f5] dark:[color-scheme:dark]"
>
```

Use this header contract:

```tsx
<header
  data-testid="interview-header"
  className="shrink-0 border-b border-black/10 bg-white/95 px-4 py-3.5 backdrop-blur-xl dark:border-white/10 dark:bg-[#111318]/95 md:px-7"
>
```

Set the footer to `data-surface="adaptive"`. Give its editor wrapper `data-testid="answer-composer-surface"` and a light surface plus dark overrides:

```tsx
className="flex flex-col gap-2 rounded-[20px] border border-black/10 bg-white/95 p-3 text-[#171717] shadow-[0_24px_70px_-32px_rgba(0,0,0,.28),0_10px_34px_-20px_rgba(249,115,22,.24)] ring-1 ring-black/[0.03] backdrop-blur-xl transition-[border-color,box-shadow] focus-within:border-orange-400/70 dark:border-white/12 dark:bg-[#17191f]/92 dark:text-[#f4f4f2] dark:shadow-[0_24px_70px_-28px_rgba(0,0,0,.9),0_10px_34px_-18px_rgba(249,115,22,.38)] dark:ring-white/[0.04]"
```

Convert remaining interview-only neutral surfaces and text in the normal shell, review drawer, and end dialog according to this exact palette rule:

- light default: white/`#fafafa`, `border-black/10`, primary `#171717`, secondary `#525252`/`#737373`;
- dark override: preserve current `#0d0f12`, `#111318`, `#17191f`, `border-white/*`, `#f4f4f2`, `#b8bbc1`, and `#8f939b`;
- retain orange, green, amber, and red semantic colors, adding light-theme contrast overrides where needed;
- do not change layout, animation props, event handlers, voice behavior, or practice-mode early return.

- [ ] **Step 4: Run the focused interview test and verify GREEN**

Run `npm test -- src/components/interview/InterviewClient.test.tsx`. Expected: all tests pass.

---

### Task 4: Regression and runtime verification

**Files:**
- Verify only; do not modify unrelated files.

- [ ] **Step 1: Run the full frontend gate serially**

From `frontend/` run `npm run lint`, `npx tsc --noEmit`, `npm test`, then `npm run build`. Expected: every command exits 0.

- [ ] **Step 2: Run the Spring gate**

From `backend/business/` with JDK 21 run `.\gradlew.bat clean check --no-daemon`. Expected: `BUILD SUCCESSFUL` with all tests passing.

- [ ] **Step 3: Restart the managed stack**

From the repository root:

```powershell
.\scripts\dev-down.ps1
.\scripts\dev-up.ps1 -StartupTimeoutSeconds 180
```

Expected: frontend, Spring, and AI health checks complete and ports 3000/8080/8000 listen.

- [ ] **Step 4: Perform browser acceptance in both themes**

Open a real interview session. In light theme verify shell, header, question, composer, review drawer, and end dialog are light. In dark theme verify the existing dark presentation returns without losing interview state. Register a disposable account using `pass1234`; verify `abc1234` and a letters-only password are rejected.

- [ ] **Step 5: Check the final diff**

From the repository root:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors; intended auth/theme files and the approved design/plan documents are the only new changes from this work, alongside the user's pre-existing T-121 changes.
