package com.miraprep.web;

import com.miraprep.common.error.ErrorCode;
import com.miraprep.common.exception.BusinessException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Profile("test")
@RestController
@RequestMapping("/api/v1/test")
public class TestController {

    @GetMapping("/business-error")
    public void businessError() {
        throw new BusinessException(ErrorCode.INVALID_PARAM);
    }

    @PostMapping("/validated")
    public void validated(@Valid @RequestBody ValidationRequest request) {}

    public record ValidationRequest(@NotBlank String value) {}
}
