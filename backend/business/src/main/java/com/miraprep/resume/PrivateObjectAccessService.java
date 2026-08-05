package com.miraprep.resume;

import com.miraprep.common.error.ErrorCode;
import com.miraprep.common.exception.BusinessException;
import org.springframework.stereotype.Service;

/** Validates ownership-shaped object keys before creating short-lived download URLs. */
@Service
public class PrivateObjectAccessService {
    private final ObjectStorageService objectStorageService;

    public PrivateObjectAccessService(ObjectStorageService objectStorageService) {
        this.objectStorageService = objectStorageService;
    }

    public String requireOwnedAudioObjectKey(Long userId, Long sessionId, String objectKey) {
        if (!isOwnedAudioObjectKey(userId, sessionId, objectKey)) {
            throw new BusinessException(ErrorCode.INVALID_PARAM);
        }
        return objectKey;
    }

    public String signedAudioUrl(Long userId, Long sessionId, String objectKey) {
        if (objectKey == null || !isOwnedAudioObjectKey(userId, sessionId, objectKey)) {
            return null;
        }
        try {
            return objectStorageService.signedDownloadUrl(objectKey);
        } catch (Exception exception) {
            throw new BusinessException(ErrorCode.INTERNAL);
        }
    }

    public boolean isOwnedResumeObjectKey(Long userId, String objectKey) {
        return hasSafePrefix(objectKey, "resumes/" + userId + "/");
    }

    public boolean isOwnedAudioObjectKey(Long userId, Long sessionId, String objectKey) {
        return hasSafePrefix(objectKey, "audio/" + userId + "/" + sessionId + "/");
    }

    private boolean hasSafePrefix(String objectKey, String expectedPrefix) {
        return objectKey != null
                && objectKey.startsWith(expectedPrefix)
                && objectKey.length() > expectedPrefix.length()
                && !objectKey.contains("..")
                && !objectKey.contains("\\")
                && !objectKey.contains("://");
    }
}
