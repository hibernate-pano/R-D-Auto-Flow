import type { EvidenceInput, ManualActionInput } from "@rdaf/domain";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      "x-operator-id": "web-operator",
      "x-operator-email": "web.operator@example.com",
      "x-operator-display-name": "Web Operator",
      "x-operator-capabilities":
        "flow:start,flow:pause,flow:resume,flow:cancel,flow:retry,flow:skip,flow:override-repo,flow:approve-analysis,flow:approve-verification,flow:submit-evidence",
    },
    ...init,
  });

  const payload = (await response.json()) as {
    success: boolean;
    data: T;
    error?: { message: string };
  };

  if (!response.ok || !payload.success) {
    throw new Error(payload.error?.message ?? "Request failed");
  }

  return payload.data;
}

export async function fetchFlows() {
  return request<{ items: Array<Record<string, unknown>> }>("/api/flows");
}

export async function fetchFlowDetail(flowRunId: string) {
  return request<Record<string, unknown>>(`/api/flows/${flowRunId}`);
}

export async function fetchAvailableActions(flowRunId: string) {
  return request<{ actions: string[] }>(`/api/flows/${flowRunId}/available-actions`);
}

export async function createFlow(jiraKey: string) {
  return request<{ flowRunId: string; workItemId: string; overallStatus: string; currentStage: string }>(
    "/api/flows",
    {
      method: "POST",
      body: JSON.stringify({
        jiraKey,
        triggerMode: "manual_start",
        repoOverride: null,
        note: "created from web",
        sourceFlowRunId: null,
        resumeFromStage: null,
      }),
    },
  );
}

export async function rerunFlow(opts: {
  jiraKey: string;
  sourceFlowRunId: string;
  resumeFromStage: string;
}) {
  return request<{ flowRunId: string; workItemId: string; overallStatus: string; currentStage: string }>(
    "/api/flows",
    {
      method: "POST",
      body: JSON.stringify({
        jiraKey: opts.jiraKey,
        triggerMode: "rerun",
        repoOverride: null,
        note: "rerun from web",
        sourceFlowRunId: opts.sourceFlowRunId,
        resumeFromStage: opts.resumeFromStage,
      }),
    },
  );
}

export async function resumeFlow(opts: {
  jiraKey: string;
  sourceFlowRunId: string;
  resumeFromStage: string;
}) {
  return request<{ flowRunId: string; workItemId: string; overallStatus: string; currentStage: string }>(
    "/api/flows",
    {
      method: "POST",
      body: JSON.stringify({
        jiraKey: opts.jiraKey,
        triggerMode: "resume_from_failure",
        repoOverride: null,
        note: "resume from web",
        sourceFlowRunId: opts.sourceFlowRunId,
        resumeFromStage: opts.resumeFromStage,
      }),
    },
  );
}

export async function precheckFlow(jiraKey: string) {
  return request<Record<string, unknown>>("/api/flows/precheck", {
    method: "POST",
    body: JSON.stringify({ jiraKey }),
  });
}

export async function submitEvidence(flowRunId: string, input: EvidenceInput) {
  return request<{ evidenceId: string; flowRunId: string }>(`/api/flows/${flowRunId}/evidence`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function submitAction(flowRunId: string, input: ManualActionInput) {
  return request<{ flowRunId: string }>(`/api/flows/${flowRunId}/actions`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
