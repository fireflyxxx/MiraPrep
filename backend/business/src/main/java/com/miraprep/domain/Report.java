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
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "report")
public class Report extends BaseAuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "session_id", nullable = false, unique = true)
    private InterviewSession session;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ReportGrade grade;

    @Column(name = "total_score", nullable = false, precision = 5, scale = 2)
    private BigDecimal totalScore;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "dimension_scores")
    private Map<String, Object> dimensionScores;

    @Column(columnDefinition = "TEXT")
    private String summary;

    @JdbcTypeCode(SqlTypes.JSON)
    private List<String> highlights;

    @JdbcTypeCode(SqlTypes.JSON)
    private List<String> weaknesses;

    @Column(nullable = false)
    private boolean partial;

    /** 分享链接的随机 token；null 表示分享关闭。关闭再开启会换一个新 token，老链接永久失效。 */
    @Column(name = "share_token", length = 64, unique = true)
    private String shareToken;

    @Column(name = "shared_at")
    private Instant sharedAt;
}
