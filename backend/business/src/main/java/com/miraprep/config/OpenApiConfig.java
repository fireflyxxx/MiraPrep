package com.miraprep.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.servers.Server;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    OpenAPI miraPrepOpenApi() {
        return new OpenAPI()
                .info(new Info().title("MiraPrep Business API").version("v1"))
                .addServersItem(new Server().url("http://localhost:8080"));
    }
}
