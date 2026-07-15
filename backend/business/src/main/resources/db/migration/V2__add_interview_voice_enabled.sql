ALTER TABLE interview_session
    ADD COLUMN voice_enabled BOOLEAN NOT NULL DEFAULT FALSE AFTER interviewer_style;
