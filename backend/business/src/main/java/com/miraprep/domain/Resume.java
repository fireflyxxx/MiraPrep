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
@Table(name = "resume")
public class Resume extends BaseAuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "file_url", nullable = false, length = 2048)
    private String fileUrl;

    @Column(name = "file_name", nullable = false, length = 512)
    private String fileName;

    @Column(name = "file_size", nullable = false)
    private long fileSize;

    @Column(name = "page_count")
    private Integer pageCount;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "parsed_json")
    private Map<String, Object> parsedJson;

    @Enumerated(EnumType.STRING)
    @Column(name = "parse_status", nullable = false)
    private ResumeParseStatus parseStatus = ResumeParseStatus.PENDING;

    @Column(name = "is_default", nullable = false)
    private boolean defaultResume;

    @Column(nullable = false)
    private boolean deleted;
}
