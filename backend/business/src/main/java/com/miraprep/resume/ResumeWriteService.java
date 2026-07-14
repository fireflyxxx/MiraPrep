package com.miraprep.resume;

import com.miraprep.common.error.ErrorCode;
import com.miraprep.common.exception.BusinessException;
import com.miraprep.domain.Resume;
import com.miraprep.domain.ResumeParseStatus;
import com.miraprep.domain.User;
import com.miraprep.user.UserRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Keeps the short database transaction separate from potentially slow object-storage I/O. */
@Service
public class ResumeWriteService {
    private final ResumeRepository resumeRepository;
    private final UserRepository userRepository;
    private final ApplicationEventPublisher eventPublisher;

    public ResumeWriteService(
            ResumeRepository resumeRepository, UserRepository userRepository, ApplicationEventPublisher eventPublisher) {
        this.resumeRepository = resumeRepository;
        this.userRepository = userRepository;
        this.eventPublisher = eventPublisher;
    }

    @Transactional
    public Resume persistUploadedResume(
            Long userId, String objectKey, String fileName, long fileSize, String mimeType) {
        User user = userRepository.findByIdForUpdate(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHORIZED));
        Resume resume = new Resume();
        resume.setUser(user);
        resume.setFileUrl(objectKey);
        resume.setFileName(fileName);
        resume.setFileSize(fileSize);
        resume.setParseStatus(ResumeParseStatus.PENDING);
        resume.setDefaultResume(!resumeRepository.existsByUserIdAndDeletedFalse(userId));
        Resume saved = resumeRepository.save(resume);
        eventPublisher.publishEvent(new ResumeParseRequestedEvent(
                saved.getId(), saved.getFileUrl(), saved.getFileName(), mimeType));
        return saved;
    }
}
