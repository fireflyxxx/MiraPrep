package com.miraprep;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.miraprep.domain.ExperienceLevel;
import com.miraprep.domain.ProfileStatus;
import com.miraprep.domain.User;
import com.miraprep.domain.UserProfile;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(classes = BusinessApplication.class)
class SchemaMigrationIntegrationTest {

    private static final List<String> EXPECTED_TABLES = List.of(
            "USERS",
            "USER_PROFILE",
            "RESUME",
            "INTERVIEW_SESSION",
            "INTERVIEW_MESSAGE",
            "QUESTION",
            "REPORT",
            "QUESTION_REVIEW");

    @Autowired private JdbcTemplate jdbcTemplate;

    @Autowired private EntityManager entityManager;

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> "jdbc:h2:mem:schema;MODE=MySQL;DB_CLOSE_DELAY=-1");
        registry.add("spring.datasource.driver-class-name", () -> "org.h2.Driver");
        registry.add("spring.datasource.username", () -> "sa");
        registry.add("spring.datasource.password", () -> "");
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
        registry.add("spring.data.redis.repositories.enabled", () -> false);
    }

    @Test
    void flywayCreatesEveryBusinessTable() {
        List<String> actualTables = jdbcTemplate.queryForList(
                "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES "
                        + "WHERE TABLE_SCHEMA = 'PUBLIC' "
                        + "AND LOWER(TABLE_NAME) <> 'flyway_schema_history'",
                String.class);

        assertThat(actualTables).containsExactlyInAnyOrderElementsOf(EXPECTED_TABLES);
    }

    @Test
    void jpaRegistersAnEntityForEveryBusinessTable() {
        Set<String> entityNames = entityManager.getMetamodel().getEntities().stream()
                .map(entityType -> entityType.getName())
                .collect(java.util.stream.Collectors.toSet());

        assertThat(entityNames).containsExactlyInAnyOrder(
                "User",
                "UserProfile",
                "Resume",
                "InterviewSession",
                "InterviewMessage",
                "Question",
                "Report",
                "QuestionReview");
    }

    @Test
    @Transactional
    void jsonColumnsAndAuditFieldsRoundTripThroughJpa() {
        User user = new User();
        user.setEmail("learner@example.com");
        user.setPasswordHash("not-a-real-password");
        entityManager.persist(user);

        UserProfile profile = new UserProfile();
        profile.setUser(user);
        profile.setJobDirection("backend");
        profile.setTechStacks(List.of("Java", "MySQL"));
        profile.setExperienceLevel(ExperienceLevel.JUNIOR);
        profile.setStatus(ProfileStatus.ACTIVE);
        profile.setPreferences(Map.of("mockInterview", true, "duration", 30));
        entityManager.persist(profile);
        entityManager.flush();
        entityManager.clear();

        UserProfile reloaded = entityManager.find(UserProfile.class, user.getId());

        assertThat(reloaded.getTechStacks()).containsExactly("Java", "MySQL");
        assertThat(reloaded.getPreferences()).containsEntry("mockInterview", true).containsEntry("duration", 30);
        assertThat(reloaded.getCreatedAt()).isNotNull();
        assertThat(reloaded.getUpdatedAt()).isNotNull();
    }

    @Test
    @Transactional
    void userEmailUniqueConstraintIsEnforced() {
        User first = new User();
        first.setEmail("dup@example.com");
        first.setPasswordHash("hash");
        entityManager.persist(first);
        entityManager.flush();

        User second = new User();
        second.setEmail("dup@example.com");
        second.setPasswordHash("hash");

        assertThatThrownBy(() -> {
                    entityManager.persist(second);
                    entityManager.flush();
                })
                .isInstanceOf(org.hibernate.exception.ConstraintViolationException.class);
    }
}
