-- Migration 001: Initial schema for R&D Auto Flow MVP
-- 6 tables: work_items, flow_runs, flow_stage_runs, flow_logs, manual_actions, evidence_records

BEGIN;

-- 5.1 work_items
CREATE TABLE work_items (
  id UUID PRIMARY KEY,
  jira_key VARCHAR(64) NOT NULL,
  jira_url TEXT,
  jira_title TEXT,
  jira_description TEXT,
  jira_status VARCHAR(128),
  jira_project_key VARCHAR(64),
  assignee VARCHAR(128),
  source_confluence_urls_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  source_confluence_digest_json JSONB,
  analysis_page_url TEXT,
  analysis_page_id VARCHAR(128),
  repo_name VARCHAR(255),
  repo_url TEXT,
  base_branch VARCHAR(128),
  base_commit_sha VARCHAR(64),
  working_branch VARCHAR(128),
  implementation_summary TEXT,
  test_summary TEXT,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX ux_work_items_jira_key ON work_items (jira_key);
CREATE INDEX idx_work_items_jira_project_key ON work_items (jira_project_key);
CREATE INDEX idx_work_items_updated_at ON work_items (updated_at DESC);

-- 5.2 flow_runs
CREATE TABLE flow_runs (
  id UUID PRIMARY KEY,
  work_item_id UUID NOT NULL REFERENCES work_items(id),
  trigger_mode VARCHAR(64) NOT NULL,
  current_stage VARCHAR(128) NOT NULL,
  overall_status VARCHAR(64) NOT NULL,
  blocking_reason_code VARCHAR(128),
  blocking_reason_message TEXT,
  manual_action_required BOOLEAN NOT NULL DEFAULT false,
  manual_action_type VARCHAR(64),
  operator_id VARCHAR(128) NOT NULL,
  operator_email VARCHAR(255) NOT NULL,
  operator_display_name VARCHAR(255) NOT NULL,
  operator_capabilities_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  source_flow_run_id UUID,
  resume_from_stage VARCHAR(128),
  repo_override VARCHAR(255),
  started_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_flow_runs_work_item_id ON flow_runs (work_item_id);
CREATE INDEX idx_flow_runs_overall_status ON flow_runs (overall_status);
CREATE INDEX idx_flow_runs_current_stage ON flow_runs (current_stage);
CREATE INDEX idx_flow_runs_started_at_desc ON flow_runs (started_at DESC);
CREATE INDEX idx_flow_runs_manual_action_required ON flow_runs (manual_action_required);

-- 5.3 flow_stage_runs
CREATE TABLE flow_stage_runs (
  id UUID PRIMARY KEY,
  flow_run_id UUID NOT NULL REFERENCES flow_runs(id),
  stage_name VARCHAR(128) NOT NULL,
  status VARCHAR(64) NOT NULL,
  attempt_no INTEGER NOT NULL DEFAULT 1,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  duration_ms BIGINT,
  error_code VARCHAR(128),
  error_message TEXT,
  requires_manual_action BOOLEAN NOT NULL DEFAULT false,
  manual_action_type VARCHAR(64),
  lease_owner VARCHAR(128),
  lease_expires_at TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ,
  input_snapshot_json JSONB,
  output_snapshot_json JSONB,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_stage_runs_flow_run_id ON flow_stage_runs (flow_run_id);
CREATE INDEX idx_stage_runs_stage_name ON flow_stage_runs (stage_name);
CREATE INDEX idx_stage_runs_status ON flow_stage_runs (status);
CREATE INDEX ux_stage_runs_flow_stage_attempt ON flow_stage_runs (flow_run_id, stage_name, attempt_no);
CREATE INDEX idx_stage_runs_lease_expires_at ON flow_stage_runs (lease_expires_at);

-- 5.4 flow_logs
CREATE TABLE flow_logs (
  id UUID PRIMARY KEY,
  flow_run_id UUID NOT NULL REFERENCES flow_runs(id),
  stage_name VARCHAR(128),
  level VARCHAR(32) NOT NULL,
  event_type VARCHAR(128) NOT NULL,
  message TEXT NOT NULL,
  details_json JSONB,
  related_object_type VARCHAR(64),
  related_object_id VARCHAR(128),
  redacted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_flow_logs_flow_run_id_created_at ON flow_logs (flow_run_id, created_at DESC);
CREATE INDEX idx_flow_logs_stage_name ON flow_logs (stage_name);
CREATE INDEX idx_flow_logs_level ON flow_logs (level);
CREATE INDEX idx_flow_logs_event_type ON flow_logs (event_type);

-- 5.5 manual_actions
CREATE TABLE manual_actions (
  id UUID PRIMARY KEY,
  flow_run_id UUID NOT NULL REFERENCES flow_runs(id),
  action_type VARCHAR(64) NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  note TEXT,
  operator_id VARCHAR(128) NOT NULL,
  operator_email VARCHAR(255) NOT NULL,
  operator_display_name VARCHAR(255) NOT NULL,
  operator_capabilities_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  result VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_manual_actions_flow_run_id ON manual_actions (flow_run_id);
CREATE INDEX idx_manual_actions_action_type ON manual_actions (action_type);
CREATE INDEX idx_manual_actions_created_at_desc ON manual_actions (created_at DESC);

-- 5.6 evidence_records
CREATE TABLE evidence_records (
  id UUID PRIMARY KEY,
  flow_run_id UUID NOT NULL REFERENCES flow_runs(id),
  stage_name VARCHAR(128) NOT NULL,
  evidence_type VARCHAR(64) NOT NULL,
  payload_json JSONB NOT NULL,
  operator_id VARCHAR(128) NOT NULL,
  operator_email VARCHAR(255) NOT NULL,
  operator_display_name VARCHAR(255) NOT NULL,
  source_system VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_evidence_records_flow_run_id ON evidence_records (flow_run_id);
CREATE INDEX idx_evidence_records_stage_name ON evidence_records (stage_name);
CREATE INDEX idx_evidence_records_evidence_type ON evidence_records (evidence_type);

COMMIT;
