import { useEffect, useMemo, useState } from "react";
import {
  createFlow,
  fetchAvailableActions,
  fetchFlowDetail,
  fetchFlows,
  precheckFlow,
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

// ── CreateFlowModal ──────────────────────────────────────────────────────────

function CreateFlowModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (flowRunId: string) => void;
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
      setPrecheckMsg(err instanceof Error ? err.message : "Failed");
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
      />
    </AntdApp>
  );
}
