# Unified Interview Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the formal interview page's separate voice/text modes with one adaptive answer composer whose microphone and keyboard edit the same draft and whose recorder has one start/stop action.

**Architecture:** Keep the existing SSE and WebSocket transports, but hide transport selection from the user. `InterviewClient` lazily switches from SSE to the voice WebSocket when the microphone is first requested, then automatically starts `VoiceRecorder`; a focused `UnifiedAnswerComposer` owns the formal-page rendering while `PracticeAnswerCard` keeps its current runtime surface. `VoiceRecorder` remains responsible for audio capture and gains a small imperative/preflight API so the transport can be ready before microphone capture starts.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, Vitest, Testing Library, Web Audio, WebSocket.

**Workspace rule:** Do not create a branch/worktree or commit. Preserve all unrelated uncommitted T-121, password, and theme work.

---

## File map

- Create `frontend/src/components/interview/UnifiedAnswerComposer.tsx`: formal-interview-only composer layout and accessibility semantics.
- Create `frontend/src/components/interview/UnifiedAnswerComposer.test.tsx`: isolated visual/state contract tests.
- Modify `frontend/src/components/interview/VoiceRecorder.tsx`: expose recorder control, preflight, live level, labels, and compact rendering options without changing PCM capture behavior.
- Modify `frontend/src/components/interview/VoiceRecorder.test.tsx`: protect preflight, single action, level reporting, and existing tail-flush behavior.
- Modify `frontend/src/components/interview/InterviewClient.tsx`: remove visible mode switch, lazily hand off SSE to WS, preserve the draft, render the unified composer, and move TTS mute into the header.
- Modify `frontend/src/components/interview/InterviewClient.test.tsx`: verify transport handoff, unified draft, provider fallback, submission path, and removal of duplicated controls.

### Task 1: Make `VoiceRecorder` controllable without duplicating recorder UI

**Files:**
- Modify: `frontend/src/components/interview/VoiceRecorder.tsx`
- Test: `frontend/src/components/interview/VoiceRecorder.test.tsx`

- [ ] **Step 1: Add failing tests for preflight and one action button**

Add tests which render the recorder with `onBeforeStart`, `onLevelChange`, `showWaveform={false}`, and custom labels:

```tsx
it("waits for voice transport preflight before requesting microphone access", async () => {
  const getUserMedia = vi.fn();
  const onBeforeStart = vi.fn().mockResolvedValue(false);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });

  render(
    <VoiceRecorder
      onBeforeStart={onBeforeStart}
      onAudioFrame={vi.fn()}
      onRecordingChange={vi.fn()}
      onError={vi.fn()}
      onSilence={vi.fn()}
      showWaveform={false}
      labels={{ idle: "语音输入", recording: "停止并转写" }}
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: "语音输入" }));
  expect(onBeforeStart).toHaveBeenCalledOnce();
  expect(getUserMedia).not.toHaveBeenCalled();
  expect(screen.getAllByRole("button")).toHaveLength(1);
});
```

Extend the capture test to assert `onLevelChange` receives a value greater than zero after loud samples.

- [ ] **Step 2: Run the focused recorder tests and confirm RED**

Run:

```powershell
cd frontend
npm test -- --run src/components/interview/VoiceRecorder.test.tsx
```

Expected: failure because the new props and imperative handle do not exist.

- [ ] **Step 3: Add the recorder API while preserving the audio pipeline**

Export the handle and props, convert the component to `forwardRef`, and gate capture through `onBeforeStart`:

```tsx
export interface VoiceRecorderHandle {
  start(): Promise<void>;
  stop(): void;
}

export interface VoiceRecorderLabels {
  idle: string;
  recording: string;
}

interface VoiceRecorderProps {
  disabled?: boolean;
  labels?: VoiceRecorderLabels;
  onBeforeStart?: () => boolean | Promise<boolean>;
  onLevelChange?: (level: number) => void;
  showWaveform?: boolean;
  // existing callbacks remain unchanged
}
```

Inside `start`, execute `const allowed = await onBeforeStart?.(); if (allowed === false) return;` before `getUserMedia`. Call `onLevelChange?.(nextLevel)` wherever RMS updates the internal level. Expose `start` and `stop` with `useImperativeHandle`. Render exactly one button and conditionally render the existing `Waveform` only when `showWaveform` is true.

- [ ] **Step 4: Run recorder tests and confirm GREEN**

Run the same focused command. Expected: all recorder tests pass, including PCM batching, tail flush, silence, preflight, and level reporting.

### Task 2: Build the formal-page unified answer composer

**Files:**
- Create: `frontend/src/components/interview/UnifiedAnswerComposer.tsx`
- Create: `frontend/src/components/interview/UnifiedAnswerComposer.test.tsx`

- [ ] **Step 1: Write failing component contract tests**

Cover the B4 contract with a connected idle render and a recording render:

```tsx
it("renders one shared editor and one microphone action without mode toggles", () => {
  render(<UnifiedAnswerComposer {...idleProps} />);
  expect(screen.getByRole("textbox", { name: "你的回答" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "语音输入" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "语音回答" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "打字回答" })).not.toBeInTheDocument();
});

it("shows a non-interactive recording status and one stop action", () => {
  render(<UnifiedAnswerComposer {...recordingProps} />);
  expect(screen.getByRole("status")).toHaveTextContent("正在聆听");
  expect(screen.getAllByRole("button", { name: "停止并转写" })).toHaveLength(1);
  expect(screen.queryByText("点击停止")).not.toBeInTheDocument();
});
```

Also assert light/dark adaptive classes, `Enter` submission, `Shift+Enter` newline behavior, recording-time submit disablement, and mobile-safe button heights.

- [ ] **Step 2: Run the new test file and confirm RED**

Run:

```powershell
cd frontend
npm test -- --run src/components/interview/UnifiedAnswerComposer.test.tsx
```

Expected: failure because the component does not exist.

- [ ] **Step 3: Implement the B4 component**

Define a typed view component which receives the draft and recorder callbacks rather than owning transport state:

```tsx
export interface UnifiedAnswerComposerProps {
  answerText: string;
  answerLocked: boolean;
  asrFinal: boolean;
  isRecording: boolean;
  isSubmitting: boolean;
  isVoiceConnecting: boolean;
  voiceLevel: number;
  voiceNotice: string | null;
  recorderRef: Ref<VoiceRecorderHandle>;
  onAnswerChange(value: string): void;
  onAudioFrame(frame: Uint8Array): void;
  onBeforeVoiceStart(): boolean | Promise<boolean>;
  onRecordingChange(recording: boolean): void;
  onRecorderError(message: string): void;
  onSilence(): void;
  onSubmit(): void;
}
```

Render one textarea, the conditional non-clickable `role="status"` strip with `Waveform`, one compact `VoiceRecorder` control in the footer, the character counter, and one submit button. Keep the current orange accent, warm light surface, dark adaptive surface, visible focus rings, and 44px touch targets.

- [ ] **Step 4: Run component tests and confirm GREEN**

Run the focused component command. Expected: all B4 visual/state contract tests pass.

### Task 3: Integrate lazy voice handoff into `InterviewClient`

**Files:**
- Modify: `frontend/src/components/interview/InterviewClient.tsx`
- Modify: `frontend/src/components/interview/InterviewClient.test.tsx`

- [ ] **Step 1: Replace old mode-switch assertions with failing unified-flow tests**

Update the existing voice test to click `语音输入` directly and verify:

```tsx
await user.click(screen.getByRole("button", { name: "语音输入" }));
await waitFor(() => expect(streamVoiceInterview).toHaveBeenCalled());
expect(screen.queryByRole("button", { name: "语音回答" })).not.toBeInTheDocument();
expect(screen.queryByRole("button", { name: "打字回答" })).not.toBeInTheDocument();
expect(screen.getByRole("textbox", { name: "你的回答" })).toHaveValue(existingDraft);
```

Add a regression test where the voice socket rejects with 1013 after the draft is typed; assert the same textbox retains the draft and remains enabled. Preserve the existing final-ASR/manual-edit test and change its textbox query to the unified accessible name.

- [ ] **Step 2: Run `InterviewClient.test.tsx` and confirm RED**

Run:

```powershell
cd frontend
npm test -- --run src/components/interview/InterviewClient.test.tsx
```

Expected: old mode buttons still render and microphone does not lazily switch transports.

- [ ] **Step 3: Add the hidden transport handoff**

Add stable refs/state:

```tsx
const recorderRef = useRef<VoiceRecorderHandle>(null);
const pendingVoiceStartRef = useRef(false);
const [isVoiceConnecting, setIsVoiceConnecting] = useState(false);
const [voiceLevel, setVoiceLevel] = useState(0);
```

Implement `prepareVoiceStart`:

```tsx
const prepareVoiceStart = async () => {
  if (voiceMode && voiceSocketRef.current) return true;
  pendingVoiceStartRef.current = true;
  setIsVoiceConnecting(true);
  setConnection("connecting");
  setVoiceMode(true);
  return false;
};
```

In the voice socket `onOpen`, clear the connecting state and, when the pending ref is set, schedule `recorderRef.current?.start()` after the socket ref is installed. On provider/auth/network failure, clear both pending states, preserve `answerText`, fall back to SSE, and leave the unified textarea usable.

- [ ] **Step 4: Replace the formal footer with `UnifiedAnswerComposer`**

Remove the formal-page `语音回答`/`打字回答` buttons, detached waveform, detached voice notice, and old composer surface. Render `UnifiedAnswerComposer` with existing submit, ASR, silence, and audio callbacks. Keep `PracticeAnswerCard` and its runtime interface unchanged.

Move the formal `TTSPlayer` mute control into the interview header utility group so interviewer playback remains controllable without cluttering the answer composer.

- [ ] **Step 5: Run focused integration tests and confirm GREEN**

Run:

```powershell
cd frontend
npm test -- --run src/components/interview/VoiceRecorder.test.tsx src/components/interview/UnifiedAnswerComposer.test.tsx src/components/interview/InterviewClient.test.tsx
```

Expected: all focused tests pass; no duplicate recorder action or visible input-mode switch remains.

### Task 4: Full verification and real browser acceptance

**Files:**
- Verify only; do not commit generated output.

- [ ] **Step 1: Run formatting and static gates**

```powershell
cd frontend
npm run lint
npx tsc --noEmit
```

Expected: exit code 0 for both commands.

- [ ] **Step 2: Run the full frontend test suite and production build**

```powershell
cd frontend
npm test -- --run
npm run build
```

Expected: zero failed tests and a successful Next.js production build.

- [ ] **Step 3: Verify the live services before browser testing**

Check `http://localhost:3000`, `http://localhost:8000/health`, and `http://localhost:8080/api/v1/health`; each must return 200. Confirm the AI service still loads `ASR_PROVIDER=deepgram` without printing the key.

- [ ] **Step 4: Perform browser acceptance**

At `http://localhost:3000`, verify in both system light and dark themes:

1. One unified textarea is present and no voice/text toggle exists.
2. A typed answer submits through the text path without requesting microphone permission.
3. Clicking `语音输入` establishes WS, requests microphone permission, and begins recording automatically.
4. During recording, the status strip is non-clickable and the only stop action is `停止并转写`.
5. Real speech produces partial/final Deepgram text in the same textarea; manual editing remains intact.
6. Provider or permission failure keeps the existing draft and text input usable.
7. Mobile width, reduced motion, focus indicators, and keyboard submission remain usable.

- [ ] **Step 5: Check the final diff boundary**

Run `git diff --check` and inspect `git status --short`. Confirm only the planned frontend files plus the approved spec/plan are new or modified by this task; preserve all unrelated dirty files.
