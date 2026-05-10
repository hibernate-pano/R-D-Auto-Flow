import { useEffect, useMemo, useState } from "react";
import {
  createFlow,
  fetchAvailableActions,
  fetchFlowDetail,
  fetchFlows,
  precheckFlow,
  submitAction,
  submitEvidence,
} from "./api.js";

type FlowSummary = {
  id: string;
  jiraKey: string;
  jiraTitle: string;
  currentStage: string;
  overallStatus: string;
  triggerMode: string;
  manualActionRequired: boolean;
  updatedAt: string;
};

type FlowDetail = {
  flowRun: Record<string, unknown>;
  workItem: Record<string, unknown>;
  stageRuns: Array<Record<string, unknown>>;
  logs: Array<Record<string, unknown>>;
  evidence: Array<Record<string, unknown>>;
  availableActions: string[];
};

export function App() {
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FlowDetail | null>(null);
  const [availableActions, setAvailableActions] = useState<string[]>([]);
  const [jiraKey, setJiraKey] = useState("RD-100");
  const [statusMessage, setStatusMessage] = useState<string>("Ready");
  const [search, setSearch] = useState("");

  async function refreshFlows(selected?: string | null) {
    const data = await fetchFlows();
    const items = data.items as FlowSummary[];
    setFlows(items);
    const nextSelected = selected ?? selectedFlowId ?? items[0]?.id ?? null;
    if (nextSelected) {
      await refreshDetail(nextSelected);
    }
  }

  async function refreshDetail(flowRunId: string) {
    const nextDetail = (await fetchFlowDetail(flowRunId)) as FlowDetail;
    const nextActions = await fetchAvailableActions(flowRunId);
    setSelectedFlowId(flowRunId);
    setDetail(nextDetail);
    setAvailableActions(nextActions.actions);
  }

  useEffect(() => {
    void refreshFlows();
  }, []);

  const filteredFlows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return flows;
    }
    return flows.filter((flow) => {
      return (
        flow.jiraKey.toLowerCase().includes(keyword) ||
        flow.jiraTitle.toLowerCase().includes(keyword) ||
        flow.id.toLowerCase().includes(keyword)
      );
    });
  }, [flows, search]);

  async function handleCreateFlow() {
    try {
      const precheck = await precheckFlow(jiraKey);
      setStatusMessage(String(precheck.message ?? "Precheck passed"));
      const created = await createFlow(jiraKey);
      await refreshFlows(created.flowRunId);
      setStatusMessage(`Created flow ${created.flowRunId}`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to create flow");
    }
  }

  async function handleAction(actionType: string) {
    if (!selectedFlowId) {
      return;
    }
    try {
      const payload =
        actionType === "set_repo_override"
          ? { repoName: "manual-override-repo" }
          : actionType === "set_confluence_links"
            ? { urls: ["https://confluence.example.com/manual-link"] }
            : {};
      await submitAction(selectedFlowId, { actionType: actionType as never, payload, note: actionType });
      await refreshFlows(selectedFlowId);
      setStatusMessage(`Action applied: ${actionType}`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Action failed");
    }
  }

  async function handleSubmitImplementationEvidence() {
    if (!selectedFlowId) {
      return;
    }
    await submitEvidence(selectedFlowId, {
      stageName: "implementation_waiting",
      evidenceType: "implementation_note",
      payload: {
        summary: "Implementation completed from workbench",
        detail: "Operator confirmed implementation completion.",
      },
    });
    await refreshFlows(selectedFlowId);
    setStatusMessage("Implementation evidence submitted");
  }

  async function handleSubmitVerificationEvidence() {
    if (!selectedFlowId) {
      return;
    }
    await submitEvidence(selectedFlowId, {
      stageName: "verification_waiting",
      evidenceType: "test_execution",
      payload: {
        command: "pnpm test",
        result: "passed",
        summary: "Frontend-submitted verification",
        artifacts: [],
        coverageNote: "Workflow and gates verified",
        riskNote: "Mock connectors only",
      },
    });
    await refreshFlows(selectedFlowId);
    setStatusMessage("Verification evidence submitted");
  }

  return (
    <div className="app-shell">
      <header className="page-header">
        <div>
          <h1>R&amp;D Auto Flow</h1>
          <p>{statusMessage}</p>
        </div>
        <div className="toolbar">
          <input value={jiraKey} onChange={(event) => setJiraKey(event.target.value.toUpperCase())} />
          <button onClick={() => void handleCreateFlow()}>Start Flow</button>
        </div>
      </header>
      <main className="layout">
        <section className="panel list-panel">
          <div className="panel-header">
            <h2>Flows</h2>
            <input
              placeholder="Search by Jira / title / flow id"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="flow-list">
            {filteredFlows.map((flow) => (
              <button
                key={flow.id}
                className={`flow-row ${selectedFlowId === flow.id ? "active" : ""}`}
                onClick={() => void refreshDetail(flow.id)}
              >
                <div>
                  <strong>{flow.jiraKey}</strong>
                  <div>{flow.jiraTitle}</div>
                </div>
                <div className="flow-meta">
                  <span>{flow.currentStage}</span>
                  <span>{flow.overallStatus}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
        <section className="panel detail-panel">
          {detail ? (
            <>
              <div className="panel-header">
                <div>
                  <h2>{String(detail.workItem.jiraKey ?? "")}</h2>
                  <p>{String(detail.workItem.jiraTitle ?? "")}</p>
                </div>
                <div className="detail-actions">
                  {availableActions.map((action) => (
                    <button key={action} onClick={() => void handleAction(action)}>
                      {action}
                    </button>
                  ))}
                </div>
              </div>
              <div className="detail-grid">
                <div className="detail-card">
                  <h3>Summary</h3>
                  <pre>{JSON.stringify(detail.flowRun, null, 2)}</pre>
                </div>
                <div className="detail-card">
                  <h3>Work Item</h3>
                  <pre>{JSON.stringify(detail.workItem, null, 2)}</pre>
                </div>
              </div>
              <div className="detail-grid">
                <div className="detail-card">
                  <div className="card-header">
                    <h3>Evidence</h3>
                    <div className="toolbar compact">
                      <button onClick={() => void handleSubmitImplementationEvidence()}>
                        Add implementation note
                      </button>
                      <button onClick={() => void handleSubmitVerificationEvidence()}>
                        Add verification evidence
                      </button>
                    </div>
                  </div>
                  <pre>{JSON.stringify(detail.evidence, null, 2)}</pre>
                </div>
                <div className="detail-card">
                  <h3>Logs</h3>
                  <pre>{JSON.stringify(detail.logs, null, 2)}</pre>
                </div>
              </div>
              <div className="detail-card">
                <h3>Stage timeline</h3>
                <pre>{JSON.stringify(detail.stageRuns, null, 2)}</pre>
              </div>
            </>
          ) : (
            <div className="empty-state">Create or select a flow to inspect details.</div>
          )}
        </section>
      </main>
    </div>
  );
}
