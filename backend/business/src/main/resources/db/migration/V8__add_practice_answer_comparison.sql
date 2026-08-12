ALTER TABLE question_review
    ADD COLUMN comparison_json JSON NULL;

ALTER TABLE practice_session
    ADD COLUMN source_follow_ups_json JSON NULL;
