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
