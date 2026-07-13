package com.miraprep.common.response;

import com.miraprep.common.error.ErrorCode;

public record ApiResponse<T>(int code, String message, T data) {

    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>(0, "ok", data);
    }

    public static <T> ApiResponse<T> fail(ErrorCode errorCode) {
        return new ApiResponse<>(errorCode.code(), errorCode.defaultMessage(), null);
    }
}
