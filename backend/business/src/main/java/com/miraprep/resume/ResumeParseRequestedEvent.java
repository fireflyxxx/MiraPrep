package com.miraprep.resume;

/** Published inside the upload transaction and consumed only after its database row is committed. */
public record ResumeParseRequestedEvent(Long resumeId, String objectKey, String fileName, String mimeType) {}
