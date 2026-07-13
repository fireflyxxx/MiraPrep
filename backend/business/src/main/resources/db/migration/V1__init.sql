CREATE TABLE users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nickname VARCHAR(100),
    avatar VARCHAR(2048),
    is_first_login BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT uk_users_email UNIQUE (email)
);

CREATE TABLE user_profile (
    user_id BIGINT PRIMARY KEY,
    job_direction VARCHAR(255),
    tech_stacks JSON,
    experience_level VARCHAR(64),
    status VARCHAR(64),
    target_company VARCHAR(255),
    preferences JSON,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_user_profile_user FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE resume (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    file_url VARCHAR(2048) NOT NULL,
    file_name VARCHAR(512) NOT NULL,
    file_size BIGINT NOT NULL,
    page_count INT,
    parsed_json JSON,
    parse_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_resume_user FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE INDEX idx_resume_user_deleted ON resume (user_id, deleted);

CREATE TABLE interview_session (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    resume_id BIGINT,
    job_direction VARCHAR(255) NOT NULL,
    job_title VARCHAR(255) NOT NULL,
    jd_text TEXT,
    difficulty VARCHAR(32) NOT NULL,
    types JSON,
    duration_min INT NOT NULL,
    custom_requirements TEXT,
    interviewer_style VARCHAR(64),
    status VARCHAR(32) NOT NULL DEFAULT 'CREATED',
    outline_status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    grading_status VARCHAR(32) NOT NULL DEFAULT 'NONE',
    grading_error TEXT,
    started_at TIMESTAMP(6),
    ended_at TIMESTAMP(6),
    deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_interview_session_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_interview_session_resume FOREIGN KEY (resume_id) REFERENCES resume (id)
);

CREATE INDEX idx_interview_session_user_status ON interview_session (user_id, status);

CREATE TABLE interview_message (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id BIGINT NOT NULL,
    role VARCHAR(32) NOT NULL,
    content TEXT NOT NULL,
    audio_url VARCHAR(2048),
    phase VARCHAR(64),
    question_id BIGINT,
    seq INT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_interview_message_session FOREIGN KEY (session_id) REFERENCES interview_session (id)
);

CREATE INDEX idx_interview_message_session_seq ON interview_message (session_id, seq);

CREATE TABLE question (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id BIGINT NOT NULL,
    phase VARCHAR(64) NOT NULL,
    text TEXT NOT NULL,
    focus_points JSON,
    sort_order INT NOT NULL,
    think_seconds INT,
    answer_seconds INT,
    suggested_seconds INT,
    skipped BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_question_session FOREIGN KEY (session_id) REFERENCES interview_session (id)
);

CREATE INDEX idx_question_session_sort_order ON question (session_id, sort_order);

ALTER TABLE interview_message
    ADD CONSTRAINT fk_interview_message_question FOREIGN KEY (question_id) REFERENCES question (id);

CREATE TABLE report (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id BIGINT NOT NULL,
    grade VARCHAR(32) NOT NULL,
    total_score DECIMAL(5, 2) NOT NULL,
    dimension_scores JSON,
    summary TEXT,
    highlights JSON,
    weaknesses JSON,
    partial BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT uk_report_session UNIQUE (session_id),
    CONSTRAINT fk_report_session FOREIGN KEY (session_id) REFERENCES interview_session (id)
);

CREATE TABLE question_review (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    report_id BIGINT NOT NULL,
    question_id BIGINT NOT NULL,
    score DECIMAL(5, 2) NOT NULL,
    reference_answer TEXT,
    suggestions JSON,
    follow_up_chain_json JSON,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_question_review_report FOREIGN KEY (report_id) REFERENCES report (id),
    CONSTRAINT fk_question_review_question FOREIGN KEY (question_id) REFERENCES question (id)
);
