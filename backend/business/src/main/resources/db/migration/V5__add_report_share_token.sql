-- 分享是「一份报告最多一个有效链接」，所以用报告表上的两列就够了，不额外建表。
-- share_token 为 NULL 表示分享关闭；唯一索引允许多行 NULL，正好符合语义。
-- 每条 ALTER 单独一句：H2（测试用的内存库）不支持一条 ALTER 里加多列。
ALTER TABLE report ADD COLUMN share_token VARCHAR(64) NULL;

ALTER TABLE report ADD COLUMN shared_at TIMESTAMP(6) NULL;

ALTER TABLE report ADD CONSTRAINT uk_report_share_token UNIQUE (share_token);
