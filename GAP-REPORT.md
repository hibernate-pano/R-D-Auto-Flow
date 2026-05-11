# R-D-Auto-Flow: Spec vs Implementation Gap Analysis

**Date:** 2026-05-11  
**Reference Specs:** `docs/canonical-workflow-spec.md` (458 lines), `docs/api-contract.md` (1003 lines)  
**Implementation Path:** `/Users/jasper/code/R-D-Auto-Flow`

---

## 1. Stage Names Enum — ✅ COMPLETE

| Spec Stage | Implementation |
|---|---|
| manual_request_received | ✅ present |
| jira_ticket_fetching | ✅ present |
| jira_ticket_normalized | ✅ present |
| confluence_links_extracting | ✅ present |
| source_pages_fetching | ✅ present |
| analysis_generating | ✅ present |
| analysis_page_creating | ✅ present |
| analysis_approval_waiting | ✅ present |
| repo_resolving | ✅ present |
| branch_preparing | ✅ present |
| implementation_waiting | ✅ present |
| verification_waiting | ✅ present |
| verification_approval_waiting | ✅ present |
| confluence_result_updating | ✅ present |
| jira_status_updating | ✅ present |
| completed | ✅ present |

**Status:** All 16 stage names defined as a Zod enum in `packages/domain/src/index.ts`. ✅

---

## 2. Stage Statuses Enum — ✅ COMPLETE

Spec: `pending`, `running`, `succeeded`, `failed`, `skipped`, `waiting_manual_action`

Implementation (`packages/domain/src/index.ts`): All 6 present in `stageStatuses` array and `StageStatusSchema`. ✅

---

## 3. Flow Overall Statuses — ✅ COMPLETE

Spec: `pending`, `running`, `waiting_manual_action`, `paused`, `failed`, `completed`, `cancelled`

Implementation: All 7 present in `packages/domain/src/index.ts`. ✅

---

## 4. Manual Action Types — ✅ COMPLETE

Spec lists 11 types (lines 181-191 of canonical-workflow-spec.md):
`pause`, `resume`, `cancel`, `retry_stage`, `skip_stage`, `set_repo_override`, `set_confluence_links`, `approve_analysis`, `request_analysis_changes`, `approve_verification`, `request_verification_changes`

Implementation: All 11 present in `packages/domain/src/index.ts`. ✅

> **Note:** Task description mentioned "12 types" but spec only defines 11.

---

## 5. Evidence Types (7 types) — ✅ COMPLETE

Spec: `analysis_snapshot`, `branch_snapshot`, `implementation_note`, `test_execution`, `manual_verification`, `approval_decision`, `final_writeback`

Implementation: All 7 present in `packages/domain/src/index.ts`. ✅

---

## 6. Evidence Payload Minimum Fields — ⚠️ INCOMPLETE

### Spec Requirement (for test_execution, lines 231-240):
```
command, result, summary, artifacts, coverage_note, risk_note, operator, recorded_at
```

### Implementation — TestExecutionSchema (`packages/domain/src/index.ts`):
```typescript
const TestExecutionSchema = z.object({
  command: z.string().min(1),
  result: z.enum(["passed", "failed", "partial"]),
  summary: z.string().min(1),
  artifacts: z.array(z.string()).default([]),
  coverageNote: z.string().min(1),   // ✅ coverage_note (camelCase ok)
  riskNote: z.string().min(1),       // ✅ risk_note (camelCase ok)
  // ❌ MISSING: operator
  // ❌ MISSING: recorded_at
});
```

**Gap:** `operator` and `recorded_at` are missing from `TestExecutionSchema`.

> ✅ **FIXED (2026-05-11):** Both `operator: z.string().min(1)` and `recordedAt: z.string().datetime({ offset: true })` added to `TestExecutionSchema`. Same fix applied to `ManualVerificationSchema`.

### ManualVerificationSchema — Similar Gap:
```typescript
const ManualVerificationSchema = z.object({
  conclusion: z.string().min(1),
  scope: z.string().min(1),
  riskNote: z.string().min(1),
  noAutomationReason: z.string().min(1),
  // ❌ MISSING: operator
  // ❌ MISSING: recorded_at
});
```

**Severity:** Medium — The `EvidenceRecord` itself has `actor` and `createdAt`, but the evidence payload schemas don't include the required `operator` and `recorded_at` fields that are meant to be part of the evidence payload itself per spec Section 6.2.

---

## 7. Capabilities/Permissions Model — ⚠️ NAME MISMATCH

### Spec Capability Names (Section 11, lines 447-458):
```typescript
"flow:start",
"flow:pause",
"flow:resume",
"flow:cancel",
"flow:retry",
"flow:skip",
"flow:override-repo",
"flow:approve-analysis",    // ← note the hyphen
"flow:approve-verification", // ← note the hyphen
"flow:submit-evidence"
```

### Implementation (`packages/domain/src/index.ts`):
```typescript
export const capabilityValues = [
  "flow:start",
  "flow:pause",
  "flow:resume",
  "flow:cancel",
  "flow:retry",
  "flow:skip",
  "flow:override-repo",
  "flow:approve-analysis",    // ✅ matches spec
  "flow:approve-verification", // ✅ matches spec
  "flow:submit-evidence"
] as const;
```

**Actually matches — no gap here. ✅**

---

## 8. blocking_reason_code and blocking_reason_message — ✅ COMPLETE

Both fields are present in `FlowRunSchema` and `FlowRun` type:
```typescript
blockingReasonCode: z.string().nullable(),
blockingReasonMessage: z.string().nullable(),
```

Implementation in flow-service correctly populates these on failures and manual action transitions. ✅

---

## 9. base_branch and base_commit_sha Persistence — ✅ COMPLETE

**WorkItemSchema** (`packages/domain/src/index.ts`, lines 222-223):
```typescript
baseBranch: z.string().nullable(),
baseCommitSha: z.string().nullable(),
```

**branch_preparing stage** (`flow-service.ts` lines 582-585):
```typescript
workItem.baseCommitSha = prepared.baseCommitSha;
workItem.workingBranch = prepared.workingBranch;
```

Both fields are persisted to WorkItem. ✅

---

## 10. Lease / Heartbeat / Crash Recovery Fields — ✅ COMPLETE

**StageRunSchema** (`packages/domain/src/index.ts`):
```typescript
leaseOwner: z.string().nullable(),
leaseExpiresAt: z.string().nullable(),
lastHeartbeatAt: z.string().nullable(),
```

**WorkflowRunner** (`workflow-runner.ts`):
- `recoverStaleStages()` — handles crash recovery (lines 66-105)
- `sendHeartbeat()` — extends leases every 10 seconds (lines 119-134)
- `executeWithLease()` — acquires/releases lease with race detection (lines 171-243)
- `startStageRun()` in flow-service sets initial lease (lines 699-701)

All spec requirements for Section 9 (lease/heartbeat/crash recovery) are implemented. ✅

---

## 11. API Endpoints Completeness — ⚠️ PARTIAL

### Implemented Endpoints (server.ts):
| Endpoint | Status |
|---|---|
| GET /api/health | ✅ |
| GET /api/jira/issues/search | ✅ |
| POST /api/flows/precheck | ✅ |
| POST /api/flows | ✅ |
| GET /api/flows | ✅ |
| GET /api/flows/:flowRunId | ✅ |
| GET /api/flows/:flowRunId/logs | ✅ |
| GET /api/flows/:flowRunId/evidence | ✅ |
| POST /api/flows/:flowRunId/evidence | ✅ |
| GET /api/flows/:flowRunId/available-actions | ✅ |
| POST /api/flows/:flowRunId/actions | ✅ |

### Gap: Evidence Query Filtering (api-contract.md Section 12.1)
**Spec says** evidence endpoint should support query parameters:
```
?stage=...&evidenceType=...&createdAt=...&operator=...
```

**Implementation** (`server.ts` lines 204-208):
```typescript
app.get("/api/flows/:flowRunId/evidence", async (request) => ({
  success: true,
  data: { items: service.listEvidence((request.params as { flowRunId: string }).flowRunId) },
  meta: {},
}));
```

No query parameter filtering is implemented. Evidence is returned as a flat list.

> ✅ **FIXED (2026-05-11):** server.ts now reads `stageName`, `evidenceType`, `createdAt`, and `operator` from query params and passes them to `service.listEvidence()` which filters accordingly.

**Severity:** Medium — Filtering is defined in contract but not wired up.

---

## 12. Conflict Response Missing Fields — ⚠️ MINOR

### Spec Conflict Response (api-contract.md lines 533-549):
```json
{
  "code": "FLOW_CONFLICT",
  "details": {
    "jiraKey": "RD-1234",
    "existingFlowRunId": "flow_0008",
    "existingStatus": "running",      // ❌ not included
    "existingStage": "analysis_generating"  // ❌ not included
  }
}
```

### Implementation (`flow-service.ts` lines 81-84):
```typescript
throw new DomainError(errorCodes.flowConflict, "Current Jira ticket already has an active flow", {
  jiraKey: payload.jiraKey,
  flowRunId: precheck.existingFlowRunId,
});
```

`existingStatus` and `existingStage` are not included in the error details.

> ✅ **FIXED (2026-05-11):** DomainError details now include `existingStatus: precheck.existingStatus` and `existingStage: precheck.existingStage`.

**Severity:** Low — The error still conveys the conflict, just with less detail.

---

## 13. skip_stage Capability Check — ⚠️ INCOMPLETE

### Spec (Section 5.3):
> `skip_stage`、`cancel`、`set_repo_override` 需要显式能力

### Implementation (`flow-service.ts` lines 410-417):
```typescript
case "skip_stage": {
  const target = nextStage(flow.currentStage);
  if (!target) {
    throw new DomainError(errorCodes.actionNotAllowed, "Cannot skip final stage");
  }
  await this.transitionTo(flow, target, "running");
  await this.executeAutomaticStages(flow.id);
  break;
}
```

No `hasCapability(actor, "flow:skip")` check is performed before allowing the action.

> ⚠️ **STALE REPORT:** GAP-REPORT cited line numbers that are now out of date. The capability check `hasCapability(actor, "flow:skip")` is already implemented at flow-service.ts line 444.

**Severity:** Medium — Other privileged actions (pause, resume, approve_analysis, approve_verification) all have capability checks, but skip_stage does not.

---

## 14. createFlow Response Payload — ✅ FIXED

### Spec (api-contract.md lines 515-527):
```json
{
  "flowRunId": "flow_001",
  "workItemId": "work_001",
  "overallStatus": "pending",                    // ❌ not returned
  "currentStage": "manual_request_received"      // ❌ not returned
}
```

### Implementation: ✅ FIXED (2026-05-11)
`createFlow` now calls `requireFlow` after `executeAutomaticStages` and returns `overallStatus` and `currentStage` from the updated flow state.

**Severity:** Low — FIXED.

---

## 15. rerun / resume_from_failure Actual Resume Logic — ✅ FIXED

The system correctly stores `sourceFlowRunId` and `resumeFromStage`, and `rerun` correctly starts from the beginning. But `resume_from_failure` with an explicit `resumeFromStage` should resume from that specific stage.

> ✅ **FIXED:** The `startingStage` logic at flow-service.ts lines 120-123 correctly uses `resumeFromStage` when `triggerMode === "resume_from_failure"`. The runner then executes from that stage forward. The GAP-REPORT assessment was incorrect — this was already implemented.

**Severity:** Medium — FIXED.

---

## 16. HTTP Status Code for FLOW_CONFLICT — ⚠️ WRONG

### Spec: Should return **409 Conflict**

### Implementation (`server.ts` lines 123-132):
```typescript
app.setErrorHandler((error, _request, reply) => {
  if (error instanceof DomainError) {
    void reply.status(error.code === errorCodes.flowConflict ? 409 : 400).send({ ... });
    // ...
  }
});
```

The code **does** check for `flowConflict` and return 409. ✅ **Actually correct.**

---

## 17. Frontend: No Rerun/Resume UI — ✅ FIXED

### Spec: User must be able to choose `rerun` or `resume_from_failure` when a conflict occurs.

### Implementation: ✅ FIXED (2026-05-11)

`CreateFlowModal` now catches FLOW_CONFLICT errors and extracts conflict info. A new `ConflictModal` component is rendered with:
1. Alert showing existing flow's status and stage
2. Radio group to choose between **Rerun from start** and **Resume from stage**
3. Stage selector (dropdown of all 16 stages) when Resume is chosen
4. Calls `rerunFlow()` or `resumeFlow()` API accordingly

API layer (`api.ts`) extended with `rerunFlow()` and `resumeFlow()` helpers.

**Severity:** Medium — FIXED.

---

## 18. Actor Snapshot in Evidence Payload — ⚠️ CONCEPTUAL AMBIGUITY

The spec (Section 6.2) lists `operator` as a minimum evidence payload field. The implementation puts `actor` at the `EvidenceRecord` level (not inside payload). This is actually a better design (operator is metadata, not part of the evidence content itself), but it deviates from the literal spec wording.

**Severity:** Low — The information is captured, just at a different level. This may be an intentional design improvement.

---

## Summary Table

| Area | Severity | Status |
|---|---|---|
| Stage names enum (16) | — | ✅ Complete |
| Stage statuses enum (6) | — | ✅ Complete |
| Flow overall statuses (7) | — | ✅ Complete |
| Manual action types (11) | — | ✅ Complete |
| Evidence types (7) | — | ✅ Complete |
| Evidence payload: operator, recorded_at | Medium | ✅ Fixed (2026-05-11) |
| Capabilities model | — | ✅ Complete |
| blocking_reason_code/message | — | ✅ Complete |
| base_branch/base_commit_sha persistence | — | ✅ Complete |
| Lease/heartbeat/crash recovery | — | ✅ Complete |
| API endpoint completeness | Medium | ✅ Fixed (2026-05-11) — Evidence filtering wired in server.ts |
| Conflict response extra fields | Low | ✅ Fixed (2026-05-11) — existingStatus + existingStage added |
| skip_stage capability check | Medium | ✅ Fixed — Already implemented (GAP-REPORT had stale line numbers) |
| createFlow response payload | Low | ✅ Fixed (2026-05-11) — overallStatus + currentStage now returned |
| resume_from_failure resume logic | Medium | ✅ Fixed — Already implemented correctly |
| FLOW_CONFLICT HTTP 409 | — | ✅ Correct |
| Frontend rerun/resume UI | Medium | ✅ Fixed (2026-05-11) — ConflictModal with rerun/resume_from_failure choices |

---

## Critical Issues (Require Fix Before MVP)

All critical issues resolved as of 2026-05-11.

---

*End of Gap Report*