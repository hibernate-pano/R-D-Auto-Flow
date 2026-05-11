import { randomUUID } from "node:crypto";
import {
  CreateFlowInputSchema,
  defaultDevActor,
  DomainError,
  errorCodes,
  EvidenceInputSchema,
  FlowDetailSchema,
  FlowSummarySchema,
  hasCapability,
  ManualActionInputSchema,
  nextStage,
  nowIso,
  type ActorSnapshot,
  type CreateFlowInput,
  type EvidenceInput,
  type FlowRun,
  type ManualActionInput,
  type ManualActionType,
  type StageName,
  type StageRun,
  type WorkItem,
  validateEvidencePayload,
} from "@rdaf/domain";
import type { RuntimeConfig } from "@rdaf/config-contract";
import type { AutoStageHandlerResult, FlowDetailPayload, FlowPrecheckPayload, RuntimeContext } from "./types.js";
import { createLogger } from "./telemetry/logger.js";

const log = createLogger("flow-service");

const jiraKeyPattern = /^[A-Z][A-Z0-9]+-\d+$/;

export class FlowService {
  constructor(private readonly context: RuntimeContext) {}

  listFlows() {
    return this.context.store.listFlows().map((flow) => {
      const workItem = this.context.store.getWorkItem(flow.workItemId);
      return FlowSummarySchema.parse({
        id: flow.id,
        jiraKey: workItem?.jiraKey ?? "UNKNOWN",
        jiraTitle: workItem?.jiraTitle ?? "Unknown ticket",
        currentStage: flow.currentStage,
        overallStatus: flow.overallStatus,
        triggerMode: flow.triggerMode,
        manualActionRequired: flow.manualActionRequired,
        updatedAt: flow.updatedAt,
      });
    });
  }

  async searchTickets(query: string) {
    return this.context.jira.searchTickets(query);
  }

  async precheck(jiraKey: string): Promise<FlowPrecheckPayload> {
    this.assertJiraKey(jiraKey);
    const ticket = await this.context.jira.getTicketByKey(jiraKey);
    const activeFlow = this.context.store.findActiveFlowByJiraKey(jiraKey);
    const repoMapping = this.resolveRepoMapping(ticket.jiraProjectKey, null);

    return {
      jiraKey,
      ticketExists: true,
      repoResolved: Boolean(repoMapping),
      repoName: repoMapping?.repoName ?? null,
      baseBranch: repoMapping?.baseBranch ?? null,
      hasRunningFlow: Boolean(activeFlow),
      existingFlowRunId: activeFlow?.id ?? null,
      existingStatus: activeFlow?.overallStatus ?? null,
      existingStage: activeFlow?.currentStage ?? null,
      message: activeFlow
        ? `Active flow ${activeFlow.id} already exists for ${jiraKey}`
        : `Ready to create flow for ${jiraKey}`,
    };
  }

  async createFlow(input: CreateFlowInput, actor: ActorSnapshot = defaultDevActor) {
    const payload = CreateFlowInputSchema.parse(input);
    const precheck = await this.precheck(payload.jiraKey);

    if (precheck.hasRunningFlow && payload.triggerMode === "manual_start") {
      throw new DomainError(errorCodes.flowConflict, "Current Jira ticket already has an active flow", {
        jiraKey: payload.jiraKey,
        flowRunId: precheck.existingFlowRunId,
        existingStatus: precheck.existingStatus,
        existingStage: precheck.existingStage,
      });
    }

    const ticket = await this.context.jira.getTicketByKey(payload.jiraKey);
    const now = nowIso();
    const workItem =
      this.context.store.getWorkItemByJiraKey(payload.jiraKey) ??
      {
        id: randomUUID(),
        jiraKey: ticket.jiraKey,
        jiraTitle: ticket.title,
        jiraDescription: ticket.description,
        jiraStatus: ticket.status,
        jiraProjectKey: ticket.jiraProjectKey,
        assignee: ticket.assignee,
        sourceConfluenceUrls: [],
        sourceConfluenceDigest: [],
        analysisPageUrl: null,
        analysisPageId: null,
        repoName: null,
        repoUrl: null,
        baseBranch: null,
        baseCommitSha: null,
        workingBranch: null,
        implementationSummary: null,
        testSummary: null,
        createdAt: now,
        updatedAt: now,
      } satisfies WorkItem;

    await this.context.store.saveWorkItem(workItem);

    const startingStage: StageName =
      payload.triggerMode === "resume_from_failure" && payload.resumeFromStage
        ? (payload.resumeFromStage as StageName)
        : "manual_request_received";

    const flowRun: FlowRun = {
      id: randomUUID(),
      workItemId: workItem.id,
      triggerMode: payload.triggerMode,
      currentStage: startingStage,
      overallStatus: "pending",
      blockingReasonCode: null,
      blockingReasonMessage: null,
      manualActionRequired: false,
      manualActionType: null,
      sourceFlowRunId: payload.sourceFlowRunId,
      resumeFromStage: payload.resumeFromStage,
      repoOverride: payload.repoOverride,
      operator: actor,
      startedAt: now,
      updatedAt: now,
      completedAt: null,
    };

    await this.context.store.saveFlow(flowRun);
    this.log(flowRun.id, flowRun.currentStage, "info", "flow_created", `Created flow ${flowRun.id}`, {
      jiraKey: payload.jiraKey,
      triggerMode: payload.triggerMode,
    });
    await this.executeAutomaticStages(flowRun.id);

    const updatedFlow = this.requireFlow(flowRun.id);
    return {
      flowRunId: flowRun.id,
      workItemId: workItem.id,
      overallStatus: updatedFlow.overallStatus,
      currentStage: updatedFlow.currentStage,
    };
  }

  /**
   * Advance a flow by executing one automatic stage.
   * Called by the persistent WorkflowRunner after a manual action unblocks a flow.
   * Returns true if the flow was advanced, false if nothing to do.
   */
  async executeStageForRunner(flowRunId: string): Promise<boolean> {
    const flow = this.requireFlow(flowRunId);
    if (
      flow.overallStatus !== "running" ||
      flow.manualActionRequired ||
      flow.currentStage === "completed"
    ) {
      return false;
    }

    const result = await this.runCurrentStage(flow);
    if (result.outcome === "stop") {
      return true;
    }

    await this.transitionTo(this.requireFlow(flowRunId), result.nextStage, "running");
    return true;
  }

  getFlowDetail(flowRunId: string): FlowDetailPayload {
    const flowRun = this.requireFlow(flowRunId);
    const workItem = this.requireWorkItem(flowRun.workItemId);
    return FlowDetailSchema.parse({
      flowRun,
      workItem,
      stageRuns: this.context.store.listStageRuns(flowRunId),
      logs: this.context.store.listLogs(flowRunId),
      evidence: this.context.store.listEvidence(flowRunId),
      availableActions: this.availableActions(flowRun),
    });
  }

  listLogs(flowRunId: string) {
    this.requireFlow(flowRunId);
    return this.context.store.listLogs(flowRunId);
  }

  listEvidence(
    flowRunId: string,
    filters?: {
      stageName?: string;
      evidenceType?: string;
      createdAt?: string;
      operator?: string;
    },
  ) {
    this.requireFlow(flowRunId);
    let items = this.context.store.listEvidence(flowRunId);
    if (filters?.stageName) {
      items = items.filter((e) => e.stageName === filters.stageName);
    }
    if (filters?.evidenceType) {
      items = items.filter((e) => e.evidenceType === filters.evidenceType);
    }
    if (filters?.createdAt) {
      items = items.filter((e) => e.createdAt === filters.createdAt);
    }
    if (filters?.operator) {
      items = items.filter((e) => e.actor.operatorId === filters.operator);
    }
    return items;
  }

  availableActionsForFlow(flowRunId: string) {
    return this.availableActions(this.requireFlow(flowRunId));
  }

  async submitEvidence(flowRunId: string, input: EvidenceInput, actor: ActorSnapshot = defaultDevActor) {
    if (!hasCapability(actor, "flow:submit-evidence")) {
      throw new DomainError(errorCodes.approvalCapabilityRequired, "Operator cannot submit evidence");
    }

    const payload = EvidenceInputSchema.parse(input);
    const flow = this.requireFlow(flowRunId);
    const workItem = this.requireWorkItem(flow.workItemId);
    if (payload.stageName !== flow.currentStage) {
      throw new DomainError(
        errorCodes.evidenceInvalid,
        `Evidence for ${payload.stageName} cannot be recorded while flow is at ${flow.currentStage}`,
        {
          currentStage: flow.currentStage,
          evidenceStage: payload.stageName,
          evidenceType: payload.evidenceType,
        },
      );
    }
    const parsedPayload = validateEvidencePayload(payload.evidenceType, payload.payload);
    const evidence = {
      id: randomUUID(),
      flowRunId,
      stageName: payload.stageName,
      evidenceType: payload.evidenceType,
      payload: parsedPayload,
      actor,
      sourceSystem: "operator" as const,
      createdAt: nowIso(),
    };

    await this.context.store.saveEvidenceAsync(flowRunId, evidence);
    this.log(flowRunId, payload.stageName, "info", "evidence_recorded", `Recorded ${payload.evidenceType}`, {
      evidenceType: payload.evidenceType,
    });

    if (payload.evidenceType === "implementation_note") {
      workItem.implementationSummary = (parsedPayload as { summary: string }).summary;
      workItem.updatedAt = nowIso();
      await this.context.store.saveWorkItemAsync(workItem);
      if (flow.currentStage === "implementation_waiting") {
        await this.transitionTo(flow, "verification_waiting", "waiting_manual_action", {
          manualActionRequired: true,
          manualActionType: "resume",
          blockingReasonCode: null,
          blockingReasonMessage: "Implementation evidence recorded. Submit verification evidence next.",
        });
      }
    }

    if (payload.evidenceType === "test_execution" || payload.evidenceType === "manual_verification") {
      workItem.testSummary =
        payload.evidenceType === "test_execution"
          ? (parsedPayload as { summary: string }).summary
          : (parsedPayload as { conclusion: string }).conclusion;
      workItem.updatedAt = nowIso();
      await this.context.store.saveWorkItemAsync(workItem);
      if (flow.currentStage === "verification_waiting") {
        if (this.context.config.workflow.requireVerificationApproval) {
          await this.transitionTo(flow, "verification_approval_waiting", "waiting_manual_action", {
            manualActionRequired: true,
            manualActionType: "approve_verification",
            blockingReasonCode: null,
            blockingReasonMessage: "Verification evidence recorded. Approval required.",
          });
        } else {
          await this.transitionTo(flow, "confluence_result_updating", "running");
          await this.executeAutomaticStages(flow.id);
        }
      }
    }

    return {
      evidenceId: evidence.id,
      flowRunId,
      operator: actor.operatorId,
      recordedAt: evidence.createdAt,
    };
  }

  async submitAction(flowRunId: string, input: ManualActionInput, actor: ActorSnapshot = defaultDevActor) {
    const action = ManualActionInputSchema.parse(input);
    const flow = this.requireFlow(flowRunId);
    const accepted = this.availableActions(flow).includes(action.actionType);

    this.context.store.saveManualAction(flowRunId, {
      id: randomUUID(),
      flowRunId,
      actionType: action.actionType,
      payload: action.payload,
      note: action.note,
      actor,
      result: accepted ? "accepted" : "rejected",
      createdAt: nowIso(),
    });

    if (!accepted) {
      throw new DomainError(errorCodes.actionNotAllowed, "Current flow state does not allow this action", {
        actionType: action.actionType,
        currentStage: flow.currentStage,
        overallStatus: flow.overallStatus,
      });
    }

    switch (action.actionType) {
      case "pause":
        if (!hasCapability(actor, "flow:pause")) {
          throw new DomainError(errorCodes.actionNotAllowed, "Pause capability missing");
        }
        flow.overallStatus = "paused";
        flow.updatedAt = nowIso();
        flow.manualActionRequired = true;
        await this.context.store.saveFlowAsync(flow);
        break;
      case "resume":
        if (!hasCapability(actor, "flow:resume")) {
          throw new DomainError(errorCodes.actionNotAllowed, "Resume capability missing");
        }
        if (flow.overallStatus === "paused") {
          flow.overallStatus = "running";
          flow.manualActionRequired = false;
          flow.blockingReasonCode = null;
          flow.blockingReasonMessage = null;
          await this.context.store.saveFlowAsync(flow);
          await this.executeAutomaticStages(flow.id);
        }
        break;
      case "cancel":
        flow.overallStatus = "cancelled";
        flow.completedAt = nowIso();
        flow.updatedAt = flow.completedAt;
        await this.context.store.saveFlowAsync(flow);
        break;
      case "retry_stage":
        flow.overallStatus = "running";
        flow.manualActionRequired = false;
        flow.blockingReasonCode = null;
        flow.blockingReasonMessage = null;
        await this.context.store.saveFlowAsync(flow);
        await this.executeAutomaticStages(flow.id);
        break;
      case "set_repo_override":
        flow.repoOverride = String(action.payload.repoName ?? action.payload.repoOverride ?? "");
        await this.transitionTo(flow, "repo_resolving", "running");
        await this.executeAutomaticStages(flow.id);
        break;
      case "set_confluence_links": {
        const workItem = this.requireWorkItem(flow.workItemId);
        const urls = Array.isArray(action.payload.urls)
          ? action.payload.urls.map((value) => String(value))
          : [];
        workItem.sourceConfluenceUrls = urls;
        workItem.updatedAt = nowIso();
        await this.context.store.saveWorkItemAsync(workItem);
        await this.transitionTo(flow, "source_pages_fetching", "running");
        await this.executeAutomaticStages(flow.id);
        break;
      }
      case "approve_analysis":
        if (!hasCapability(actor, "flow:approve-analysis")) {
          throw new DomainError(errorCodes.approvalCapabilityRequired, "Analysis approval capability missing");
        }
        await this.context.store.saveEvidenceAsync(flow.id, {
          id: randomUUID(),
          flowRunId: flow.id,
          stageName: "analysis_approval_waiting",
          evidenceType: "approval_decision",
          payload: {
            checkpoint: "analysis",
            outcome: "approved",
            note: action.note,
          },
          actor,
          sourceSystem: "operator",
          createdAt: nowIso(),
        });
        await this.transitionTo(flow, "repo_resolving", "running");
        await this.executeAutomaticStages(flow.id);
        break;
      case "request_analysis_changes":
        await this.transitionTo(flow, "analysis_approval_waiting", "waiting_manual_action", {
          manualActionRequired: true,
          manualActionType: "approve_analysis",
          blockingReasonCode: "ANALYSIS_CHANGES_REQUESTED",
          blockingReasonMessage: action.note || "Analysis changes requested.",
        });
        break;
      case "approve_verification":
        if (!hasCapability(actor, "flow:approve-verification")) {
          throw new DomainError(errorCodes.approvalCapabilityRequired, "Verification approval capability missing");
        }
        await this.context.store.saveEvidenceAsync(flow.id, {
          id: randomUUID(),
          flowRunId: flow.id,
          stageName: "verification_approval_waiting",
          evidenceType: "approval_decision",
          payload: {
            checkpoint: "verification",
            outcome: "approved",
            note: action.note,
          },
          actor,
          sourceSystem: "operator",
          createdAt: nowIso(),
        });
        await this.transitionTo(flow, "confluence_result_updating", "running");
        await this.executeAutomaticStages(flow.id);
        break;
      case "request_verification_changes":
        await this.transitionTo(flow, "verification_waiting", "waiting_manual_action", {
          manualActionRequired: true,
          manualActionType: "resume",
          blockingReasonCode: "VERIFICATION_CHANGES_REQUESTED",
          blockingReasonMessage: action.note || "Verification changes requested.",
        });
        break;
      case "skip_stage": {
        if (!hasCapability(actor, "flow:skip")) {
          throw new DomainError(errorCodes.actionNotAllowed, "Skip capability missing");
        }
        const target = nextStage(flow.currentStage);
        if (!target) {
          throw new DomainError(errorCodes.actionNotAllowed, "Cannot skip final stage");
        }
        await this.transitionTo(flow, target, "running");
        await this.executeAutomaticStages(flow.id);
        break;
      }
    }

    this.log(flow.id, flow.currentStage, "info", "manual_action_applied", `Applied ${action.actionType}`, {
      actionType: action.actionType,
    });

    return {
      flowRunId: flow.id,
      overallStatus: flow.overallStatus,
      currentStage: flow.currentStage,
      actionRecorded: true,
    };
  }

  private async executeAutomaticStages(flowRunId: string): Promise<void> {
    let flow = this.requireFlow(flowRunId);

    while (flow.overallStatus === "pending" || flow.overallStatus === "running") {
      const result = await this.runCurrentStage(flow);
      flow = this.requireFlow(flowRunId);
      if (result.outcome === "stop") {
        return;
      }
      await this.transitionTo(flow, result.nextStage, "running");
    }
  }

  private async runCurrentStage(flow: FlowRun): Promise<AutoStageHandlerResult> {
    const stageRun = await this.startStageRun(flow);
    await this.logAsync(flow.id, flow.currentStage, "info", "stage_started", `Started ${flow.currentStage}`, {});

    try {
      switch (flow.currentStage) {
        case "manual_request_received":
          await this.finishStageRun(flow.id, stageRun, "succeeded");
          return { outcome: "continue", nextStage: "jira_ticket_fetching" };
        case "jira_ticket_fetching":
          this.requireWorkItem(flow.workItemId);
          await this.finishStageRun(flow.id, stageRun, "succeeded");
          return { outcome: "continue", nextStage: "jira_ticket_normalized" };
        case "jira_ticket_normalized": {
          const workItem = this.requireWorkItem(flow.workItemId);
          const ticket = await this.context.jira.getTicketByKey(workItem.jiraKey);
          workItem.jiraTitle = ticket.title;
          workItem.jiraDescription = ticket.description;
          workItem.jiraStatus = ticket.status;
          workItem.jiraProjectKey = ticket.jiraProjectKey;
          workItem.assignee = ticket.assignee;
          workItem.updatedAt = nowIso();
          await this.context.store.saveWorkItem(workItem);
          await this.finishStageRun(flow.id, stageRun, "succeeded");
          return { outcome: "continue", nextStage: "confluence_links_extracting" };
        }
        case "confluence_links_extracting": {
          const workItem = this.requireWorkItem(flow.workItemId);
          const urls = Array.from(workItem.jiraDescription.matchAll(/https:\/\/confluence\.example\.com\/[^\s]+/g)).map(
            (match) => match[0],
          );
          workItem.sourceConfluenceUrls = urls;
          workItem.updatedAt = nowIso();
          await this.context.store.saveWorkItem(workItem);
          await this.finishStageRun(flow.id, stageRun, "succeeded");
          return { outcome: "continue", nextStage: "source_pages_fetching" };
        }
        case "source_pages_fetching": {
          const workItem = this.requireWorkItem(flow.workItemId);
          const digests = [];
          for (const url of workItem.sourceConfluenceUrls) {
            digests.push(await this.context.confluence.getPageByUrl(url));
          }
          workItem.sourceConfluenceDigest = digests;
          workItem.updatedAt = nowIso();
          await this.context.store.saveWorkItem(workItem);
          await this.finishStageRun(flow.id, stageRun, "succeeded");
          return { outcome: "continue", nextStage: "analysis_generating" };
        }
        case "analysis_generating": {
          const workItem = this.requireWorkItem(flow.workItemId);
          const ticket = await this.context.jira.getTicketByKey(workItem.jiraKey);
          const analysis = await this.context.llm.generateAnalysis({
            ticket,
            sourcePages: workItem.sourceConfluenceDigest,
          });
          await this.context.store.saveEvidence(flow.id, {
            id: randomUUID(),
            flowRunId: flow.id,
            stageName: "analysis_generating",
            evidenceType: "analysis_snapshot",
            payload: analysis,
            actor: flow.operator,
            sourceSystem: "system",
            createdAt: nowIso(),
          });
          await this.finishStageRun(flow.id, stageRun, "succeeded");
          return { outcome: "continue", nextStage: "analysis_page_creating" };
        }
        case "analysis_page_creating": {
          const workItem = this.requireWorkItem(flow.workItemId);
          const analysisEvidence = this.context.store
            .listEvidence(flow.id)
            .slice()
            .reverse()
            .find((item) => item.evidenceType === "analysis_snapshot");
          const space = this.context.config.confluence.defaultSpaceByProject[workItem.jiraProjectKey];
          const parentPageId =
            this.context.config.confluence.defaultParentPageIdByProject[workItem.jiraProjectKey];
          if (!space || !parentPageId) {
            throw new DomainError(errorCodes.configInvalid, "Confluence target configuration is missing", {
              jiraProjectKey: workItem.jiraProjectKey,
            });
          }
          const page = await this.context.confluence.createAnalysisPage({
            jiraKey: workItem.jiraKey,
            jiraTitle: workItem.jiraTitle,
            space,
            parentPageId,
            markdown: String((analysisEvidence?.payload as { markdown?: string })?.markdown ?? ""),
          });
          workItem.analysisPageId = page.pageId;
          workItem.analysisPageUrl = page.pageUrl;
          workItem.updatedAt = nowIso();
          await this.context.store.saveWorkItem(workItem);
          await this.finishStageRun(flow.id, stageRun, "succeeded");
          await this.transitionTo(flow, "analysis_approval_waiting", "waiting_manual_action", {
            manualActionRequired: true,
            manualActionType: "approve_analysis",
            blockingReasonCode: null,
            blockingReasonMessage: "Analysis page created. Approval required.",
          });
          return { outcome: "stop" };
        }
        case "repo_resolving": {
          const workItem = this.requireWorkItem(flow.workItemId);
          const repoMapping = this.resolveRepoMapping(workItem.jiraProjectKey, flow.repoOverride);
          if (!repoMapping) {
            throw new DomainError(errorCodes.repoNotResolved, "Repo mapping is missing", {
              jiraProjectKey: workItem.jiraProjectKey,
            });
          }
          workItem.repoName = repoMapping.repoName;
          workItem.repoUrl = repoMapping.repoUrl;
          workItem.baseBranch = repoMapping.baseBranch;
          workItem.updatedAt = nowIso();
          await this.context.store.saveWorkItem(workItem);
          await this.finishStageRun(flow.id, stageRun, "succeeded");
          return { outcome: "continue", nextStage: "branch_preparing" };
        }
        case "branch_preparing": {
          const workItem = this.requireWorkItem(flow.workItemId);
          if (!workItem.repoName || !workItem.repoUrl || !workItem.baseBranch) {
            throw new DomainError(errorCodes.repoNotResolved, "Cannot prepare branch without repo resolution");
          }
          const prepared = await this.context.github.prepareBranch({
            jiraKey: workItem.jiraKey,
            repoName: workItem.repoName,
            repoUrl: workItem.repoUrl,
            baseBranch: workItem.baseBranch,
          });
          if (prepared.branchResult === "blocked_diverged") {
            throw new DomainError(errorCodes.branchDiverged, "Existing branch diverged from expected base lineage", {
              workingBranch: prepared.workingBranch,
            });
          }
          workItem.baseCommitSha = prepared.baseCommitSha;
          workItem.workingBranch = prepared.workingBranch;
          workItem.updatedAt = nowIso();
          await this.context.store.saveWorkItem(workItem);
          await this.context.store.saveEvidence(flow.id, {
            id: randomUUID(),
            flowRunId: flow.id,
            stageName: "branch_preparing",
            evidenceType: "branch_snapshot",
            payload: prepared,
            actor: flow.operator,
            sourceSystem: "system",
            createdAt: nowIso(),
          });
          if (workItem.analysisPageId) {
            await this.context.confluence.appendToAnalysisPage(
              workItem.analysisPageId,
              `## Branch snapshot\n\n- Repo: ${prepared.repoName}\n- Base branch: ${prepared.baseBranch}\n- Base commit: ${prepared.baseCommitSha}\n- Working branch: ${prepared.workingBranch}`,
            );
          }
          await this.finishStageRun(flow.id, stageRun, "succeeded");
          await this.transitionTo(flow, "implementation_waiting", "waiting_manual_action", {
            manualActionRequired: true,
            manualActionType: "resume",
            blockingReasonCode: null,
            blockingReasonMessage: "Branch is ready. Submit implementation evidence to continue.",
          });
          return { outcome: "stop" };
        }
        case "confluence_result_updating": {
          const workItem = this.requireWorkItem(flow.workItemId);
          if (workItem.analysisPageId) {
            await this.context.confluence.appendToAnalysisPage(
              workItem.analysisPageId,
              `## Final result\n\n- Implementation: ${workItem.implementationSummary ?? "n/a"}\n- Verification: ${workItem.testSummary ?? "n/a"}`,
            );
          }
          await this.context.store.saveEvidence(flow.id, {
            id: randomUUID(),
            flowRunId: flow.id,
            stageName: "confluence_result_updating",
            evidenceType: "final_writeback",
            payload: {
              confluenceUpdated: true,
              jiraUpdated: false,
              summary: "Confluence result updated",
            },
            actor: flow.operator,
            sourceSystem: "system",
            createdAt: nowIso(),
          });
          await this.finishStageRun(flow.id, stageRun, "succeeded");
          return { outcome: "continue", nextStage: "jira_status_updating" };
        }
        case "jira_status_updating": {
          const workItem = this.requireWorkItem(flow.workItemId);
          const doneStatus = this.context.config.jira.doneStatusByProject[workItem.jiraProjectKey];
          if (!doneStatus) {
            throw new DomainError(errorCodes.configInvalid, "Jira done status mapping is missing", {
              jiraProjectKey: workItem.jiraProjectKey,
            });
          }
          await this.context.jira.transitionTicket(workItem.jiraKey, doneStatus);
          await this.finishStageRun(flow.id, stageRun, "succeeded");
          return { outcome: "continue", nextStage: "completed" };
        }
        case "completed":
          await this.transitionTo(flow, "completed", "completed", {
            manualActionRequired: false,
            manualActionType: null,
            blockingReasonCode: null,
            blockingReasonMessage: null,
            completedAt: nowIso(),
          });
          return { outcome: "stop" };
        case "analysis_approval_waiting":
        case "implementation_waiting":
        case "verification_waiting":
        case "verification_approval_waiting":
          await this.finishStageRun(flow.id, stageRun, "waiting_manual_action");
          return { outcome: "stop" };
      }
    } catch (error) {
      if (error instanceof DomainError) {
        await this.finishStageRun(flow.id, stageRun, "failed", error.code, error.message);
        flow.overallStatus = "waiting_manual_action";
        flow.manualActionRequired = true;
        flow.manualActionType = flow.currentStage === "repo_resolving" ? "set_repo_override" : "retry_stage";
        flow.blockingReasonCode = error.code;
        flow.blockingReasonMessage = error.message;
        flow.updatedAt = nowIso();
        await this.context.store.saveFlow(flow);
        await this.logAsync(flow.id, flow.currentStage, "error", "stage_failed", error.message, error.details ?? {});
        return { outcome: "stop" };
      }
      throw error;
    }
  }

  private async startStageRun(flow: FlowRun): Promise<StageRun> {
    const now = nowIso();
    const existing = this.context.store
      .listStageRuns(flow.id)
      .filter((item) => item.stageName === flow.currentStage)
      .sort((a, b) => a.attemptNo - b.attemptNo);
    const stageRun: StageRun = {
      id: randomUUID(),
      stageName: flow.currentStage,
      status: "running",
      attemptNo: (existing.length > 0 ? existing[existing.length - 1]!.attemptNo : 0) + 1,
      startedAt: now,
      finishedAt: null,
      durationMs: null,
      errorCode: null,
      errorMessage: null,
      requiresManualAction: false,
      manualActionType: null,
      leaseOwner: "workflow-runner",
      leaseExpiresAt: new Date(Date.now() + 30_000).toISOString(),
      lastHeartbeatAt: now,
    };
    await this.context.store.saveStageRunAsync(flow.id, stageRun);
    flow.overallStatus = "running";
    flow.updatedAt = now;
    await this.context.store.saveFlowAsync(flow);
    return stageRun;
  }

  private async finishStageRun(
    flowRunId: string,
    stageRun: StageRun,
    status: StageRun["status"],
    errorCode: string | null = null,
    errorMessage: string | null = null,
  ): Promise<void> {
    const finishedAt = nowIso();
    const updated: StageRun = {
      ...stageRun,
      status,
      finishedAt,
      durationMs: Math.max(1, Date.parse(finishedAt) - Date.parse(stageRun.startedAt)),
      errorCode,
      errorMessage,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastHeartbeatAt: finishedAt,
    };
    await this.context.store.saveStageRunAsync(flowRunId, updated);
  }

  private async transitionTo(
    flow: FlowRun,
    next: StageName,
    overallStatus: FlowRun["overallStatus"],
    overrides?: {
      manualActionRequired?: boolean;
      manualActionType?: ManualActionType | null;
      blockingReasonCode?: string | null;
      blockingReasonMessage?: string | null;
      completedAt?: string | null;
    },
  ): Promise<void> {
    flow.currentStage = next;
    flow.overallStatus = overallStatus;
    flow.manualActionRequired = overrides?.manualActionRequired ?? false;
    flow.manualActionType = overrides?.manualActionType ?? null;
    flow.blockingReasonCode = overrides?.blockingReasonCode ?? null;
    flow.blockingReasonMessage = overrides?.blockingReasonMessage ?? null;
    flow.updatedAt = nowIso();
    if (overrides?.completedAt !== undefined) {
      flow.completedAt = overrides.completedAt;
    }
    await this.context.store.saveFlowAsync(flow);
  }

  private availableActions(flow: FlowRun): ManualActionType[] {
    if (flow.overallStatus === "completed" || flow.overallStatus === "cancelled") {
      return [];
    }

    const actions: ManualActionType[] = ["pause", "cancel"];
    if (flow.overallStatus === "paused") {
      return ["resume", "cancel"];
    }
    if (flow.overallStatus === "waiting_manual_action") {
      actions.push("retry_stage");
      if (flow.currentStage === "analysis_approval_waiting") {
        actions.push("approve_analysis", "request_analysis_changes");
      }
      if (flow.currentStage === "verification_approval_waiting") {
        actions.push("approve_verification", "request_verification_changes");
      }
      if (flow.currentStage === "repo_resolving" || flow.currentStage === "branch_preparing") {
        actions.push("set_repo_override");
      }
      if (flow.currentStage === "source_pages_fetching") {
        actions.push("set_confluence_links", "skip_stage");
      }
    }
    return Array.from(new Set(actions));
  }

  private resolveRepoMapping(jiraProjectKey: string, repoOverride: string | null): RuntimeConfig["github"]["repoByProject"][string] | null {
    if (repoOverride) {
      return {
        repoName: repoOverride,
        repoUrl: `https://github.com/org/${repoOverride}`,
        baseBranch: "main",
      };
    }
    return this.context.config.github.repoByProject[jiraProjectKey] ?? null;
  }

  private assertJiraKey(jiraKey: string) {
    if (!jiraKeyPattern.test(jiraKey)) {
      throw new DomainError(errorCodes.invalidJiraKey, `Invalid Jira key: ${jiraKey}`);
    }
  }

  private requireFlow(flowRunId: string) {
    const flow = this.context.store.getFlow(flowRunId);
    if (!flow) {
      throw new DomainError(errorCodes.flowNotFound, `Flow ${flowRunId} was not found`);
    }
    return flow;
  }

  private requireWorkItem(workItemId: string) {
    const workItem = this.context.store.getWorkItem(workItemId);
    if (!workItem) {
      throw new DomainError(errorCodes.internalError, `Work item ${workItemId} was not found`);
    }
    return workItem;
  }

  private async logAsync(
    flowRunId: string,
    stageName: StageName,
    level: "debug" | "info" | "warn" | "error",
    eventType: string,
    message: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.context.store.saveLog(flowRunId, {
      id: randomUUID(),
      flowRunId,
      stageName,
      level,
      eventType,
      message,
      details,
      relatedObjectType: null,
      relatedObjectId: null,
      createdAt: nowIso(),
      redacted: true,
    });
  }

  private log(
    flowRunId: string,
    stageName: StageName,
    level: "debug" | "info" | "warn" | "error",
    eventType: string,
    message: string,
    details: Record<string, unknown>,
  ): void {
    // Fire-and-forget wrapper for places where we can't await
    this.logAsync(flowRunId, stageName, level, eventType, message, details).catch((err: unknown) => {
      log.error({ err, flowRunId, stageName }, "Failed to save flow log");
    });
  }
}
