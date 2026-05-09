# Canonical Workflow Spec: R&D Auto Flow MVP

## 1. Purpose

This document is the authoritative workflow contract for MVP.

If other docs conflict with this file, this file wins.

It fixes eight things before implementation starts:

1. MVP boundary
2. canonical state machine
3. manual action and approval model
4. evidence and closure gate model
5. rerun / resume semantics
6. repository / branch contract
7. workflow runner semantics
8. authorization and actor model

---

## 2. MVP Boundary

MVP is an orchestration and governance system, not a fully autonomous implementation runtime.

In MVP, the system must:

1. accept a manually selected Jira ticket
2. fetch and normalize Jira context
3. read referenced Confluence pages
4. generate and create the analysis page
5. resolve the target GitHub repository
6. create or verify the working branch
7. track the implementation and verification stages as first-class workflow stages
8. collect structured implementation and test evidence
9. enforce approval and closure gates
10. write results back to Confluence and Jira

In MVP, the system does not have to:

1. autonomously modify repository code
2. autonomously run all test commands inside the target repository
3. provide a generic approval engine
4. support multi-repo orchestration

Interpretation:

- `implementation_waiting` means implementation is performed outside the workflow engine, but the workflow engine still owns state, evidence, audit, and closure gating.
- `verification_waiting` means verification evidence is produced outside the workflow engine, but the workflow engine still owns evidence capture, approval, and final closure gating.

### 2.1 Actor Model

MVP has three actor classes:

1. `system`
   - the workflow runner that advances automatic stages
2. `operator`
   - the human who starts a flow, submits evidence, or performs manual actions
3. `external_executor`
   - a human or external agent that performs implementation or verification outside the workflow engine

Rules:

1. the workflow engine owns orchestration state
2. implementation and test execution may happen outside the workflow engine
3. closure gates depend on persisted evidence, not on free-text claims
4. every manual action, evidence submission, and approval decision must persist an immutable actor snapshot

---

## 3. Canonical Workflow Vocabulary

### 3.1 Overall Status

These are the only allowed flow-level statuses in MVP:

- `pending`
- `running`
- `waiting_manual_action`
- `paused`
- `failed`
- `completed`
- `cancelled`

### 3.2 Stage Names

These are the only allowed stage names in MVP:

1. `manual_request_received`
2. `jira_ticket_fetching`
3. `jira_ticket_normalized`
4. `confluence_links_extracting`
5. `source_pages_fetching`
6. `analysis_generating`
7. `analysis_page_creating`
8. `analysis_approval_waiting`
9. `repo_resolving`
10. `branch_preparing`
11. `implementation_waiting`
12. `verification_waiting`
13. `verification_approval_waiting`
14. `confluence_result_updating`
15. `jira_status_updating`
16. `completed`

### 3.3 Stage Status

These are the only allowed stage-run statuses in MVP:

- `pending`
- `running`
- `succeeded`
- `failed`
- `skipped`
- `waiting_manual_action`

### 3.4 Blocking Model

Do not create ad hoc stages such as `awaiting-repo-resolution` or `branch-creation-failed`.

Blocking is expressed by:

1. current canonical stage
2. flow `overall_status`
3. `blocking_reason_code`
4. `blocking_reason_message`
5. `manual_action_required`
6. `manual_action_type`

`blocking_reason_code` is for stable programmatic handling.

`blocking_reason_message` is for operator-facing diagnosis.

---

## 4. Canonical Stage Flow

Primary path:

`manual_request_received`
-> `jira_ticket_fetching`
-> `jira_ticket_normalized`
-> `confluence_links_extracting`
-> `source_pages_fetching`
-> `analysis_generating`
-> `analysis_page_creating`
-> `analysis_approval_waiting`
-> `repo_resolving`
-> `branch_preparing`
-> `implementation_waiting`
-> `verification_waiting`
-> `verification_approval_waiting`
-> `confluence_result_updating`
-> `jira_status_updating`
-> `completed`

---

## 5. Approval Model

MVP supports two fixed approval checkpoints, not a generic configurable approval engine.

### 5.1 Fixed Checkpoints

1. analysis approval: after analysis page creation, before repository and implementation progression
2. verification approval: after verification evidence is recorded, before Confluence final writeback and Jira completion

### 5.2 Approval Outcomes

MVP approval outcomes are:

- `approved`
- `rejected`
- `changes_requested`

### 5.3 Approval Actions

The manual action vocabulary must include:

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

### 5.4 Approval Policy

MVP keeps approvals fixed, but they are still first-class records.

Each approval decision must persist:

1. `checkpoint`
2. `outcome`
3. `note`
4. immutable approver snapshot
5. decision timestamp

Minimum policy:

1. `approve_analysis` and `approve_verification` require explicit capability
2. `skip_stage`, `cancel`, and `set_repo_override` require explicit capability
3. self-approval is allowed only if the deployment policy explicitly permits it; otherwise the backend must reject it

---

## 6. Evidence Model

MVP must persist structured evidence. Logs and free-text summaries are not enough.

### 6.1 Evidence Record Types

At minimum, support these evidence types:

- `analysis_snapshot`
- `branch_snapshot`
- `implementation_note`
- `test_execution`
- `manual_verification`
- `approval_decision`
- `final_writeback`

### 6.2 Minimum Test Evidence Payload

Each test evidence record should support:

1. `command`
2. `result`
3. `summary`
4. `artifacts`
5. `coverage_note`
6. `risk_note`
7. `operator`
8. `recorded_at`

### 6.3 Evidence Ingress Contract

The system must expose a structured evidence ingress surface.

Minimum API surface:

1. `GET /api/flows/{flowRunId}/evidence`
2. `POST /api/flows/{flowRunId}/evidence`

Evidence must be queryable by:

1. `stage`
2. `evidenceType`
3. `createdAt`
4. `operator`

### 6.4 Closure Gates

Jira can move to completed only when all are true:

1. analysis page exists
2. target repo is resolved
3. working branch is prepared
4. implementation completion has been recorded
5. verification evidence exists
6. verification approval is approved
7. Confluence final writeback is complete

---

## 7. Rerun and Resume Semantics

### 7.1 Trigger Modes

The supported trigger modes are:

- `manual_start`
- `rerun`
- `resume_from_failure`

`auto_assigned` is reserved for post-MVP.

### 7.2 Create Flow Rules

`POST /api/flows` must support:

1. `jiraKey`
2. `triggerMode`
3. `repoOverride`
4. `note`
5. `sourceFlowRunId` for `rerun` and `resume_from_failure`
6. `resumeFromStage` for `resume_from_failure` when needed

### 7.3 Semantic Differences

`manual_start`

- creates a new flow with no dependency on a prior flow

`rerun`

- creates a new flow linked to a prior flow
- restarts from the beginning of the canonical workflow

`resume_from_failure`

- creates a new flow or recovery flow linked to a prior flow
- resumes from a canonical stage boundary

### 7.4 Conflict Rules

If an active flow exists for the same Jira ticket:

1. default create must be rejected with `FLOW_CONFLICT`
2. the API response must include the conflicting flow id, status, and stage
3. the user must explicitly choose rerun or resume

---

## 8. Repository and Branch Contract

MVP must not hardcode `master` as the only valid base branch.

### 8.1 Base Branch

Use:

1. resolved repository default branch, or
2. explicit configured override

Persist both:

1. `base_branch`
2. `base_commit_sha`

### 8.2 Working Branch

Default working branch name:

`<jira-key>`

### 8.3 Branch Preparation Rules

`branch_preparing` must cover:

1. resolving the base branch
2. capturing base commit sha
3. checking whether the working branch already exists
4. creating the working branch when needed
5. recording whether the result was created or reused

Required branch outcomes:

1. `created`
2. `reused`
3. `blocked_diverged`
4. `blocked_permission_denied`

Policy:

1. if the branch does not exist, create it from the resolved base branch
2. if the branch exists and its head matches the recorded branch intent, reuse it
3. if the branch exists but conflicts with the intended base lineage, do not silently reuse it; block and require manual action
4. rerun and resume must not create hidden alternate branch names in MVP
5. the working branch name must directly equal `<jira-key>`

### 8.4 Repo Resolution Policy

Repository resolution precedence:

1. explicit `repoOverride`
2. ticket-level explicit mapping field if configured
3. Jira project to repo mapping table

`POST /api/flows/precheck` must return:

1. whether the ticket exists
2. whether the repo resolves
3. the resolved repo name
4. the resolved base branch
5. whether an active flow already exists

---

## 9. Workflow Runner Contract

MVP does not require a separate queueing platform, but it does require durable runner semantics.

### 9.1 Runnable Stage Contract

A stage is runnable only when:

1. the flow is in `pending` or `running`
2. the current stage is canonical
3. the stage is not waiting for manual action
4. no active lease exists for the same stage attempt

### 9.2 Lease and Recovery Contract

Each running stage attempt must support:

1. lease owner
2. lease expiry
3. heartbeat timestamp
4. bounded retry count

Rules:

1. only one worker may hold the active lease for a stage attempt
2. expired leases may be reclaimed
3. external side effects must be wrapped in idempotent stage logic
4. crash recovery must resume from persisted stage state, not from in-memory assumptions

### 9.3 Manual Action Race Contract

If a manual action targets a flow with an active stage lease:

1. the action must be persisted first
2. the runner must re-check flow state before committing the next transition
3. the runner must not advance a stage after a conflicting pause or cancel has been accepted

---

## 10. Search and Precheck Contract

The frontend contract requires both search and precheck.

MVP should expose:

1. `GET /api/jira/issues/search?query=...`
2. `POST /api/flows/precheck`

---

## 11. Minimal Authorization Contract

MVP does not need full RBAC, but it must define authorization for sensitive actions.

The backend must receive at least:

1. `operatorId`
2. `operatorEmail`
3. `operatorDisplayName`
4. `operatorCapabilities`

Minimum capability vocabulary:

1. `flow:start`
2. `flow:pause`
3. `flow:resume`
4. `flow:cancel`
5. `flow:retry`
6. `flow:skip`
7. `flow:override-repo`
8. `flow:approve-analysis`
9. `flow:approve-verification`
10. `flow:submit-evidence`
