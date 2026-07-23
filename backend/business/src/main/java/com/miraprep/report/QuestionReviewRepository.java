package com.miraprep.report;

import com.miraprep.domain.QuestionReview;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface QuestionReviewRepository extends JpaRepository<QuestionReview, Long> {
    List<QuestionReview> findByReportId(Long reportId);
}
