package com.miraprep.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Column;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** 单题练习与来源面试、来源题目的只读关联。 */
@Getter
@Setter
@NoArgsConstructor
@Entity
@Table(name = "practice_session")
public class PracticeSession {

    @Id
    private Long id;

    @MapsId
    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "session_id", nullable = false)
    private InterviewSession session;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "source_session_id", nullable = false)
    private InterviewSession sourceSession;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "source_question_id", nullable = false)
    private Question sourceQuestion;

    @Enumerated(EnumType.STRING)
    @Column(name = "target_type", nullable = false)
    private PracticeTargetType targetType = PracticeTargetType.MAIN_QUESTION;

    @Column(name = "source_follow_up_index")
    private Integer sourceFollowUpIndex;

    @Column(name = "source_prompt", columnDefinition = "TEXT")
    private String sourcePrompt;

    @Column(name = "source_answer", columnDefinition = "TEXT")
    private String sourceAnswer;

    @Column(name = "source_score", precision = 5, scale = 2)
    private BigDecimal sourceScore;

    @Column(name = "source_reference_answer", columnDefinition = "TEXT")
    private String sourceReferenceAnswer;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "source_suggestions_json")
    private List<String> sourceSuggestions;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "source_follow_ups_json")
    private List<Map<String, Object>> sourceFollowUps;
}
