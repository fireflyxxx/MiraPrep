package com.miraprep.resume;

import com.miraprep.auth.RequestRateLimiter;
import com.miraprep.common.error.ErrorCode;
import com.miraprep.common.exception.BusinessException;
import com.miraprep.domain.Resume;
import com.miraprep.domain.ResumeParseStatus;
import com.miraprep.resume.dto.ParseResultRequest;
import com.miraprep.resume.dto.ResumeDetailResponse;
import com.miraprep.resume.dto.ResumeListResponse;
import com.miraprep.resume.dto.ResumeSummaryResponse;
import com.miraprep.resume.dto.UpdateResumeRequest;
import com.miraprep.user.UserRepository;
import java.io.InputStream;
import java.time.Duration;
import java.util.Locale;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class ResumeService {
    private static final Logger LOGGER = LoggerFactory.getLogger(ResumeService.class);
    private static final long MAX_FILE_SIZE = 10L * 1024 * 1024;
    private final ResumeRepository resumeRepository;
    private final UserRepository userRepository;
    private final ObjectStorageService objectStorageService;
    private final ResumeWriteService resumeWriteService;
    private final RequestRateLimiter rateLimiter;
    private final Duration uploadWindow;
    private final int uploadMaxAttempts;

    public ResumeService(
            ResumeRepository resumeRepository,
            UserRepository userRepository,
            ObjectStorageService objectStorageService,
            ResumeWriteService resumeWriteService,
            RequestRateLimiter rateLimiter,
            @Value("${app.resume.upload-window}") long uploadWindowSeconds,
            @Value("${app.resume.upload-max-attempts}") int uploadMaxAttempts) {
        this.resumeRepository = resumeRepository;
        this.userRepository = userRepository;
        this.objectStorageService = objectStorageService;
        this.resumeWriteService = resumeWriteService;
        this.rateLimiter = rateLimiter;
        this.uploadWindow = Duration.ofSeconds(uploadWindowSeconds);
        this.uploadMaxAttempts = uploadMaxAttempts;
    }

    public ResumeSummaryResponse upload(Long userId, MultipartFile file) {
        String extension = validateFile(file);
        String rateLimitKey = "resume:upload:" + userId;
        if (!rateLimiter.tryAcquire(rateLimitKey, uploadMaxAttempts, uploadWindow)) {
            throw new BusinessException(ErrorCode.UPLOAD_RATE_LIMITED);
        }
        String objectKey = "resumes/%d/%s.%s".formatted(userId, UUID.randomUUID(), extension);
        boolean stored = false;
        try {
            objectStorageService.store(objectKey, file.getInputStream(), file.getSize(), file.getContentType());
            stored = true;
            return summary(resumeWriteService.persistUploadedResume(
                    userId, objectKey, file.getOriginalFilename(), file.getSize(), file.getContentType()));
        } catch (Exception exception) {
            rateLimiter.release(rateLimitKey);
            if (stored) {
                deleteOrphanedObject(objectKey);
            }
            if (exception instanceof BusinessException businessException) {
                throw businessException;
            }
            throw new BusinessException(ErrorCode.INTERNAL);
        }
    }

    @Transactional(readOnly = true)
    public ResumeListResponse list(Long userId, int page, int size) {
        var resumes = resumeRepository.findByUserIdAndDeletedFalse(
                userId, PageRequest.of(page - 1, size, Sort.by(Sort.Direction.DESC, "createdAt")));
        return new ResumeListResponse(resumes.getContent().stream().map(this::summary).toList(), resumes.getTotalElements(), page, size);
    }

    @Transactional(readOnly = true)
    public ResumeDetailResponse get(Long userId, Long resumeId) {
        Resume resume = ownedResume(userId, resumeId);
        return new ResumeDetailResponse(
                resume.getId(), resume.getFileName(), resume.getFileSize(), resume.getPageCount(), status(resume),
                resume.isDefaultResume(), resume.getCreatedAt(), resume.getParsedJson(), signedUrl(resume));
    }

    @Transactional
    public void delete(Long userId, Long resumeId) {
        lockUser(userId);
        Resume resume = ownedResume(userId, resumeId);
        resume.setDeleted(true);
        if (resume.isDefaultResume()) {
            resume.setDefaultResume(false);
            resumeRepository.findByUserIdAndDeletedFalseOrderByCreatedAtDesc(userId)
                    .stream().findFirst().ifPresent(other -> other.setDefaultResume(true));
        }
    }

    @Transactional
    public ResumeSummaryResponse update(Long userId, Long resumeId, UpdateResumeRequest request) {
        lockUser(userId);
        Resume resume = ownedResume(userId, resumeId);
        if (request.fileName() != null) {
            String trimmedFileName = request.fileName().trim();
            if (trimmedFileName.isEmpty()) {
                throw new BusinessException(ErrorCode.INVALID_PARAM);
            }
            resume.setFileName(trimmedFileName);
        }
        if (Boolean.TRUE.equals(request.isDefault())) {
            resumeRepository.findByUserIdAndDeletedFalseAndDefaultResumeTrue(userId)
                    .forEach(existing -> existing.setDefaultResume(false));
            resume.setDefaultResume(true);
        } else if (Boolean.FALSE.equals(request.isDefault())) {
            resume.setDefaultResume(false);
        }
        return summary(resume);
    }

    @Transactional
    public void applyParseResult(Long resumeId, ParseResultRequest request) {
        Resume resume = resumeRepository.findById(resumeId).orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
        if (resume.isDeleted() || resume.getParseStatus() != ResumeParseStatus.PENDING) {
            return;
        }
        ResumeParseStatus parseStatus = switch (request.status().toLowerCase(Locale.ROOT)) {
            case "success" -> ResumeParseStatus.SUCCESS;
            case "failed" -> ResumeParseStatus.FAILED;
            default -> throw new BusinessException(ErrorCode.INVALID_PARAM);
        };
        resume.setParseStatus(parseStatus);
        resume.setPageCount(request.pageCount());
        resume.setParsedJson(parseStatus == ResumeParseStatus.SUCCESS ? request.parsedJson() : null);
    }

    private Resume ownedResume(Long userId, Long resumeId) {
        return resumeRepository.findByIdAndUserIdAndDeletedFalse(resumeId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND));
    }

    private void lockUser(Long userId) {
        userRepository.findByIdForUpdate(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.UNAUTHORIZED));
    }

    private String validateFile(MultipartFile file) {
        if (file == null || file.isEmpty() || file.getOriginalFilename() == null) {
            throw new BusinessException(ErrorCode.INVALID_FILE_TYPE);
        }
        if (file.getSize() > MAX_FILE_SIZE) {
            throw new BusinessException(ErrorCode.FILE_TOO_LARGE);
        }
        String fileName = file.getOriginalFilename();
        int dot = fileName.lastIndexOf('.');
        String extension = dot < 1 ? "" : fileName.substring(dot + 1).toLowerCase(Locale.ROOT);
        boolean pdf = extension.equals("pdf")
                && "application/pdf".equalsIgnoreCase(file.getContentType())
                && hasFileSignature(file, new byte[] {'%', 'P', 'D', 'F'});
        boolean docx = extension.equals("docx")
                && "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        .equalsIgnoreCase(file.getContentType())
                && hasFileSignature(file, new byte[] {'P', 'K', 3, 4});
        if (!pdf && !docx) {
            throw new BusinessException(ErrorCode.INVALID_FILE_TYPE);
        }
        return extension;
    }

    private boolean hasFileSignature(MultipartFile file, byte[] expected) {
        try (InputStream input = file.getInputStream()) {
            byte[] actual = input.readNBytes(expected.length);
            return java.util.Arrays.equals(actual, expected);
        } catch (Exception exception) {
            return false;
        }
    }

    private String signedUrl(Resume resume) {
        try {
            return objectStorageService.signedDownloadUrl(resume.getFileUrl());
        } catch (Exception exception) {
            throw new BusinessException(ErrorCode.INTERNAL);
        }
    }

    private void deleteOrphanedObject(String objectKey) {
        try {
            objectStorageService.delete(objectKey);
        } catch (Exception cleanupException) {
            LOGGER.error("Failed to remove orphaned resume object {}", objectKey, cleanupException);
        }
    }

    private ResumeSummaryResponse summary(Resume resume) {
        return new ResumeSummaryResponse(
                resume.getId(), resume.getFileName(), resume.getFileSize(), resume.getPageCount(), status(resume),
                resume.isDefaultResume(), resume.getCreatedAt());
    }

    private String status(Resume resume) {
        return resume.getParseStatus().name().toLowerCase(Locale.ROOT);
    }
}
