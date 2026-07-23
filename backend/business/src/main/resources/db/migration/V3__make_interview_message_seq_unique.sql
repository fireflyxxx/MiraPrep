ALTER TABLE interview_message
    ADD CONSTRAINT uk_interview_message_session_seq UNIQUE (session_id, seq);
