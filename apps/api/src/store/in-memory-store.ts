import type {
  ActorSnapshot,
  EvidenceRecord,
  FlowLog,
  FlowRun,
  ManualActionInput,
  StageRun,
  WorkItem,
} from "@rdaf/domain";
import type { FlowStore } from "../types.js";

export class InMemoryFlowStore implements FlowStore {
  private readonly flows = new Map<string, FlowRun>();
  private readonly workItems = new Map<string, WorkItem>();
  private readonly stageRuns = new Map<string, StageRun[]>();
  private readonly logs = new Map<string, FlowLog[]>();
  private readonly evidence = new Map<string, EvidenceRecord[]>();
  private readonly actions = new Map<
    string,
    Array<{
      id: string;
      flowRunId: string;
      actionType: ManualActionInput["actionType"];
      payload: Record<string, unknown>;
      note: string;
      actor: ActorSnapshot;
      result: "accepted" | "rejected" | "applied" | "failed";
      createdAt: string;
    }>
  >();

  listFlows(): FlowRun[] {
    return [...this.flows.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getFlow(flowRunId: string): FlowRun | undefined {
    return this.flows.get(flowRunId);
  }

  saveFlow(flowRun: FlowRun): void {
    this.flows.set(flowRun.id, flowRun);
  }

  listWorkItems(): WorkItem[] {
    return [...this.workItems.values()];
  }

  getWorkItem(workItemId: string): WorkItem | undefined {
    return this.workItems.get(workItemId);
  }

  getWorkItemByJiraKey(jiraKey: string): WorkItem | undefined {
    return [...this.workItems.values()].find((item) => item.jiraKey === jiraKey);
  }

  saveWorkItem(workItem: WorkItem): void {
    this.workItems.set(workItem.id, workItem);
  }

  listStageRuns(flowRunId: string): StageRun[] {
    return [...(this.stageRuns.get(flowRunId) ?? [])];
  }

  saveStageRun(flowRunId: string, stageRun: StageRun): void {
    const items = this.stageRuns.get(flowRunId) ?? [];
    const idx = items.findIndex((item) => item.id === stageRun.id);
    if (idx >= 0) {
      items[idx] = stageRun;
    } else {
      items.push(stageRun);
    }
    this.stageRuns.set(flowRunId, items);
  }

  listLogs(flowRunId: string): FlowLog[] {
    return [...(this.logs.get(flowRunId) ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  saveLog(flowRunId: string, log: FlowLog): Promise<void> {
    const items = this.logs.get(flowRunId) ?? [];
    items.push(log);
    this.logs.set(flowRunId, items);
    return Promise.resolve();
  }

  listEvidence(flowRunId: string): EvidenceRecord[] {
    return [...(this.evidence.get(flowRunId) ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  saveEvidence(flowRunId: string, evidence: EvidenceRecord): void {
    const items = this.evidence.get(flowRunId) ?? [];
    items.push(evidence);
    this.evidence.set(flowRunId, items);
  }

  listManualActions(flowRunId: string) {
    return [...(this.actions.get(flowRunId) ?? [])];
  }

  saveManualAction(
    flowRunId: string,
    action: {
      id: string;
      flowRunId: string;
      actionType: ManualActionInput["actionType"];
      payload: Record<string, unknown>;
      note: string;
      actor: ActorSnapshot;
      result: "accepted" | "rejected" | "applied" | "failed";
      createdAt: string;
    },
  ): void {
    const items = this.actions.get(flowRunId) ?? [];
    items.push(action);
    this.actions.set(flowRunId, items);
  }

  findActiveFlowByJiraKey(jiraKey: string): FlowRun | undefined {
    const workItem = this.getWorkItemByJiraKey(jiraKey);
    if (!workItem) {
      return undefined;
    }

    return this.listFlows().find((flow) => {
      return (
        flow.workItemId === workItem.id &&
        ["running", "waiting_manual_action", "paused"].includes(flow.overallStatus)
      );
    });
  }

  // ── Async variants (passthrough to sync for in-memory store) ─────────────────

  listFlowsAsync(): Promise<FlowRun[]> {
    return Promise.resolve(this.listFlows());
  }

  getFlowAsync(flowRunId: string): Promise<FlowRun | undefined> {
    return Promise.resolve(this.getFlow(flowRunId));
  }

  saveFlowAsync(flowRun: FlowRun): Promise<void> {
    this.saveFlow(flowRun);
    return Promise.resolve();
  }

  listStageRunsAsync(flowRunId: string): Promise<StageRun[]> {
    return Promise.resolve(this.listStageRuns(flowRunId));
  }

  saveStageRunAsync(flowRunId: string, stageRun: StageRun): Promise<void> {
    this.saveStageRun(flowRunId, stageRun);
    return Promise.resolve();
  }

  saveLogAsync(flowRunId: string, log: FlowLog): Promise<void> {
    return this.saveLog(flowRunId, log);
  }

  saveEvidenceAsync(flowRunId: string, evidence: EvidenceRecord): Promise<void> {
    this.saveEvidence(flowRunId, evidence);
    return Promise.resolve();
  }

  saveManualActionAsync(
    flowRunId: string,
    action: {
      id: string;
      flowRunId: string;
      actionType: ManualActionInput["actionType"];
      payload: Record<string, unknown>;
      note: string;
      actor: ActorSnapshot;
      result: "accepted" | "rejected" | "applied" | "failed";
      createdAt: string;
    },
  ): Promise<void> {
    this.saveManualAction(flowRunId, action);
    return Promise.resolve();
  }
}
