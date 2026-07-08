# T-004 · 数据库表结构与 Flyway 迁移

| 轨道 | 里程碑 | 预估 | 依赖 | 阻塞 |
|---|---|---|---|---|
| Backend-Spring | M1 | 1d | T-002 | T-010, T-020, T-030, T-041, T-051 |

## 背景
落地 PRD §6.2 的数据模型为真实表结构与 Flyway 迁移，作为所有业务后端任务的存储基础。先读 `DEVELOPMENT.md §8`。

## 目标
用 Flyway 建立全部业务表，并提供对应的 JPA 实体（或至少表结构 + 实体骨架），保证 T-010/020/030/041/051 可直接用。

## 范围
- **做**：`V1__init.sql`（全表）、JPA 实体类、枚举定义、索引与外键、`created_at/updated_at` 审计字段、软删除字段（简历/会话）。
- **不做**：不写 Repository 的业务查询方法（各业务任务按需加）；不塞种子数据（除非最小字典）。

## 技术规格
按 PRD §6.2 建表（表名 snake_case、复数或单数团队统一并记录）：
- `user`(id, email[uniq], password_hash, nickname, avatar, is_first_login, created_at, updated_at)
- `user_profile`(user_id[uniq FK], job_direction, tech_stacks(JSON), experience_level, status, target_company, preferences(JSON), updated_at)
- `resume`(id, user_id[FK], file_url, file_name, file_size, page_count, parsed_json(JSON,nullable), parse_status[pending|success|failed], is_default, deleted, created_at, updated_at) — 索引 (user_id, deleted)
- `interview_session`(id, user_id[FK], resume_id[FK], job_direction, job_title, jd_text(TEXT), difficulty, types(JSON), duration_min, custom_requirements(TEXT), interviewer_style, status[created|ongoing|completed|aborted], outline_status[pending|ready|failed], started_at, ended_at, deleted, created_at, updated_at) — 索引 (user_id, status)
- `interview_message`(id, session_id[FK], role[interviewer|candidate], content(TEXT), audio_url, phase, question_id, seq, created_at) — 索引 (session_id, seq)
- `question`(id, session_id[FK], phase, text(TEXT), focus_points(JSON), sort_order, think_seconds, answer_seconds, suggested_seconds, skipped, created_at) — 索引 (session_id, sort_order)
- `report`(id, session_id[uniq FK], grade, total_score, dimension_scores(JSON), summary(TEXT), highlights(JSON), weaknesses(JSON), partial, created_at)
- `question_review`(id, report_id[FK], question_id[FK], score, reference_answer(TEXT), suggestions(JSON), follow_up_chain_json(JSON), created_at)

主键策略：`BIGINT AUTO_INCREMENT`（若选雪花/ULID 在此定并全局统一）。枚举在 DB 存字符串。

- 实体：`domain/` 下每表一个 `@Entity`，JSON 列用 `@JdbcTypeCode(SqlTypes.JSON)` 或 AttributeConverter；枚举用 `@Enumerated(STRING)`；审计用 `@CreatedDate/@LastModifiedDate` + `@EntityListeners(AuditingEntityListener.class)`。
- `application.yml`：`spring.jpa.hibernate.ddl-auto=validate`（**禁止 update/create**），`spring.flyway.enabled=true`。

## 涉及文件
- `backend/business/src/main/resources/db/migration/V1__init.sql`
- `backend/business/src/main/java/com/miraprep/domain/*.java`（实体 + 枚举）
- `config/JpaAuditingConfig.java`
- 修改 `application.yml`（flyway + ddl-auto=validate）

## 验收标准
1. `./gradlew bootRun` 时 Flyway 自动执行 `V1__init.sql`，所有表创建成功，`ddl-auto=validate` 无 schema 不匹配报错。
2. 外键、唯一约束、索引均存在（可用 `SHOW CREATE TABLE` 验证）。
3. JSON 列可正常读写（写一个临时测试或单测存取一条含 JSON 的记录）。
4. 重复启动不报错（迁移幂等）。

## 验证方式
PR 贴：Flyway 迁移日志、几张关键表的 `SHOW CREATE TABLE`、JSON 列读写测试证据。

## 遗留/发现
