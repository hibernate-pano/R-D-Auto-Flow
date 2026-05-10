# API 契约：R&D Auto Flow MVP

## Authority

- Authority level: Derived interface contract, subordinate to canonical workflow rules
- Primary upstream sources:
  - `docs/canonical-workflow-spec.md`
  - `docs/mvp-technical-design.md`
- Usage rule: This document translates approved workflow behavior into interface shapes, payloads, and endpoint contracts.
- Conflict rule: API behavior that conflicts with canonical workflow semantics must be corrected to match `docs/canonical-workflow-spec.md`.

## 1. 文档定位

- 文档类型：后端 API 契约
- 对应文档：
  - [canonical-workflow-spec.md](/Users/panbo/Code/Work-HSBC/R&D-Auto-Flow/docs/canonical-workflow-spec.md)
  - [rpd-jira-confluence-github-workflow.md](/Users/panbo/Code/Work-HSBC/R&D-Auto-Flow/docs/rpd-jira-confluence-github-workflow.md)
  - [mvp-technical-design.md](/Users/panbo/Code/Work-HSBC/R&D-Auto-Flow/docs/mvp-technical-design.md)
  - [frontend-page-detailed-design.md](/Users/panbo/Code/Work-HSBC/R&D-Auto-Flow/docs/frontend-page-detailed-design.md)
  - [backend-implementation-plan.md](/Users/panbo/Code/Work-HSBC/R&D-Auto-Flow/docs/backend-implementation-plan.md)
- 目标：定义 MVP 阶段前后端接口、请求响应结构、错误码与状态语义

---

## 2. 设计原则

1. API 优先服务 MVP 前端工作台
2. Flow、WorkItem、Stage、Log 分层清晰
3. 状态字段必须稳定、可枚举
4. 错误码统一，不直接暴露第三方原始错误
5. 危险操作必须显式接口化，不能靠隐式字段更新
6. 证据录入与审批必须走结构化接口，不能只依赖日志

---

## 3. 通用约定

## 3.1 Base URL

建议：

`/api`

## 3.2 Content-Type

- 请求：`application/json`
- 响应：`application/json`

## 3.3 鉴权

MVP 可先假设后端已有登录态或网关鉴权。

后端接口层至少应能拿到：

- `operatorId`
- `operatorEmail`
- `operatorDisplayName`
- `operatorCapabilities`

## 3.4 时间格式

统一使用 ISO 8601 UTC 字符串，例如：

`2026-05-09T15:31:00.000Z`

## 3.5 ID 类型

MVP 建议统一使用字符串 ID。

---

## 4. 通用响应结构

## 4.1 成功响应

```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

## 4.2 失败响应

```json
{
  "success": false,
  "error": {
    "code": "FLOW_CONFLICT",
    "message": "当前 Jira Ticket 已存在运行中的 Flow",
    "details": {
      "jiraKey": "RD-1234",
      "flowRunId": "flow_001"
    }
  }
}
```

---

## 5. 枚举定义

本节列出接口层必须接受或返回的稳定枚举。语义定义以上游 canonical 为准，这里只保留接口契约所需的词表快照。

## 5.1 Flow 总状态

- `pending`
- `running`
- `waiting_manual_action`
- `paused`
- `failed`
- `completed`
- `cancelled`

## 5.2 Trigger Mode

- `manual_start`
- `rerun`
- `resume_from_failure`

MVP 仅要求前三个可用。

## 5.3 阶段枚举

- `manual_request_received`
- `jira_ticket_fetching`
- `jira_ticket_normalized`
- `confluence_links_extracting`
- `source_pages_fetching`
- `analysis_generating`
- `analysis_page_creating`
- `analysis_approval_waiting`
- `repo_resolving`
- `branch_preparing`
- `implementation_waiting`
- `verification_waiting`
- `verification_approval_waiting`
- `confluence_result_updating`
- `jira_status_updating`
- `completed`

## 5.4 阶段状态

- `pending`
- `running`
- `succeeded`
- `failed`
- `skipped`
- `waiting_manual_action`

## 5.5 日志级别

- `debug`
- `info`
- `warn`
- `error`

## 5.6 人工动作类型

- `pause`
- `resume`
- `cancel`
- `retry_stage`
- `skip_stage`
- `set_repo_override`
- `set_confluence_links`
- `approve_analysis`
- `request_analysis_changes`
- `approve_verification`
- `request_verification_changes`

## 5.7 证据类型

- `analysis_snapshot`
- `branch_snapshot`
- `implementation_note`
- `test_execution`
- `manual_verification`
- `approval_decision`
- `final_writeback`

---

## 6. 资源模型

## 6.0 ActorSnapshot

```json
{
  "operatorId": "u_001",
  "operatorEmail": "panbo@example.com",
  "operatorDisplayName": "Panbo",
  "operatorCapabilities": [
    "flow:start",
    "flow:submit-evidence"
  ]
}
```

## 6.1 FlowSummary

```json
{
  "id": "flow_001",
  "jiraKey": "RD-1234",
  "jiraTitle": "Support timeout validation in settlement job",
  "currentStage": "analysis_generating",
  "overallStatus": "running",
  "triggerMode": "manual_start",
  "manualActionRequired": false,
  "updatedAt": "2026-05-09T15:31:00.000Z",
  "links": {
    "jira": "https://jira.example.com/browse/RD-1234",
    "confluenceAnalysisPage": null,
    "githubBranch": null
  }
}
```

## 6.2 FlowDetail

```json
{
  "id": "flow_001",
  "workItem": {
    "id": "work_001",
    "jiraKey": "RD-1234",
    "jiraTitle": "Support timeout validation in settlement job",
    "jiraDescription": "......",
    "jiraStatus": "In Progress",
    "jiraProjectKey": "RD",
    "assignee": "panbo",
    "sourceConfluenceUrls": [
      "https://confluence.example.com/pages/viewpage.action?pageId=1001"
    ],
    "analysisPageUrl": "https://confluence.example.com/pages/viewpage.action?pageId=2001",
    "repoName": "hsbc-settlement-service",
    "repoUrl": "https://github.com/org/hsbc-settlement-service",
    "baseBranch": "main",
    "baseCommitSha": "4d3c2b1a",
    "workingBranch": "RD-1234",
    "implementationSummary": null,
    "testSummary": null
  },
  "flowRun": {
    "triggerMode": "manual_start",
    "currentStage": "analysis_generating",
    "overallStatus": "running",
    "blockingReasonCode": null,
    "blockingReasonMessage": null,
    "manualActionRequired": false,
    "manualActionType": null,
    "operator": {
      "operatorId": "u_001",
      "operatorEmail": "panbo@example.com",
      "operatorDisplayName": "Panbo"
    },
    "startedAt": "2026-05-09T15:20:00.000Z",
    "updatedAt": "2026-05-09T15:31:00.000Z",
    "completedAt": null
  },
  "stageRuns": [],
  "evidenceSummary": {
    "implementationRecorded": false,
    "verificationRecorded": false,
    "verificationApproved": false
  },
  "availableActions": [
    "pause",
    "cancel"
  ],
  "links": {
    "jira": "https://jira.example.com/browse/RD-1234",
    "confluenceSourcePages": [
      "https://confluence.example.com/pages/viewpage.action?pageId=1001"
    ],
    "confluenceAnalysisPage": "https://confluence.example.com/pages/viewpage.action?pageId=2001",
    "githubRepo": "https://github.com/org/hsbc-settlement-service",
    "githubBranch": "https://github.com/org/hsbc-settlement-service/tree/RD-1234"
  }
}
```

## 6.3 StageRun

```json
{
  "id": "stage_001",
  "stageName": "analysis_generating",
  "status": "running",
  "attemptNo": 1,
  "startedAt": "2026-05-09T15:28:00.000Z",
  "finishedAt": null,
  "durationMs": null,
  "errorCode": null,
  "errorMessage": null,
  "requiresManualAction": false
}
```

## 6.4 FlowLog

```json
{
  "id": "log_001",
  "flowRunId": "flow_001",
  "stageName": "analysis_generating",
  "level": "info",
  "eventType": "llm_request_started",
  "message": "开始调用 LLM 生成分析文档",
  "details": {
    "model": "gpt-5-mini",
    "baseUrl": "http://127.0.0.1:14434"
  },
  "relatedObjectType": "llm_request",
  "relatedObjectId": "req_001",
  "createdAt": "2026-05-09T15:28:01.000Z",
  "redacted": true
}
```

## 6.5 EvidenceRecord

```json
{
  "id": "evi_001",
  "flowRunId": "flow_001",
  "stageName": "verification_waiting",
  "evidenceType": "test_execution",
  "payload": {
    "command": "pnpm test",
    "result": "passed",
    "summary": "all targeted tests passed",
    "artifacts": [],
    "coverageNote": "covered timeout validation and retry path",
    "riskNote": "no full regression run in upstream environment"
  },
  "actor": {
    "operatorId": "u_001",
    "operatorEmail": "panbo@example.com",
    "operatorDisplayName": "Panbo"
  },
  "createdAt": "2026-05-09T15:45:00.000Z"
}
```

---

## 7. Flow 列表接口

## 7.1 查询 Flow 列表

### Request

`GET /api/flows`

### Query Parameters

- `status`
- `stage`
- `triggerMode`
- `jiraKey`
- `query`
- `page`
- `pageSize`

示例：

`GET /api/flows?status=waiting_manual_action&page=1&pageSize=20`

### Response

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "flow_001",
        "jiraKey": "RD-1234",
        "jiraTitle": "Support timeout validation in settlement job",
        "currentStage": "verification_waiting",
        "overallStatus": "waiting_manual_action",
        "triggerMode": "manual_start",
        "manualActionRequired": true,
        "updatedAt": "2026-05-09T15:31:00.000Z",
        "links": {
          "jira": "https://jira.example.com/browse/RD-1234",
          "confluenceAnalysisPage": "https://confluence.example.com/pages/viewpage.action?pageId=2001",
          "githubBranch": "https://github.com/org/repo/tree/RD-1234"
        }
      }
    ]
  },
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 1
  }
}
```

---

## 8. Flow 详情接口

## 8.1 查询 Flow 详情

### Request

`GET /api/flows/{flowRunId}`

### Response

返回 `FlowDetail`。

### 404 场景

```json
{
  "success": false,
  "error": {
    "code": "FLOW_NOT_FOUND",
    "message": "指定的 Flow 不存在",
    "details": {
      "flowRunId": "flow_999"
    }
  }
}
```

---

## 9. Flow 日志接口

## 9.1 查询日志

### Request

`GET /api/flows/{flowRunId}/logs`

### Query Parameters

- `stage`
- `level`
- `query`
- `onlyError`
- `cursor`
- `limit`

示例：

`GET /api/flows/flow_001/logs?stage=analysis_generating&onlyError=false&limit=50`

### Response

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "log_001",
        "flowRunId": "flow_001",
        "stageName": "analysis_generating",
        "level": "info",
        "eventType": "llm_request_started",
        "message": "开始调用 LLM 生成分析文档",
        "details": {
          "model": "gpt-5-mini"
        },
        "relatedObjectType": "llm_request",
        "relatedObjectId": "req_001",
        "createdAt": "2026-05-09T15:28:01.000Z",
        "redacted": true
      }
    ],
    "nextCursor": null
  },
  "meta": {}
}
```

---

## 10. 手动启动接口

## 10.1 创建 Flow

### Request

`POST /api/flows`

```json
{
  "jiraKey": "RD-1234",
  "triggerMode": "manual_start",
  "repoOverride": null,
  "note": "manual start from dashboard",
  "sourceFlowRunId": null,
  "resumeFromStage": null
}
```

### 字段说明

- `jiraKey`: 必填
- `triggerMode`: 必填，MVP 允许 `manual_start` / `rerun` / `resume_from_failure`
- `repoOverride`: 可选
- `note`: 可选
- `sourceFlowRunId`: `rerun` / `resume_from_failure` 时必填
- `resumeFromStage`: `resume_from_failure` 时可选，用于显式恢复起点

### 成功响应

```json
{
  "success": true,
  "data": {
    "flowRunId": "flow_001",
    "workItemId": "work_001",
    "overallStatus": "pending",
    "currentStage": "manual_request_received"
  },
  "meta": {}
}
```

### 冲突响应

```json
{
  "success": false,
  "error": {
    "code": "FLOW_CONFLICT",
    "message": "当前 Jira Ticket 已存在运行中的 Flow",
    "details": {
      "jiraKey": "RD-1234",
      "existingFlowRunId": "flow_0008",
      "existingStatus": "running",
      "existingStage": "analysis_generating",
      "allowedNextTriggerModes": [
        "rerun",
        "resume_from_failure"
      ]
    }
  }
}
```

### 参数校验失败

```json
{
  "success": false,
  "error": {
    "code": "INVALID_JIRA_KEY",
    "message": "Jira Key 格式不合法",
    "details": {
      "jiraKey": "foo"
    }
  }
}
```

---

## 11. 人工动作接口

## 11.1 执行动作

### Request

`POST /api/flows/{flowRunId}/actions`

### 通用结构

```json
{
  "actionType": "retry_stage",
  "payload": {
    "stage": "analysis_generating"
  },
  "note": "retry after fixing prompt template"
}
```

### 支持动作示例

#### pause

```json
{
  "actionType": "pause",
  "payload": {},
  "note": "pause for investigation"
}
```

#### resume

```json
{
  "actionType": "resume",
  "payload": {},
  "note": "resume after confirmation"
}
```

#### cancel

```json
{
  "actionType": "cancel",
  "payload": {},
  "note": "cancel this run"
}
```

#### retry_stage

```json
{
  "actionType": "retry_stage",
  "payload": {
    "stage": "branch_preparing"
  },
  "note": "retry after branch conflict resolved"
}
```

#### skip_stage

```json
{
  "actionType": "skip_stage",
  "payload": {
    "stage": "source_pages_fetching"
  },
  "note": "no accessible source page, skip with approval"
}
```

#### set_repo_override

```json
{
  "actionType": "set_repo_override",
  "payload": {
    "repoName": "hsbc-settlement-service"
  },
  "note": "manual repo correction"
}
```

#### set_confluence_links

```json
{
  "actionType": "set_confluence_links",
  "payload": {
    "urls": [
      "https://confluence.example.com/pages/viewpage.action?pageId=1001"
    ]
  },
  "note": "manual link correction"
}
```

#### approve_analysis

```json
{
  "actionType": "approve_analysis",
  "payload": {},
  "note": "analysis reviewed and approved"
}
```

#### approve_verification

```json
{
  "actionType": "approve_verification",
  "payload": {},
  "note": "verification reviewed and approved"
}
```

#### request_analysis_changes

```json
{
  "actionType": "request_analysis_changes",
  "payload": {},
  "note": "analysis needs refinement before repo preparation"
}
```

#### request_verification_changes

```json
{
  "actionType": "request_verification_changes",
  "payload": {},
  "note": "verification evidence is incomplete"
}
```

### 成功响应

```json
{
  "success": true,
  "data": {
    "flowRunId": "flow_001",
    "overallStatus": "running",
    "currentStage": "analysis_generating",
    "actionRecorded": true
  },
  "meta": {}
}
```

### 动作不允许

```json
{
  "success": false,
  "error": {
    "code": "ACTION_NOT_ALLOWED",
    "message": "当前 Flow 状态下不允许执行该动作",
    "details": {
      "actionType": "resume",
      "overallStatus": "running"
    }
  }
}
```

---

## 12. Evidence 接口

## 12.1 查询 Flow Evidence

### Request

`GET /api/flows/{flowRunId}/evidence`

### Query Parameters

- `stage`
- `evidenceType`
- `cursor`
- `limit`

### Response

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "evi_001",
        "flowRunId": "flow_001",
        "stageName": "verification_waiting",
        "evidenceType": "test_execution",
        "payload": {
          "command": "pnpm test",
          "result": "passed",
          "summary": "all targeted tests passed",
          "artifacts": [],
          "coverageNote": "covered timeout validation and retry path",
          "riskNote": "no full regression run in upstream environment"
        },
        "actor": {
          "operatorId": "u_001",
          "operatorEmail": "panbo@example.com",
          "operatorDisplayName": "Panbo"
        },
        "createdAt": "2026-05-09T15:45:00.000Z"
      }
    ],
    "nextCursor": null
  },
  "meta": {}
}
```

## 12.2 提交 Evidence

### Request

`POST /api/flows/{flowRunId}/evidence`

```json
{
  "stageName": "verification_waiting",
  "evidenceType": "test_execution",
  "payload": {
    "command": "pnpm test",
    "result": "passed",
    "summary": "all targeted tests passed",
    "artifacts": [],
    "coverageNote": "covered timeout validation and retry path",
    "riskNote": "no full regression run in upstream environment"
  }
}
```

### 规则

- `implementation_note` 用于记录实现完成事实
- `test_execution` 用于记录测试命令和结果
- `manual_verification` 用于记录人工验证结论；若未提供 `test_execution`，必须额外说明未执行自动化测试的原因、范围与风险
- `approval_decision` 主要由审批动作驱动生成，不建议前端直接伪造
- `final_writeback` 由系统在回写阶段写入

### 成功响应

```json
{
  "success": true,
  "data": {
    "evidenceId": "evi_001",
    "flowRunId": "flow_001"
  },
  "meta": {}
}
```

---

## 13. 可执行动作接口

## 13.1 查询当前允许动作

### Request

`GET /api/flows/{flowRunId}/available-actions`

### Response

```json
{
  "success": true,
  "data": {
    "actions": [
      "pause",
      "cancel"
    ]
  },
  "meta": {}
}
```

---

## 14. Repo 预检接口

MVP 必须提供该接口。

## 14.1 校验 Jira Key 与 Repo 路由

### Request

`POST /api/flows/precheck`

```json
{
  "jiraKey": "RD-1234"
}
```

### Response

```json
{
  "success": true,
  "data": {
    "ticketExists": true,
    "repoResolved": true,
    "repoName": "hsbc-settlement-service",
    "baseBranch": "main",
    "hasRunningFlow": false,
    "existingFlowRunId": null
  },
  "meta": {}
}
```

---

## 15. Jira 搜索接口

## 15.1 搜索 Jira Ticket

### Request

`GET /api/jira/issues/search?query=RD-12`

### Response

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "jiraKey": "RD-1234",
        "summary": "Support timeout validation in settlement job",
        "status": "In Progress"
      }
    ]
  },
  "meta": {}
}
```

---

## 16. 健康检查接口

## 16.1 系统健康检查

### Request

`GET /api/health`

### Response

```json
{
  "success": true,
  "data": {
    "status": "ok",
    "services": {
      "database": "ok",
      "jira": "unknown",
      "confluence": "unknown",
      "github": "unknown",
      "llmBridge": "ok"
    }
  },
  "meta": {}
}
```

---

## 17. 错误码约定

建议 MVP 先覆盖以下错误码：

- `INVALID_JIRA_KEY`
- `TICKET_NOT_FOUND`
- `FLOW_NOT_FOUND`
- `FLOW_CONFLICT`
- `ACTION_NOT_ALLOWED`
- `APPROVAL_NOT_ALLOWED`
- `JIRA_ACCESS_DENIED`
- `CONFLUENCE_ACCESS_DENIED`
- `GITHUB_ACCESS_DENIED`
- `REPO_NOT_RESOLVED`
- `BRANCH_ALREADY_EXISTS`
- `BRANCH_DIVERGED`
- `LLM_BRIDGE_UNAVAILABLE`
- `UPSTREAM_TIMEOUT`
- `ANALYSIS_OUTPUT_INVALID`
- `EVIDENCE_INVALID`
- `EVIDENCE_NOT_FOUND`
- `APPROVAL_CAPABILITY_REQUIRED`
- `DATABASE_ERROR`
- `INTERNAL_ERROR`

---

## 18. 前端对接建议

1. 列表页使用 `/api/flows`
2. 详情页使用 `/api/flows/{id}`
3. 日志区使用 `/api/flows/{id}/logs`
4. 证据区使用 `/api/flows/{id}/evidence`
5. 启动弹窗先调用 `/api/jira/issues/search`，再调 `/api/flows/precheck` 和 `/api/flows`
6. 人工按钮显示逻辑优先使用 `/available-actions`
7. `implementation_waiting` 到 `verification_waiting` 的推进，前端必须先提交至少一条 `implementation_note`
8. `verification_waiting` 的审批前，前端必须先提交 `test_execution` 或 `manual_verification`

---

## 19. 总结

这份 API 契约的重点不是接口数量，而是把以下边界定死：

1. Flow 的状态如何表达
2. 前端如何拿到阶段和日志
3. 手动启动和人工干预如何落接口
4. 冲突、失败、阻塞如何稳定表达

只要这些边界稳定，前后端就可以并行推进。
