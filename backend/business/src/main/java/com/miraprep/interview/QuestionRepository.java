package com.miraprep.interview;

import com.miraprep.domain.Question;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface QuestionRepository extends JpaRepository<Question, Long> {
    long countBySessionId(Long sessionId);

    Optional<Question> findByIdAndSessionId(Long id, Long sessionId);

    List<Question> findBySessionIdOrderBySortOrder(Long sessionId);

    @Query("select question.session.id, count(question) from Question question "
            + "where question.session.id in :sessionIds group by question.session.id")
    List<Object[]> countBySessionIds(@Param("sessionIds") Collection<Long> sessionIds);
}
