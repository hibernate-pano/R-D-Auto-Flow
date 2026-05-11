/**
 * PgFlowStore — PostgreSQL-backed FlowStore implementation using Kysely.
 * Maps between Domain types (camelCase) and DB rows (snake_case).
 */

import type {
  ActorSnapshot,
  EvidenceRecord,
  FlowLog,
  FlowRun,
  ManualActionInput,
  StageRun,
  WorkItem,
} from "@rdaf/domain";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

// ── DB row interfaces (snake_case, mirrors DB schema) ─────────────────────────

interface Db {
  work_items: WorkItemRow;
  flow_runs: FlowRunRow;
  flow_stage_runs: StageRunRow;
  flow_logs: FlowLogRow;
  manual_actions: ManualActionRow;
  evidence_records: EvidenceRecordRow;
}

interface WorkItemRow {
  id: string;
  jira_key: string;
  jira_url: string | null;
  jira_title: string;
  jira_description: string;
  jira_status: string;
  jira_project_key: string;
  assignee: string | null;
  source_confluence_urls_json: string;
  source_confluence_digest_json: string | null;
  analysis_page_url: string | null;
  analysis_page_id: string | null;
  repo_name: string | null;
  repo_url: string | null;
  base_branch: string | null;
  base_commit_sha: string | null;
  working_branch: string | null;
  implementation_summary: string | null;
  test_summary: string | null;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

interface FlowRunRow {
  id: string;
  work_item_id: string;
  trigger_mode: string;
  current_stage: string;
  overall_status: string;
  blocking_reason_code: string | null;
  blocking_reason_message: string | null;
  manual_action_required: boolean;
  manual_action_type: string | null;
  operator_id: string;
  operator_email: string;
  operator_display_name: string;
  operator_capabilities_json: unknown;
  source_flow_run_id: string | null;
  resume_from_stage: string | null;
  repo_override: string | null;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface StageRunRow {
  id: string;
  flow_run_id: string;
  stage_name: string;
  status: string;
  attempt_no: number;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  error_code: string | null;
  error_message: string | null;
  requires_manual_action: boolean;
  manual_action_type: string | null;
  lease_owner: string | null;
  lease_expires_at: string | null;
  last_heartbeat_at: string | null;
  created_at: string;
}

interface FlowLogRow {
  id: string;
  flow_run_id: string;
  stage_name: string | null;
  level: string;
  event_type: string;
  message: string;
  details_json: unknown | null;
  related_object_type: string | null;
  related_object_id: string | null;
  redacted: boolean;
  created_at: string;
}

interface ManualActionRow {
  id: string;
  flow_run_id: string;
  action_type: string;
  payload_json: Record<string, unknown>;
  note: string | null;
  operator_id: string;
  operator_email: string;
  operator_display_name: string;
  operator_capabilities_json: unknown;
  result: string;
  created_at: string;
}

interface EvidenceRecordRow {
  id: string;
  flow_run_id: string;
  stage_name: string;
  evidence_type: string;
  payload_json: unknown;
  operator_id: string;
  operator_email: string;
  operator_display_name: string;
  source_system: string;
  created_at: string;
}

// ── Store implementation ───────────────────────────────────────────────────────

export class PgFlowStore {
  private readonly db: Kysely<Db>;

  constructor(databaseUrl: string) {
    this.db = new Kysely<Db>({
      dialect: new PostgresDialect({ pool: new Pool({ connectionString: databaseUrl }) }),
    });
  }

  async destroy(): Promise<void> {
    await this.db.destroy();
  }

  // ── Sync implementations (backed by in-memory caches populated by init()) ──
  getFlow(flowRunId: string): FlowRun | undefined {
    return this._getFlow?.get(flowRunId);
  }
  saveFlow(flowRun: FlowRun): void {
    this._saveFlow = (async () => {
      // Await the insert so the row exists in PG before child records
      // (logs, stage_runs) are inserted by executeAutomaticStages.
      await this.db.insertInto("flow_runs").values(toFlowRunRow(flowRun))
        .onConflict(oc => oc.column("id").doUpdateSet(toFlowRunRow(flowRun)))
        .executeTakeFirstOrThrow();
    })();
    // Keep sync cache in sync for read-after-write
    if (!this._getFlow) this._getFlow = new Map();
    this._getFlow.set(flowRun.id, flowRun);
    if (!this._listFlows) this._listFlows = [];
    this._listFlows.push(flowRun);
  }
  listWorkItems(): WorkItem[] {
    return this._listWorkItems ?? [];
  }
  getWorkItem(workItemId: string): WorkItem | undefined {
    return this._getWorkItem?.get(workItemId);
  }
  getWorkItemByJiraKey(jiraKey: string): WorkItem | undefined {
    return this._getWorkItemByJiraKey?.get(jiraKey);
  }
  saveWorkItem(workItem: WorkItem): void {
    this._saveWorkItem = (async () => {
      // Await so the work_item row exists before saveFlow (which has a FK to it).
      await this.db.insertInto("work_items").values(toWorkItemRow(workItem))
        .onConflict(oc => oc.column("id").doUpdateSet(toWorkItemRow(workItem)))
        .executeTakeFirstOrThrow();
    })();
  }
  listStageRuns(flowRunId: string): StageRun[] {
    return this._listStageRuns?.get(flowRunId) ?? [];
  }
  saveStageRun(flowRunId: string, stageRun: StageRun): void {
    this._saveStageRun = Promise.resolve(this.db.insertInto("flow_stage_runs").values(toStageRunRow(flowRunId, stageRun))
      .onConflict(oc => oc.column("id").doUpdateSet(toStageRunRow(flowRunId, stageRun)))
      .executeTakeFirstOrThrow());
  }
  listLogs(flowRunId: string): FlowLog[] {
    return this._listLogs?.get(flowRunId) ?? [];
  }
  saveLog(flowRunId: string, log: FlowLog): Promise<void> {
    this._saveLog = Promise.resolve(this.db.insertInto("flow_logs").values(toFlowLogRow(flowRunId, log))
      .executeTakeFirstOrThrow());
    return this._saveLog as Promise<void>;
  }
  listEvidence(flowRunId: string): EvidenceRecord[] {
    return this._listEvidence?.get(flowRunId) ?? [];
  }
  saveEvidence(flowRunId: string, evidence: EvidenceRecord): void {
    this._saveEvidence = Promise.resolve(this.db.insertInto("evidence_records").values(toEvidenceRecordRow(flowRunId, evidence))
      .onConflict(oc => oc.column("id").doUpdateSet(toEvidenceRecordRow(flowRunId, evidence)))
      .executeTakeFirstOrThrow());
  }
  listManualActions(flowRunId: string): Array<{id: string; flowRunId: string; actionType: ManualActionInput["actionType"]; payload: Record<string, unknown>; note: string; actor: ActorSnapshot; result: "accepted" | "rejected" | "applied" | "failed"; createdAt: string;}> {
    return this._listManualActions?.get(flowRunId) ?? [];
  }
  saveManualAction(flowRunId: string, action: {id: string; flowRunId: string; actionType: ManualActionInput["actionType"]; payload: Record<string, unknown>; note: string; actor: ActorSnapshot; result: "accepted" | "rejected" | "applied" | "failed"; createdAt: string;}): void {
    this._saveManualAction = Promise.resolve(this.db.insertInto("manual_actions").values(toManualActionRow(flowRunId, action))
      .onConflict(oc => oc.column("id").doUpdateSet(toManualActionRow(flowRunId, action)))
      .executeTakeFirstOrThrow());
  }
  listFlows(): FlowRun[] {
    return this._listFlows ?? [];
  }
  findActiveFlowByJiraKey(jiraKey: string): FlowRun | undefined {
    return this._findActiveFlowByJiraKey?.get(jiraKey);
  }

  // ── Initialization (call after construction, before use) ───────────────────────

  private _listFlows?: FlowRun[];
  private _getFlow?: Map<string, FlowRun>;
  private _saveFlow?: Promise<unknown>;
  private _listWorkItems?: WorkItem[];
  private _getWorkItem?: Map<string, WorkItem>;
  private _getWorkItemByJiraKey?: Map<string, WorkItem>;
  private _saveWorkItem?: Promise<unknown>;
  private _listStageRuns?: Map<string, StageRun[]>;
  private _saveStageRun?: Promise<unknown>;
  private _listLogs?: Map<string, FlowLog[]>;
  private _saveLog?: Promise<unknown>;
  private _listEvidence?: Map<string, EvidenceRecord[]>;
  private _saveEvidence?: Promise<unknown>;
  private _listManualActions?: Map<string, Array<{id: string; flowRunId: string; actionType: ManualActionInput["actionType"]; payload: Record<string, unknown>; note: string; actor: ActorSnapshot; result: "accepted" | "rejected" | "applied" | "failed"; createdAt: string;}>>;
  private _saveManualAction?: Promise<unknown>;
  private _findActiveFlowByJiraKey?: Map<string, FlowRun>;

  async init(): Promise<void> {
    const [flows, workItems, stageRuns, logs, evidence, manualActions] = await Promise.all([
      this.db.selectFrom("flow_runs").orderBy("updated_at", "desc").selectAll().execute(),
      this.db.selectFrom("work_items").selectAll().execute(),
      this.db.selectFrom("flow_stage_runs").orderBy("created_at", "asc").selectAll().execute(),
      this.db.selectFrom("flow_logs").orderBy("created_at", "asc").execute(),
      this.db.selectFrom("evidence_records").orderBy("created_at", "asc").execute(),
      this.db.selectFrom("manual_actions").orderBy("created_at", "asc").execute(),
    ]);

    this._listFlows = flows.map(toFlowRun);
    this._getFlow = new Map(flows.map(r => [r.id, toFlowRun(r)]));

    this._listWorkItems = workItems.map(toWorkItem);
    this._getWorkItem = new Map(workItems.map(r => [r.id, toWorkItem(r)]));
    this._getWorkItemByJiraKey = new Map(workItems.map(r => [r.jira_key, toWorkItem(r)]));

    const srMap = new Map<string, StageRun[]>();
    for (const row of stageRuns) {
      const sr = toStageRun(row);
      const fid = (row as any).flow_run_id;
      if (!srMap.has(fid)) srMap.set(fid, []);
      srMap.get(fid)!.push(sr);
    }
    this._listStageRuns = srMap;

    const logMap = new Map<string, FlowLog[]>();
    for (const row of logs) {
      const lg = toFlowLog(row as FlowLogRow);
      const fid = (row as any).flow_run_id;
      if (!logMap.has(fid)) logMap.set(fid, []);
      logMap.get(fid)!.push(lg);
    }
    this._listLogs = logMap;

    const evMap = new Map<string, EvidenceRecord[]>();
    for (const row of evidence) {
      const ev = toEvidenceRecord(row as EvidenceRecordRow);
      const fid = (row as any).flow_run_id;
      if (!evMap.has(fid)) evMap.set(fid, []);
      evMap.get(fid)!.push(ev);
    }
    this._listEvidence = evMap;

    const maMap = new Map<string, Array<{id: string; flowRunId: string; actionType: ManualActionInput["actionType"]; payload: Record<string, unknown>; note: string; actor: ActorSnapshot; result: "accepted" | "rejected" | "applied" | "failed"; createdAt: string;}>>();
    for (const row of manualActions) {
      const ma = toManualAction(row as ManualActionRow);
      const fid = (row as any).flow_run_id;
      if (!maMap.has(fid)) maMap.set(fid, []);
      maMap.get(fid)!.push(ma);
    }
    this._listManualActions = maMap;

    const notActive = ["completed", "failed", "cancelled"];
    const activeFlowRuns = await this.db
      .selectFrom("flow_runs")
      .where("overall_status", "not in", notActive)
      .selectAll().execute();
    const entries: [string, FlowRun][] = [];
    for (const r of activeFlowRuns) {
      const workItem = this._getWorkItem.get(r.work_item_id);
      if (workItem) {
        entries.push([workItem.jiraKey, toFlowRun(r)]);
      }
    }
    this._findActiveFlowByJiraKey = new Map(entries);
  }

  // ── Async variants (actual PG implementation) ────────────────────────────────

  async listFlowsAsync(): Promise<FlowRun[]> {
    const rows = await this.db.selectFrom("flow_runs").orderBy("updated_at", "desc").selectAll().execute();
    return rows.map(toFlowRun);
  }

  async getFlowAsync(flowRunId: string): Promise<FlowRun | undefined> {
    const row = await this.db.selectFrom("flow_runs").where("id", "=", flowRunId).selectAll().executeTakeFirst();
    return row ? toFlowRun(row) : undefined;
  }

  async saveFlowAsync(flowRun: FlowRun): Promise<void> {
    await this.db.insertInto("flow_runs").values(toFlowRunRow(flowRun))
      .onConflict(oc => oc.column("id").doUpdateSet(toFlowRunRow(flowRun)))
      .executeTakeFirstOrThrow();
  }

  async listWorkItemsAsync(): Promise<WorkItem[]> {
    const rows = await this.db.selectFrom("work_items").selectAll().execute();
    return rows.map(toWorkItem);
  }

  async getWorkItemAsync(workItemId: string): Promise<WorkItem | undefined> {
    const row = await this.db.selectFrom("work_items").where("id", "=", workItemId).selectAll().executeTakeFirst();
    return row ? toWorkItem(row) : undefined;
  }

  async getWorkItemByJiraKeyAsync(jiraKey: string): Promise<WorkItem | undefined> {
    const row = await this.db.selectFrom("work_items").where("jira_key", "=", jiraKey).selectAll().executeTakeFirst();
    return row ? toWorkItem(row) : undefined;
  }

  async saveWorkItemAsync(workItem: WorkItem): Promise<void> {
    await this.db.insertInto("work_items").values(toWorkItemRow(workItem))
      .onConflict(oc => oc.column("id").doUpdateSet(toWorkItemRow(workItem)))
      .executeTakeFirstOrThrow();
  }

  async listStageRunsAsync(flowRunId: string): Promise<StageRun[]> {
    const rows = await this.db.selectFrom("flow_stage_runs").where("flow_run_id", "=", flowRunId).orderBy("started_at", "asc").selectAll().execute();
    return rows.map(toStageRun);
  }

  async saveStageRunAsync(flowRunId: string, stageRun: StageRun): Promise<void> {
    await this.db.insertInto("flow_stage_runs").values(toStageRunRow(flowRunId, stageRun))
      .onConflict(oc => oc.columns(["flow_run_id", "stage_name", "attempt_no"]).doUpdateSet(toStageRunRow(flowRunId, stageRun)))
      .executeTakeFirstOrThrow();
  }

  async listLogsAsync(flowRunId: string): Promise<FlowLog[]> {
    const rows = await this.db.selectFrom("flow_logs").where("flow_run_id", "=", flowRunId).orderBy("created_at", "asc").selectAll().execute();
    return rows.map(toFlowLog);
  }

  async saveLogAsync(flowRunId: string, log: FlowLog): Promise<void> {
    await this.db.insertInto("flow_logs").values(toFlowLogRow(flowRunId, log)).executeTakeFirstOrThrow();
  }

  async listEvidenceAsync(flowRunId: string): Promise<EvidenceRecord[]> {
    const rows = await this.db.selectFrom("evidence_records").where("flow_run_id", "=", flowRunId).orderBy("created_at", "asc").selectAll().execute();
    return rows.map(toEvidenceRecord);
  }

  async saveEvidenceAsync(flowRunId: string, evidence: EvidenceRecord): Promise<void> {
    await this.db.insertInto("evidence_records").values(toEvidenceRecordRow(flowRunId, evidence)).executeTakeFirstOrThrow();
  }

  async listManualActionsAsync(flowRunId: string): Promise<Array<{
    id: string; flowRunId: string; actionType: ManualActionInput["actionType"];
    payload: Record<string, unknown>; note: string; actor: ActorSnapshot;
    result: "accepted" | "rejected" | "applied" | "failed"; createdAt: string;
  }>> {
    const rows = await this.db.selectFrom("manual_actions").where("flow_run_id", "=", flowRunId).orderBy("created_at", "asc").selectAll().execute();
    return rows.map(toManualAction);
  }

  async saveManualActionAsync(flowRunId: string, action: {
    id: string; flowRunId: string; actionType: ManualActionInput["actionType"];
    payload: Record<string, unknown>; note: string; actor: ActorSnapshot;
    result: "accepted" | "rejected" | "applied" | "failed"; createdAt: string;
  }): Promise<void> {
    await this.db.insertInto("manual_actions").values(toManualActionRow(flowRunId, action)).executeTakeFirstOrThrow();
  }

  async findActiveFlowByJiraKeyAsync(jiraKey: string): Promise<FlowRun | undefined> {
    const workItem = await this.getWorkItemByJiraKeyAsync(jiraKey);
    if (!workItem) return undefined;
    const row = await this.db
      .selectFrom("flow_runs").where("work_item_id", "=", workItem.id)
      .where("overall_status", "in", ["running", "waiting_manual_action", "paused"])
      .orderBy("updated_at", "desc").selectAll().executeTakeFirst();
    return row ? toFlowRun(row) : undefined;
  }
}

// ── Row → Domain mappers ──────────────────────────────────────────────────────

function tsToString(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  return v;
}

function toWorkItem(r: WorkItemRow): WorkItem {
  return {
    id: r.id,
    jiraKey: r.jira_key,
    jiraTitle: r.jira_title,
    jiraDescription: r.jira_description,
    jiraStatus: r.jira_status,
    jiraProjectKey: r.jira_project_key,
    assignee: r.assignee,
    sourceConfluenceUrls: (typeof r.source_confluence_urls_json === "string" ? JSON.parse(r.source_confluence_urls_json) : r.source_confluence_urls_json) as string[],
    sourceConfluenceDigest: (r.source_confluence_digest_json ?? []) as WorkItem["sourceConfluenceDigest"],
    analysisPageUrl: r.analysis_page_url,
    analysisPageId: r.analysis_page_id,
    repoName: r.repo_name,
    repoUrl: r.repo_url,
    baseBranch: r.base_branch,
    baseCommitSha: r.base_commit_sha,
    workingBranch: r.working_branch,
    implementationSummary: r.implementation_summary,
    testSummary: r.test_summary,
    createdAt: tsToString(r.created_at)!,
    updatedAt: tsToString(r.updated_at)!,
  };
}

function toFlowRun(r: FlowRunRow): FlowRun {
  return {
    id: r.id,
    workItemId: r.work_item_id,
    triggerMode: r.trigger_mode as FlowRun["triggerMode"],
    currentStage: r.current_stage as FlowRun["currentStage"],
    overallStatus: r.overall_status as FlowRun["overallStatus"],
    blockingReasonCode: r.blocking_reason_code,
    blockingReasonMessage: r.blocking_reason_message,
    manualActionRequired: r.manual_action_required,
    manualActionType: (r.manual_action_type ?? null) as FlowRun["manualActionType"],
    sourceFlowRunId: r.source_flow_run_id,
    resumeFromStage: (r.resume_from_stage ?? null) as FlowRun["resumeFromStage"],
    repoOverride: r.repo_override,
    operator: {
      operatorId: r.operator_id,
      operatorEmail: r.operator_email,
      operatorDisplayName: r.operator_display_name,
      operatorCapabilities: r.operator_capabilities_json as ActorSnapshot["operatorCapabilities"],
    },
    startedAt: tsToString(r.started_at)!,
    updatedAt: tsToString(r.updated_at)!,
    completedAt: tsToString(r.completed_at),
  };
}

function toStageRun(r: StageRunRow): StageRun {
  return {
    id: r.id,
    stageName: r.stage_name as StageRun["stageName"],
    status: r.status as StageRun["status"],
    attemptNo: r.attempt_no,
    startedAt: tsToString(r.started_at)!,
    finishedAt: tsToString(r.finished_at),
    durationMs: r.duration_ms,
    errorCode: r.error_code,
    errorMessage: r.error_message,
    requiresManualAction: r.requires_manual_action,
    manualActionType: (r.manual_action_type ?? null) as StageRun["manualActionType"],
    leaseOwner: r.lease_owner,
    leaseExpiresAt: tsToString(r.lease_expires_at),
    lastHeartbeatAt: tsToString(r.last_heartbeat_at),
  };
}

function toFlowLog(r: FlowLogRow): FlowLog {
  return {
    id: r.id,
    flowRunId: r.flow_run_id,
    stageName: (r.stage_name ?? null) as FlowLog["stageName"],
    level: r.level as FlowLog["level"],
    eventType: r.event_type,
    message: r.message,
    details: (r.details_json ?? {}) as Record<string, unknown>,
    relatedObjectType: r.related_object_type,
    relatedObjectId: r.related_object_id,
    redacted: r.redacted,
    createdAt: tsToString(r.created_at)!,
  };
}

function toEvidenceRecord(r: EvidenceRecordRow): EvidenceRecord {
  return {
    id: r.id,
    flowRunId: r.flow_run_id,
    stageName: r.stage_name as EvidenceRecord["stageName"],
    evidenceType: r.evidence_type as EvidenceRecord["evidenceType"],
    payload: r.payload_json,
    actor: {
      operatorId: r.operator_id,
      operatorEmail: r.operator_email,
      operatorDisplayName: r.operator_display_name,
      operatorCapabilities: [],
    },
    sourceSystem: r.source_system as EvidenceRecord["sourceSystem"],
    createdAt: tsToString(r.created_at)!,
  };
}

function toManualAction(r: ManualActionRow) {
  return {
    id: r.id,
    flowRunId: r.flow_run_id,
    actionType: r.action_type as ManualActionInput["actionType"],
    payload: r.payload_json as Record<string, unknown>,
    note: r.note ?? "",
    actor: {
      operatorId: r.operator_id,
      operatorEmail: r.operator_email,
      operatorDisplayName: r.operator_display_name,
      operatorCapabilities: r.operator_capabilities_json as ActorSnapshot["operatorCapabilities"],
    },
    result: r.result as "accepted" | "rejected" | "applied" | "failed",
    createdAt: tsToString(r.created_at)!,
  };
}

// ── Domain → Row mappers ─────────────────────────────────────────────────────

function toWorkItemRow(w: WorkItem): WorkItemRow {
  return {
    id: w.id,
    jira_key: w.jiraKey,
    jira_url: null,
    jira_title: w.jiraTitle,
    jira_description: w.jiraDescription,
    jira_status: w.jiraStatus,
    jira_project_key: w.jiraProjectKey,
    assignee: w.assignee,
    source_confluence_urls_json: JSON.stringify(w.sourceConfluenceUrls),
    source_confluence_digest_json: w.sourceConfluenceDigest ? JSON.stringify(w.sourceConfluenceDigest) : null,
    analysis_page_url: w.analysisPageUrl,
    analysis_page_id: w.analysisPageId,
    repo_name: w.repoName,
    repo_url: w.repoUrl,
    base_branch: w.baseBranch,
    base_commit_sha: w.baseCommitSha,
    working_branch: w.workingBranch,
    implementation_summary: w.implementationSummary,
    test_summary: w.testSummary,
    last_sync_at: null,
    created_at: w.createdAt,
    updated_at: w.updatedAt,
  };
}

function toFlowRunRow(f: FlowRun): FlowRunRow {
  return {
    id: f.id,
    work_item_id: f.workItemId,
    trigger_mode: f.triggerMode,
    current_stage: f.currentStage,
    overall_status: f.overallStatus,
    blocking_reason_code: f.blockingReasonCode,
    blocking_reason_message: f.blockingReasonMessage,
    manual_action_required: f.manualActionRequired,
    manual_action_type: f.manualActionType ?? null,
    operator_id: f.operator.operatorId,
    operator_email: f.operator.operatorEmail,
    operator_display_name: f.operator.operatorDisplayName,
    operator_capabilities_json: JSON.stringify(f.operator.operatorCapabilities),
    source_flow_run_id: f.sourceFlowRunId,
    resume_from_stage: f.resumeFromStage,
    repo_override: f.repoOverride,
    started_at: f.startedAt,
    updated_at: f.updatedAt,
    completed_at: f.completedAt,
  };
}

function toStageRunRow(flowRunId: string, s: StageRun): StageRunRow {
  return {
    id: s.id,
    flow_run_id: flowRunId,
    stage_name: s.stageName,
    status: s.status,
    attempt_no: s.attemptNo,
    started_at: s.startedAt,
    finished_at: s.finishedAt,
    duration_ms: s.durationMs,
    error_code: s.errorCode,
    error_message: s.errorMessage,
    requires_manual_action: s.requiresManualAction,
    manual_action_type: s.manualActionType ?? null,
    lease_owner: s.leaseOwner,
    lease_expires_at: s.leaseExpiresAt,
    last_heartbeat_at: s.lastHeartbeatAt,
    created_at: s.startedAt,
  };
}

function toFlowLogRow(flowRunId: string, l: FlowLog): FlowLogRow {
  return {
    id: l.id,
    flow_run_id: flowRunId,
    stage_name: l.stageName ?? null,
    level: l.level,
    event_type: l.eventType,
    message: l.message,
    details_json: JSON.stringify(l.details),
    related_object_type: l.relatedObjectType,
    related_object_id: l.relatedObjectId,
    redacted: l.redacted,
    created_at: l.createdAt,
  };
}

function toEvidenceRecordRow(flowRunId: string, e: EvidenceRecord): EvidenceRecordRow {
  return {
    id: e.id,
    flow_run_id: flowRunId,
    stage_name: e.stageName,
    evidence_type: e.evidenceType,
    payload_json: JSON.stringify(e.payload),
    operator_id: e.actor.operatorId,
    operator_email: e.actor.operatorEmail,
    operator_display_name: e.actor.operatorDisplayName,
    source_system: e.sourceSystem,
    created_at: e.createdAt,
  };
}

function toManualActionRow(flowRunId: string, a: {
  id: string; flowRunId: string; actionType: ManualActionInput["actionType"];
  payload: Record<string, unknown>; note: string; actor: ActorSnapshot;
  result: "accepted" | "rejected" | "applied" | "failed"; createdAt: string;
}): ManualActionRow {
  return {
    id: a.id,
    flow_run_id: flowRunId,
    action_type: a.actionType,
    payload_json: JSON.stringify(a.payload) as unknown as Record<string, unknown>,
    note: a.note || null,
    operator_id: a.actor.operatorId,
    operator_email: a.actor.operatorEmail,
    operator_display_name: a.actor.operatorDisplayName,
    operator_capabilities_json: JSON.stringify(a.actor.operatorCapabilities),
    result: a.result,
    created_at: a.createdAt,
  };
}
