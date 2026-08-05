package com.miraprep;

import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.miraprep.domain.GradingStatus;
import com.miraprep.domain.InterviewDifficulty;
import com.miraprep.domain.InterviewerStyle;
import com.miraprep.domain.InterviewMessage;
import com.miraprep.domain.InterviewPhase;
import com.miraprep.domain.InterviewSession;
import com.miraprep.domain.MessageRole;
import com.miraprep.domain.Question;
import com.miraprep.domain.QuestionReview;
import com.miraprep.domain.Report;
import com.miraprep.domain.ReportGrade;
import com.miraprep.domain.Resume;
import com.miraprep.domain.ResumeParseStatus;
import com.miraprep.domain.User;
import com.miraprep.interview.InterviewMessageRepository;
import com.miraprep.interview.InterviewSessionRepository;
import com.miraprep.interview.QuestionRepository;
import com.miraprep.report.QuestionReviewRepository;
import com.miraprep.report.ReportRepository;
import com.miraprep.resume.ObjectStorageService;
import com.miraprep.resume.ResumeRepository;
import com.miraprep.user.UserProfileRepository;
import com.miraprep.user.UserRepository;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest(classes = BusinessApplication.class)
@AutoConfigureMockMvc
class DataDeletionIntegrationTest {
    private static final String PASSWORD = "safe-password-123";

    @Autowired private MockMvc mockMvc;
    @Autowired private UserRepository userRepository;
    @Autowired private UserProfileRepository profileRepository;
    @Autowired private ResumeRepository resumeRepository;
    @Autowired private InterviewSessionRepository sessionRepository;
    @Autowired private QuestionRepository questionRepository;
    @Autowired private InterviewMessageRepository messageRepository;
    @Autowired private ReportRepository reportRepository;
    @Autowired private QuestionReviewRepository reviewRepository;

    @MockBean private ObjectStorageService objectStorageService;

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> "jdbc:h2:mem:data-deletion;MODE=MySQL;DB_CLOSE_DELAY=-1");
        registry.add("spring.datasource.driver-class-name", () -> "org.h2.Driver");
        registry.add("spring.datasource.username", () -> "sa");
        registry.add("spring.datasource.password", () -> "");
        registry.add("spring.data.redis.repositories.enabled", () -> false);
        registry.add("app.auth.jwt-secret", () -> "test-jwt-secret-that-is-long-enough-for-hmac-sha256");
        registry.add("app.auth.verification.fixed-code", () -> "123456");
        registry.add("app.auth.token-store", () -> "memory");
        registry.add("app.auth.rate-limiter", () -> "memory");
    }

    @Test
    void passwordConfirmedDeletionRemovesDatabaseAndPrivateObjectsAndRevokesRefresh() throws Exception {
        Registration owner = register();
        createProfile(owner.accessToken());
        User ownerUser = userRepository.findByEmail(owner.email()).orElseThrow();
        OwnedGraph graph = createOwnedGraph(ownerUser);

        Registration other = register();
        User otherUser = userRepository.findByEmail(other.email()).orElseThrow();
        Resume otherResume = resume(otherUser, "resumes/%d/keep.pdf".formatted(otherUser.getId()));

        mockMvc.perform(delete("/api/v1/users/me")
                        .header("Authorization", "Bearer " + owner.accessToken())
                        .contentType("application/json")
                        .content("""
                                {"password":"wrong-password","confirmation":"DELETE"}
                                """))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(40101));
        org.assertj.core.api.Assertions.assertThat(userRepository.existsById(ownerUser.getId())).isTrue();

        mockMvc.perform(delete("/api/v1/users/me")
                        .header("Authorization", "Bearer " + owner.accessToken())
                        .contentType("application/json")
                        .content("""
                                {"password":"safe-password-123","confirmation":"DELETE"}
                                """))
                .andExpect(status().isNoContent());

        org.assertj.core.api.Assertions.assertThat(userRepository.existsById(ownerUser.getId())).isFalse();
        org.assertj.core.api.Assertions.assertThat(profileRepository.existsById(ownerUser.getId())).isFalse();
        org.assertj.core.api.Assertions.assertThat(resumeRepository.findAll()).extracting(Resume::getId)
                .containsExactly(otherResume.getId());
        org.assertj.core.api.Assertions.assertThat(sessionRepository.count()).isZero();
        org.assertj.core.api.Assertions.assertThat(questionRepository.count()).isZero();
        org.assertj.core.api.Assertions.assertThat(messageRepository.count()).isZero();
        org.assertj.core.api.Assertions.assertThat(reportRepository.count()).isZero();
        org.assertj.core.api.Assertions.assertThat(reviewRepository.count()).isZero();
        verify(objectStorageService).delete(graph.resumeObjectKey());
        verify(objectStorageService).delete(graph.audioObjectKey());
        verify(objectStorageService, never()).delete(otherResume.getFileUrl());

        mockMvc.perform(get("/api/v1/users/me")
                        .header("Authorization", "Bearer " + owner.accessToken()))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/v1/auth/refresh")
                        .contentType("application/json")
                        .content("{\"refreshToken\":\"%s\"}".formatted(owner.refreshToken())))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(40102));
    }

    @Test
    void storageFailureLeavesTheAccountAvailableForARetry() throws Exception {
        Registration owner = register();
        createProfile(owner.accessToken());
        User ownerUser = userRepository.findByEmail(owner.email()).orElseThrow();
        OwnedGraph graph = createOwnedGraph(ownerUser);
        doThrow(new RuntimeException("storage unavailable"))
                .when(objectStorageService)
                .delete(graph.resumeObjectKey());

        mockMvc.perform(delete("/api/v1/users/me")
                        .header("Authorization", "Bearer " + owner.accessToken())
                        .contentType("application/json")
                        .content("""
                                {"password":"safe-password-123","confirmation":"DELETE"}
                                """))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value(50000));

        org.assertj.core.api.Assertions.assertThat(userRepository.existsById(ownerUser.getId())).isTrue();
        org.assertj.core.api.Assertions.assertThat(resumeRepository.existsById(graph.resumeId())).isTrue();
        verify(objectStorageService).delete(graph.resumeObjectKey());
    }

    @Test
    void newlyRegisteredAccountCanBeDeletedBeforeOnboarding() throws Exception {
        Registration owner = register();
        User ownerUser = userRepository.findByEmail(owner.email()).orElseThrow();

        mockMvc.perform(delete("/api/v1/users/me")
                        .header("Authorization", "Bearer " + owner.accessToken())
                        .contentType("application/json")
                        .content("""
                                {"password":"safe-password-123","confirmation":"DELETE"}
                                """))
                .andExpect(status().isNoContent());

        org.assertj.core.api.Assertions.assertThat(userRepository.existsById(ownerUser.getId())).isFalse();
        org.assertj.core.api.Assertions.assertThat(profileRepository.existsById(ownerUser.getId())).isFalse();
    }

    private Registration register() throws Exception {
        String email = "delete-" + UUID.randomUUID() + "@example.com";
        MvcResult result = mockMvc.perform(post("/api/v1/auth/register")
                        .contentType("application/json")
                        .content("""
                                {"email":"%s","password":"%s","code":"123456"}
                                """.formatted(email, PASSWORD)))
                .andExpect(status().isOk())
                .andReturn();
        return new Registration(
                email,
                JsonPath.read(result.getResponse().getContentAsString(), "$.data.accessToken"),
                JsonPath.read(result.getResponse().getContentAsString(), "$.data.refreshToken"));
    }

    private void createProfile(String accessToken) throws Exception {
        mockMvc.perform(put("/api/v1/users/me/profile")
                        .header("Authorization", "Bearer " + accessToken)
                        .contentType("application/json")
                        .content("""
                                {"jobDirection":"backend","techStacks":["Java"],
                                 "experienceLevel":"JUNIOR","status":"ACTIVE",
                                 "targetCompany":null,"preferences":{}}
                                """))
                .andExpect(status().isOk());
    }

    private OwnedGraph createOwnedGraph(User user) {
        String resumeKey = "resumes/%d/private.pdf".formatted(user.getId());
        Resume resume = resume(user, resumeKey);

        InterviewSession session = new InterviewSession();
        session.setUser(user);
        session.setResume(resume);
        session.setJobDirection("backend");
        session.setJobTitle("Java engineer");
        session.setDifficulty(InterviewDifficulty.MEDIUM);
        session.setTypes(List.of("technical"));
        session.setDurationMin(15);
        session.setInterviewerStyle(InterviewerStyle.BALANCED);
        session.setGradingStatus(GradingStatus.READY);
        session = sessionRepository.save(session);

        Question question = new Question();
        question.setSession(session);
        question.setPhase(InterviewPhase.DOMAIN_ASSESSMENT);
        question.setText("请介绍事务。");
        question.setFocusPoints(List.of("事务"));
        question.setSortOrder(1);
        question = questionRepository.save(question);

        String audioKey = "audio/%d/%d/answer.webm".formatted(user.getId(), session.getId());
        InterviewMessage message = new InterviewMessage();
        message.setSession(session);
        message.setQuestion(question);
        message.setRole(MessageRole.CANDIDATE);
        message.setContent("回答");
        message.setPhase(InterviewPhase.DOMAIN_ASSESSMENT);
        message.setAudioUrl(audioKey);
        message.setSeq(1);
        messageRepository.save(message);

        Report report = new Report();
        report.setSession(session);
        report.setGrade(ReportGrade.B);
        report.setTotalScore(BigDecimal.valueOf(75));
        report.setDimensionScores(Map.of("professionalKnowledge", 75));
        report.setSummary("summary");
        report.setHighlights(List.of("highlight"));
        report.setWeaknesses(List.of("weakness"));
        report = reportRepository.save(report);

        QuestionReview review = new QuestionReview();
        review.setReport(report);
        review.setQuestion(question);
        review.setScore(BigDecimal.valueOf(8));
        review.setReferenceAnswer("reference");
        review.setSuggestions(List.of("suggestion"));
        review.setFollowUpChainJson(List.of());
        reviewRepository.save(review);
        return new OwnedGraph(resume.getId(), resumeKey, audioKey);
    }

    private Resume resume(User user, String objectKey) {
        Resume resume = new Resume();
        resume.setUser(user);
        resume.setFileUrl(objectKey);
        resume.setFileName("private.pdf");
        resume.setFileSize(100);
        resume.setParseStatus(ResumeParseStatus.SUCCESS);
        return resumeRepository.save(resume);
    }

    private record Registration(String email, String accessToken, String refreshToken) {}

    private record OwnedGraph(Long resumeId, String resumeObjectKey, String audioObjectKey) {}
}
