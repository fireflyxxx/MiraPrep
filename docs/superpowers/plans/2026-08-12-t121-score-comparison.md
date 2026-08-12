# T-121 Score Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在重练结果中用真实批改数据解释新旧回答的语义差异以及分数变化原因。

**Architecture:** FastAPI 在已有逐题结构化批改中接收来源回答与来源分数，生成提升点、剩余不足和评分结论。Spring 将比较结果随 `QuestionReview` 持久化并通过练习结果接口透传；Next.js 在新旧回答卡片前展示评分依据。普通正式面试不携带来源回答，因此不生成比较结果。

**Tech Stack:** FastAPI/Pydantic/LangChain structured output, Spring Boot/JPA/Flyway, Next.js/TypeScript/Tailwind/Vitest.

---

### Task 1: 扩展 AI 批改契约

**Files:**
- Modify: `backend/ai/app/schemas/grading.py`
- Modify: `backend/ai/app/prompts/grading.py`
- Modify: `backend/ai/app/services/grading.py`
- Test: `backend/ai/tests/test_grading.py`

- [x] 先写失败测试：携带 `baselineAnswer` 时必须返回 comparison，已有 `baselineScore` 必须原样保留；普通批改 comparison 为 null。
- [x] 运行 `pytest tests/test_grading.py -q`，确认因比较契约缺失而失败。
- [x] 新增 `AnswerComparison`，校验输入基线与输出基线、comparison 一致，并更新安全 prompt。
- [x] 重跑 AI 定向测试并通过。

### Task 2: 持久化并透传比较结果

**Files:**
- Modify: `backend/business/src/main/java/com/miraprep/client/AiServiceClient.java`
- Modify: `backend/business/src/main/java/com/miraprep/domain/QuestionReview.java`
- Modify: `backend/business/src/main/java/com/miraprep/interview/InterviewService.java`
- Modify: `backend/business/src/main/java/com/miraprep/interview/PracticeService.java`
- Modify: `backend/business/src/main/java/com/miraprep/interview/dto/PracticeResultResponse.java`
- Modify: `backend/business/src/main/java/com/miraprep/report/ReportService.java`
- Modify: `backend/business/src/main/java/com/miraprep/report/dto/GradeResultRequest.java`
- Create: `backend/business/src/main/resources/db/migration/V8__add_practice_answer_comparison.sql`
- Test: `backend/business/src/test/java/com/miraprep/PracticeApiIntegrationTest.java`
- Test: `backend/business/src/test/java/com/miraprep/client/AiServiceClientContractTest.java`

- [x] 先写失败测试：练习批改请求始终携带来源回答/分数，回调后结果接口返回 comparison。
- [x] 运行相关 Gradle 测试，确认因字段缺失而失败。
- [x] 增加可空 JSON 持久化字段和 DTO 映射；非练习报告保持兼容。
- [x] 重跑 Spring 定向测试并通过。

### Task 3: 展示“为什么是这个评分”

**Files:**
- Modify: `frontend/src/lib/api/practice.ts`
- Modify: `frontend/src/components/report/PracticeDialog.tsx`
- Test: `frontend/src/components/report/PracticeDialog.test.tsx`
- Test: `frontend/src/lib/api/practice.test.tsx`

- [x] 先写失败测试：ready 结果展示评分结论、提升点和剩余不足。
- [x] 运行前端定向测试，确认因 UI 和类型缺失而失败。
- [x] 在答案卡片前新增评分依据区；空列表不显示，旧数据无 comparison 时安全降级。
- [x] 重跑前端定向测试并通过。

### Task 4: 全量验证

- [x] AI：pytest、Ruff、Black 检查。
- [x] Spring：`gradlew.bat clean check`。
- [x] 前端：TypeScript、ESLint、Vitest、Next.js build。
- [x] 运行 `git diff --check`，并核对只修改 T-121 相关文件。
