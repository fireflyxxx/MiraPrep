package com.miraprep.resume.dto;

import jakarta.validation.constraints.Size;

public record UpdateResumeRequest(@Size(min = 1, max = 512) String fileName, Boolean isDefault) {}
