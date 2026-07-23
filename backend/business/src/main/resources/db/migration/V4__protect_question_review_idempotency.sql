ALTER TABLE question_review
    ADD CONSTRAINT uk_question_review_report_question UNIQUE (report_id, question_id);
