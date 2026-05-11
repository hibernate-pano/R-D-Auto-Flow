import { useEffect, useMemo, useState } from "react";
import {
  createFlow,
  fetchAvailableActions,
  fetchFlowDetail,
  fetchFlows,
  precheckFlow,
  rerunFlow,
  resumeFlow,
  submitAction,
} from "./api.js";
import type { TableColumnsType } from "antd";
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Descriptions,
  Input,
  Layout,
  message,
  Modal,
  Radio,
  Select,
  Space,
  Table,
  Tag,
  Timeline,
  Typography,
} from "antd";
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";

const { Header, Content, Sider } = Layout;
const { Title, Text } = Typography;

// ── Types ────────────────────────────────────────────────────────────────────

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

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { color: string; icon: React.ReactNode }> = {
  pending:               { color: "default",    icon: <ClockCircleOutlined /> },
  running:               { color: "processing", icon: <PlayCircleOutlined /> },
  waiting_manual_action:  { color: "warning",   icon: <ExclamationCircleOutlined /> },
  paused:                { color: "warning",    icon: <PauseCircleOutlined /> },
  failed:                { color: "error",      icon: <CloseCircleOutlined /> },
  completed:             { color: "success",    icon: <CheckCircleOutlined /> },
  cancelled:             { color: "default",    icon: <CloseCircleOutlined /> },
};

function OverallStatusTag({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { color: "default", icon: null };
  return (
    <Tag color={meta.color} icon={meta.icon}>
      {status.replace(/_/g, " ")}
    </Tag>
  );
}

// ── FlowListTable ────────────────────────────────────────────────────────────

function FlowListTable({
  flows,
  selectedId,
  onSelect,
  search,
  onSearchChange,
}: {
  flows: FlowSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
}) {
  const columns: TableColumnsType<FlowSummary> = [
    {
      title: "Jira Key",
      dataIndex: "jiraKey",
      key: "jiraKey",
      width: 120,
      render: (val, record) => (
        <Button type="text" size="small" onClick={() => onSelect(record.id)}>
          <strong>{val}</strong>
        </Button>
      ),
    },
    {
      title: "Title",
      dataIndex: "jiraTitle",
      key: "jiraTitle",
      ellipsis: true,
    },
    {
      title: "Stage",
      dataIndex: "currentStage",
      key: "currentStage",
      width: 200,
      render: (val: string) => <Text code>{val.replace(/_/g, " ")}</Text>,
    },
    {
      title: "Status",
      dataIndex: "overallStatus",
      key: "overallStatus",
      width: 160,
      render: (val: string) => <OverallStatusTag status={val} />,
    },
    {
      title: "Manual Action",
      dataIndex: "manualActionRequired",
      key: "manualActionRequired",
      width: 120,
      render: (val: boolean) =>
        val ? <Tag color="warning">Required</Tag> : <Tag color="default">No</Tag>,
    },
    {
      title: "Updated",
      dataIndex: "updatedAt",
      key: "updatedAt",
      width: 160,
      render: (val: string) => (val ? new Date(val).toLocaleString("zh-CN") : "—"),
    },
  ];

  const filtered = useMemo(() => {
    if (!search.trim()) return flows;
    const kw = search.toLowerCase();
    return flows.filter(
      (f) =>
        f.jiraKey.toLowerCase().includes(kw) ||
        f.jiraTitle.toLowerCase().includes(kw) ||
        f.id.toLowerCase().includes(kw)
    );
  }, [flows, search]);

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="middle">
      <Input.Search
        placeholder="Search Jira / title / flow ID"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        style={{ width: 300 }}
      />
      <Table
        rowKey="id"
        size="small"
        columns={columns}
        dataSource={filtered}
        pagination={{ pageSize: 20, size: "small" }}
        rowClassName={(record) =>
          record.id === selectedId ? "ant-table-row--selected" : ""
        }
        onRow={(record) => ({
          onClick: () => onSelect(record.id),
          style: { cursor: "pointer" },
        })}
      />
    </Space>
  );
}

// ── FlowDetailPanel ──────────────────────────────────────────────────────────

function FlowDetailPanel({
  detail,
  availableActions,
  onAction,
}: {
  detail: FlowDetail;
  availableActions: string[];
  onAction: (actionType: string) => void;
}) {
  const workItem = detail.workItem as Record<string, unknown>;
  const flowRun = detail.flowRun as Record<string, unknown>;

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="middle">
      {/* Work Item Summary */}
      <Card title="Work Item" size="small">
        <Descriptions column={2} size="small">
          <Descriptions.Item label="Jira Key">{String(workItem.jiraKey ?? "—")}</Descriptions.Item>
          <Descriptions.Item label="Title">{String(workItem.jiraTitle ?? "—")}</Descriptions.Item>
          <Descriptions.Item label="Type">{String(workItem.issueType ?? "—")}</Descriptions.Item>
          <Descriptions.Item label="Priority">{String(workItem.priority ?? "—")}</Descriptions.Item>
          <Descriptions.Item label="Status">{String(workItem.status ?? "—")}</Descriptions.Item>
          <Descriptions.Item label="Assignee">{String(workItem.assignee ?? "—")}</Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Available Actions */}
      {availableActions.length > 0 && (
        <Card title="Available Actions" size="small">
          <Space wrap>
            {availableActions.map((action) => (
              <Button key={action} onClick={() => onAction(action)}>
                {action.replace(/_/g, " ")}
              </Button>
            ))}
          </Space>
        </Card>
      )}

      {/* Stage Timeline */}
      <Card title="Stage Timeline" size="small">
        <Timeline
          items={detail.stageRuns.map((sr) => {
            const stageName = String(sr.stageName ?? "");
            const status = String(sr.status ?? "pending");
            const duration = sr.durationMs != null ? `${(Number(sr.durationMs) / 1000).toFixed(1)}s` : undefined;
            return {
              color: status === "completed" ? "green" : status === "failed" ? "red" : "blue",
              children: (
                <div>
                  <Text strong>{stageName.replace(/_/g, " ")}</Text>
                  {duration && (
                    <Text type="secondary" style={{ marginLeft: 8 }}>{duration}</Text>
                  )}
                  {sr.error && (
                    <div>
                      <Text type="danger">{String(sr.error)}</Text>
                    </div>
                  )}
                </div>
              ),
            };
          })}
        />
      </Card>

      {/* Flow Run Summary */}
      <Card title="Flow Run" size="small">
        <Descriptions column={2} size="small">
          <Descriptions.Item label="Flow ID">{String(flowRun.id ?? "—")}</Descriptions.Item>
          <Descriptions.Item label="Overall Status">
            <OverallStatusTag status={String(flowRun.overallStatus ?? "pending")} />
          </Descriptions.Item>
          <Descriptions.Item label="Trigger Mode">{String(flowRun.triggerMode ?? "—")}</Descriptions.Item>
          <Descriptions.Item label="Started">
            {flowRun.startedAt ? new Date(String(flowRun.startedAt)).toLocaleString("zh-CN") : "—"}
          </Descriptions.Item>
          <Descriptions.Item label="Updated">
            {flowRun.updatedAt ? new Date(String(flowRun.updatedAt)).toLocaleString("zh-CN") : "—"}
          </Descriptions.Item>
          <Descriptions.Item label="Current Stage">
            {String(flowRun.currentStageName ?? "—").replace(/_/g, " ")}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Evidence */}
      {detail.evidence.length > 0 && (
        <Card title="Evidence" size="small">
          <Timeline
            items={detail.evidence.map((ev) => ({
              color: "gray",
              children: (
                <div>
                  <Text strong>{String(ev.evidenceType ?? "unknown")}</Text>
                  <div>
                    <Text type="secondary">
                      {ev.submittedAt
                        ? new Date(String(ev.submittedAt)).toLocaleString("zh-CN")
                        : "—"}
                    </Text>
                  </div>
                  {ev.payload && (
                    <pre style={{ fontSize: 11 }}>{JSON.stringify(ev.payload, null, 2)}</pre>
                  )}
                </div>
              ),
            }))}
          />
        </Card>
      )}
    </Space>
  );
}

// ── ConflictModal ─────────────────────────────────────────────────────────────

type ConflictInfo = {
  jiraKey: string;
  flowRunId: string;
  existingStatus: string;
  existingStage: string;
};

function ConflictModal({
  open,
  conflict,
  onClose,
  onChosen,
}: {
  open: boolean;
  conflict: ConflictInfo | null;
  onClose: () => void;
  onChosen: (flowRunId: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"rerun" | "resume">("rerun");
  const [chosenStage, setChosenStage] = useState<string>("manual_request_received");

  async function handleOk() {
    if (!conflict) return;
    setLoading(true);
    try {
      const created =
        mode === "rerun"
          ? await rerunFlow({
              jiraKey: conflict.jiraKey,
              sourceFlowRunId: conflict.flowRunId,
              resumeFromStage: "manual_request_received",
            })
          : await resumeFlow({
              jiraKey: conflict.jiraKey,
              sourceFlowRunId: conflict.flowRunId,
              resumeFromStage: chosenStage,
            });
      onChosen(created.flowRunId);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title="Active Flow Conflict"
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      confirmLoading={loading}
      okText={mode === "rerun" ? "Rerun from Start" : "Resume from Stage"}
    >
      {conflict && (
        <Space direction="vertical" style={{ width: "100%" }} size="middle">
          <Alert
            message={`Jira ticket ${conflict.jiraKey} already has an active flow`}
            description={
              <span>
                Status: <strong>{conflict.existingStatus}</strong> | Stage:{" "}
                <strong>{conflict.existingStage.replace(/_/g, " ")}</strong>
              </span>
            }
            type="warning"
            showIcon
          />
          <div>
            <Text>Choose recovery mode:</Text>
            <div style={{ marginTop: 8 }}>
              <Radio.Group
                value={mode}
                onChange={(e) => setMode(e.target.value as "rerun" | "resume")}
              >
                <Space direction="vertical">
                  <Radio value="rerun">
                    <Text>
                      <strong>Rerun from start</strong> — restart from manual_request_received, will
                      re-fetch Jira ticket
                    </Text>
                  </Radio>
                  <Radio value="resume">
                    <Text>
                      <strong>Resume from stage</strong> — continue from where it left off
                    </Text>
                  </Radio>
                </Space>
              </Radio.Group>
            </div>
          </div>
          {mode === "resume" && (
            <div>
              <Text>Resume from stage:</Text>
              <Select
                value={chosenStage}
                onChange={setChosenStage}
                style={{ width: "100%", marginTop: 4 }}
              >
                <Select.Option value="manual_request_received">
                  manual_request_received
                </Select.Option>
                <Select.Option value="jira_ticket_fetching">jira_ticket_fetching</Select.Option>
                <Select.Option value="jira_ticket_normalized">jira_ticket_normalized</Select.Option>
                <Select.Option value="confluence_links_extracting">
                  confluence_links_extracting
                </Select.Option>
                <Select.Option value="source_pages_fetching">source_pages_fetching</Select.Option>
                <Select.Option value="analysis_generating">analysis_generating</Select.Option>
                <Select.Option value="analysis_page_creating">analysis_page_creating</Select.Option>
                <Select.Option value="repo_resolving">repo_resolving</Select.Option>
                <Select.Option value="branch_preparing">branch_preparing</Select.Option>
              </Select>
            </div>
          )}
        </Space>
      )}
    </Modal>
  );
}

// ── CreateFlowModal ──────────────────────────────────────────────────────────

function CreateFlowModal({
  open,
  onClose,
  onCreated,
  onConflict,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (flowRunId: string) => void;
  onConflict: (info: ConflictInfo) => void;
}) {
  const [jiraKey, setJiraKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [precheckMsg, setPrecheckMsg] = useState<string | null>(null);

  async function handleOk() {
    if (!jiraKey.trim()) return;
    setLoading(true);
    setPrecheckMsg(null);
    try {
      const precheck = await precheckFlow(jiraKey.trim().toUpperCase());
      setPrecheckMsg(String((precheck as Record<string, unknown>).message ?? "Precheck passed"));
      const created = await createFlow(jiraKey.trim().toUpperCase());
      setJiraKey("");
      onCreated(created.flowRunId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed";
      if (
        msg.includes("already has an active flow") ||
        msg.includes("FLOW_CONFLICT")
      ) {
        const precheck = await precheckFlow(jiraKey.trim().toUpperCase()).catch(() => null);
        if (precheck) {
          const p = precheck as Record<string, unknown>;
          setLoading(false);
          onConflict({
            jiraKey: jiraKey.trim().toUpperCase(),
            flowRunId: String(p.existingFlowRunId ?? ""),
            existingStatus: String(p.existingStatus ?? "unknown"),
            existingStage: String(p.existingStage ?? "unknown"),
          });
          return;
        }
      }
      setPrecheckMsg(msg);
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setJiraKey("");
    setPrecheckMsg(null);
    onClose();
  }

  return (
    <Modal
      title="Start New Flow"
      open={open}
      onOk={handleOk}
      onCancel={handleClose}
      confirmLoading={loading}
      okText="Start Flow"
    >
      <Space direction="vertical" style={{ width: "100%" }} size="middle">
        <div>
          <Text>Jira Ticket Key</Text>
          <Input
            value={jiraKey}
            onChange={(e) => setJiraKey(e.target.value.toUpperCase())}
            placeholder="e.g. RD-100"
            style={{ marginTop: 4 }}
            onPressEnter={handleOk}
          />
        </div>
        {precheckMsg && <Alert message={precheckMsg} type="info" showIcon />}
      </Space>
    </Modal>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────

export function App() {
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [detail, setDetail] = useState<FlowDetail | null>(null);
  const [availableActions, setAvailableActions] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [conflictInfo, setConflictInfo] = useState<ConflictInfo | null>(null);
  const [messageApi, contextHolder] = message.useMessage();

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

  async function handleCreateFlow() {
    setCreateModalOpen(false);
    await refreshFlows();
  }

  function handleConflict(info: ConflictInfo) {
    setConflictInfo(info);
    setConflictModalOpen(true);
  }

  async function handleConflictChosen(flowRunId: string) {
    setConflictModalOpen(false);
    setConflictInfo(null);
    await refreshFlows(flowRunId);
  }

  async function handleAction(actionType: string) {
    if (!selectedFlowId) return;
    try {
      await submitAction(selectedFlowId, {
        actionType: actionType as never,
        payload:
          actionType === "set_repo_override"
            ? { repoName: "manual-override-repo" }
            : actionType === "set_confluence_links"
              ? { urls: ["https://confluence.example.com/manual-link"] }
              : {},
        note: actionType,
      });
      messageApi.success(`Action applied: ${actionType}`);
      await refreshFlows(selectedFlowId);
    } catch (err) {
      messageApi.error(err instanceof Error ? err.message : "Action failed");
    }
  }

  return (
    <AntdApp>
      {contextHolder}
      <Layout style={{ minHeight: "100vh" }}>
        <Header style={{ display: "flex", alignItems: "center", gap: 16, background: "#001529", padding: "0 16px" }}>
          <Title level={4} style={{ color: "#fff", margin: 0 }}>R&amp;D Auto Flow</Title>
          <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => setCreateModalOpen(true)}>
            Start Flow
          </Button>
          <Button onClick={() => void refreshFlows()}>Refresh</Button>
        </Header>
        <Layout style={{ padding: "16px" }}>
          <Layout hasSider>
            <Sider width={520} style={{ background: "#fff", paddingRight: 16 }}>
              <Card title="Flows" size="small">
                <FlowListTable
                  flows={flows}
                  selectedId={selectedFlowId}
                  onSelect={(id) => { void refreshDetail(id); }}
                  search={search}
                  onSearchChange={setSearch}
                />
              </Card>
            </Sider>
            <Content>
              {detail ? (
                <FlowDetailPanel
                  detail={detail}
                  availableActions={availableActions}
                  onAction={handleAction}
                />
              ) : (
                <Card style={{ textAlign: "center", padding: 40 }}>
                  <Text type="secondary">Select a flow to view details</Text>
                </Card>
              )}
            </Content>
          </Layout>
        </Layout>
      </Layout>
      <CreateFlowModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={handleCreateFlow}
        onConflict={handleConflict}
      />
      <ConflictModal
        open={conflictModalOpen}
        conflict={conflictInfo}
        onClose={() => setConflictModalOpen(false)}
        onChosen={handleConflictChosen}
      />
    </AntdApp>
  );
}
