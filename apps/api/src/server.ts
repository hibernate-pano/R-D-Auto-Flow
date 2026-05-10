import Fastify from "fastify";
import {
  CreateFlowInputSchema,
  defaultDevActor,
  DomainError,
  errorCodes,
  EvidenceInputSchema,
  ManualActionInputSchema,
} from "@rdaf/domain";
import { loadRuntimeConfig } from "./config.js";
import {
  MockConfluenceConnector,
  MockGithubConnector,
  MockJiraConnector,
  MockLlmConnector,
} from "./connectors/mock-connectors.js";
import { FlowService } from "./flow-service.js";
import { InMemoryFlowStore } from "./store/in-memory-store.js";

function buildActorFromHeaders(headers: Record<string, unknown>) {
  const capabilities = String(headers["x-operator-capabilities"] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    operatorId: String(headers["x-operator-id"] ?? defaultDevActor.operatorId),
    operatorEmail: String(headers["x-operator-email"] ?? defaultDevActor.operatorEmail),
    operatorDisplayName: String(
      headers["x-operator-display-name"] ?? defaultDevActor.operatorDisplayName,
    ),
    operatorCapabilities: capabilities.length
      ? (capabilities as typeof defaultDevActor.operatorCapabilities)
      : defaultDevActor.operatorCapabilities,
  };
}

export async function buildServer(cwd: string) {
  const { config, env, summary } = loadRuntimeConfig(cwd);
  const app = Fastify({ logger: true });
  const service = new FlowService({
    config,
    env,
    store: new InMemoryFlowStore(),
    jira: new MockJiraConnector(config),
    confluence: new MockConfluenceConnector(),
    github: new MockGithubConnector(),
    llm: new MockLlmConnector(),
  });

  app.log.info({ summary }, "runtime config loaded");

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof DomainError) {
      void reply.status(error.code === errorCodes.flowConflict ? 409 : 400).send({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details ?? {},
        },
      });
      return;
    }
    void reply.status(500).send({
      success: false,
      error: {
        code: errorCodes.internalError,
        message: error instanceof Error ? error.message : "Internal error",
      },
    });
  });

  app.get("/api/health", async () => ({
    success: true,
    data: {
      status: "ok",
      services: {
        database: "memory",
        jira: "mock",
        confluence: "mock",
        github: "mock",
        llmBridge: env.LLM_BASE_URL,
      },
    },
    meta: {},
  }));

  app.get("/api/jira/issues/search", async (request) => {
    const query = String((request.query as { query?: string }).query ?? "");
    return {
      success: true,
      data: { items: await service.searchTickets(query) },
      meta: {},
    };
  });

  app.post("/api/flows/precheck", async (request) => {
    const jiraKey = String((request.body as { jiraKey?: string }).jiraKey ?? "");
    return {
      success: true,
      data: await service.precheck(jiraKey),
      meta: {},
    };
  });

  app.post("/api/flows", async (request) => {
    const actor = buildActorFromHeaders(request.headers as Record<string, unknown>);
    const body = CreateFlowInputSchema.parse(request.body);
    return {
      success: true,
      data: await service.createFlow(body, actor),
      meta: {},
    };
  });

  app.get("/api/flows", async () => ({
    success: true,
    data: { items: service.listFlows() },
    meta: {},
  }));

  app.get("/api/flows/:flowRunId", async (request) => ({
    success: true,
    data: service.getFlowDetail((request.params as { flowRunId: string }).flowRunId),
    meta: {},
  }));

  app.get("/api/flows/:flowRunId/logs", async (request) => ({
    success: true,
    data: { items: service.listLogs((request.params as { flowRunId: string }).flowRunId) },
    meta: {},
  }));

  app.get("/api/flows/:flowRunId/evidence", async (request) => ({
    success: true,
    data: { items: service.listEvidence((request.params as { flowRunId: string }).flowRunId) },
    meta: {},
  }));

  app.post("/api/flows/:flowRunId/evidence", async (request) => {
    const actor = buildActorFromHeaders(request.headers as Record<string, unknown>);
    const body = EvidenceInputSchema.parse(request.body);
    return {
      success: true,
      data: await service.submitEvidence(
        (request.params as { flowRunId: string }).flowRunId,
        body,
        actor,
      ),
      meta: {},
    };
  });

  app.get("/api/flows/:flowRunId/available-actions", async (request) => ({
    success: true,
    data: { actions: service.availableActionsForFlow((request.params as { flowRunId: string }).flowRunId) },
    meta: {},
  }));

  app.post("/api/flows/:flowRunId/actions", async (request) => {
    const actor = buildActorFromHeaders(request.headers as Record<string, unknown>);
    const body = ManualActionInputSchema.parse(request.body);
    return {
      success: true,
      data: await service.submitAction(
        (request.params as { flowRunId: string }).flowRunId,
        body,
        actor,
      ),
      meta: {},
    };
  });

  return { app, env };
}
