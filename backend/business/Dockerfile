FROM eclipse-temurin:21-jdk-jammy AS builder
WORKDIR /workspace
COPY gradlew gradlew.bat settings.gradle.kts build.gradle.kts ./
COPY gradle ./gradle
RUN sed -i 's/\r$//' gradlew \
    && chmod +x gradlew
COPY src ./src
RUN ./gradlew bootJar --no-daemon

FROM eclipse-temurin:21-jre-jammy AS runner
RUN apt-get update \
    && apt-get install --no-install-recommends -y curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 1001 --create-home miraprep
WORKDIR /app
COPY --from=builder --chown=miraprep:miraprep /workspace/build/libs/*.jar app.jar
USER miraprep
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-jar", "/app/app.jar"]
