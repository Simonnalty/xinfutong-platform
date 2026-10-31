-- 信复通 v2 数据库结构（MySQL 8 / MariaDB 10.6+）
-- 24 张表：账号权限、企业档案、案件流转、文书版本、渠道证据、凭证链、运营

SET NAMES utf8mb4;

-- ============ 账号与权限 ============
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(20) NOT NULL UNIQUE,
  pwd_hash VARCHAR(200) NOT NULL,
  name VARCHAR(50),
  role VARCHAR(20) NOT NULL DEFAULT 'enterprise',   -- enterprise|org|admin
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ip VARCHAR(64),
  ua VARCHAR(300),
  KEY idx_session_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS orgs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  type VARCHAR(20) NOT NULL,                        -- park|agency|bank
  credit_code CHAR(18),
  contact VARCHAR(50),
  phone VARCHAR(20),
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS org_members (
  org_id INT NOT NULL,
  user_id INT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'member',       -- owner|member
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (org_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS org_enterprises (
  org_id INT NOT NULL,
  enterprise_id INT NOT NULL,
  perm VARCHAR(10) NOT NULL DEFAULT 'read',          -- read|write
  note VARCHAR(200) NULL,
  granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME NULL,
  PRIMARY KEY (org_id, enterprise_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS enterprise_members (
  enterprise_id INT NOT NULL,
  user_id INT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'staff',        -- owner|staff
  granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME NULL,
  PRIMARY KEY (enterprise_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ 企业档案 ============
CREATE TABLE IF NOT EXISTS enterprises (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  credit_code CHAR(18) NOT NULL UNIQUE,
  legal VARCHAR(50),
  industry VARCHAR(60),
  region VARCHAR(60),
  scale VARCHAR(40),
  contact VARCHAR(50),
  phone VARCHAR(20),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ 案件 ============
CREATE TABLE IF NOT EXISTS cases (
  id VARCHAR(64) PRIMARY KEY,
  enterprise_id INT NOT NULL,
  type VARCHAR(30) NOT NULL,                        -- abnormal|penalty|blacklist
  event VARCHAR(500) NOT NULL,
  authority VARCHAR(200),
  doc_no VARCHAR(120),
  listed_date DATE,
  removed_date DATE NULL,
  level VARCHAR(20) NOT NULL,                       -- minor|general|serious|severe
  stage VARCHAR(20) NOT NULL DEFAULT 'draft',
  progress TINYINT NOT NULL DEFAULT 0,
  apply_from DATE NULL,
  due_date DATE NULL,
  closed_at DATETIME NULL,
  obligation_at DATE NULL,                          -- 义务履行/缴款完成日
  rectified TINYINT NULL,                           -- 整改是否完成：1 是 / 0 否 / NULL 未知
  rectify_at DATE NULL,
  no_new_similar TINYINT NULL,                      -- 近12个月无新增同类：1/0/NULL
  fine_amount DECIMAL(12,2) NULL,                   -- 罚款金额（元），决定书载明的数额
  discretion VARCHAR(16) NULL,                      -- 裁量阶次：lighter从轻/mitigated减轻/normal一般/heavier从重
  facts_updated_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_case_ent (enterprise_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS case_channels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id VARCHAR(64) NOT NULL,
  channel_code VARCHAR(40) NOT NULL,
  channel_name VARCHAR(100) NOT NULL,
  state VARCHAR(16) NOT NULL DEFAULT 'idle',        -- ok|warn|bad|idle
  note VARCHAR(300),
  first_seen_at DATETIME NULL,
  last_checked_at DATETIME NULL,
  sort INT DEFAULT 0,
  UNIQUE KEY uk_case_channel (case_id, channel_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS channel_snapshots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id VARCHAR(64) NOT NULL,
  channel_code VARCHAR(40) NOT NULL,
  fetched_at DATETIME NOT NULL,
  payload JSON,
  digest CHAR(64) NOT NULL,
  source VARCHAR(20) NOT NULL DEFAULT 'mock',
  run_id INT NULL,
  KEY idx_snap_case (case_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS checks_runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id VARCHAR(64) NOT NULL,
  started_at DATETIME NOT NULL,
  finished_at DATETIME NULL,
  diffs INT DEFAULT 0,
  digest CHAR(64),
  trigger_by VARCHAR(40) DEFAULT 'manual',
  KEY idx_run_case (case_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS diagnoses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id VARCHAR(64) NOT NULL,
  level VARCHAR(20),
  apply_from DATE,
  conditions JSON,
  basis JSON,
  score TINYINT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_diag_case (case_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ 规则与模板 ============
CREATE TABLE IF NOT EXISTS rule_params (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pkey VARCHAR(60) NOT NULL UNIQUE,
  pvalue VARCHAR(500) NOT NULL,
  note VARCHAR(300),
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS doc_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  doc_key VARCHAR(32) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  title VARCHAR(100) NOT NULL,
  slots JSON,
  body MEDIUMTEXT,
  effective_from DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_doc_ver (doc_key, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS case_docs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id VARCHAR(64) NOT NULL,
  doc_key VARCHAR(32) NOT NULL,
  html MEDIUMTEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'template',   -- template|polished|final|exported
  source VARCHAR(16) NOT NULL DEFAULT 'template',   -- template|ai|manual
  version INT NOT NULL DEFAULT 1,
  updated_by INT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_case_doc (case_id, doc_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS doc_checks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id VARCHAR(64) NOT NULL,
  result JSON,
  score TINYINT,
  checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_check_case (case_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ 任务与时间线 ============
CREATE TABLE IF NOT EXISTS tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id VARCHAR(64) NOT NULL,
  name VARCHAR(200) NOT NULL,
  owner VARCHAR(50),
  due_date DATE,
  status VARCHAR(16) NOT NULL DEFAULT 'todo',       -- todo|doing|done
  depends_on INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_task_case (case_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS timeline_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id VARCHAR(64) NOT NULL,
  at DATETIME NOT NULL,
  actor VARCHAR(50),
  action VARCHAR(100) NOT NULL,
  detail VARCHAR(500),
  KEY idx_tl_case (case_id, at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ 异议 ============
CREATE TABLE IF NOT EXISTS objections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  case_id VARCHAR(64) NOT NULL,
  channel_code VARCHAR(40) NOT NULL,
  body_html MEDIUMTEXT,
  status VARCHAR(16) NOT NULL DEFAULT 'draft',      -- draft|sent|replied|timeout|closed
  sent_at DATETIME NULL,
  reply_at DATETIME NULL,
  pdf_path VARCHAR(300),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_obj_case (case_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ 凭证 ============
CREATE TABLE IF NOT EXISTS certificates (
  code VARCHAR(64) PRIMARY KEY,
  case_id VARCHAR(64) NOT NULL,
  doc_no VARCHAR(120),
  digest CHAR(64) NOT NULL,
  prev_hash CHAR(64) NOT NULL,
  signature VARCHAR(200) NOT NULL,
  issued_at DATETIME NOT NULL,
  valid_until DATE,
  status VARCHAR(16) NOT NULL DEFAULT 'valid',      -- valid|revoked|stale
  revoked_reason VARCHAR(300),
  revoked_at DATETIME NULL,
  KEY idx_cert_case (case_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cert_scans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(64) NOT NULL,
  at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ip VARCHAR(64),
  ua VARCHAR(300),
  result VARCHAR(20),
  KEY idx_scan_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============ 内容与运营 ============
CREATE TABLE IF NOT EXISTS policies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(300) NOT NULL,
  issuer VARCHAR(200),
  published_at DATE,
  effective_at DATE,
  level VARCHAR(20),
  summary TEXT,
  url VARCHAR(500),
  tags VARCHAR(200)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS alerts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  enterprise_id INT,
  case_id VARCHAR(64),
  policy_id INT,
  due_at DATETIME,
  channel VARCHAR(20) DEFAULT 'inapp',
  status VARCHAR(16) DEFAULT 'pending',
  read_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subject_type VARCHAR(20) NOT NULL,                -- user|org
  subject_id INT NOT NULL,
  plan VARCHAR(40) NOT NULL,
  quota INT NOT NULL DEFAULT 0,
  used INT NOT NULL DEFAULT 0,
  start_at DATE,
  end_at DATE,
  status VARCHAR(16) DEFAULT 'active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS usage_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subject_type VARCHAR(20),
  subject_id INT,
  kind VARCHAR(20) NOT NULL,                        -- ai_doc|pdf|check
  tokens_in INT DEFAULT 0,
  tokens_out INT DEFAULT 0,
  cost DECIMAL(10,4) DEFAULT 0,
  at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  actor_id INT,
  action VARCHAR(60) NOT NULL,
  target VARCHAR(100),
  detail VARCHAR(500),
  ip VARCHAR(64),
  at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_actor (actor_id, at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS kb_articles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category VARCHAR(40) NOT NULL,
  title VARCHAR(200) NOT NULL,
  body MEDIUMTEXT,
  tags VARCHAR(200),
  status VARCHAR(16) DEFAULT 'published',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 私有证据：文件与元信息同事务保存，下载只能通过鉴权接口。
CREATE TABLE IF NOT EXISTS evidence_files (
  id CHAR(36) PRIMARY KEY,
  case_id VARCHAR(64) NOT NULL,
  kind VARCHAR(32) NOT NULL,
  filename VARCHAR(200) NOT NULL,
  media_type VARCHAR(100) NOT NULL,
  byte_size INT NOT NULL,
  content LONGBLOB NOT NULL,
  digest CHAR(64) NOT NULL,
  source VARCHAR(500) NOT NULL,
  observed_at DATE NOT NULL,
  uploaded_by INT NOT NULL,
  review_status VARCHAR(20) NOT NULL DEFAULT 'recorded',
  reviewed_by INT NULL,
  reviewed_at DATETIME NULL,
  review_note VARCHAR(500) NULL,
  archived TINYINT NOT NULL DEFAULT 0,
  archived_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_evidence_case (case_id,kind,archived)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS doc_versions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  case_id VARCHAR(64) NOT NULL,
  doc_key VARCHAR(32) NOT NULL,
  version INT NOT NULL,
  html MEDIUMTEXT NOT NULL,
  source VARCHAR(32) NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_doc_version (case_id,doc_key,version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS channel_configs (
  case_id VARCHAR(64) NOT NULL,
  channel_code VARCHAR(40) NOT NULL,
  provider VARCHAR(20) NOT NULL DEFAULT 'manual',
  latest_snapshot INT NULL,
  last_error VARCHAR(300) NULL,
  PRIMARY KEY (case_id,channel_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS objection_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  objection_id INT NOT NULL,
  status VARCHAR(16) NOT NULL,
  note VARCHAR(500) NOT NULL,
  evidence_id CHAR(36) NULL,
  snapshot_id INT NULL,
  actor_id INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  KEY idx_objection_event (objection_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  case_id VARCHAR(64) NOT NULL,
  kind VARCHAR(32) NOT NULL,
  state VARCHAR(16) NOT NULL DEFAULT 'queued',
  next_at DATETIME NOT NULL,
  interval_hours INT NOT NULL DEFAULT 24,
  attempts INT NOT NULL DEFAULT 0,
  lease_until DATETIME NULL,
  lease_token CHAR(36) NULL,
  last_error VARCHAR(300) NULL,
  last_run_at DATETIME NULL,
  UNIQUE KEY uq_job_case_kind (case_id,kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS certificate_snapshots (
  code VARCHAR(64) PRIMARY KEY,
  case_id VARCHAR(64) NOT NULL,
  version INT NOT NULL,
  content JSON NOT NULL,
  content_hash CHAR(64) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cert_case_version (case_id,version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS rule_versions (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 rule_key VARCHAR(80) NOT NULL,
 version INT NOT NULL,
 title VARCHAR(200) NOT NULL,
 case_type VARCHAR(20) NOT NULL,
 level VARCHAR(20) NOT NULL,
 authority_match VARCHAR(100) NOT NULL,
 source_url VARCHAR(500) NOT NULL,
 effective_from DATE NOT NULL,
 effective_until DATE NULL,
 review_status VARCHAR(20) NOT NULL DEFAULT 'draft',
 review_note VARCHAR(500) NOT NULL,
 definition JSON NOT NULL,
 created_by INT NULL,
 created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_rule_version (rule_key,version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS diagnosis_snapshots (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 diagnosis_id INT NOT NULL,
 case_id VARCHAR(64) NOT NULL,
 content JSON NOT NULL,
 digest CHAR(64) NOT NULL,
 created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
 KEY idx_diagnosis_case (case_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS task_events (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 task_id INT NOT NULL,
 actor_id INT NOT NULL,
 note VARCHAR(500) NOT NULL,
 evidence_id CHAR(36) NULL,
 changes JSON NOT NULL,
 created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
 KEY idx_task_events (task_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS stage_events (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 case_id VARCHAR(64) NOT NULL,
 from_stage VARCHAR(20) NOT NULL,
 to_stage VARCHAR(20) NOT NULL,
 actor_id INT NULL,
 note VARCHAR(500) NOT NULL,
 evidence_id CHAR(36) NULL,
 created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
 KEY idx_stage_event (case_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS knowledge_entries (
 id INT AUTO_INCREMENT PRIMARY KEY,
 category VARCHAR(20) NOT NULL,
 title VARCHAR(200) NOT NULL,
 body MEDIUMTEXT NOT NULL,
 source_url VARCHAR(500) NOT NULL,
 issuer VARCHAR(100) NOT NULL,
 effective_at DATE NULL,
 review_status VARCHAR(16) NOT NULL DEFAULT 'draft',
 review_note VARCHAR(500),
 created_by INT NOT NULL,
 created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
 KEY idx_knowledge_status (review_status,category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS compliance_subscriptions (
 enterprise_id INT PRIMARY KEY,
 enabled TINYINT NOT NULL DEFAULT 1,
 policy_updates TINYINT NOT NULL DEFAULT 1,
 repeat_days INT NOT NULL DEFAULT 30,
 next_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS compliance_notices (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 enterprise_id INT NOT NULL,
 kind VARCHAR(20) NOT NULL,
 title VARCHAR(200) NOT NULL,
 body TEXT NOT NULL,
 source_url VARCHAR(500),
 case_id VARCHAR(64),
 dedup_key CHAR(64) NOT NULL UNIQUE,
 created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
 KEY idx_notice_enterprise (enterprise_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS notice_receipts (
 notice_id BIGINT NOT NULL,
 user_id INT NOT NULL,
 read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (notice_id,user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS purpose_shares (
 id CHAR(36) PRIMARY KEY,
 case_id VARCHAR(64) NOT NULL,
 certificate_code VARCHAR(64) NOT NULL,
 purpose VARCHAR(20) NOT NULL,
 recipient VARCHAR(200),
 token_hash CHAR(64) NOT NULL UNIQUE,
 expires_ts BIGINT NOT NULL,
 revoked_at DATETIME NULL,
 created_by INT NOT NULL,
 created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
 KEY idx_share_case (case_id,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS objection_revisions (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 objection_id INT NOT NULL,
 version INT NOT NULL,
 body_html MEDIUMTEXT NOT NULL,
 note TEXT NOT NULL,
 actor_id INT NULL,
 created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_objection_revision (objection_id,version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS objection_followups (
 objection_id INT PRIMARY KEY,
 remind_date DATE NULL,
 updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
