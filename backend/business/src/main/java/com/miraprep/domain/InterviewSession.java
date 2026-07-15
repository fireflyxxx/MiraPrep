package com.miraprep.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.List;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "interview_session")
public class InterviewSession extends BaseAuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "resume_id")
    private Resume resume;

    @Column(name = "job_direction", nullable = false)
    private String jobDirection;

    @Column(name = "job_title", nullable = false)
    private String jobTitle;

    @Column(name = "jd_text", columnDefinition = "TEXT")
    private String jdText;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private InterviewDifficulty difficulty;

    @JdbcTypeCode(SqlTypes.JSON)
    private List<String> types;

    @Column(name = "duration_min", nullable = false)
    private int durationMin;

    @Column(name = "custom_requirements", columnDefinition = "TEXT")
    private String customRequirements;

    @Enumerated(EnumType.STRING)
    @Column(name = "interviewer_style")
    private InterviewerStyle interviewerStyle;

    @Column(name = "voice_enabled", nullable = false)
    private boolean voiceEnabled;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private InterviewStatus status = InterviewStatus.CREATED;

    @Enumerated(EnumType.STRING)
    @Column(name = "outline_status", nullable = false)
    private OutlineStatus outlineStatus = OutlineStatus.PENDING;

    @Enumerated(EnumType.STRING)
    @Column(name = "grading_status", nullable = false)
    private GradingStatus gradingStatus = GradingStatus.NONE;

    @Column(name = "grading_error", columnDefinition = "TEXT")
    private String gradingError;

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "ended_at")
    private Instant endedAt;

    @Column(nullable = false)
    private boolean deleted;
}
