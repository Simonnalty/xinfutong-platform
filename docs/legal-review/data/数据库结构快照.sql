-- 本地演示数据库结构快照，不含业务记录
-- 2026-11-03T02:58:39.406Z
SET NAMES utf8mb4;

CREATE TABLE `alerts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `enterprise_id` int(11) DEFAULT NULL,
  `case_id` varchar(64) DEFAULT NULL,
  `policy_id` int(11) DEFAULT NULL,
  `due_at` datetime DEFAULT NULL,
  `channel` varchar(20) DEFAULT 'inapp',
  `status` varchar(16) DEFAULT 'pending',
  `read_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `audit_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `actor_id` int(11) DEFAULT NULL,
  `action` varchar(60) NOT NULL,
  `target` varchar(100) DEFAULT NULL,
  `detail` varchar(500) DEFAULT NULL,
  `ip` varchar(64) DEFAULT NULL,
  `at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_audit_actor` (`actor_id`,`at`)
) ENGINE=InnoDB AUTO_INCREMENT=59 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `cases` (
  `id` varchar(64) NOT NULL,
  `enterprise_id` int(11) NOT NULL,
  `type` varchar(30) NOT NULL,
  `event` varchar(500) NOT NULL,
  `authority` varchar(200) DEFAULT NULL,
  `doc_no` varchar(120) DEFAULT NULL,
  `listed_date` date DEFAULT NULL,
  `removed_date` date DEFAULT NULL,
  `level` varchar(20) NOT NULL,
  `stage` varchar(20) NOT NULL DEFAULT 'draft',
  `progress` tinyint(4) NOT NULL DEFAULT 0,
  `apply_from` date DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `closed_at` datetime DEFAULT NULL,
  `obligation_at` date DEFAULT NULL,
  `rectified` tinyint(4) DEFAULT NULL,
  `rectify_at` date DEFAULT NULL,
  `no_new_similar` tinyint(4) DEFAULT NULL,
  `fine_amount` decimal(12,2) DEFAULT NULL,
  `discretion` varchar(16) DEFAULT NULL,
  `facts_updated_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_case_ent` (`enterprise_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `case_channels` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `case_id` varchar(64) NOT NULL,
  `channel_code` varchar(40) NOT NULL,
  `channel_name` varchar(100) NOT NULL,
  `state` varchar(16) NOT NULL DEFAULT 'idle',
  `note` varchar(300) DEFAULT NULL,
  `first_seen_at` datetime DEFAULT NULL,
  `last_checked_at` datetime DEFAULT NULL,
  `sort` int(11) DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_case_channel` (`case_id`,`channel_code`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `case_docs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `case_id` varchar(64) NOT NULL,
  `doc_key` varchar(32) NOT NULL,
  `html` mediumtext NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'template',
  `source` varchar(16) NOT NULL DEFAULT 'template',
  `version` int(11) NOT NULL DEFAULT 1,
  `updated_by` int(11) DEFAULT NULL,
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_case_doc` (`case_id`,`doc_key`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `certificates` (
  `code` varchar(64) NOT NULL,
  `case_id` varchar(64) NOT NULL,
  `doc_no` varchar(120) DEFAULT NULL,
  `digest` char(64) NOT NULL,
  `prev_hash` char(64) NOT NULL,
  `signature` varchar(200) NOT NULL,
  `issued_at` datetime NOT NULL,
  `valid_until` date DEFAULT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'valid',
  `revoked_reason` varchar(300) DEFAULT NULL,
  `revoked_at` datetime DEFAULT NULL,
  PRIMARY KEY (`code`),
  KEY `idx_cert_case` (`case_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `certificate_snapshots` (
  `code` varchar(64) NOT NULL,
  `case_id` varchar(64) NOT NULL,
  `version` int(11) NOT NULL,
  `content` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`content`)),
  `content_hash` char(64) NOT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`code`),
  UNIQUE KEY `uq_cert_case_version` (`case_id`,`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `cert_scans` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `code` varchar(64) NOT NULL,
  `at` datetime DEFAULT current_timestamp(),
  `ip` varchar(64) DEFAULT NULL,
  `ua` varchar(300) DEFAULT NULL,
  `result` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_scan_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `channel_configs` (
  `case_id` varchar(64) NOT NULL,
  `channel_code` varchar(40) NOT NULL,
  `provider` varchar(20) NOT NULL DEFAULT 'manual',
  `latest_snapshot` int(11) DEFAULT NULL,
  `last_error` varchar(300) DEFAULT NULL,
  PRIMARY KEY (`case_id`,`channel_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `channel_snapshots` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `case_id` varchar(64) NOT NULL,
  `channel_code` varchar(40) NOT NULL,
  `fetched_at` datetime NOT NULL,
  `payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`payload`)),
  `digest` char(64) NOT NULL,
  `source` varchar(20) NOT NULL DEFAULT 'mock',
  `run_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_snap_case` (`case_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `checks_runs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `case_id` varchar(64) NOT NULL,
  `started_at` datetime NOT NULL,
  `finished_at` datetime DEFAULT NULL,
  `diffs` int(11) DEFAULT 0,
  `digest` char(64) DEFAULT NULL,
  `trigger_by` varchar(40) DEFAULT 'manual',
  PRIMARY KEY (`id`),
  KEY `idx_run_case` (`case_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `compliance_notices` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `enterprise_id` int(11) NOT NULL,
  `kind` varchar(20) NOT NULL,
  `title` varchar(200) NOT NULL,
  `body` text NOT NULL,
  `source_url` varchar(500) DEFAULT NULL,
  `case_id` varchar(64) DEFAULT NULL,
  `dedup_key` char(64) NOT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `dedup_key` (`dedup_key`),
  KEY `idx_notice_enterprise` (`enterprise_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `compliance_subscriptions` (
  `enterprise_id` int(11) NOT NULL,
  `enabled` tinyint(4) NOT NULL DEFAULT 1,
  `policy_updates` tinyint(4) NOT NULL DEFAULT 1,
  `repeat_days` int(11) NOT NULL DEFAULT 30,
  `next_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`enterprise_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `diagnoses` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `case_id` varchar(64) NOT NULL,
  `level` varchar(20) DEFAULT NULL,
  `apply_from` date DEFAULT NULL,
  `conditions` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`conditions`)),
  `basis` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`basis`)),
  `score` tinyint(4) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_diag_case` (`case_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `diagnosis_snapshots` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `diagnosis_id` int(11) NOT NULL,
  `case_id` varchar(64) NOT NULL,
  `content` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`content`)),
  `digest` char(64) NOT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_diagnosis_case` (`case_id`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `doc_checks` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `case_id` varchar(64) NOT NULL,
  `result` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`result`)),
  `score` tinyint(4) DEFAULT NULL,
  `checked_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_check_case` (`case_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `doc_templates` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `doc_key` varchar(32) NOT NULL,
  `version` int(11) NOT NULL DEFAULT 1,
  `title` varchar(100) NOT NULL,
  `slots` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`slots`)),
  `body` mediumtext DEFAULT NULL,
  `effective_from` datetime DEFAULT current_timestamp(),
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_doc_ver` (`doc_key`,`version`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `doc_versions` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `case_id` varchar(64) NOT NULL,
  `doc_key` varchar(32) NOT NULL,
  `version` int(11) NOT NULL,
  `html` mediumtext NOT NULL,
  `source` varchar(32) NOT NULL,
  `created_by` bigint(20) unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_doc_version` (`case_id`,`doc_key`,`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `enterprises` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(200) NOT NULL,
  `credit_code` char(18) NOT NULL,
  `legal` varchar(50) DEFAULT NULL,
  `industry` varchar(60) DEFAULT NULL,
  `region` varchar(60) DEFAULT NULL,
  `scale` varchar(40) DEFAULT NULL,
  `contact` varchar(50) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `credit_code` (`credit_code`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `enterprise_members` (
  `enterprise_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `role` varchar(20) NOT NULL DEFAULT 'staff',
  `granted_at` datetime DEFAULT current_timestamp(),
  `revoked_at` datetime DEFAULT NULL,
  PRIMARY KEY (`enterprise_id`,`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `evidence_files` (
  `id` char(36) NOT NULL,
  `case_id` varchar(64) NOT NULL,
  `kind` varchar(32) NOT NULL,
  `filename` varchar(200) NOT NULL,
  `media_type` varchar(100) NOT NULL,
  `byte_size` int(11) NOT NULL,
  `content` longblob NOT NULL,
  `digest` char(64) NOT NULL,
  `source` varchar(500) NOT NULL,
  `observed_at` date NOT NULL,
  `uploaded_by` int(11) NOT NULL,
  `review_status` varchar(20) NOT NULL DEFAULT 'recorded',
  `reviewed_by` int(11) DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `review_note` varchar(500) DEFAULT NULL,
  `archived` tinyint(4) NOT NULL DEFAULT 0,
  `archived_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_evidence_case` (`case_id`,`kind`,`archived`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `kb_articles` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `category` varchar(40) NOT NULL,
  `title` varchar(200) NOT NULL,
  `body` mediumtext DEFAULT NULL,
  `tags` varchar(200) DEFAULT NULL,
  `status` varchar(16) DEFAULT 'published',
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `knowledge_entries` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `category` varchar(20) NOT NULL,
  `title` varchar(200) NOT NULL,
  `body` mediumtext NOT NULL,
  `source_url` varchar(500) NOT NULL,
  `issuer` varchar(100) NOT NULL,
  `effective_at` date DEFAULT NULL,
  `review_status` varchar(16) NOT NULL DEFAULT 'draft',
  `review_note` varchar(500) DEFAULT NULL,
  `created_by` int(11) NOT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_knowledge_status` (`review_status`,`category`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `notice_receipts` (
  `notice_id` bigint(20) NOT NULL,
  `user_id` int(11) NOT NULL,
  `read_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`notice_id`,`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `objections` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `case_id` varchar(64) NOT NULL,
  `channel_code` varchar(40) NOT NULL,
  `body_html` mediumtext DEFAULT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'draft',
  `sent_at` datetime DEFAULT NULL,
  `reply_at` datetime DEFAULT NULL,
  `pdf_path` varchar(300) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_obj_case` (`case_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `objection_events` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `objection_id` int(11) NOT NULL,
  `status` varchar(16) NOT NULL,
  `note` varchar(500) NOT NULL,
  `evidence_id` char(36) DEFAULT NULL,
  `snapshot_id` int(11) DEFAULT NULL,
  `actor_id` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_objection_event` (`objection_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `objection_followups` (
  `objection_id` int(11) NOT NULL,
  `remind_date` date DEFAULT NULL,
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`objection_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `objection_revisions` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `objection_id` int(11) NOT NULL,
  `version` int(11) NOT NULL,
  `body_html` mediumtext NOT NULL,
  `note` text NOT NULL,
  `actor_id` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_objection_revision` (`objection_id`,`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `orgs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(200) NOT NULL,
  `type` varchar(20) NOT NULL,
  `credit_code` char(18) DEFAULT NULL,
  `contact` varchar(50) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'active',
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `org_enterprises` (
  `org_id` int(11) NOT NULL,
  `enterprise_id` int(11) NOT NULL,
  `perm` varchar(10) NOT NULL DEFAULT 'read',
  `note` varchar(200) DEFAULT NULL,
  `granted_at` datetime DEFAULT current_timestamp(),
  `revoked_at` datetime DEFAULT NULL,
  PRIMARY KEY (`org_id`,`enterprise_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `org_members` (
  `org_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `role` varchar(20) NOT NULL DEFAULT 'member',
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`org_id`,`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `policies` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `title` varchar(300) NOT NULL,
  `issuer` varchar(200) DEFAULT NULL,
  `published_at` date DEFAULT NULL,
  `effective_at` date DEFAULT NULL,
  `level` varchar(20) DEFAULT NULL,
  `summary` text DEFAULT NULL,
  `url` varchar(500) DEFAULT NULL,
  `tags` varchar(200) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `purpose_shares` (
  `id` char(36) NOT NULL,
  `case_id` varchar(64) NOT NULL,
  `certificate_code` varchar(64) NOT NULL,
  `purpose` varchar(20) NOT NULL,
  `recipient` varchar(200) DEFAULT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_ts` bigint(20) NOT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `created_by` int(11) NOT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `token_hash` (`token_hash`),
  KEY `idx_share_case` (`case_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `rule_params` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pkey` varchar(60) NOT NULL,
  `pvalue` varchar(500) NOT NULL,
  `note` varchar(300) DEFAULT NULL,
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `pkey` (`pkey`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `rule_versions` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `rule_key` varchar(80) NOT NULL,
  `version` int(11) NOT NULL,
  `title` varchar(200) NOT NULL,
  `case_type` varchar(20) NOT NULL,
  `level` varchar(20) NOT NULL,
  `authority_match` varchar(100) NOT NULL,
  `source_url` varchar(500) NOT NULL,
  `effective_from` date NOT NULL,
  `effective_until` date DEFAULT NULL,
  `review_status` varchar(20) NOT NULL DEFAULT 'draft',
  `review_note` varchar(500) NOT NULL,
  `definition` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`definition`)),
  `created_by` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_rule_version` (`rule_key`,`version`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `scheduled_jobs` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `case_id` varchar(64) NOT NULL,
  `kind` varchar(32) NOT NULL,
  `state` varchar(16) NOT NULL DEFAULT 'queued',
  `next_at` datetime NOT NULL,
  `interval_hours` int(11) NOT NULL DEFAULT 24,
  `attempts` int(11) NOT NULL DEFAULT 0,
  `lease_until` datetime DEFAULT NULL,
  `lease_token` char(36) DEFAULT NULL,
  `last_error` varchar(300) DEFAULT NULL,
  `last_run_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_job_case_kind` (`case_id`,`kind`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `sessions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `token` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `ip` varchar(64) DEFAULT NULL,
  `ua` varchar(300) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `token` (`token`),
  KEY `idx_session_user` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=31 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `stage_events` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `case_id` varchar(64) NOT NULL,
  `from_stage` varchar(20) NOT NULL,
  `to_stage` varchar(20) NOT NULL,
  `actor_id` int(11) DEFAULT NULL,
  `note` varchar(500) NOT NULL,
  `evidence_id` char(36) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_stage_event` (`case_id`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `subscriptions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `subject_type` varchar(20) NOT NULL,
  `subject_id` int(11) NOT NULL,
  `plan` varchar(40) NOT NULL,
  `quota` int(11) NOT NULL DEFAULT 0,
  `used` int(11) NOT NULL DEFAULT 0,
  `start_at` date DEFAULT NULL,
  `end_at` date DEFAULT NULL,
  `status` varchar(16) DEFAULT 'active',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `tasks` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `case_id` varchar(64) NOT NULL,
  `name` varchar(200) NOT NULL,
  `owner` varchar(50) DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'todo',
  `depends_on` int(11) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_task_case` (`case_id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `task_events` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `task_id` int(11) NOT NULL,
  `actor_id` int(11) NOT NULL,
  `note` varchar(500) NOT NULL,
  `evidence_id` char(36) DEFAULT NULL,
  `changes` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`changes`)),
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_task_events` (`task_id`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `timeline_events` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `case_id` varchar(64) NOT NULL,
  `at` datetime NOT NULL,
  `actor` varchar(50) DEFAULT NULL,
  `action` varchar(100) NOT NULL,
  `detail` varchar(500) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tl_case` (`case_id`,`at`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `usage_logs` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `subject_type` varchar(20) DEFAULT NULL,
  `subject_id` int(11) DEFAULT NULL,
  `kind` varchar(20) NOT NULL,
  `tokens_in` int(11) DEFAULT 0,
  `tokens_out` int(11) DEFAULT 0,
  `cost` decimal(10,4) DEFAULT 0.0000,
  `at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `phone` varchar(20) NOT NULL,
  `pwd_hash` varchar(200) NOT NULL,
  `name` varchar(50) DEFAULT NULL,
  `role` varchar(20) NOT NULL DEFAULT 'enterprise',
  `status` varchar(16) NOT NULL DEFAULT 'active',
  `created_at` datetime DEFAULT current_timestamp(),
  `last_login_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `phone` (`phone`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

