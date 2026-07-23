package com.miraprep.interview;

import com.miraprep.domain.InterviewMessage;
import com.miraprep.domain.MessageRole;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InterviewMessageRepository extends JpaRepository<InterviewMessage, Long> {
    Optional<InterviewMessage> findBySessionIdAndSeq(Long sessionId, int seq);

    List<InterviewMessage> findBySessionIdAndSeqGreaterThanOrderBySeqAsc(Long sessionId, int afterSeq);

    List<InterviewMessage> findBySessionIdAndRoleOrderBySeqAsc(Long sessionId, MessageRole role);

    List<InterviewMessage> findBySessionIdOrderBySeqAsc(Long sessionId);

}
