package com.miraprep.common.exception;

import com.miraprep.common.error.ErrorCode;
import com.miraprep.common.response.ApiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * 继承 {@link ResponseEntityExceptionHandler} 是为了让 Spring MVC 的标准异常各回各的状态码
 * ——方法不允许是 405、请求体读不动是 400、路径参数类型不对是 400、路由不存在是 404。
 *
 * <p>以前它们全部掉进下面的 {@code Exception} 兜底分支变成 500，日志里还会堆一条假的
 * 「服务器错误」。分享链接是发给外人的，别人拿浏览器插件或链接预览撞一下就能触发，
 * 所以这不只是好看问题：真出故障时，错误日志得是可信的。
 *
 * <p>这里只覆写 {@code handleExceptionInternal}，把父类算好的状态码换上本项目统一的 JSON 信封。
 */
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {
    private static final Logger LOGGER = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<Void>> handleBusinessException(BusinessException exception) {
        ErrorCode errorCode = exception.errorCode();
        return ResponseEntity.status(errorCode.httpStatus()).body(ApiResponse.fail(errorCode));
    }

    @Override
    protected ResponseEntity<Object> handleExceptionInternal(
            Exception exception,
            Object body,
            HttpHeaders headers,
            HttpStatusCode status,
            WebRequest request) {
        // 上传超限父类判 413，但前端一直按 400/40002 处理，保持既有契约。
        if (exception instanceof MaxUploadSizeExceededException) {
            return new ResponseEntity<>(
                    ApiResponse.fail(ErrorCode.FILE_TOO_LARGE),
                    headers,
                    ErrorCode.FILE_TOO_LARGE.httpStatus());
        }
        if (status.is5xxServerError()) {
            LOGGER.error("Unhandled server exception", exception);
        }
        return new ResponseEntity<>(ApiResponse.fail(errorCodeFor(status)), headers, status);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleUnexpectedException(Exception exception) {
        LOGGER.error("Unhandled server exception", exception);
        return ResponseEntity.internalServerError().body(ApiResponse.fail(ErrorCode.INTERNAL));
    }

    /** 4xx 一律归到「参数不对」，除了 404 和 405 这两个有独立语义、前端要分开处理的。 */
    private static ErrorCode errorCodeFor(HttpStatusCode status) {
        if (status.isSameCodeAs(HttpStatus.NOT_FOUND)) {
            return ErrorCode.NOT_FOUND;
        }
        if (status.isSameCodeAs(HttpStatus.METHOD_NOT_ALLOWED)) {
            return ErrorCode.METHOD_NOT_ALLOWED;
        }
        return status.is4xxClientError() ? ErrorCode.INVALID_PARAM : ErrorCode.INTERNAL;
    }
}
