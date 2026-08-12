# T-121 Main Question and Follow-up Retry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow report users to retrain either a main question with up to three dynamic follow-ups or one historical follow-up with no further follow-up, including independent score comparison.

**Architecture:** Keep one isolated `PRACTICE` session per attempt. Add an explicit practice target to the Spring persistence/API and FastAPI runtime, snapshot the selected source attempt, and extend the existing grading chain with follow-up scores plus an optional legacy baseline score. The report UI sends a typed target and reuses the dedicated practice dialog.

**Tech Stack:** Java 21, Spring Boot 3.3, JPA/Flyway, Python 3.12, FastAPI/Pydantic/LangGraph, Next.js 16, React 19, TypeScript, TanStack Query, Vitest, JUnit, pytest.

---

No branch creation, worktree, commit, push, merge, or pull request is part of this plan.

## File map

- Create `backend/business/src/main/java/com/miraprep/domain/PracticeTargetType.java`: persisted target enum.
- Create `backend/business/src/main/java/com/miraprep/interview/dto/CreatePracticeRequest.java`: optional request body contract.
- Create `backend/business/src/main/resources/db/migration/V7__extend_practice_targets.sql`: target snapshots and legacy baseline score.
- Modify Spring practice domain/service/controller/result DTO, `AiServiceClient`, `InterviewService`, report callback DTO/service, and integration tests.
- Modify `backend/ai/app/schemas/interview.py` and `interview_agent.py`: practice target runtime behavior.
- Modify AI grading schema/prompt/service/tests: follow-up scores and optional baseline score.
- Modify frontend report/practice API, `ReportClient`, `PracticeDialog`, `PracticeAnswerCard`, and their tests.
- Modify `docs/tasks/T-121-question-retry.md`: final contract and evidence.

### Task 1: Spring target contract and persistence

**Files:**
- Create: `backend/business/src/main/java/com/miraprep/domain/PracticeTargetType.java`
- Create: `backend/business/src/main/java/com/miraprep/interview/dto/CreatePracticeRequest.java`
- Create: `backend/business/src/main/resources/db/migration/V7__extend_practice_targets.sql`
- Modify: `backend/business/src/main/java/com/miraprep/domain/PracticeSession.java`
- Modify: `backend/business/src/main/java/com/miraprep/domain/QuestionReview.java`
- Modify: `backend/business/src/main/java/com/miraprep/interview/PracticeController.java`
- Test: `backend/business/src/test/java/com/miraprep/PracticeApiIntegrationTest.java`

- [ ] Write integration tests that POST `MAIN_QUESTION`, POST `FOLLOW_UP` with index `0`, reject an out-of-range index, and verify an empty body remains main-question compatible.
- [ ] Run `./gradlew.bat test --tests com.miraprep.PracticeApiIntegrationTest` and verify the new tests fail because the request contract and columns do not exist.
- [ ] Add `PracticeTargetType { MAIN_QUESTION, FOLLOW_UP }` and `CreatePracticeRequest(PracticeTargetType targetType, Integer followUpIndex)` with a `mainQuestion()` default factory.
- [ ] Add nullable/backward-compatible V7 columns to `practice_session`: `target_type`, `source_follow_up_index`, `source_prompt`, `source_answer`, `source_score`, `source_reference_answer`, `source_suggestions_json`; add nullable `baseline_score` to `question_review`. Backfill `target_type='MAIN_QUESTION'` and make it non-null.
- [ ] Map the columns in `PracticeSession` and `QuestionReview`, and make the controller accept `@RequestBody(required=false)`.
- [ ] Re-run the focused Spring test and verify the schema/contract assertions pass before service behavior assertions are added.

### Task 2: Spring creation, grading assembly, and result comparison

**Files:**
- Modify: `backend/business/src/main/java/com/miraprep/interview/PracticeService.java`
- Modify: `backend/business/src/main/java/com/miraprep/interview/dto/CreatePracticeResponse.java`
- Modify: `backend/business/src/main/java/com/miraprep/interview/dto/PracticeResultResponse.java`
- Modify: `backend/business/src/main/java/com/miraprep/client/AiServiceClient.java`
- Modify: `backend/business/src/main/java/com/miraprep/interview/InterviewService.java`
- Modify: `backend/business/src/main/java/com/miraprep/report/dto/GradeResultRequest.java`
- Modify: `backend/business/src/main/java/com/miraprep/report/ReportService.java`
- Test: `backend/business/src/test/java/com/miraprep/PracticeApiIntegrationTest.java`

- [ ] Add failing tests proving a main target clones the main prompt with `practiceTarget="main_question"`, while a follow-up target clones only the selected follow-up text with `practiceTarget="follow_up"` and snapshots the server-owned source answer/reference/suggestions/score.
- [ ] Add failing result tests proving main results include current follow-up reviews and follow-up results use the selected historical attempt plus independent `source.score`, `current.score`, and `scoreDelta`.
- [ ] Add failing grading-request tests proving a legacy follow-up without `score` sends its source answer as `baselineAnswer`, while scored follow-ups do not request redundant baseline grading.
- [ ] Implement strict follow-up JSON parsing in `PracticeService`; malformed or out-of-range targets throw `NOT_FOUND` rather than trusting frontend text.
- [ ] Extend `InterviewStartRequest` with `practiceTarget`, `InterviewGradeTranscriptQuestion` with nullable `baselineAnswer`, and grade callback `QuestionReviewResult` with nullable `baselineScore`.
- [ ] Persist returned `baselineScore` on the practice `QuestionReview`; assemble the result from the immutable practice snapshot, using snapshot score first and current-review baseline score only for legacy reports.
- [ ] Re-run the focused Spring integration suite until all new and old tests pass.

### Task 3: FastAPI practice runtime branching

**Files:**
- Modify: `backend/ai/app/schemas/interview.py`
- Modify: `backend/ai/app/services/interview_agent.py`
- Test: `backend/ai/tests/test_interview_agent_service.py`
- Test: `backend/ai/tests/test_interview_agent.py`

- [ ] Replace the old single practice test with two RED tests: `follow_up` finishes after one answer without invoking the decision graph; `main_question` accepts a scripted follow-up, records the second answer, then finishes when the graph routes to `next_question`.
- [ ] Add a RED cap test showing a main-question practice finishes after the third follow-up instead of generating a new main question.
- [ ] Add `PracticeTarget.MAIN_QUESTION/FOLLOW_UP` to start/state schemas; require it for practice and reject it for formal interviews.
- [ ] Refactor the unconditional practice finish into `_finish_practice_or_advance`: follow-up targets finish immediately; main targets run the existing decision graph and translate every would-be `_advance` into `practice_completed`.
- [ ] Update the practice greeting so main practice announces possible targeted follow-ups, while follow-up practice describes one focused answer.
- [ ] Run the focused AI runtime tests and verify all practice and formal-interview regression tests pass.

### Task 4: Independent follow-up and legacy baseline grading

**Files:**
- Modify: `backend/ai/app/schemas/grading.py`
- Modify: `backend/ai/app/prompts/grading.py`
- Modify: `backend/ai/app/services/grading.py`
- Test: `backend/ai/tests/test_grading.py`

- [ ] Add RED schema/service tests requiring every generated follow-up review to contain a 0–10 `score` and requiring `baselineScore` only when transcript `baselineAnswer` is present.
- [ ] Extend `TranscriptQuestion` with nullable `baselineAnswer`, `FollowUpReview` with `score`, and `QuestionReview` with nullable `baselineScore`.
- [ ] Update the grading prompt to evaluate follow-ups independently and, when supplied, score the baseline answer against exactly the same question/rubric as the current answer.
- [ ] Normalize follow-up `score` from model output while still copying question/answer/timing from trusted transcript input; reject missing or mismatched follow-up items.
- [ ] Validate baseline symmetry: missing requested score or an unexpected baseline score fails the job rather than silently showing a misleading delta.
- [ ] Run `uv run pytest tests/test_grading.py tests/test_interview_agent_service.py tests/test_interview_agent.py` and verify green.

### Task 5: Frontend typed targets and direct report entries

**Files:**
- Modify: `frontend/src/lib/api/report.ts`
- Modify: `frontend/src/lib/api/practice.ts`
- Modify: `frontend/src/lib/api/practice.test.tsx`
- Modify: `frontend/src/components/report/ReportClient.tsx`
- Modify: `frontend/src/components/report/ReportClient.test.tsx`

- [ ] Add RED API tests proving main requests send `{targetType:"MAIN_QUESTION",followUpIndex:null}` and follow-up requests send `{targetType:"FOLLOW_UP",followUpIndex:0}`.
- [ ] Add RED report tests proving the main footer renders “重练主问题”, every valid follow-up renders “重练此追问”, and clicking each opens the correct target without exposing retry controls on public reports.
- [ ] Add optional `score` to `FollowUpReview`, define a discriminated `PracticeTarget`, and make `useCreatePractice` accept the target.
- [ ] Store `{question, target}` in launch state and use server IDs/indexes only in the request; never send historical answer text to Spring.
- [ ] Render the direct-entry layout selected in the visual review, including the follow-up score when available.
- [ ] Run `npm test -- practice.test.tsx ReportClient.test.tsx` and verify green.

### Task 6: Practice dialog/runtime and result layouts

**Files:**
- Modify: `frontend/src/components/report/PracticeRuntimeCard.tsx`
- Modify: `frontend/src/components/report/PracticeDialog.tsx`
- Modify: `frontend/src/components/report/PracticeDialog.test.tsx`
- Modify: `frontend/src/components/report/PracticeAnswerCard.tsx`
- Modify: `frontend/src/components/report/PracticeAnswerCard.test.tsx`
- Modify: `frontend/src/components/interview/InterviewClient.tsx`
- Modify: `frontend/src/components/interview/InterviewClient.test.tsx`

- [ ] Add RED tests proving a main practice stays active after the first answer and renders the streamed follow-up prompt, while a follow-up practice transitions to grading after the first answer.
- [ ] Add RED dialog tests for target-specific title/copy, main-result follow-up chain, and follow-up-result independent score delta.
- [ ] Pass the discriminated target through `PracticeDialog`/`PracticeRuntimeCard` into the shared runtime without restoring the formal interview shell.
- [ ] In the focused card, show “可能继续追问” for main practice and “不会继续追问” for follow-up practice; keep old answers and scores hidden during answering.
- [ ] Extend comparison attempts with follow-up reviews; render current follow-up chain only for main practice and the selected independent score cards for follow-up practice.
- [ ] Run the focused frontend suites and verify green.

### Task 7: Contract update and final verification

**Files:**
- Modify: `docs/tasks/T-121-question-retry.md`

- [ ] Replace the obsolete “all practice never follows up” contract with the approved target-specific rules and independent follow-up scoring.
- [ ] Run frontend gates serially: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`.
- [ ] Run Spring `./gradlew.bat clean check`.
- [ ] Run AI `uv run pytest`, `uv run ruff check .`, and `uv run black --check .`.
- [ ] Run `git diff --check` from the repository root.
- [ ] Start the real stack with `./scripts/dev-up.ps1`; use browser fixtures to complete one main-question practice that produces at least one follow-up and one follow-up practice that ends after one answer.
- [ ] Query MySQL to prove source session/report immutability, target metadata, isolated messages, expected follow-up counts, and independent score deltas.
- [ ] Delete acceptance fixtures, close the browser, stop the visual companion and run `./scripts/dev-down.ps1`.
