package com.miraprep.user.dto;

import jakarta.validation.constraints.Size;

public record UpdateUserRequest(@Size(max = 100) String nickname, @Size(max = 2048) String avatar) {}
