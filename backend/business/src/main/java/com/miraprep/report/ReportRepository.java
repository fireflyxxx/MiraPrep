package com.miraprep.report;

import com.miraprep.domain.Report;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReportRepository extends JpaRepository<Report, Long> {
    Optional<Report> findBySessionId(Long sessionId);

    List<Report> findBySessionIdIn(Collection<Long> sessionIds);

    Optional<Report> findByShareToken(String shareToken);

    /**
     * 同岗位历史趋势：只取完整报告，按结束时间正序，方便前端直接画折线。
     * jobDirection / jobTitle 传 null 表示不按该维度过滤。
     */
    @Query(
            """
            select report from Report report
            join fetch report.session session
            where session.user.id = :userId
              and session.deleted = false
              and report.partial = false
              and (:jobDirection is null or session.jobDirection = :jobDirection)
              and (:jobTitle is null or session.jobTitle = :jobTitle)
            order by session.endedAt asc, session.id asc
            """)
    List<Report> findHistory(
            @Param("userId") Long userId,
            @Param("jobDirection") String jobDirection,
            @Param("jobTitle") String jobTitle);

    @Query(
            """
            select report from Report report
            join fetch report.session session
            where session.user.id = :userId
              and session.deleted = false
              and report.partial = false
            order by session.endedAt desc, session.id desc
            """)
    List<Report> findRecentCompleteReports(@Param("userId") Long userId, Pageable pageable);
}
