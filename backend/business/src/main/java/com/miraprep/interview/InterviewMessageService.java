package com.miraprep.interview;

import com.miraprep.common.error.ErrorCode;
import com.miraprep.common.exception.BusinessException;
import com.miraprep.domain.InterviewMessage;
import com.miraprep.domain.InterviewPhase;
import com.miraprep.domain.InterviewSession;
import com.miraprep.domain.InterviewStatus;
import com.miraprep.domain.MessageRole;
import com.miraprep.domain.Question;
import com.miraprep.interview.dto.InterviewMessageResponse;
import com.miraprep.interview.dto.InterviewMessagesResponse;
import com.miraprep.interview.dto.WriteInterviewMessageRequest;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class InterviewMessageService {
    private final InterviewSessionRepository interviewSessionRepository;
    private final InterviewMessageRepository interviewMessageRepository;
    private final QuestionRepository questionRepository;

    public InterviewMessageService(
            InterviewSessionRepository interviewSessionRepository,
            InterviewMessageRepository interviewMessageRepository,
            QuestionRepository questionRepository) {
        this.interviewSessionRepository = interviewSessionRepository;
        this.interviewMessageRepository = interviewMessageRepository;
        this.questionRepository = questionRepository;
    }

    @Transactional
    public InterviewMessageResponse write(Long sessionId, WriteInterviewMessageRequest request) {
        InterviewSession session = interviewSessionRepository.findByIdForUpdate(sessionId)
                .filter(candidate -> !candidate.isDeleted())
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));

        // 回调重试可能晚于结束请求到达；已落库的 seq 仍按幂等成功处理。
        InterviewMessage existing = interviewMessageRepository.findBySessionIdAndSeq(sessionId, request.seq())
                .orElse(null);
        if (existing != null) {
            return toResponse(existing);
        }
        if (session.getStatus() == InterviewStatus.COMPLETED
                || session.getStatus() == InterviewStatus.ABORTED) {
            throw new BusinessException(ErrorCode.INVALID_PARAM);
        }

        Question question = null;
        if (request.questionId() != null) {
            question = questionRepository.findByIdAndSessionId(request.questionId(), sessionId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_PARAM));
        }

        InterviewMessage message = new InterviewMessage();
        message.setSession(session);
        message.setRole(enumValue(MessageRole.class, request.role()));
        message.setContent(request.content().trim());
        message.setPhase(enumValue(InterviewPhase.class, request.phase()));
        message.setQuestion(question);
        message.setAudioUrl(optionalText(request.audioUrl()));
        message.setSeq(request.seq());
        InterviewMessage saved = interviewMessageRepository.saveAndFlush(message);

        if (session.getStatus() == InterviewStatus.CREATED) {
            session.setStatus(InterviewStatus.ONGOING);
            session.setStartedAt(Instant.now());
        }
        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public InterviewMessagesResponse read(Long userId, Long sessionId, int afterSeq) {
        if (afterSeq < 0) {
            throw new BusinessException(ErrorCode.INVALID_PARAM);
        }
        InterviewSession session = interviewSessionRepository.findByIdAndDeletedFalse(sessionId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (!session.getUser().getId().equals(userId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
        List<InterviewMessageResponse> items = interviewMessageRepository
                .findBySessionIdAndSeqGreaterThanOrderBySeqAsc(sessionId, afterSeq)
                .stream()
                .map(this::toResponse)
                .toList();
        return new InterviewMessagesResponse(items);
    }

    private InterviewMessageResponse toResponse(InterviewMessage message) {
        return new InterviewMessageResponse(
                lower(message.getRole()),
                message.getContent(),
                lower(message.getPhase()),
                message.getQuestion() == null ? null : message.getQuestion().getId(),
                message.getAudioUrl(),
                message.getSeq(),
                message.getCreatedAt());
    }

    private <E extends Enum<E>> E enumValue(Class<E> type, String value) {
        try {
            return Enum.valueOf(type, value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw new BusinessException(ErrorCode.INVALID_PARAM);
        }
    }

    private String optionalText(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String lower(Enum<?> value) {
        return value == null ? null : value.name().toLowerCase(Locale.ROOT);
    }
}
