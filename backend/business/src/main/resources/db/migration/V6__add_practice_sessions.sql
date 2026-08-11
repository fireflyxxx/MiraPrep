ALTER TABLE interview_session
    ADD COLUMN session_type VARCHAR(32) NOT NULL DEFAULT 'INTERVIEW';

CREATE TABLE practice_session (
    session_id BIGINT PRIMARY KEY,
    source_session_id BIGINT NOT NULL,
    source_question_id BIGINT NOT NULL,
    CONSTRAINT fk_practice_session_session FOREIGN KEY (session_id)
        REFERENCES interview_session (id) ON DELETE CASCADE,
    CONSTRAINT fk_practice_session_source_session FOREIGN KEY (source_session_id)
        REFERENCES interview_session (id) ON DELETE CASCADE,
    CONSTRAINT fk_practice_session_source_question FOREIGN KEY (source_question_id)
        REFERENCES question (id) ON DELETE CASCADE
);

CREATE INDEX idx_practice_session_source_session
    ON practice_session (source_session_id);
