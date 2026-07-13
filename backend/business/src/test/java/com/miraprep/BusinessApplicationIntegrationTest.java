package com.miraprep;

import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(classes = BusinessApplication.class)
@AutoConfigureMockMvc
@ActiveProfiles("test")
class BusinessApplicationIntegrationTest {

    @Autowired private MockMvc mockMvc;

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.flyway.enabled", () -> false);
        registry.add("spring.datasource.url", () -> "jdbc:h2:mem:miraprep;MODE=MySQL;DB_CLOSE_DELAY=-1");
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "none");
        registry.add("spring.data.redis.repositories.enabled", () -> false);
        registry.add("app.internal-token", () -> "test-internal-token");
    }

    @Test
    void healthReturnsWrappedUpStatus() throws Exception {
        mockMvc.perform(get("/api/v1/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.message").value("ok"))
                .andExpect(jsonPath("$.data.status").value("UP"));
    }

    @Test
    void businessExceptionReturnsMappedClientError() throws Exception {
        mockMvc.perform(get("/api/v1/test/business-error"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40000))
                .andExpect(jsonPath("$.message").value("invalid parameter"))
                .andExpect(jsonPath("$.data").value(nullValue()));
    }

    @Test
    void invalidRequestBodyReturnsWrappedClientError() throws Exception {
        mockMvc.perform(post("/api/v1/test/validated")
                        .contentType("application/json")
                        .content("{\"value\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value(40000))
                .andExpect(jsonPath("$.message").value("invalid parameter"));
    }

    @Test
    void missingInternalTokenIsForbidden() throws Exception {
        mockMvc.perform(get("/api/v1/internal/ping"))
                .andExpect(status().isForbidden())
                .andExpect(header().string("Content-Type", "application/json;charset=UTF-8"))
                .andExpect(jsonPath("$.code").value(40300));
    }

    @Test
    void validInternalTokenCanAccessInternalEndpoint() throws Exception {
        mockMvc.perform(get("/api/v1/internal/ping").header("X-Internal-Token", "test-internal-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.status").value("UP"));
    }
}
