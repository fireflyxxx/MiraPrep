package com.miraprep.user;

import com.miraprep.auth.AuthTokenStore;
import com.miraprep.common.error.ErrorCode;
import com.miraprep.common.exception.BusinessException;
import com.miraprep.domain.InterviewMessage;
import com.miraprep.domain.InterviewSession;
import com.miraprep.domain.Question;
import com.miraprep.domain.QuestionReview;
import com.miraprep.domain.Report;
import com.miraprep.domain.Resume;
import com.miraprep.domain.User;
import com.miraprep.interview.InterviewMessageRepository;
import com.miraprep.interview.InterviewSessionRepository;
import com.miraprep.interview.QuestionRepository;
import com.miraprep.report.QuestionReviewRepository;
import com.miraprep.report.ReportRepository;
import com.miraprep.resume.ObjectStorageService;
import com.miraprep.resume.PrivateObjectAccessService;
import com.miraprep.resume.ResumeRepository;
import com.miraprep.user.dto.DeleteAccountRequest;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DataDeletionService {
    private static final Logger LOGGER = LoggerFactory.getLogger(DataDeletionService.class);

    private final UserRepository userRepository;
    private final UserProfileRepository profileRepository;
    private final ResumeRepository resumeRepository;
    private final InterviewSessionRepository sessionRepository;
    private final QuestionRepository questionRepository;
    private final InterviewMessageRepository messageRepository;
    private final ReportRepository reportRepository;
    private final QuestionReviewRepository reviewRepository;
    private final ObjectStorageService objectStorageService;
    private final PrivateObjectAccessService privateObjectAccessService;
    private final PasswordEncoder passwordEncoder;
    private final AuthTokenStore tokenStore;

    public DataDeletionService(
            UserRepository userRepository,
            UserProfileRepository profileRepository,
            ResumeRepository resumeRepository,
            InterviewSessionRepository sessionRepository,
            QuestionRepository questionRepository,
            InterviewMessageRepository messageRepository,
            ReportRepository reportRepository,
            QuestionReviewRepository reviewRepository,
            ObjectStorageService objectStorageService,
            PrivateObjectAccessService privateObjectAccessService,
            PasswordEncoder passwordEncoder,
            AuthTokenStore tokenStore) {
        this.userRepository = userRepository;
        this.profileRepository = profileRepository;
        this.resumeRepository = resumeRepository;
        this.sessionRepository = sessionRepository;
        this.questionRepository = questionRepository;
        this.messageRepository = messageRepository;
        this.reportRepository = reportRepository;
        this.reviewRepository = reviewRepository;
        this.objectStorageService = objectStorageService;
        this.privateObjectAccessService = privateObjectAccessService;
        this.passwordEncoder = passwordEncoder;
        this.tokenStore = tokenStore;
    }

    @Transactional
    public void deleteAccount(Long userId, DeleteAccountRequest request) {
        User user = userRepository.findByIdForUpdate(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHORIZED));
        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new BusinessException(ErrorCode.INVALID_CREDENTIALS);
        }

        List<Resume> resumes = resumeRepository.findByUserId(userId);
        List<InterviewSession> sessions = sessionRepository.findByUserId(userId);
        List<Long> sessionIds = sessions.stream().map(InterviewSession::getId).toList();
        List<InterviewMessage> messages =
                sessionIds.isEmpty() ? List.of() : messageRepository.findBySessionIdIn(sessionIds);
        List<Question> questions =
                sessionIds.isEmpty() ? List.of() : questionRepository.findBySessionIdIn(sessionIds);
        List<Report> reports =
                sessionIds.isEmpty() ? List.of() : reportRepository.findBySessionIdIn(sessionIds);
        List<Long> reportIds = reports.stream().map(Report::getId).toList();
        List<QuestionReview> reviews =
                reportIds.isEmpty() ? List.of() : reviewRepository.findByReportIdIn(reportIds);

        deletePrivateObjects(userId, resumes, messages);

        reviewRepository.deleteAllInBatch(reviews);
        messageRepository.deleteAllInBatch(messages);
        reportRepository.deleteAllInBatch(reports);
        questionRepository.deleteAllInBatch(questions);
        sessionRepository.deleteAllInBatch(sessions);
        resumeRepository.deleteAllInBatch(resumes);
        profileRepository.deleteById(userId);
        userRepository.delete(user);
        sessionIds.forEach(sessionId -> tokenStore.delete("interview:runtime-token:" + sessionId));
    }

    private void deletePrivateObjects(
            Long userId, List<Resume> resumes, List<InterviewMessage> messages) {
        Set<String> objectKeys = new LinkedHashSet<>();
        resumes.stream()
                .map(Resume::getFileUrl)
                .filter(key -> privateObjectAccessService.isOwnedResumeObjectKey(userId, key))
                .forEach(objectKeys::add);
        messages.stream()
                .filter(message -> privateObjectAccessService.isOwnedAudioObjectKey(
                        userId, message.getSession().getId(), message.getAudioUrl()))
                .map(InterviewMessage::getAudioUrl)
                .forEach(objectKeys::add);

        for (String objectKey : objectKeys) {
            try {
                objectStorageService.delete(objectKey);
            } catch (Exception exception) {
                LOGGER.error("Failed to delete private object during account deletion: {}", objectKey, exception);
                throw new BusinessException(ErrorCode.INTERNAL);
            }
        }
    }
}
