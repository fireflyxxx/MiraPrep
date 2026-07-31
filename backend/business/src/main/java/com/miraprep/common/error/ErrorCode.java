package com.miraprep.common.error;

import org.springframework.http.HttpStatus;

public enum ErrorCode {
    INVALID_PARAM(40000, HttpStatus.BAD_REQUEST, "invalid parameter"),
    INVALID_FILE_TYPE(40001, HttpStatus.BAD_REQUEST, "invalid file type"),
    FILE_TOO_LARGE(40002, HttpStatus.BAD_REQUEST, "file too large"),
    UNAUTHORIZED(40100, HttpStatus.UNAUTHORIZED, "unauthorized"),
    INVALID_CREDENTIALS(40101, HttpStatus.UNAUTHORIZED, "invalid credentials"),
    INVALID_REFRESH_TOKEN(40102, HttpStatus.UNAUTHORIZED, "invalid refresh token"),
    FORBIDDEN(40300, HttpStatus.FORBIDDEN, "forbidden"),
    NOT_FOUND(40400, HttpStatus.NOT_FOUND, "not found"),
    RATE_LIMITED(42900, HttpStatus.TOO_MANY_REQUESTS, "too many requests"),
    INTERNAL(50000, HttpStatus.INTERNAL_SERVER_ERROR, "internal server error");

    private final int code;
    private final HttpStatus httpStatus;
    private final String defaultMessage;

    ErrorCode(int code, HttpStatus httpStatus, String defaultMessage) {
        this.code = code;
        this.httpStatus = httpStatus;
        this.defaultMessage = defaultMessage;
    }

    public int code() {
        return code;
    }

    public HttpStatus httpStatus() {
        return httpStatus;
    }

    public String defaultMessage() {
        return defaultMessage;
    }
}
