import { z } from "zod";

export const flowOverallStatuses = [
  "pending",
  "running",
  "waiting_manual_action",
  "paused",
  "failed",
  "completed",
  "cancelled",
] as const;

export const stageNames = [
  "manual_request_received",
  "jira_ticket_fetching",
  "jira_ticket_normalized",
  "confluence_links_extracting",
  "source_pages_fetching",
  "analysis_generating",
  "analysis_page_creating",
  "analysis_approval_waiting",
  "repo_resolving",
  "branch_preparing",
  "implementation_waiting",
  "verification_waiting",
  "verification_approval_waiting",
  "confluence_result_updating",
  "jira_status_updating",
  "completed",
] as const;

export const stageStatuses = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "skipped",
  "waiting_manual_action",
] as const;

export const triggerModes = [
  "manual_start",
  "rerun",
  "resume_from_failure",
] as const;

export const manualActionTypes = [
  "pause",
  "resume",
  "cancel",
  "retry_stage",
  "skip_stage",
  "set_repo_override",
  "set_confluence_links",
  "approve_analysis",
  "request_analysis_changes",
  "approve_verification",
  "request_verification_changes",
] as const;

export const evidenceTypes = [
  "analysis_snapshot",
  "branch_snapshot",
  "implementation_note",
  "test_execution",
  "manual_verification",
  "approval_decision",
  "final_writeback",
] as const;

export const capabilityValues = [
  "flow:start",
  "flow:pause",
  "flow:resume",
  "flow:cancel",
  "flow:retry",
  "flow:skip",
  "flow:override-repo",
  "flow:approve-analysis",
  "flow:approve-verification",
  "flow:submit-evidence",
] as const;

export type FlowOverallStatus = (typeof flowOverallStatuses)[number];
export type StageName = (typeof stageNames)[number];
export type StageStatus = (typeof stageStatuses)[number];
export type TriggerMode = (typeof triggerModes)[number];
export type ManualActionType = (typeof manualActionTypes)[number];
export type EvidenceType = (typeof evidenceTypes)[number];
export type Capability = (typeof capabilityValues)[number];

export const FlowOverallStatusSchema = z.enum(flowOverallStatuses);
export const StageNameSchema = z.enum(stageNames);
export const StageStatusSchema = z.enum(stageStatuses);
export const TriggerModeSchema = z.enum(triggerModes);
export const ManualActionTypeSchema = z.enum(manualActionTypes);
export const EvidenceTypeSchema = z.enum(evidenceTypes);
export const CapabilitySchema = z.enum(capabilityValues);

export const ActorSnapshotSchema = z.object({
  operatorId: z.string(),
  operatorEmail: z.string().email(),
  operatorDisplayName: z.string(),
  operatorCapabilities: z.array(CapabilitySchema),
});

export type ActorSnapshot = z.infer<typeof ActorSnapshotSchema>;

export const FlowLogSchema = z.object({
  id: z.string(),
  flowRunId: z.string(),
  stageName: StageNameSchema,
  level: z.enum(["debug", "info", "warn", "error"]),
  eventType: z.string(),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).default({}),
  relatedObjectType: z.string().nullable().default(null),
  relatedObjectId: z.string().nullable().default(null),
  createdAt: z.string(),
  redacted: z.boolean(),
});

export type FlowLog = z.infer<typeof FlowLogSchema>;

export const ImplementationNoteSchema = z.object({
  summary: z.string().min(1),
  detail: z.string().min(1),
});

export const TestExecutionSchema = z.object({
  command: z.string().min(1),
  result: z.enum(["passed", "failed", "partial"]),
  summary: z.string().min(1),
  artifacts: z.array(z.string()).default([]),
  coverageNote: z.string().min(1),
  riskNote: z.string().min(1),
  operator: z.string().min(1),
  recordedAt: z.string().datetime({ offset: true }),
});

export const ManualVerificationSchema = z.object({
  conclusion: z.string().min(1),
  scope: z.string().min(1),
  riskNote: z.string().min(1),
  noAutomationReason: z.string().min(1),
  operator: z.string().min(1),
  recordedAt: z.string().datetime({ offset: true }),
});

export const ApprovalDecisionSchema = z.object({
  checkpoint: z.enum(["analysis", "verification"]),
  outcome: z.enum(["approved", "rejected", "changes_requested"]),
  note: z.string().default(""),
});

export const BranchSnapshotSchema = z.object({
  repoName: z.string(),
  repoUrl: z.string().url(),
  baseBranch: z.string(),
  baseCommitSha: z.string(),
  workingBranch: z.string(),
  branchResult: z.enum([
    "created",
    "reused",
    "blocked_diverged",
    "blocked_permission_denied",
  ]),
});

export const FinalWritebackSchema = z.object({
  confluenceUpdated: z.boolean(),
  jiraUpdated: z.boolean(),
  summary: z.string().min(1),
});

export const EvidenceRecordSchema = z.object({
  id: z.string(),
  flowRunId: z.string(),
  stageName: StageNameSchema,
  evidenceType: EvidenceTypeSchema,
  payload: z.unknown(),
  actor: ActorSnapshotSchema,
  sourceSystem: z.enum(["system", "operator", "external_executor"]),
  createdAt: z.string(),
});

export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>;

export const StageRunSchema = z.object({
  id: z.string(),
  stageName: StageNameSchema,
  status: StageStatusSchema,
  attemptNo: z.number().int().positive(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  durationMs: z.number().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  requiresManualAction: z.boolean(),
  manualActionType: ManualActionTypeSchema.nullable(),
  leaseOwner: z.string().nullable(),
  leaseExpiresAt: z.string().nullable(),
  lastHeartbeatAt: z.string().nullable(),
});

export type StageRun = z.infer<typeof StageRunSchema>;

export const WorkItemSchema = z.object({
  id: z.string(),
  jiraKey: z.string(),
  jiraTitle: z.string(),
  jiraDescription: z.string(),
  jiraStatus: z.string(),
  jiraProjectKey: z.string(),
  assignee: z.string().nullable(),
  sourceConfluenceUrls: z.array(z.string()),
  sourceConfluenceDigest: z.array(z.object({
    url: z.string(),
    title: z.string(),
    summary: z.string(),
  })),
  analysisPageUrl: z.string().nullable(),
  analysisPageId: z.string().nullable(),
  repoName: z.string().nullable(),
  repoUrl: z.string().nullable(),
  baseBranch: z.string().nullable(),
  baseCommitSha: z.string().nullable(),
  workingBranch: z.string().nullable(),
  implementationSummary: z.string().nullable(),
  testSummary: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type WorkItem = z.infer<typeof WorkItemSchema>;

export const FlowRunSchema = z.object({
  id: z.string(),
  workItemId: z.string(),
  triggerMode: TriggerModeSchema,
  currentStage: StageNameSchema,
  overallStatus: FlowOverallStatusSchema,
  blockingReasonCode: z.string().nullable(),
  blockingReasonMessage: z.string().nullable(),
  manualActionRequired: z.boolean(),
  manualActionType: ManualActionTypeSchema.nullable(),
  sourceFlowRunId: z.string().nullable(),
  resumeFromStage: StageNameSchema.nullable(),
  repoOverride: z.string().nullable(),
  operator: ActorSnapshotSchema,
  startedAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
});

export type FlowRun = z.infer<typeof FlowRunSchema>;

export const FlowSummarySchema = z.object({
  id: z.string(),
  jiraKey: z.string(),
  jiraTitle: z.string(),
  currentStage: StageNameSchema,
  overallStatus: FlowOverallStatusSchema,
  triggerMode: TriggerModeSchema,
  manualActionRequired: z.boolean(),
  updatedAt: z.string(),
});

export type FlowSummary = z.infer<typeof FlowSummarySchema>;

export const FlowDetailSchema = z.object({
  flowRun: FlowRunSchema,
  workItem: WorkItemSchema,
  stageRuns: z.array(StageRunSchema),
  logs: z.array(FlowLogSchema),
  evidence: z.array(EvidenceRecordSchema),
  availableActions: z.array(ManualActionTypeSchema),
});

export type FlowDetail = z.infer<typeof FlowDetailSchema>;

export const CreateFlowInputSchema = z.object({
  jiraKey: z.string().min(2),
  triggerMode: TriggerModeSchema,
  repoOverride: z.string().nullable().default(null),
  note: z.string().default(""),
  sourceFlowRunId: z.string().nullable().default(null),
  resumeFromStage: StageNameSchema.nullable().default(null),
});

export type CreateFlowInput = z.infer<typeof CreateFlowInputSchema>;

export const ManualActionInputSchema = z.object({
  actionType: ManualActionTypeSchema,
  payload: z.record(z.string(), z.unknown()).default({}),
  note: z.string().default(""),
});

export type ManualActionInput = z.infer<typeof ManualActionInputSchema>;

export const EvidenceInputSchema = z.object({
  stageName: StageNameSchema,
  evidenceType: EvidenceTypeSchema,
  payload: z.unknown(),
});

export type EvidenceInput = z.infer<typeof EvidenceInputSchema>;

export const PrecheckResultSchema = z.object({
  ticketExists: z.boolean(),
  repoResolved: z.boolean(),
  repoName: z.string().nullable(),
  baseBranch: z.string().nullable(),
  hasRunningFlow: z.boolean(),
  existingFlowRunId: z.string().nullable(),
  existingStatus: z.string().nullable(),
  existingStage: z.string().nullable(),
});

export type PrecheckResult = z.infer<typeof PrecheckResultSchema>;

export const errorCodes = {
  invalidJiraKey: "INVALID_JIRA_KEY",
  ticketNotFound: "TICKET_NOT_FOUND",
  flowNotFound: "FLOW_NOT_FOUND",
  flowConflict: "FLOW_CONFLICT",
  actionNotAllowed: "ACTION_NOT_ALLOWED",
  approvalNotAllowed: "APPROVAL_NOT_ALLOWED",
  jiraAccessDenied: "JIRA_ACCESS_DENIED",
  confluenceAccessDenied: "CONFLUENCE_ACCESS_DENIED",
  githubAccessDenied: "GITHUB_ACCESS_DENIED",
  repoNotResolved: "REPO_NOT_RESOLVED",
  branchDiverged: "BRANCH_DIVERGED",
  llmBridgeUnavailable: "LLM_BRIDGE_UNAVAILABLE",
  upstreamTimeout: "UPSTREAM_TIMEOUT",
  analysisOutputInvalid: "ANALYSIS_OUTPUT_INVALID",
  evidenceInvalid: "EVIDENCE_INVALID",
  evidenceNotFound: "EVIDENCE_NOT_FOUND",
  approvalCapabilityRequired: "APPROVAL_CAPABILITY_REQUIRED",
  configInvalid: "CONFIG_INVALID",
  internalError: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof errorCodes)[keyof typeof errorCodes];

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function nextStage(stage: StageName): StageName | null {
  const idx = stageNames.indexOf(stage);
  if (idx === -1 || idx === stageNames.length - 1) {
    return null;
  }

  return stageNames[idx + 1] ?? null;
}

export function validateEvidencePayload(
  evidenceType: EvidenceType,
  payload: unknown,
): unknown {
  switch (evidenceType) {
    case "implementation_note":
      return ImplementationNoteSchema.parse(payload);
    case "test_execution":
      return TestExecutionSchema.parse(payload);
    case "manual_verification":
      return ManualVerificationSchema.parse(payload);
    case "approval_decision":
      return ApprovalDecisionSchema.parse(payload);
    case "branch_snapshot":
      return BranchSnapshotSchema.parse(payload);
    case "final_writeback":
      return FinalWritebackSchema.parse(payload);
    case "analysis_snapshot":
      return z.record(z.string(), z.unknown()).parse(payload);
    default:
      return payload;
  }
}

export function hasCapability(actor: ActorSnapshot, capability: Capability): boolean {
  return actor.operatorCapabilities.includes(capability);
}

export const defaultDevActor: ActorSnapshot = {
  operatorId: "dev-operator",
  operatorEmail: "dev.operator@example.com",
  operatorDisplayName: "Dev Operator",
  operatorCapabilities: [...capabilityValues],
};
