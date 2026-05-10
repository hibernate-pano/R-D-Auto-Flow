import type {
  ActorSnapshot,
  EvidenceRecord,
  FlowLog,
  FlowRun,
  ManualActionInput,
  PrecheckResult,
  StageName,
  StageRun,
  WorkItem,
} from "@rdaf/domain";

export interface JiraTicket {
  jiraKey: string;
  title: string;
  description: string;
  status: string;
  jiraProjectKey: string;
  assignee: string | null;
  comments: string[];
}

export interface ConfluencePageSummary {
  url: string;
  title: string;
  summary: string;
}

export interface AnalysisResult {
  title: string;
  markdown: string;
  sections: string[];
}

export interface PreparedBranchResult {
  repoName: string;
  repoUrl: string;
  baseBranch: string;
  baseCommitSha: string;
  workingBranch: string;
  branchResult: "created" | "reused" | "blocked_diverged" | "blocked_permission_denied";
}

export interface JiraConnector {
  searchTickets(query: string): Promise<Array<{ jiraKey: string; summary: string; status: string }>>;
  getTicketByKey(jiraKey: string): Promise<JiraTicket>;
  transitionTicket(jiraKey: string, targetStatus: string): Promise<void>;
}

export interface ConfluenceConnector {
  getPageByUrl(url: string): Promise<ConfluencePageSummary>;
  createAnalysisPage(input: {
    jiraKey: string;
    jiraTitle: string;
    space: string;
    parentPageId: string;
    markdown: string;
  }): Promise<{ pageId: string; pageUrl: string }>;
  appendToAnalysisPage(pageId: string, markdown: string): Promise<void>;
}

export interface GithubConnector {
  prepareBranch(input: {
    jiraKey: string;
    repoName: string;
    repoUrl: string;
    baseBranch: string;
  }): Promise<PreparedBranchResult>;
}

export interface LlmConnector {
  generateAnalysis(input: {
    ticket: JiraTicket;
    sourcePages: ConfluencePageSummary[];
  }): Promise<AnalysisResult>;
}

export interface FlowStore {
  listFlows(): FlowRun[];
  getFlow(flowRunId: string): FlowRun | undefined;
  saveFlow(flowRun: FlowRun): void;
  listWorkItems(): WorkItem[];
  getWorkItem(workItemId: string): WorkItem | undefined;
  getWorkItemByJiraKey(jiraKey: string): WorkItem | undefined;
  saveWorkItem(workItem: WorkItem): void;
  listStageRuns(flowRunId: string): StageRun[];
  saveStageRun(flowRunId: string, stageRun: StageRun): void;
  listLogs(flowRunId: string): FlowLog[];
  saveLog(flowRunId: string, log: FlowLog): void;
  listEvidence(flowRunId: string): EvidenceRecord[];
  saveEvidence(flowRunId: string, evidence: EvidenceRecord): void;
  listManualActions(flowRunId: string): Array<{
    id: string;
    flowRunId: string;
    actionType: ManualActionInput["actionType"];
    payload: Record<string, unknown>;
    note: string;
    actor: ActorSnapshot;
    result: "accepted" | "rejected" | "applied" | "failed";
    createdAt: string;
  }>;
  saveManualAction(flowRunId: string, action: {
    id: string;
    flowRunId: string;
    actionType: ManualActionInput["actionType"];
    payload: Record<string, unknown>;
    note: string;
    actor: ActorSnapshot;
    result: "accepted" | "rejected" | "applied" | "failed";
    createdAt: string;
  }): void;
  findActiveFlowByJiraKey(jiraKey: string): FlowRun | undefined;
}

export interface RuntimeContext {
  store: FlowStore;
  jira: JiraConnector;
  confluence: ConfluenceConnector;
  github: GithubConnector;
  llm: LlmConnector;
  config: import("@rdaf/config-contract").RuntimeConfig;
  env: import("@rdaf/config-contract").EnvConfig;
}

export interface FlowDetailPayload {
  flowRun: FlowRun;
  workItem: WorkItem;
  stageRuns: StageRun[];
  logs: FlowLog[];
  evidence: EvidenceRecord[];
  availableActions: import("@rdaf/domain").ManualActionType[];
}

export interface FlowPrecheckPayload extends PrecheckResult {
  jiraKey: string;
  message: string;
}

export type AutoStageHandlerResult =
  | { outcome: "continue"; nextStage: StageName }
  | { outcome: "stop" };
