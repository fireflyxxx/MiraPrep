# T-030 Interview Session Backend Implementation Plan

> **历史快照**：本文记录任务实施时的计划，未勾选项不代表当前未完成。当前状态见 [任务总表](../../tasks/README.md) 与 [历史文档说明](../README.md)。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the authenticated Spring Boot APIs and internal callback that manage interview creation, outline readiness, history, and termination.

**Architecture:** Keep database writes in short Spring transactions and publish domain events that are handled only after commit. Persist sessions and questions in MySQL through JPA, call FastAPI through the existing internal REST client, and expose DTO-only responses with ownership checks at the service boundary.

**Tech Stack:** Java 21, Spring Boot 3.3, Spring MVC, Spring Security, Spring Data JPA, Flyway, H2 integration tests, JUnit 5, MockMvc, Mockito, Gradle.

---

## File map

**Create**

- `backend/business/src/main/resources/db/migration/V2__add_interview_voice_enabled.sql`: add the missing persisted voice preference.
- `backend/business/src/main/java/com/miraprep/interview/InterviewController.java`: authenticated public endpoints.
- `backend/business/src/main/java/com/miraprep/interview/InternalInterviewController.java`: internal outline callback endpoint.
- `backend/business/src/main/java/com/miraprep/interview/InterviewService.java`: transactions, ownership, state transitions, pagination projection.
- `backend/business/src/main/java/com/miraprep/interview/InterviewSessionRepository.java`: session persistence and filtered pages.
- `backend/business/src/main/java/com/miraprep/interview/QuestionRepository.java`: question persistence and grouped counts.
- `backend/business/src/main/java/com/miraprep/interview/InterviewOutlineRequestedEvent.java`: post-commit outline payload.
- `backend/business/src/main/java/com/miraprep/interview/InterviewGradingRequestedEvent.java`: post-commit grading signal.
- `backend/business/src/main/java/com/miraprep/interview/InterviewAiRequestListener.java`: after-commit AI dispatch.
- `backend/business/src/main/java/com/miraprep/interview/dto/*.java`: validated API records and response records.
- `backend/business/src/test/java/com/miraprep/InterviewApiIntegrationTest.java`: full public/internal API behavior.
- `backend/business/src/test/java/com/miraprep/InterviewStateIntegrationTest.java`: persisted state, durations, callback idempotency and list projection.

**Modify**

- `backend/business/src/main/java/com/miraprep/domain/InterviewSession.java`: map `voiceEnabled`.
- `backend/business/src/main/java/com/miraprep/client/AiServiceClient.java`: add outline and grading internal calls.
- `backend/business/src/test/java/com/miraprep/client/AiServiceClientContractTest.java`: freeze outgoing JSON field names.

## Task 1: Freeze the database and outgoing AI contracts

**Files:**

- Modify: `backend/business/src/test/java/com/miraprep/client/AiServiceClientContractTest.java`
- Create: `backend/business/src/main/resources/db/migration/V2__add_interview_voice_enabled.sql`
- Modify: `backend/business/src/main/java/com/miraprep/domain/InterviewSession.java`
- Modify: `backend/business/src/main/java/com/miraprep/client/AiServiceClient.java`

- [ ] **Step 1: Add failing serialization contract tests**

Add tests that serialize these exact records and assert the named fields:

```java
var outline = new AiServiceClient.InterviewOutlineRequest(
        7L,
        new AiServiceClient.InterviewOutlineConfig(
                "backend", "Java engineer", "JD", "medium",
                List.of("technical"), 45, "Spring", "standard"),
        new AiServiceClient.InterviewOutlineResume(
                Map.of("skills", List.of("Java"))));
JsonNode outlineBody = objectMapper.readTree(objectMapper.writeValueAsBytes(outline));
assertThat(outlineBody.path("sessionId").asLong()).isEqualTo(7L);
assertThat(outlineBody.path("config").path("jobDirection").asText()).isEqualTo("backend");
assertThat(outlineBody.path("resume").path("parsedJson").path("skills").get(0).asText())
        .isEqualTo("Java");

var grade = new AiServiceClient.InterviewGradeRequest(7L);
JsonNode gradeBody = objectMapper.readTree(objectMapper.writeValueAsBytes(grade));
assertThat(gradeBody.path("sessionId").asLong()).isEqualTo(7L);
```

- [ ] **Step 2: Run the contract tests and confirm RED**

Run from `backend/business`:

```powershell
./gradlew.bat test --tests com.miraprep.client.AiServiceClientContractTest
```

Expected: compilation fails because `InterviewOutlineRequest` and `InterviewGradeRequest` do not exist.

- [ ] **Step 3: Add the migration and entity field**

Create the migration:

```sql
ALTER TABLE interview_session
    ADD COLUMN voice_enabled BOOLEAN NOT NULL DEFAULT FALSE AFTER interviewer_style;
```

Add to `InterviewSession`:

```java
@Column(name = "voice_enabled", nullable = false)
private boolean voiceEnabled;
```

- [ ] **Step 4: Add minimal AI request records and methods**

Add records with these signatures:

```java
public record InterviewOutlineRequest(
        Long sessionId, InterviewOutlineConfig config, InterviewOutlineResume resume) {}

public record InterviewOutlineConfig(
        String jobDirection,
        String jobTitle,
        String jdText,
        String difficulty,
        List<String> types,
        int durationMin,
        String customRequirements,
        String interviewerStyle) {}

public record InterviewOutlineResume(Map<String, Object> parsedJson) {}

public record InterviewGradeRequest(Long sessionId) {}
```

Add async methods that reuse the configured `RestClient`, send `X-Internal-Token`, catch/log exceptions, and call:

```java
POST /internal/interviews/{sessionId}/outline
POST /internal/interviews/{sessionId}/grade
```

- [ ] **Step 5: Run the contract test and migration test**

```powershell
./gradlew.bat test --tests com.miraprep.client.AiServiceClientContractTest --tests com.miraprep.SchemaMigrationIntegrationTest
```

Expected: both test classes pass and Hibernate validates `voice_enabled`.

## Task 2: Create request/response DTOs and public endpoint skeleton

**Files:**

- Create: `backend/business/src/main/java/com/miraprep/interview/dto/CreateInterviewRequest.java`
- Create: `backend/business/src/main/java/com/miraprep/interview/dto/CreateInterviewResponse.java`
- Create: `backend/business/src/main/java/com/miraprep/interview/dto/InterviewStatusResponse.java`
- Create: `backend/business/src/main/java/com/miraprep/interview/dto/EndInterviewRequest.java`
- Create: `backend/business/src/main/java/com/miraprep/interview/dto/EndInterviewResponse.java`
- Create: `backend/business/src/main/java/com/miraprep/interview/dto/InterviewListItemResponse.java`
- Create: `backend/business/src/main/java/com/miraprep/interview/dto/InterviewListResponse.java`
- Create: `backend/business/src/main/java/com/miraprep/interview/InterviewController.java`
- Test: `backend/business/src/test/java/com/miraprep/InterviewApiIntegrationTest.java`

- [ ] **Step 1: Write failing authentication, validation, and OpenAPI tests**

Use `@SpringBootTest`, `@AutoConfigureMockMvc`, the existing H2/JWT dynamic properties, and `@MockBean AiServiceClient`. Assert:

```java
mockMvc.perform(post("/api/v1/interviews")
        .contentType("application/json")
        .content(validCreateBody))
    .andExpect(status().isUnauthorized());

mockMvc.perform(post("/api/v1/interviews")
        .header("Authorization", "Bearer " + token)
        .contentType("application/json")
        .content("{\"resumeId\":null}"))
    .andExpect(status().isBadRequest())
    .andExpect(jsonPath("$.code").value(40000));

mockMvc.perform(get("/v3/api-docs"))
    .andExpect(jsonPath("$.paths['/api/v1/interviews'].post").exists())
    .andExpect(jsonPath("$.paths['/api/v1/interviews/{id}/status'].get").exists())
    .andExpect(jsonPath("$.paths['/api/v1/interviews/{id}/end'].post").exists());
```

- [ ] **Step 2: Run the new class and confirm RED**

```powershell
./gradlew.bat test --tests com.miraprep.InterviewApiIntegrationTest
```

Expected: endpoint/OpenAPI assertions fail because no interview controller exists.

- [ ] **Step 3: Define validated DTO records**

Create `CreateInterviewRequest` with:

```java
Long resumeId;                         // @NotNull
String jobDirection;                   // @NotBlank @Size(max=255)
String jobTitle;                       // @Size(max=255), optional
String jdText;                         // optional
InterviewDifficulty difficulty;        // @NotNull
List<@NotBlank String> types;           // @NotEmpty
Integer durationMin;                   // @NotNull + @AssertTrue，仅允许 15/30/45
String customRequirements;             // optional
InterviewerStyle interviewerStyle;     // @NotNull
Boolean voiceEnabled;                  // @NotNull
```

Create `EndInterviewRequest` with a nested enum whose JSON values are `manual`, `timeout`, and `completed`. Response records must expose lower-case status strings as frozen by T-030.

- [ ] **Step 4: Add controller mappings with explicit page normalization**

Controller methods delegate with `Long.parseLong(authentication.getName())`. Normalize pagination using:

```java
int normalizedPage = Math.max(1, page);
int normalizedSize = Math.min(100, Math.max(1, size));
```

The skeleton may depend on an `InterviewService` interface/class introduced in Task 3; compile it with method signatures only and no behavior beyond delegation.

- [ ] **Step 5: Re-run tests**

```powershell
./gradlew.bat test --tests com.miraprep.InterviewApiIntegrationTest
```

Expected: unauthorized, validation, and OpenAPI tests pass; behavior tests remain to be added.

## Task 3: Implement creation and post-commit outline dispatch

**Files:**

- Create: `backend/business/src/main/java/com/miraprep/interview/InterviewSessionRepository.java`
- Create: `backend/business/src/main/java/com/miraprep/interview/QuestionRepository.java`
- Create: `backend/business/src/main/java/com/miraprep/interview/InterviewOutlineRequestedEvent.java`
- Create: `backend/business/src/main/java/com/miraprep/interview/InterviewGradingRequestedEvent.java`
- Create: `backend/business/src/main/java/com/miraprep/interview/InterviewAiRequestListener.java`
- Create/Modify: `backend/business/src/main/java/com/miraprep/interview/InterviewService.java`
- Modify: `backend/business/src/test/java/com/miraprep/InterviewApiIntegrationTest.java`

- [ ] **Step 1: Add failing create tests**

Register a user, upload a mocked PDF to create an owned resume, then POST a complete body. Assert:

```java
.andExpect(status().isOk())
.andExpect(jsonPath("$.data.sessionId").isNumber())
.andExpect(jsonPath("$.data.outlineStatus").value("pending"));
```

Capture `AiServiceClient.InterviewOutlineRequest` and assert all request fields. Add separate tests where the resume ID does not exist (404) and belongs to a second user (403).

- [ ] **Step 2: Run and confirm RED**

```powershell
./gradlew.bat test --tests 'com.miraprep.InterviewApiIntegrationTest*create*'
```

Expected: creation fails because persistence and ownership logic are missing.

- [ ] **Step 3: Implement repositories and creation transaction**

Required repository methods:

```java
Optional<InterviewSession> findByIdAndDeletedFalse(Long id);
Page<InterviewSession> findByUserIdAndDeletedFalse(Long userId, Pageable pageable);
Page<InterviewSession> findByUserIdAndDeletedFalseAndStatus(Long userId, InterviewStatus status, Pageable pageable);
long countBySessionId(Long sessionId);
List<Question> findBySessionIdOrderBySortOrder(Long sessionId);
```

In `InterviewService.create`, load the resume by raw ID first to distinguish 404 from 403, reject deleted resumes, load the user, populate every request field, save, publish `InterviewOutlineRequestedEvent` containing an immutable outgoing request, and return lower-case `pending`.

- [ ] **Step 4: Implement after-commit listener**

Use:

```java
@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
public void requestOutline(InterviewOutlineRequestedEvent event) {
    aiServiceClient.requestInterviewOutline(event.request());
}
```

Add the equivalent listener for grading, to be exercised in Task 6.

- [ ] **Step 5: Run create tests and confirm GREEN**

```powershell
./gradlew.bat test --tests com.miraprep.InterviewApiIntegrationTest
```

Expected: create, missing-resume, foreign-resume, validation and OpenAPI tests pass.

## Task 4: Implement idempotent outline callback and status polling

**Files:**

- Create: `backend/business/src/main/java/com/miraprep/interview/dto/OutlineResultRequest.java`
- Create: `backend/business/src/main/java/com/miraprep/interview/dto/OutlineQuestionRequest.java`
- Create: `backend/business/src/main/java/com/miraprep/interview/InternalInterviewController.java`
- Modify: `backend/business/src/main/java/com/miraprep/interview/InterviewService.java`
- Modify: `backend/business/src/test/java/com/miraprep/InterviewApiIntegrationTest.java`
- Create/Modify: `backend/business/src/test/java/com/miraprep/InterviewStateIntegrationTest.java`

- [ ] **Step 1: Add failing ready/failed/security tests**

Ready callback body:

```json
{
  "status":"ready",
  "questions":[
    {"phase":"technical","text":"Question two","focusPoints":["JPA"],"order":2,"suggestedSeconds":120},
    {"phase":"introduction","text":"Question one","focusPoints":["clarity"],"order":1,"suggestedSeconds":60}
  ]
}
```

Assert missing internal token returns 403. With the token, assert polling returns `outlineStatus=ready` and `questionCount=2`. Post the same callback again and assert the count remains 2. For `failed`, assert polling exposes `failed` and zero questions.

- [ ] **Step 2: Run and confirm RED**

```powershell
./gradlew.bat test --tests 'com.miraprep.InterviewApiIntegrationTest*outline*' --tests 'com.miraprep.InterviewStateIntegrationTest*outline*'
```

Expected: callback endpoint is absent or state remains pending.

- [ ] **Step 3: Implement callback DTO validation**

Use a callback status enum `READY/FAILED` with case-insensitive JSON parsing or accept a string and explicitly map lower-case values. Each question requires nonblank text, nonnull phase, `order >= 1`, and `suggestedSeconds >= 1`. For ready callbacks, reject null/empty questions with `INVALID_PARAM`.

- [ ] **Step 4: Implement locked, idempotent callback transaction**

Add a repository method using `@Lock(PESSIMISTIC_WRITE)` for callback/end transitions. In the transaction:

```java
if (session.getOutlineStatus() != OutlineStatus.PENDING) {
    return;
}
if (callback is FAILED) {
    session.setOutlineStatus(OutlineStatus.FAILED);
    return;
}
save questions sorted by order;
session.setOutlineStatus(OutlineStatus.READY);
```

Reject duplicate `order` values to keep question order deterministic.

- [ ] **Step 5: Implement ownership-aware polling**

Load the raw session by ID; return 404 when absent/deleted and 403 when `session.user.id != userId`. Return lower-case session and outline statuses plus `questionRepository.countBySessionId(id)`.

- [ ] **Step 6: Run callback/status tests and confirm GREEN**

```powershell
./gradlew.bat test --tests com.miraprep.InterviewApiIntegrationTest --tests com.miraprep.InterviewStateIntegrationTest
```

Expected: ready, failed, duplicate callback, internal-token, and polling tests pass.

## Task 5: Implement paginated interview history

**Files:**

- Modify: `backend/business/src/main/java/com/miraprep/interview/InterviewSessionRepository.java`
- Modify: `backend/business/src/main/java/com/miraprep/interview/QuestionRepository.java`
- Modify: `backend/business/src/main/java/com/miraprep/interview/InterviewService.java`
- Modify: `backend/business/src/test/java/com/miraprep/InterviewStateIntegrationTest.java`

- [ ] **Step 1: Add failing pagination/projection tests**

Persist sessions for two users with different statuses and times. Add questions to selected sessions. Request pages and assert:

```java
assertThat(response.items()).extracting(InterviewListItemResponse::sessionId)
        .containsExactly(newestOwnedId, olderOwnedId);
assertThat(response.total()).isEqualTo(2);
assertThat(response.page()).isEqualTo(1);
assertThat(response.size()).isEqualTo(20);
assertThat(item.questionCount()).isEqualTo(2);
assertThat(item.actualDurationSeconds()).isEqualTo(2520L);
assertThat(item.reportStatus()).isEqualTo("grading");
assertThat(item.grade()).isNull();
```

Add a status-filter request and prove another user's records never appear.

- [ ] **Step 2: Run and confirm RED**

```powershell
./gradlew.bat test --tests 'com.miraprep.InterviewStateIntegrationTest*list*'
```

Expected: list projection is absent or missing counts/status mapping.

- [ ] **Step 3: Add grouped question-count query**

Use one query for all session IDs:

```java
@Query("select q.session.id, count(q) from Question q where q.session.id in :sessionIds group by q.session.id")
List<Object[]> countBySessionIds(@Param("sessionIds") Collection<Long> sessionIds);
```

Convert it into `Map<Long, Long>` once per page.

- [ ] **Step 4: Implement list projection**

Use `PageRequest.of(page - 1, size, Sort.by(DESC, "createdAt"))`. Map actual duration only when both timestamps exist, using `Duration.between(startedAt, endedAt).getSeconds()`. Map grading status exactly:

```java
NONE -> "none"
PENDING -> "grading"
READY -> "ready"
FAILED -> "failed"
```

- [ ] **Step 5: Run list tests and confirm GREEN**

```powershell
./gradlew.bat test --tests com.miraprep.InterviewStateIntegrationTest
```

Expected: paging, ordering, filtering, ownership, duration, counts, null grade, and report status all pass.

## Task 6: Implement idempotent termination and grading hook

**Files:**

- Modify: `backend/business/src/main/java/com/miraprep/interview/InterviewService.java`
- Modify: `backend/business/src/test/java/com/miraprep/InterviewApiIntegrationTest.java`
- Modify: `backend/business/src/test/java/com/miraprep/InterviewStateIntegrationTest.java`

- [ ] **Step 1: Add failing termination tests**

For `manual`, assert `aborted`; for `timeout` and `completed`, assert `completed`. In every first termination assert `endedAt` is present, `reportStatus=grading`, persisted grading status is pending, and `requestInterviewGrade` is called once. Repeat the same request and verify it is still called only once. Add foreign-owner 403 and missing-session 404 cases.

- [ ] **Step 2: Run and confirm RED**

```powershell
./gradlew.bat test --tests 'com.miraprep.InterviewApiIntegrationTest*end*' --tests 'com.miraprep.InterviewStateIntegrationTest*end*'
```

Expected: end behavior is missing.

- [ ] **Step 3: Implement locked state transition**

Load with the pessimistic lock, perform ownership checks, then:

```java
if (status is COMPLETED or ABORTED) {
    return current response;
}
session.setStatus(reason == MANUAL ? InterviewStatus.ABORTED : InterviewStatus.COMPLETED);
session.setEndedAt(clock.instant());
session.setGradingStatus(GradingStatus.PENDING);
publisher.publishEvent(new InterviewGradingRequestedEvent(session.getId()));
```

Inject `Clock` through a Spring bean only if exact-time assertions require it; otherwise assert a bounded timestamp window and keep production code simpler.

- [ ] **Step 4: Run termination tests and confirm GREEN**

```powershell
./gradlew.bat test --tests com.miraprep.InterviewApiIntegrationTest --tests com.miraprep.InterviewStateIntegrationTest
```

Expected: mapping, persistence, ownership, idempotency and one-time grading dispatch pass.

## Task 7: Debug failures and run full verification

**Files:**

- Modify only files proven responsible by failing evidence.

- [ ] **Step 1: Run the focused T-030 suite**

```powershell
./gradlew.bat test --tests com.miraprep.InterviewApiIntegrationTest --tests com.miraprep.InterviewStateIntegrationTest --tests com.miraprep.client.AiServiceClientContractTest --tests com.miraprep.SchemaMigrationIntegrationTest
```

Expected: exit code 0 with all focused tests passing.

- [ ] **Step 2: For every failure, follow the debugging evidence loop**

Record the full exception and failing assertion, reproduce the single test, compare with the working resume/auth patterns, state one root-cause hypothesis, and make one minimal change. Do not stack speculative fixes. Add a regression test before fixing any newly discovered behavior bug.

- [ ] **Step 3: Run the entire backend test suite**

```powershell
./gradlew.bat clean test
```

Expected: `BUILD SUCCESSFUL`, zero failed tests.

- [ ] **Step 4: Build the application artifact**

```powershell
./gradlew.bat bootJar
```

Expected: `BUILD SUCCESSFUL` and a jar under `backend/business/build/libs/`.

- [ ] **Step 5: Check formatting and scope**

From repository root:

```powershell
git diff --check
git status --short --branch
git diff --stat
```

Expected: no whitespace errors; implementation changes remain under `backend/business/` plus the two approved design/plan documents; pre-existing `backend/ai/.black.log` and root `node_modules/` remain untouched.

- [ ] **Step 6: Re-read T-030 acceptance criteria**

Map each of the five acceptance criteria to a passing test and, if local infrastructure is available, run a real create → ready callback → poll → end HTTP sequence. If MySQL/Redis/FastAPI are unavailable, report the integration-test evidence and the exact environmental limitation instead of claiming a live curl run.

## Plan self-review

- Spec coverage: all four public endpoints, internal callback, migration, ownership, pagination, idempotency, AI calls, OpenAPI and five acceptance criteria are assigned to tasks.
- Type consistency: public status values remain lower-case strings; persistence enums remain upper-case Java enums; `order` maps to `Question.sortOrder`; `voiceEnabled` is present from API through entity and AI request.
- Scope: only Spring business service implementation plus the approved planning documents; no frontend, FastAPI, branch, commit or push operations.
