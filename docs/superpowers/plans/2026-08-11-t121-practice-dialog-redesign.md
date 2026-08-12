# T-121 Practice Dialog Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the embedded miniature formal-interview page with a dedicated, accessible single-question practice card while preserving the existing text, SSE, WebSocket, ASR, TTS, reconnect, and cleanup behavior.

**Architecture:** Keep the proven session lifecycle inside `InterviewClient`, but expose a narrow practice boundary that renders a separate `PracticeAnswerCard` instead of the formal interview markup. Shared runtime types live in `InterviewRuntimeTypes.ts`; `PracticeRuntimeCard` adapts the report dialog to the runtime, and `PracticeDialog` owns creating, active, grading, failed, and ready stages.

**Implementation note:** The initial hook extraction described in the task steps below was replaced during implementation by an explicit component boundary. React 19's refs lint rule correctly rejected passing the aggregate runtime object through render props/context. Explicitly destructured props preserve the same reuse goal without suppressing lint rules or duplicating transport logic.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS, Radix Dialog, TanStack Query, Vitest, Testing Library, Playwright, existing SSE/WebSocket transports.

---

## File map

- Create `frontend/src/components/interview/useInterviewRuntime.ts`: all runtime state, restoration, SSE/WebSocket connections, answer submission, voice mode, end handling, and cleanup.
- Create `frontend/src/components/report/PracticeAnswerCard.tsx`: selected A “focused answer card” UI only.
- Create `frontend/src/components/report/PracticeAnswerCard.test.tsx`: dedicated behavior, accessibility, voice/text, submission, fallback, and cleanup tests.
- Modify `frontend/src/components/interview/InterviewClient.tsx`: consume the shared runtime hook and remove practice-specific presentation branches.
- Modify `frontend/src/components/interview/InterviewClient.test.tsx`: remove miniature-dialog assertions and preserve formal-interview regression coverage.
- Modify `frontend/src/components/report/PracticeDialog.tsx`: mount `PracticeAnswerCard`, manage close confirmation, and retain result polling/comparison.
- Modify `frontend/src/components/report/PracticeDialog.test.tsx`: verify stage transitions and prove no formal interview shell is embedded.
- Modify `docs/tasks/T-121-question-retry.md`: describe the dedicated modal acceptance contract and final verification evidence.

No commit, push, branch switch, merge, or pull request is part of this plan.

### Task 1: Extract the shared runtime without changing the formal interview

**Files:**
- Create: `frontend/src/components/interview/useInterviewRuntime.ts`
- Modify: `frontend/src/components/interview/InterviewClient.tsx`
- Test: `frontend/src/components/interview/InterviewClient.test.tsx`

- [ ] **Step 1: Run the existing formal interview suite as a baseline**

Run:

```powershell
Set-Location frontend
npm test -- InterviewClient.test.tsx
```

Expected: the current formal and `practice-dialog` tests pass before extraction.

- [ ] **Step 2: Define the runtime interface and move non-visual state into the hook**

Create the following public shape and move the existing effects/callbacks without changing transport semantics:

```ts
export type ConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed";

export interface UseInterviewRuntimeOptions {
  sessionId: string;
  onEnded: () => void;
}

export function useInterviewRuntime({
  sessionId,
  onEnded,
}: UseInterviewRuntimeOptions) {
  return {
    answerText,
    setAnswerText,
    asrFinal,
    connection,
    currentQuestion,
    activeExchange,
    errorMessage,
    setErrorMessage,
    isEnded,
    isLoading,
    isRecording,
    isSubmitting,
    isThinking,
    interviewerSpeaking,
    messages,
    phase,
    reviewQuestions,
    totalElapsed,
    currentQuestionElapsed,
    voiceMode,
    voiceNotice,
    ttsPlayerRef,
    enableVoiceMode,
    disableVoiceMode,
    retryConnection,
    submitAnswer: handleSubmitAnswer,
    endRuntime: handleManualEnd,
    sendAudioFrame,
    finishAudio,
    handleRecordingChange,
    handleRecorderError,
    handleSilence,
    canReplayQuestion,
    replayQuestionAudio,
  };
}
```

Move the existing `runtimeToken` through `lastTranscriptRef` state/ref declarations, derived message values, event handlers, restoration/connection effects, submit/voice/end handlers, and unload cleanup into this hook. The hook must keep `endedRef` as the one-shot guard and call `onEnded` instead of routing. It must stop TTS and clear runtime/event/audio cursors exactly once after the end event. Cache received question `audio` events by question id so `replayQuestionAudio` can stop the current queue, unlock audio, and enqueue that cached sequence again; expose `canReplayQuestion` only after a complete sequence exists.

- [ ] **Step 3: Make the formal page consume the hook**

Reduce `InterviewClient` to formal-page presentation plus review/end-confirm dialogs:

```tsx
interface InterviewClientProps {
  sessionId: string;
}

export default function InterviewClient({ sessionId }: InterviewClientProps) {
  const router = useRouter();
  const runtime = useInterviewRuntime({
    sessionId,
    onEnded: () =>
      router.push(`/interview/${sessionId}/result`, {
        transitionTypes: ["nav-reveal"],
      }),
  });

  return (
    <FormalInterviewScreen
      sessionId={sessionId}
      runtime={runtime}
    />
  );
}
```

Define `FormalInterviewScreen` in the same file and move the current header, timers, progress, interviewer stage, composer, review dialog, and end-confirm dialog into it. Remove `presentation`, `isPracticeDialog`, `data-presentation`, and every conditional label/style added only for the embedded popup. Keep formal text and layout byte-for-byte equivalent where practical.

- [ ] **Step 4: Run formal-interview regression tests**

Run:

```powershell
npm test -- InterviewClient.test.tsx VoiceRecorder.test.tsx TTSPlayer.test.tsx interview-ws.test.ts interview-stream.test.ts
```

Expected: all formal text/voice/reconnect tests pass. Delete only assertions whose sole contract is `presentation="practice-dialog"`; Task 2 adds the replacement modal coverage before the full gate.

### Task 2: Build the dedicated focused answer card test-first

**Files:**
- Create: `frontend/src/components/report/PracticeAnswerCard.test.tsx`
- Create: `frontend/src/components/report/PracticeAnswerCard.tsx`

- [ ] **Step 1: Write failing tests for the selected A layout and single-submit contract**

Mock `useInterviewRuntime`, `VoiceRecorder`, and `TTSPlayer`, then assert the dedicated surface:

```tsx
expect(screen.getByRole("heading", { name: "重新回答这道题" })).toBeVisible();
expect(screen.getByText(question.text)).toBeVisible();
expect(screen.getByText("只提交一次 · 不会追问")).toBeVisible();
expect(screen.queryByTestId("interview-shell")).not.toBeInTheDocument();
expect(screen.queryByText("Mira 面试官")).not.toBeInTheDocument();
expect(screen.queryByLabelText("面试总用时")).not.toBeInTheDocument();
```

Cover these user actions in separate tests:

```tsx
await user.type(screen.getByRole("textbox", { name: "本次回答" }), "新的回答");
await user.click(screen.getByRole("button", { name: "提交本次回答" }));
expect(submitAnswer).toHaveBeenCalledTimes(1);

await user.click(screen.getByRole("button", { name: "语音回答" }));
expect(screen.getByTestId("practice-voice-recorder")).toBeVisible();
expect(screen.getByDisplayValue("实时转写内容")).toBeVisible();
await user.click(screen.getByRole("button", { name: "文字回答" }));
expect(screen.getByDisplayValue("实时转写内容")).toBeVisible();
```

Also cover empty-answer disabling, disconnected disabling, provider fallback alert, replay-question control, and `interview_end` calling `onEnded` once.

- [ ] **Step 2: Run the new tests and verify the component is missing**

Run:

```powershell
npm test -- PracticeAnswerCard.test.tsx
```

Expected: FAIL because `PracticeAnswerCard` does not exist.

- [ ] **Step 3: Implement the focused answer card**

Use the shared runtime and existing voice primitives:

```tsx
export interface PracticeAnswerCardProps {
  sessionId: string;
  question: ReportQuestion;
  onEnded: () => void;
  onRequestClose: () => void;
}

export default function PracticeAnswerCard(props: PracticeAnswerCardProps) {
  const runtime = useInterviewRuntime({
    sessionId: props.sessionId,
    onEnded: props.onEnded,
  });

  return (
    <section data-testid="practice-answer-card" className="bg-surface">
      <header className="flex items-start justify-between border-b border-border px-5 py-4 sm:px-7">
        <div>
          <p className="font-display text-xs tracking-[0.16em] text-primary uppercase">
            Focused practice
          </p>
          <h2 className="mt-1 text-xl font-semibold">重新回答这道题</h2>
        </div>
        <button type="button" aria-label="关闭单题练习" onClick={props.onRequestClose}>
          ×
        </button>
      </header>
      <div className="rounded-2xl border border-primary/20 bg-primary-soft">
        <span>QUESTION {String(props.question.order).padStart(2, "0")}</span>
        <p>{props.question.text}</p>
        <button
          type="button"
          aria-label="播放题目"
          disabled={!runtime.canReplayQuestion}
          onClick={runtime.replayQuestionAudio}
        >
          播放题目
        </button>
      </div>
      <div role="group" aria-label="回答方式">
        <button type="button" aria-pressed={runtime.voiceMode} onClick={runtime.enableVoiceMode}>
          语音回答
        </button>
        <button type="button" aria-pressed={!runtime.voiceMode} onClick={runtime.disableVoiceMode}>
          文字回答
        </button>
      </div>
      {runtime.voiceMode ? (
        <VoiceRecorder
          disabled={runtime.connection !== "connected" || runtime.isSubmitting || runtime.isEnded}
          onAudioFrame={runtime.sendAudioFrame}
          onRecordingChange={runtime.handleRecordingChange}
          onSilence={runtime.handleSilence}
          onError={runtime.handleRecorderError}
        />
      ) : null}
      <textarea
        aria-label="本次回答"
        value={runtime.answerText}
        onChange={(event) => runtime.setAnswerText(event.target.value)}
      />
      <footer>
        <span>只提交一次 · 不会追问</span>
        <button type="button" onClick={runtime.submitAnswer}>提交本次回答</button>
      </footer>
      <TTSPlayer ref={runtime.ttsPlayerRef} />
    </section>
  );
}
```

Keep the answer textarea mounted in both modes so ASR text remains editable. The replay control must call an explicit runtime replay/unlock action rather than synthesize speech in the browser.

- [ ] **Step 4: Add mobile and reduced-motion behavior**

Use `max-h-[calc(100dvh-1rem)]`, scrolling body content, `env(safe-area-inset-bottom)`, visible focus rings, `aria-live` for status, and `motion-reduce:animate-none` for spinners/waveforms. Do not introduce a new design dependency.

- [ ] **Step 5: Run the dedicated component tests**

Run:

```powershell
npm test -- PracticeAnswerCard.test.tsx
```

Expected: all focused-card tests pass.

### Task 3: Wire modal stages and safe close behavior

**Files:**
- Modify: `frontend/src/components/report/PracticeDialog.tsx`
- Modify: `frontend/src/components/report/PracticeDialog.test.tsx`

- [ ] **Step 1: Replace the mocked embedded-interview test with a failing dedicated-card test**

Mock `PracticeAnswerCard` and assert the exact props and stage transition:

```tsx
expect(screen.getByTestId("practice-answer-card")).toHaveAttribute(
  "data-session",
  "56",
);
expect(screen.queryByTestId("embedded-interview")).not.toBeInTheDocument();
await user.click(screen.getByRole("button", { name: "模拟提交完成" }));
expect(await screen.findByText("+14 分")).toBeVisible();
```

Add tests for creating/failed/grading, close confirmation during active work, direct close after ready, and retry resetting the stage.

- [ ] **Step 2: Run the dialog tests and verify failure**

Run:

```powershell
npm test -- PracticeDialog.test.tsx
```

Expected: FAIL because the dialog still renders `InterviewClient`.

- [ ] **Step 3: Mount `PracticeAnswerCard` and add the confirmation dialog**

Replace the active branch:

```tsx
{active ? (
  <PracticeAnswerCard
    sessionId={practiceSessionId}
    question={question}
    onEnded={() => setStage("grading")}
    onRequestClose={() => setConfirmCloseOpen(true)}
  />
) : null}
```

Make backdrop click, Escape, and the visible close button route through the same confirmation while active. Confirmed close unmounts `PracticeAnswerCard`, which triggers runtime cleanup, then calls `onOpenChange(false)`. Keep grading/result polling unchanged.

- [ ] **Step 4: Make retry reset stale UI state before creating again**

Use one handler for failed and ready actions:

```ts
const handleRetry = () => {
  setStage("active");
  setConfirmCloseOpen(false);
  onRetry();
};
```

Ensure `usePracticeResult` only polls while `stage === "grading"` and the current practice session id is present.

- [ ] **Step 5: Run dialog and report entry tests**

Run:

```powershell
npm test -- PracticeDialog.test.tsx ReportClient.test.tsx practice.test.tsx
```

Expected: all practice entry, modal stage, polling, comparison, and retry tests pass.

### Task 4: Update the task contract and run automated gates

**Files:**
- Modify: `docs/tasks/T-121-question-retry.md`

- [ ] **Step 1: Update the acceptance checklist**

Document that “重新回答” uses a dedicated focused card, hides source content until grading, accepts one answer without follow-up, supports text/voice, and does not render the formal interview shell.

- [ ] **Step 2: Run focused tests serially**

Run:

```powershell
Set-Location frontend
npm test -- PracticeAnswerCard.test.tsx PracticeDialog.test.tsx InterviewClient.test.tsx VoiceRecorder.test.tsx TTSPlayer.test.tsx interview-ws.test.ts interview-stream.test.ts
```

Expected: all selected files pass with no unhandled promise rejections.

- [ ] **Step 3: Run the complete frontend gate**

Run serially:

```powershell
npm run lint
npx tsc --noEmit
npm test
npm run build
```

Expected: every command exits 0.

- [ ] **Step 4: Run repository whitespace validation**

Run from repository root:

```powershell
git diff --check
```

Expected: no output and exit code 0.

### Task 5: Perform real full-stack and browser acceptance

**Files:**
- Evidence only: `output/playwright/t121-practice-card-desktop.png`
- Evidence only: `output/playwright/t121-practice-card-mobile.png`
- Evidence only: `output/playwright/t121-practice-comparison-redesign.png`

- [ ] **Step 1: Start dependencies and all three applications**

Run:

```powershell
.\scripts\dev-up.ps1
```

Expected: MySQL, Redis, MinIO are healthy; Spring, FastAPI, and frontend health endpoints respond. `minio-init` exiting 0 is normal.

- [ ] **Step 2: Verify the real text-answer flow in the browser**

From a real report fixture/account, execute:

```text
报告逐题卡 → 重练此题 → 专注答题卡 → 输入一次回答 → 提交
→ 自动结束且无追问 → grading → ready → 上次/本次对比
```

Assert the active modal contains no formal interview header, total timer, progress segments, avatar, review, or end-interview control. Capture desktop and mobile screenshots using fixed test data and label them as visual fixtures.

- [ ] **Step 3: Verify persistence isolation**

Query the created session and confirm it is `PRACTICE`, points to the source session/question, has one candidate answer, and does not alter source messages, source report, list counts, statistics, or trend records.

- [ ] **Step 4: Verify the real voice boundary**

Open voice mode, grant browser microphone permission, verify the recorder sends PCM frames over `/ws/interview/{practiceSessionId}`, and confirm ASR text remains editable before submission. If providers are not configured, verify the 1013/not-configured path visibly falls back to text and record that this does not prove cloud ASR/TTS quality.

- [ ] **Step 5: Stop services and report exact evidence**

Run:

```powershell
.\scripts\dev-down.ps1
```

Expected: application processes and Compose dependencies started for acceptance are stopped. Report automated gate counts, browser flow evidence, persistence evidence, voice-provider boundary, and any unverified public/external integrations.
