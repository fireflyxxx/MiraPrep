package com.miraprep.resume;

import com.miraprep.domain.Resume;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ResumeRepository extends JpaRepository<Resume, Long> {
    Page<Resume> findByUserIdAndDeletedFalse(Long userId, Pageable pageable);

    List<Resume> findByUserIdAndDeletedFalse(Long userId);

    List<Resume> findByUserIdAndDeletedFalseOrderByCreatedAtDesc(Long userId);

    Optional<Resume> findByIdAndUserIdAndDeletedFalse(Long id, Long userId);

    List<Resume> findByUserIdAndDeletedFalseAndDefaultResumeTrue(Long userId);

    boolean existsByUserIdAndDeletedFalse(Long userId);
}
