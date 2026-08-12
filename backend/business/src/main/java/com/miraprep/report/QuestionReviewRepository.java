package com.miraprep.report;

import com.miraprep.domain.QuestionReview;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface QuestionReviewRepository extends JpaRepository<QuestionReview, Long> {
    List<QuestionReview> findByReportId(Long reportId);

    List<QuestionReview> findByReportIdIn(List<Long> reportIds);

    Optional<QuestionReview> findByReportIdAndQuestionId(Long reportId, Long questionId);
}
