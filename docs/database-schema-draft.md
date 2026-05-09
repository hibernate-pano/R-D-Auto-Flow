# 数据库 Schema 草案：R&D Auto Flow MVP

## 1. 文档定位

- 文档类型：数据库 Schema 草案
- 对应文档：
  - [canonical-workflow-spec.md](/Users/panbo/Code/Work-HSBC/R&D-Auto-Flow/docs/canonical-workflow-spec.md)
  - [mvp-technical-design.md](/Users/panbo/Code/Work-HSBC/R&D-Auto-Flow/docs/mvp-technical-design.md)
  - [backend-implementation-plan.md](/Users/panbo/Code/Work-HSBC/R&D-Auto-Flow/docs/backend-implementation-plan.md)
  - [api-contract.md](/Users/panbo/Code/Work-HSBC/R&D-Auto-Flow/docs/api-contract.md)
- 目标：定义 MVP 阶段数据库表、字段、约束、索引与关系

---

## 2. 设计原则

1. 以关系型数据库为基础
2. 关键状态字段使用枚举字符串
3. 历史记录不覆盖，尽量追加
4. 审计与运行日志分开存储
5. 对不稳定结构使用 JSON 字段，但核心检索字段必须结构化

MVP 推荐数据库：

- PostgreSQL

---

## 3. 表关系概览

核心关系如下：

1. 一个 `work_items` 对应一个 Jira Ticket
2. 一个 `work_items` 可以对应多个 `flow_runs`
3. 一个 `flow_runs` 对应多个 `flow_stage_runs`
4. 一个 `flow_runs` 对应多个 `flow_logs`
5. 一个 `flow_runs` 对应多个 `manual_actions`
6. 一个 `flow_runs` 对应多个 `evidence_records`

关系示意：

`work_items -> flow_runs -> flow_stage_runs`

`flow_runs -> flow_logs`

`flow_runs -> manual_actions`

`flow_runs -> evidence_records`

---

## 4. 枚举约定

## 4.1 flow_overall_status

- `pending`
- `running`
- `waiting_manual_action`
- `paused`
- `failed`
- `completed`
- `cancelled`

## 4.2 flow_trigger_mode

- `manual_start`
- `rerun`
- `resume_from_failure`

## 4.3 stage_name

- `manual_request_received`
- `jira_ticket_fetching`
- `jira_ticket_normalized`
- `confluence_links_extracting`
- `source_pages_fetching`
- `analysis_generating`
- `analysis_page_creating`
- `analysis_approval_waiting`
- `repo_resolving`
- `branch_preparing`
- `implementation_waiting`
- `verification_waiting`
- `verification_approval_waiting`
- `confluence_result_updating`
- `jira_status_updating`
- `completed`

## 4.4 stage_status

- `pending`
- `running`
- `succeeded`
- `failed`
- `skipped`
- `waiting_manual_action`

## 4.5 log_level

- `debug`
- `info`
- `warn`
- `error`

## 4.6 manual_action_type

- `pause`
- `resume`
- `cancel`
- `retry_stage`
- `skip_stage`
- `set_repo_override`
- `set_confluence_links`
- `approve_analysis`
- `request_analysis_changes`
- `approve_verification`
- `request_verification_changes`

## 4.7 manual_action_result

- `accepted`
- `rejected`
- `applied`
- `failed`

## 4.8 evidence_type

- `analysis_snapshot`
- `branch_snapshot`
- `implementation_note`
- `test_execution`
- `manual_verification`
- `approval_decision`
- `final_writeback`

---

## 5. 表设计

## 5.1 work_items

### 作用

存储 Jira Ticket 维度的稳定业务对象。

### 字段建议

| 字段名 | 类型 | 说明 |
|---|---|---|
| `id` | `uuid` | 主键 |
| `jira_key` | `varchar(64)` | Jira Key，唯一 |
| `jira_url` | `text` | Jira URL |
| `jira_title` | `text` | Ticket 标题 |
| `jira_description` | `text` | Ticket 描述 |
| `jira_status` | `varchar(128)` | Jira 当前状态名 |
| `jira_project_key` | `varchar(64)` | Jira Project Key |
| `assignee` | `varchar(128)` | 当前处理人 |
| `source_confluence_urls_json` | `jsonb` | 源页面 URL 列表 |
| `source_confluence_digest_json` | `jsonb` | 源页面摘要 |
| `analysis_page_url` | `text` | 生成的分析页 URL |
| `analysis_page_id` | `varchar(128)` | Confluence Page ID |
| `repo_name` | `varchar(255)` | 目标 Repo 名称 |
| `repo_url` | `text` | 目标 Repo URL |
| `base_branch` | `varchar(128)` | 基线分支，由 repo 默认分支或显式配置解析得到 |
| `base_commit_sha` | `varchar(64)` | 创建工作分支时使用的基线提交 |
| `working_branch` | `varchar(128)` | 工作分支，MVP 为 Jira Key |
| `implementation_summary` | `text` | 实现结果摘要 |
| `test_summary` | `text` | 测试结果摘要 |
| `last_sync_at` | `timestamptz` | 最近一次同步外部信息时间 |
| `created_at` | `timestamptz` | 创建时间 |
| `updated_at` | `timestamptz` | 更新时间 |

### 约束建议

1. 主键：`id`
2. 唯一键：`jira_key`
3. 非空字段：
   - `id`
   - `jira_key`
   - `created_at`
   - `updated_at`

### 索引建议

1. `ux_work_items_jira_key`
2. `idx_work_items_jira_project_key`
3. `idx_work_items_updated_at`

---

## 5.2 flow_runs

### 作用

记录一次完整 Flow 执行。

### 字段建议

| 字段名 | 类型 | 说明 |
|---|---|---|
| `id` | `uuid` | 主键 |
| `work_item_id` | `uuid` | 关联 `work_items.id` |
| `trigger_mode` | `varchar(64)` | 启动方式 |
| `current_stage` | `varchar(128)` | 当前阶段 |
| `overall_status` | `varchar(64)` | 总状态 |
| `blocking_reason_code` | `varchar(128)` | 稳定阻塞原因码 |
| `blocking_reason_message` | `text` | 面向操作者的阻塞原因 |
| `manual_action_required` | `boolean` | 是否需要人工处理 |
| `manual_action_type` | `varchar(64)` | 当前期待的人工作类型 |
| `operator_id` | `varchar(128)` | 发起人 ID |
| `operator_email` | `varchar(255)` | 发起人邮箱 |
| `operator_display_name` | `varchar(255)` | 发起人展示名 |
| `operator_capabilities_json` | `jsonb` | 发起时的能力快照 |
| `source_flow_run_id` | `uuid` | 源执行，重跑/恢复时使用 |
| `resume_from_stage` | `varchar(128)` | 恢复起点阶段 |
| `repo_override` | `varchar(255)` | 手工覆盖 Repo |
| `started_at` | `timestamptz` | 开始时间 |
| `updated_at` | `timestamptz` | 更新时间 |
| `completed_at` | `timestamptz` | 完成时间 |

### 约束建议

1. 主键：`id`
2. 外键：`work_item_id -> work_items.id`
3. 非空字段：
   - `id`
   - `work_item_id`
   - `trigger_mode`
   - `current_stage`
   - `overall_status`
   - `operator_id`
   - `started_at`
   - `updated_at`

### 索引建议

1. `idx_flow_runs_work_item_id`
2. `idx_flow_runs_overall_status`
3. `idx_flow_runs_current_stage`
4. `idx_flow_runs_started_at_desc`
5. `idx_flow_runs_manual_action_required`

### 并发控制建议

为了避免一个 Jira Ticket 被无提示并发执行：

1. 业务层检查 `work_item_id` 下是否存在 `running` / `waiting_manual_action` / `paused` 状态的 Flow
2. 不建议仅靠数据库唯一索引硬控，因为还要支持显式重跑
3. 阻塞原因必须同时写入 `blocking_reason_code` 与 `blocking_reason_message`

---

## 5.3 flow_stage_runs

### 作用

记录每个阶段的执行历史与重试信息。

### 字段建议

| 字段名 | 类型 | 说明 |
|---|---|---|
| `id` | `uuid` | 主键 |
| `flow_run_id` | `uuid` | 关联 `flow_runs.id` |
| `stage_name` | `varchar(128)` | 阶段名 |
| `status` | `varchar(64)` | 阶段状态 |
| `attempt_no` | `integer` | 第几次尝试 |
| `started_at` | `timestamptz` | 开始时间 |
| `finished_at` | `timestamptz` | 结束时间 |
| `duration_ms` | `bigint` | 耗时 |
| `error_code` | `varchar(128)` | 错误码 |
| `error_message` | `text` | 错误摘要 |
| `requires_manual_action` | `boolean` | 是否需人工处理 |
| `manual_action_type` | `varchar(64)` | 期待的人工作类型 |
| `lease_owner` | `varchar(128)` | 当前执行租约持有者 |
| `lease_expires_at` | `timestamptz` | 当前执行租约过期时间 |
| `last_heartbeat_at` | `timestamptz` | 最近心跳时间 |
| `input_snapshot_json` | `jsonb` | 输入快照 |
| `output_snapshot_json` | `jsonb` | 输出快照 |
| `created_at` | `timestamptz` | 创建时间 |

### 约束建议

1. 主键：`id`
2. 外键：`flow_run_id -> flow_runs.id`
3. 非空字段：
   - `id`
   - `flow_run_id`
   - `stage_name`
   - `status`
   - `attempt_no`
   - `started_at`
   - `created_at`

### 索引建议

1. `idx_stage_runs_flow_run_id`
2. `idx_stage_runs_stage_name`
3. `idx_stage_runs_status`
4. `ux_stage_runs_flow_stage_attempt`
5. `idx_stage_runs_lease_expires_at`

`ux_stage_runs_flow_stage_attempt` 建议为：

`(flow_run_id, stage_name, attempt_no)` 唯一

---

## 5.4 flow_logs

### 作用

记录 Flow 运行中的摘要日志与错误日志。

### 字段建议

| 字段名 | 类型 | 说明 |
|---|---|---|
| `id` | `uuid` | 主键 |
| `flow_run_id` | `uuid` | 关联 `flow_runs.id` |
| `stage_name` | `varchar(128)` | 所属阶段 |
| `level` | `varchar(32)` | 日志级别 |
| `event_type` | `varchar(128)` | 事件类型 |
| `message` | `text` | 摘要日志 |
| `details_json` | `jsonb` | 详细内容 |
| `related_object_type` | `varchar(64)` | 关联对象类型 |
| `related_object_id` | `varchar(128)` | 关联对象 ID |
| `redacted` | `boolean` | 是否已脱敏 |
| `created_at` | `timestamptz` | 创建时间 |

### 约束建议

1. 主键：`id`
2. 外键：`flow_run_id -> flow_runs.id`
3. 非空字段：
   - `id`
   - `flow_run_id`
   - `level`
   - `event_type`
   - `message`
   - `redacted`
   - `created_at`

### 索引建议

1. `idx_flow_logs_flow_run_id_created_at`
2. `idx_flow_logs_stage_name`
3. `idx_flow_logs_level`
4. `idx_flow_logs_event_type`

---

## 5.5 manual_actions

### 作用

记录人工干预行为与结果。

### 字段建议

| 字段名 | 类型 | 说明 |
|---|---|---|
| `id` | `uuid` | 主键 |
| `flow_run_id` | `uuid` | 关联 `flow_runs.id` |
| `action_type` | `varchar(64)` | 动作类型 |
| `payload_json` | `jsonb` | 动作参数 |
| `note` | `text` | 人工备注 |
| `operator_id` | `varchar(128)` | 操作人 ID |
| `operator_email` | `varchar(255)` | 操作人邮箱 |
| `operator_display_name` | `varchar(255)` | 操作人展示名 |
| `operator_capabilities_json` | `jsonb` | 操作时能力快照 |
| `result` | `varchar(64)` | 动作结果 |
| `created_at` | `timestamptz` | 创建时间 |

### 约束建议

1. 主键：`id`
2. 外键：`flow_run_id -> flow_runs.id`
3. 非空字段：
   - `id`
   - `flow_run_id`
   - `action_type`
   - `operator_id`
   - `result`
   - `created_at`

### 索引建议

1. `idx_manual_actions_flow_run_id`
2. `idx_manual_actions_action_type`
3. `idx_manual_actions_created_at_desc`

---

## 5.6 evidence_records

### 作用

记录结构化执行证据，支撑关闭门禁与审计。

### 字段建议

| 字段名 | 类型 | 说明 |
|---|---|---|
| `id` | `uuid` | 主键 |
| `flow_run_id` | `uuid` | 关联 `flow_runs.id` |
| `stage_name` | `varchar(128)` | 所属阶段 |
| `evidence_type` | `varchar(64)` | 证据类型 |
| `payload_json` | `jsonb` | 结构化证据内容 |
| `operator_id` | `varchar(128)` | 记录人 ID |
| `operator_email` | `varchar(255)` | 记录人邮箱 |
| `operator_display_name` | `varchar(255)` | 记录人展示名 |
| `source_system` | `varchar(64)` | `system` / `operator` / `external_executor` |
| `created_at` | `timestamptz` | 创建时间 |

### 约束建议

1. 主键：`id`
2. 外键：`flow_run_id -> flow_runs.id`
3. 非空字段：
   - `id`
   - `flow_run_id`
   - `stage_name`
   - `evidence_type`
   - `payload_json`
   - `operator_id`
   - `created_at`

### 索引建议

1. `idx_evidence_records_flow_run_id`
2. `idx_evidence_records_stage_name`
3. `idx_evidence_records_evidence_type`

---

## 6. DDL 草案

以下为接近 PostgreSQL 的示意 DDL。

## 6.1 work_items

```sql
create table work_items (
  id uuid primary key,
  jira_key varchar(64) not null,
  jira_url text,
  jira_title text,
  jira_description text,
  jira_status varchar(128),
  jira_project_key varchar(64),
  assignee varchar(128),
  source_confluence_urls_json jsonb not null default '[]'::jsonb,
  source_confluence_digest_json jsonb,
  analysis_page_url text,
  analysis_page_id varchar(128),
  repo_name varchar(255),
  repo_url text,
  base_branch varchar(128) not null,
  base_commit_sha varchar(64),
  working_branch varchar(128),
  implementation_summary text,
  test_summary text,
  last_sync_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create unique index ux_work_items_jira_key on work_items (jira_key);
create index idx_work_items_jira_project_key on work_items (jira_project_key);
create index idx_work_items_updated_at on work_items (updated_at desc);
```

## 6.2 flow_runs

```sql
create table flow_runs (
  id uuid primary key,
  work_item_id uuid not null references work_items(id),
  trigger_mode varchar(64) not null,
  current_stage varchar(128) not null,
  overall_status varchar(64) not null,
  blocking_reason_code varchar(128),
  blocking_reason_message text,
  manual_action_required boolean not null default false,
  manual_action_type varchar(64),
  operator_id varchar(128) not null,
  operator_email varchar(255) not null,
  operator_display_name varchar(255) not null,
  operator_capabilities_json jsonb not null default '[]'::jsonb,
  source_flow_run_id uuid references flow_runs(id),
  resume_from_stage varchar(128),
  repo_override varchar(255),
  started_at timestamptz not null,
  updated_at timestamptz not null,
  completed_at timestamptz
);

create index idx_flow_runs_work_item_id on flow_runs (work_item_id);
create index idx_flow_runs_overall_status on flow_runs (overall_status);
create index idx_flow_runs_current_stage on flow_runs (current_stage);
create index idx_flow_runs_started_at_desc on flow_runs (started_at desc);
create index idx_flow_runs_manual_action_required on flow_runs (manual_action_required);
```

## 6.3 flow_stage_runs

```sql
create table flow_stage_runs (
  id uuid primary key,
  flow_run_id uuid not null references flow_runs(id),
  stage_name varchar(128) not null,
  status varchar(64) not null,
  attempt_no integer not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  duration_ms bigint,
  error_code varchar(128),
  error_message text,
  requires_manual_action boolean not null default false,
  manual_action_type varchar(64),
  lease_owner varchar(128),
  lease_expires_at timestamptz,
  last_heartbeat_at timestamptz,
  input_snapshot_json jsonb,
  output_snapshot_json jsonb,
  created_at timestamptz not null
);

create unique index ux_stage_runs_flow_stage_attempt
  on flow_stage_runs (flow_run_id, stage_name, attempt_no);

create index idx_stage_runs_flow_run_id on flow_stage_runs (flow_run_id);
create index idx_stage_runs_stage_name on flow_stage_runs (stage_name);
create index idx_stage_runs_status on flow_stage_runs (status);
create index idx_stage_runs_lease_expires_at on flow_stage_runs (lease_expires_at);
```

## 6.4 flow_logs

```sql
create table flow_logs (
  id uuid primary key,
  flow_run_id uuid not null references flow_runs(id),
  stage_name varchar(128),
  level varchar(32) not null,
  event_type varchar(128) not null,
  message text not null,
  details_json jsonb,
  related_object_type varchar(64),
  related_object_id varchar(128),
  redacted boolean not null default true,
  created_at timestamptz not null
);

create index idx_flow_logs_flow_run_id_created_at
  on flow_logs (flow_run_id, created_at desc);
create index idx_flow_logs_stage_name on flow_logs (stage_name);
create index idx_flow_logs_level on flow_logs (level);
create index idx_flow_logs_event_type on flow_logs (event_type);
```

## 6.5 manual_actions

```sql
create table manual_actions (
  id uuid primary key,
  flow_run_id uuid not null references flow_runs(id),
  action_type varchar(64) not null,
  payload_json jsonb not null default '{}'::jsonb,
  note text,
  operator_id varchar(128) not null,
  operator_email varchar(255) not null,
  operator_display_name varchar(255) not null,
  operator_capabilities_json jsonb not null default '[]'::jsonb,
  result varchar(64) not null,
  created_at timestamptz not null
);

create index idx_manual_actions_flow_run_id on manual_actions (flow_run_id);
create index idx_manual_actions_action_type on manual_actions (action_type);
create index idx_manual_actions_created_at_desc on manual_actions (created_at desc);
```

## 6.6 evidence_records

```sql
create table evidence_records (
  id uuid primary key,
  flow_run_id uuid not null references flow_runs(id),
  stage_name varchar(128) not null,
  evidence_type varchar(64) not null,
  payload_json jsonb not null,
  operator_id varchar(128) not null,
  operator_email varchar(255) not null,
  operator_display_name varchar(255) not null,
  source_system varchar(64) not null,
  created_at timestamptz not null
);

create index idx_evidence_records_flow_run_id on evidence_records (flow_run_id);
create index idx_evidence_records_stage_name on evidence_records (stage_name);
create index idx_evidence_records_evidence_type on evidence_records (evidence_type);
```

---

## 7. 典型查询场景

## 7.1 Flow 列表页查询

目标：

1. 按状态筛选
2. 按阶段筛选
3. 按 Jira Key 搜索
4. 按更新时间倒序

建议主查询依赖：

- `flow_runs`
- `work_items`

## 7.2 Flow 详情页查询

目标：

1. 取单个 FlowRun
2. 取对应 WorkItem
3. 取全部阶段历史
4. 取最近日志
5. 取人工动作历史

## 7.3 日志分页查询

目标：

1. 按 `flow_run_id`
2. 按 `created_at desc`
3. 支持按阶段和级别过滤

---

## 8. 数据一致性策略

## 8.1 work_items 与 flow_runs

1. `work_items` 代表 Ticket 维度事实
2. `flow_runs` 代表一次执行事实
3. 不应把执行状态写回 `work_items`
4. 若需要“当前最新执行摘要”，应作为投影视图或查询拼装结果，而不是把运行态反写到 `work_items`

## 8.2 阶段与总状态

1. `flow_runs.current_stage` 保存当前游标
2. `flow_stage_runs` 保存历史明细
3. 当前状态由 `flow_runs` 作为快速查询主入口
4. 自动阶段执行必须基于 `flow_stage_runs` 的租约字段进行排他推进

## 8.3 日志与审计

1. `flow_logs` 记录系统过程
2. `manual_actions` 记录人工决策
3. 不建议混成一张表

---

## 9. 清理与归档建议

MVP 阶段不建议复杂归档，但建议预留策略：

1. `flow_logs` 可按时间进行历史归档
2. 已完成 Flow 的详情仍需长期可查
3. `manual_actions` 不应被轻易删除

---

## 10. 风险点

## 10.1 过度使用 JSON 字段

风险：

- 查询复杂
- 后期迁移困难

对策：

- 核心筛选字段结构化
- 只把不稳定扩展字段放到 JSON

## 10.2 并发重复启动

风险：

- 同一 Jira Ticket 出现多个运行中 Flow

对策：

- 业务层冲突检查
- API 返回 `FLOW_CONFLICT`

## 10.3 日志量增长

风险：

- `flow_logs` 增长过快

对策：

- 摘要日志优先
- 大对象只写必要字段
- 后续归档

---

## 11. 总结

这份 Schema 草案的核心目标是把三件事固定下来：

1. Ticket 事实怎么存
2. Flow 执行历史怎么存
3. 日志和人工动作怎么存

只要这三层稳定，后端状态机、API、前端工作台就能围绕它持续演进。
