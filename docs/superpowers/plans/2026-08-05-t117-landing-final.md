# T-117 Landing Page Final Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the MiraPrep landing page with trust statistics, an asymmetric Bento feature grid, a high-fidelity report preview, an accessible FAQ accordion, reduced-motion-safe scroll reveals, authenticated navigation, and measured LCP below two seconds.

**Architecture:** Keep `src/app/page.tsx` as the server-rendered composition root and isolate browser-only animation or disclosure state in four focused landing components. Reuse the installed Framer Motion, Base UI Accordion, and Recharts packages; keep all heavy report visuals below the fold and dynamically loaded so the Hero remains outside their client bundle path.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Framer Motion 12, Base UI Accordion, Recharts 3, Vitest, Testing Library, Playwright CLI, Lighthouse.

---

## File map

- Create `src/components/landing/RevealOnScroll.tsx`: one-shot viewport reveal wrapper with reduced-motion fallback.
- Create `src/components/landing/RevealOnScroll.test.tsx`: verifies normal and reduced-motion variants.
- Create `src/components/landing/StatBar.tsx`: viewport-triggered marketing counters and semantic labels.
- Create `src/components/landing/StatBar.test.tsx`: verifies final values and reduced-motion behavior.
- Create `src/components/landing/FaqAccordion.tsx`: Base UI single-value accordion with six static questions.
- Create `src/components/landing/FaqAccordion.test.tsx`: verifies collapsed state, single-open behavior, and keyboard interaction.
- Create `src/components/landing/ReportShowcase.tsx`: browser-framed, anonymized report preview with lazy chart rendering and textual fallback.
- Create `src/components/landing/ReportShowcase.test.tsx`: verifies anonymized, readable report facts independently of the chart.
- Create `src/app/page.test.tsx`: verifies the complete section order and public CTA anchors.
- Modify `src/app/page.tsx`: compose the final landing narrative and five-card Bento grid.
- Modify `src/components/landing/LandingNav.tsx`: only if tests expose an authenticated-link regression.
- Create `src/components/landing/LandingNav.test.tsx`: locks the existing token-dependent label and destination.
- Modify `src/app/globals.css`: add only landing-specific visual utilities that cannot be expressed cleanly with Tailwind, including reduced-motion fallbacks.

### Task 1: Reveal wrapper

- [ ] Write `RevealOnScroll.test.tsx` with a mocked `useReducedMotionSafe`, asserting normal mode uses a hidden state with `y: 16`, while reduced motion uses opacity only and renders content immediately.
- [ ] Run `npm test -- src/components/landing/RevealOnScroll.test.tsx` and confirm failure because the component does not exist.
- [ ] Implement `RevealOnScroll` using `motion.div`, `whileInView="visible"`, `viewport={{ once: true, amount: 0.15 }}`, and the existing 300ms `motionTransition.pageIn`.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Trust statistics

- [ ] Write `StatBar.test.tsx` asserting accessible labels and the visible values `12,800+`, `8`, and `4`; mock `useReducedMotionSafe` so reduced motion renders final values without scheduling animation frames.
- [ ] Run `npm test -- src/components/landing/StatBar.test.tsx` and confirm the missing-component failure.
- [ ] Implement three static stat definitions, an `IntersectionObserver`-backed first-entry trigger, and existing `CountUp` formatting. Give each stat a textual label so the numbers are meaningful to screen readers.
- [ ] Re-run the focused test and confirm it passes.

### Task 3: Accessible FAQ

- [ ] Write `FaqAccordion.test.tsx` asserting six buttons begin collapsed, Enter opens the selected answer, opening a second item closes the first, and the button exposes `aria-expanded`.
- [ ] Run `npm test -- src/components/landing/FaqAccordion.test.tsx` and confirm the missing-component failure.
- [ ] Implement a single-value Base UI Accordion with `Accordion.Root`, `Accordion.Item`, `Accordion.Header`, `Accordion.Trigger`, and `Accordion.Panel`; use `ChevronDown`, clear focus-visible styles, and overflow-hidden panel transitions.
- [ ] Re-run the focused test and confirm it passes.

### Task 4: Report showcase

- [ ] Write `ReportShowcase.test.tsx` asserting “示例报告 · 信息已脱敏”, grade A, all five dimension labels and scores, one question summary, and one improvement recommendation are readable.
- [ ] Run `npm test -- src/components/landing/ReportShowcase.test.tsx` and confirm the missing-component failure.
- [ ] Implement a browser-frame report layout. Render score text in the server-visible DOM, and place an animated radar visualization in a fixed-size client region so chart loading cannot cause layout shift.
- [ ] Re-run the focused test and confirm it passes.

### Task 5: Authenticated navigation

- [ ] Write `LandingNav.test.tsx`, mock `useAuthToken`, and assert no token yields `登录 → /auth` while a token yields `进入工作台 → /dashboard`.
- [ ] Run the focused test and confirm whether it fails for missing coverage setup or passes because behavior already exists.
- [ ] If it fails for behavior, make the smallest correction in `LandingNav.tsx`; if it already passes, retain production code unchanged.
- [ ] Re-run the focused test and confirm both states pass.

### Task 6: Page composition and Bento grid

- [ ] Write `src/app/page.test.tsx`, mock client-only children, and assert the headings/landmarks appear in the agreed order: Hero, trust stats, Bento features, report sample, process, FAQ, CTA, Footer.
- [ ] Run `npm test -- src/app/page.test.tsx` and confirm it fails because new sections are absent.
- [ ] Refactor `page.tsx` into the agreed sequence. Replace the equal three-card feature row with five asymmetric cards containing compact product demonstrations; wrap below-fold section headings and cards with `RevealOnScroll`.
- [ ] Add only required landing styles to `globals.css`, using transform/opacity animation properties and a `prefers-reduced-motion` override.
- [ ] Re-run the focused page and component tests and confirm they pass.

### Task 7: Automated regression gates

- [ ] Run `npm run lint`; require exit code 0 and zero ESLint errors.
- [ ] Run `npx tsc --noEmit`; require exit code 0.
- [ ] Run `npm test`; require all Vitest files and tests to pass with no unhandled errors.
- [ ] Run `npm run build`; require a successful Next.js production build.
- [ ] Run `git diff --check -- frontend`; require no whitespace errors.

### Task 8: Real browser and performance acceptance

- [ ] Verify `npx` is available, start the production frontend on a free local port, and open `/` with Playwright CLI.
- [ ] Capture desktop and mobile full-page screenshots under `frontend/output/playwright/`.
- [ ] Use snapshots and keyboard input to verify all six FAQ triggers, single-item expansion, focusability, authenticated/unauthenticated navigation states, and no browser console errors.
- [ ] Emulate reduced motion and verify content remains visible without translated entry states.
- [ ] Run Lighthouse mobile performance against the production server, save the HTML/JSON report under `frontend/output/lighthouse/`, and confirm measured LCP is below 2,000ms.
- [ ] If LCP misses the target, inspect the largest-contentful-paint element and bundle/network diagnostics, make a scoped optimization, then repeat automated gates and Lighthouse.

### Task 9: Requirement audit and teaching handoff

- [ ] Re-read `docs/tasks/T-117-landing-final.md` and map every acceptance criterion to fresh evidence.
- [ ] Inspect `git diff -- frontend` to ensure no edits escaped the task boundary and no unrelated user changes were overwritten.
- [ ] Summarize the system role, first-use concepts, key decisions, test evidence, browser artifacts, Lighthouse result, self-check questions, and extension reading in Chinese.
- [ ] Do not commit, push, create a branch, or open a pull request unless the user separately requests it.
