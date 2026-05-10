import { describe, expect, it } from "vitest";
import { defaultDevActor, DomainError, errorCodes } from "@rdaf/domain";
import { EnvConfigSchema, RuntimeConfigSchema } from "@rdaf/config-contract";
import {
  MockConfluenceConnector,
  MockGithubConnector,
  MockJiraConnector,
  MockLlmConnector,
} from "./connectors/mock-connectors.js";
import { FlowService } from "./flow-service.js";
import { InMemoryFlowStore } from "./store/in-memory-store.js";

const runtimeConfig = RuntimeConfigSchema.parse({
  jira: { doneStatusByProject: { RD: "Done" } },
  confluence: {
    defaultSpaceByProject: { RD: "RDSPACE" },
    defaultParentPageIdByProject: { RD: "123456" },
  },
  github: {
    repoByProject: {
      RD: {
        repoName: "hsbc-rd-service",
        repoUrl: "https://github.com/org/hsbc-rd-service",
        baseBranch: "main",
      },
    },
  },
  workflow: {
    jiraCommentWritebackEnabled: false,
    requireAnalysisApproval: true,
    requireVerificationApproval: true,
  },
});

const envConfig = EnvConfigSchema.parse({
  DATABASE_URL: "memory://rdaf",
  GITHUB_TOKEN: "x",
  JIRA_TOKEN: "x",
  CONFLUENCE_TOKEN: "x",
  LLM_API_KEY: "x",
  LLM_BASE_URL: "http://127.0.0.1:14434",
  PORT: 3001,
});

function buildService() {
  return new FlowService({
    store: new InMemoryFlowStore(),
    jira: new MockJiraConnector(runtimeConfig),
    confluence: new MockConfluenceConnector(),
    github: new MockGithubConnector(),
    llm: new MockLlmConnector(),
    config: runtimeConfig,
    env: envConfig,
  });
}

describe("FlowService", () => {
  it("runs create flow until analysis approval waiting", async () => {
    const service = buildService();
    const created = await service.createFlow(
      {
        jiraKey: "RD-101",
        triggerMode: "manual_start",
        repoOverride: null,
        note: "",
        sourceFlowRunId: null,
        resumeFromStage: null,
      },
      defaultDevActor,
    );

    const detail = service.getFlowDetail(created.flowRunId);
    expect(detail.flowRun.currentStage).toBe("analysis_approval_waiting");
    expect(detail.flowRun.overallStatus).toBe("waiting_manual_action");
    expect(detail.workItem.analysisPageUrl).toContain("RD-101-analysis");
  });

  it("completes the full happy path with approval and evidence", async () => {
    const service = buildService();
    const created = await service.createFlow(
      {
        jiraKey: "RD-202",
        triggerMode: "manual_start",
        repoOverride: null,
        note: "",
        sourceFlowRunId: null,
        resumeFromStage: null,
      },
      defaultDevActor,
    );

    await service.submitAction(
      created.flowRunId,
      { actionType: "approve_analysis", payload: {}, note: "approved" },
      defaultDevActor,
    );
    await service.submitEvidence(
      created.flowRunId,
      {
        stageName: "implementation_waiting",
        evidenceType: "implementation_note",
        payload: {
          summary: "Implementation done",
          detail: "Core work finished",
        },
      },
      defaultDevActor,
    );
    await service.submitEvidence(
      created.flowRunId,
      {
        stageName: "verification_waiting",
        evidenceType: "test_execution",
        payload: {
          command: "pnpm test",
          result: "passed",
          summary: "all tests green",
          artifacts: [],
          coverageNote: "state machine and gates covered",
          riskNote: "no external integration run",
        },
      },
      defaultDevActor,
    );
    await service.submitAction(
      created.flowRunId,
      { actionType: "approve_verification", payload: {}, note: "verified" },
      defaultDevActor,
    );

    const detail = service.getFlowDetail(created.flowRunId);
    expect(detail.flowRun.overallStatus).toBe("completed");
    expect(detail.flowRun.currentStage).toBe("completed");
    expect(detail.evidence.some((item) => item.evidenceType === "branch_snapshot")).toBe(true);
    expect(detail.evidence.some((item) => item.evidenceType === "final_writeback")).toBe(true);
  });

  it("rejects a new manual_start when an active flow already exists", async () => {
    const service = buildService();
    await service.createFlow(
      {
        jiraKey: "RD-303",
        triggerMode: "manual_start",
        repoOverride: null,
        note: "",
        sourceFlowRunId: null,
        resumeFromStage: null,
      },
      defaultDevActor,
    );

    await expect(
      service.createFlow(
        {
          jiraKey: "RD-303",
          triggerMode: "manual_start",
          repoOverride: null,
          note: "",
          sourceFlowRunId: null,
          resumeFromStage: null,
        },
        defaultDevActor,
      ),
    ).rejects.toMatchObject({
      code: errorCodes.flowConflict,
    } satisfies Partial<DomainError>);
  });

  it("blocks on diverged branch lineage", async () => {
    const service = buildService();
    const created = await service.createFlow(
      {
        jiraKey: "RD-999",
        triggerMode: "manual_start",
        repoOverride: null,
        note: "",
        sourceFlowRunId: null,
        resumeFromStage: null,
      },
      defaultDevActor,
    );

    await service.submitAction(
      created.flowRunId,
      { actionType: "approve_analysis", payload: {}, note: "approved" },
      defaultDevActor,
    );

    const detail = service.getFlowDetail(created.flowRunId);
    expect(detail.flowRun.overallStatus).toBe("waiting_manual_action");
    expect(detail.flowRun.blockingReasonCode).toBe(errorCodes.branchDiverged);
    expect(detail.flowRun.currentStage).toBe("branch_preparing");
  });

  it("rejects evidence submitted for a non-current stage", async () => {
    const service = buildService();
    const created = await service.createFlow(
      {
        jiraKey: "RD-505",
        triggerMode: "manual_start",
        repoOverride: null,
        note: "",
        sourceFlowRunId: null,
        resumeFromStage: null,
      },
      defaultDevActor,
    );

    await expect(
      service.submitEvidence(
        created.flowRunId,
        {
          stageName: "verification_waiting",
          evidenceType: "test_execution",
          payload: {
            command: "pnpm test",
            result: "passed",
            summary: "premature verification",
            artifacts: [],
            coverageNote: "n/a",
            riskNote: "n/a",
          },
        },
        defaultDevActor,
      ),
    ).rejects.toMatchObject({
      code: errorCodes.evidenceInvalid,
    } satisfies Partial<DomainError>);
  });
});
