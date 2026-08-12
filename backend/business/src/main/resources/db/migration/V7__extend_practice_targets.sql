ALTER TABLE practice_session
    ADD COLUMN target_type VARCHAR(32) NOT NULL DEFAULT 'MAIN_QUESTION';

ALTER TABLE practice_session
    ADD COLUMN source_follow_up_index INT NULL;

ALTER TABLE practice_session
    ADD COLUMN source_prompt TEXT NULL;

ALTER TABLE practice_session
    ADD COLUMN source_answer TEXT NULL;

ALTER TABLE practice_session
    ADD COLUMN source_score DECIMAL(5, 2) NULL;

ALTER TABLE practice_session
    ADD COLUMN source_reference_answer TEXT NULL;

ALTER TABLE practice_session
    ADD COLUMN source_suggestions_json JSON NULL;

ALTER TABLE question_review
    ADD COLUMN baseline_score DECIMAL(5, 2) NULL;
