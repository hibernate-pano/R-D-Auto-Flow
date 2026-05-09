# 后端实现计划：R&D Auto Flow MVP

## 1. 文档定位

- 文档类型：后端实现计划
- 对应文档：
  - [canonical-workflow-spec.md](/Users/panbo/Code/Work-HSBC/R&D-Auto-Flow/docs/canonical-workflow-spec.md)
  - [rpd-jira-confluence-github-workflow.md](/Users/panbo/Code/Work-HSBC/R&D-Auto-Flow/docs/rpd-jira-confluence-github-workflow.md)
  - [mvp-technical-design.md](/Users/panbo/Code/Work-HSBC/R&D-Auto-Flow/docs/mvp-technical-design.md)
  - [frontend-page-detailed-design.md](/Users/panbo/Code/Work-HSBC/R&D-Auto-Flow/docs/frontend-page-detailed-design.md)
- 目标：将 MVP 后端落到可排期、可开发、可验收的实施计划

---

## 2. 实现目标

后端 MVP 必须完成以下闭环：

1. 接收手动指定 Jira Ticket 的启动请求
2. 拉取 Jira 数据并标准化
3. 提取并读取 Confluence 源文档
4. 调用 LLM Bridge 生成分析文档
5. 在 Confluence 创建分析页
6. 解析 GitHub Repo 并准备 `<jira-key>` 工作分支
7. 记录 Flow 全部阶段、日志和错误
8. 支持人工干预、暂停、恢复、重试
9. 回写 Confluence 结果
10. 更新 Jira 状态为完成

### 2.1 边界说明

后端 MVP 不负责在目标仓库中自动编码和自动跑完整测试链路。

后端 MVP 必须负责：

1. 状态机推进
2. 外部系统编排
3. 审批门禁
4. 结构化证据采集
5. 闭环判定

---

## 3. 实现原则

1. 先做单体后端，不做微服务拆分
2. 先做状态机与持久化，再接第三方系统
3. 所有外部访问必须经过 Connector
4. 所有状态变化必须可追踪
5. 所有人工操作必须可审计
6. 先保障恢复能力，再追求自动化程度

---

## 4. 模块拆分

建议后端目录级模块如下：

1. `src/app`
   - 应用启动
   - 配置加载
   - 路由注册

2. `src/modules/flow`
   - Flow API
   - Flow 查询
   - 手动动作

3. `src/modules/workflow`
   - 状态机
   - 阶段执行器
   - 重试策略

4. `src/modules/work-item`
   - WorkItem 读写

5. `src/modules/logging`
   - FlowLog 写入
   - 审计日志

6. `src/modules/evidence`
   - EvidenceRecord 读写
   - Evidence payload 校验
   - 关闭门禁查询

7. `src/modules/governance`
   - 审批判断
   - 人工动作矩阵

8. `src/modules/runner`
   - runnable stage 选择
   - stage lease / heartbeat
   - crash recovery

9. `src/connectors/jira`
10. `src/connectors/confluence`
11. `src/connectors/github`
12. `src/connectors/llm`

13. `src/repositories`
    - 数据访问层

14. `src/shared`
    - 类型
    - 常量
    - 工具函数
    - 错误码

---

## 5. 核心后端能力

## 5.1 启动 Flow

输入：

- Jira Key
- 启动模式
- Repo Override（可选）
- 备注（可选）

后端需要完成：

1. 校验输入
2. 检查是否存在冲突 Flow
3. 创建 WorkItem 占位记录或绑定已有 WorkItem
4. 创建 FlowRun
5. 创建第一条阶段记录
6. 异步推进 workflow engine

## 5.2 Flow 查询

后端需要支持：

1. Flow 列表查询
2. Flow 详情查询
3. 阶段历史查询
4. 日志查询
5. 可执行人工动作查询
6. Evidence 查询

## 5.3 人工干预

后端需要支持以下动作：

1. 暂停
2. 继续
3. 终止
4. 重试阶段
5. 跳过阶段
6. 设置 Repo Override
7. 修正 Confluence 链接
8. 通过分析审批
9. 要求补充分析内容
10. 通过验证审批
11. 要求补充验证内容

## 5.4 Evidence

后端必须支持：

1. 提交结构化 evidence
2. 查询 evidence 列表
3. 校验 evidence payload
4. 在阶段推进前检查关闭门禁

## 5.5 Runner

后端必须支持：

1. 查询 runnable stage
2. 为 stage attempt 建立排他 lease
3. 续约 heartbeat
4. lease 过期后的恢复
5. 在手工动作后重新校验状态再提交流转

---

## 6. 数据库设计

MVP 建议使用关系型数据库。

建议核心表：

1. `work_items`
2. `flow_runs`
3. `flow_stage_runs`
4. `flow_logs`
5. `manual_actions`
6. `evidence_records`

## 6.1 work_items

关键字段建议：

- `id`
- `jira_key`
- `jira_url`
- `jira_title`
- `jira_description`
- `jira_status`
- `jira_project_key`
- `assignee`
- `source_confluence_urls_json`
- `analysis_page_url`
- `repo_name`
- `repo_url`
- `base_branch`
- `base_commit_sha`
- `working_branch`
- `implementation_summary`
- `test_summary`
- `created_at`
- `updated_at`

约束建议：

- `jira_key` 唯一索引

## 6.2 flow_runs

关键字段建议：

- `id`
- `work_item_id`
- `trigger_mode`
- `current_stage`
- `overall_status`
- `blocking_reason_code`
- `blocking_reason_message`
- `manual_action_required`
- `manual_action_type`
- `source_flow_run_id`
- `resume_from_stage`
- `operator_id`
- `operator_email`
- `operator_display_name`
- `operator_capabilities_json`
- `started_at`
- `updated_at`
- `completed_at`

索引建议：

- `work_item_id`
- `overall_status`
- `current_stage`
- `started_at`

## 6.3 flow_stage_runs

关键字段建议：

- `id`
- `flow_run_id`
- `stage_name`
- `status`
- `attempt_no`
- `started_at`
- `finished_at`
- `duration_ms`
- `error_code`
- `error_message`
- `requires_manual_action`
- `lease_owner`
- `lease_expires_at`
- `last_heartbeat_at`

## 6.4 flow_logs

关键字段建议：

- `id`
- `flow_run_id`
- `stage_name`
- `level`
- `event_type`
- `message`
- `details_json`
- `related_object_type`
- `related_object_id`
- `redacted`
- `created_at`

## 6.5 manual_actions

关键字段建议：

- `id`
- `flow_run_id`
- `action_type`
- `payload_json`
- `operator_id`
- `operator_email`
- `operator_display_name`
- `operator_capabilities_json`
- `result`
- `created_at`

## 6.6 evidence_records

关键字段建议：

- `id`
- `flow_run_id`
- `stage_name`
- `evidence_type`
- `payload_json`
- `operator_id`
- `operator_email`
- `operator_display_name`
- `source_system`
- `created_at`

---

## 7. 状态机与阶段执行器

## 7.1 总状态

总状态枚举建议：

- `pending`
- `running`
- `waiting_manual_action`
- `paused`
- `failed`
- `completed`
- `cancelled`

## 7.2 阶段枚举

建议阶段枚举：

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

## 7.3 阶段执行器接口

建议统一阶段执行器接口：

```ts
interface StageExecutor {
  stageName: string;
  execute(context: FlowContext): Promise<StageExecutionResult>;
}
```

`StageExecutionResult` 建议包含：

- `nextStage`
- `status`
- `updatedWorkItemFields`
- `requiresManualAction`
- `manualActionType`
- `blockingReasonCode`
- `blockingReasonMessage`
- `evidenceWrites`
- `idempotencyKey`

## 7.4 MVP 阶段责任

### manual_request_received

- 初始化 FlowRun
- 写入启动日志

### jira_ticket_fetching

- 调用 Jira Connector 拉取 Ticket

### jira_ticket_normalized

- 标准化 Ticket 内容
- 回填 WorkItem

### confluence_links_extracting

- 提取 Jira 描述与评论中的链接

### source_pages_fetching

- 拉取可访问的 Confluence 页面

### analysis_generating

- 调用 LLM Bridge 生成分析文档草案

### analysis_page_creating

- 在 Confluence 创建分析页

### analysis_approval_waiting

- 等待人工审批分析页
- 只接受分析审批动作

### repo_resolving

- 根据映射规则定位 Repo

### branch_preparing

- 解析基线分支
- 记录基线 commit sha
- 创建或复用 `<jira-key>` 分支

### implementation_waiting

- 等待人工完成实际开发
- 等待人工确认进入验证阶段

### verification_waiting

- 等待人工录入或确认测试完成
- 等待结构化测试证据写入

### verification_approval_waiting

- 等待人工审批验证结果

### confluence_result_updating

- 回写实现结果与测试结果

### jira_status_updating

- 更新 Jira 状态为完成

---

## 8. API 设计

## 8.1 Flow 列表

`GET /api/flows`

返回：

- 列表数据
- 分页信息

## 8.2 Flow 详情

`GET /api/flows/{flowRunId}`

返回：

- FlowRun
- WorkItem
- 阶段历史
- 关联对象
- 可执行动作

## 8.3 Flow 日志

`GET /api/flows/{flowRunId}/logs`

## 8.4 手动启动

`POST /api/flows`

请求体：

```json
{
  "jiraKey": "RD-1234",
  "triggerMode": "manual_start",
  "repoOverride": null,
  "note": "manual start",
  "sourceFlowRunId": null,
  "resumeFromStage": null
}
```

## 8.5 人工操作

`POST /api/flows/{flowRunId}/actions`

请求体：

```json
{
  "actionType": "resume",
  "payload": {}
}
```

## 8.6 可执行动作查询

`GET /api/flows/{flowRunId}/available-actions`

用于前端决定显示哪些操作按钮。

## 8.7 Evidence 接口

- `GET /api/flows/{flowRunId}/evidence`
- `POST /api/flows/{flowRunId}/evidence`

## 8.8 Jira 搜索

`GET /api/jira/issues/search?query=...`

用于手动启动时的候选 Ticket 搜索。

---

## 9. Connector 实现计划

## 9.1 Jira Connector

第一批实现：

1. `getTicketByKey`
2. `getTicketComments`
3. `searchTickets`
4. `transitionTicket`

异常处理：

1. 404：Ticket 不存在
2. 403：无访问权限
3. 超时：可重试

## 9.2 Confluence Connector

第一批实现：

1. `getPageByUrl`
2. `createAnalysisPage`
3. `updateAnalysisPage`

异常处理：

1. 页面不可访问
2. 目标 Space 无权限
3. 创建失败

## 9.3 GitHub Connector

第一批实现：

1. `resolveRepo`
2. `prepareBaseBranch`
3. `createOrReuseBranch`

特殊约束：

1. 默认分支名必须直接等于 Jira Key
2. 分支必须从解析出的基线分支创建
3. 必须记录 `base_branch` 与 `base_commit_sha`
4. 必须定义分支已存在时的幂等策略
5. 分支存在但与目标基线不一致时必须阻塞，不得静默复用

## 9.4 LLM Connector

第一批实现：

1. `generateAnalysisDocument`
2. `generateResultSummary`

必须处理：

1. Bridge 不可用
2. 请求超时
3. 输出结构不合法

---

## 10. 配置设计

建议配置项：

- `PORT`
- `DATABASE_URL`
- `GITHUB_TOKEN`
- `JIRA_BASE_URL`
- `JIRA_TOKEN`
- `CONFLUENCE_BASE_URL`
- `CONFLUENCE_TOKEN`
- `LLM_BASE_URL`
- `LLM_MODEL`
- `LLM_TIMEOUT_MS`
- `DEFAULT_CONFLUENCE_SPACE`
- `DEFAULT_CONFLUENCE_PARENT_PAGE`

还需要一份 Repo 映射配置，例如：

- `jira_project_key -> github_repo`

---

## 11. 错误码设计

建议建立统一错误码，不要直接把外部系统错误原样透传给前端。

建议错误码分类：

1. 用户输入类
   - `INVALID_JIRA_KEY`
   - `TICKET_NOT_FOUND`

2. 权限类
   - `JIRA_ACCESS_DENIED`
   - `CONFLUENCE_ACCESS_DENIED`
   - `GITHUB_ACCESS_DENIED`

3. 系统类
   - `LLM_BRIDGE_UNAVAILABLE`
   - `UPSTREAM_TIMEOUT`
   - `DATABASE_ERROR`

4. 业务类
   - `FLOW_CONFLICT`
   - `REPO_NOT_RESOLVED`
   - `BRANCH_ALREADY_EXISTS`
   - `BRANCH_DIVERGED`
   - `ANALYSIS_OUTPUT_INVALID`

---

## 12. 日志与审计设计

## 12.1 FlowLog

所有阶段执行都必须记录摘要日志。

建议记录：

1. 阶段开始
2. 阶段成功
3. 阶段失败
4. 重试
5. 人工动作
6. 外部调用摘要

## 12.2 审计要求

以下操作必须审计：

1. 手动启动
2. 暂停
3. 继续
4. 终止
5. 跳过阶段
6. 修正 Repo
7. 修正 Confluence 链接
8. 确认分析页
9. 确认验证结果

---

## 13. 实现批次

## 13.1 Batch 1：状态机骨架 + 基础 API

范围：

1. 数据表迁移
2. FlowRun / WorkItem / FlowLog Repository
3. `POST /api/flows`
4. `GET /api/flows`
5. `GET /api/flows/{id}`
6. workflow engine 骨架

交付标准：

- 能创建 Flow
- 能查询 Flow
- 能记录基础状态

## 13.2 Batch 2：Jira 接入

范围：

1. Jira Connector
2. `jira_ticket_fetching`
3. `jira_ticket_normalized`

交付标准：

- 输入 Jira Key 后能真实拉取 Ticket

## 13.3 Batch 3：Confluence 源页读取 + LLM 生成

范围：

1. 链接提取
2. Confluence Connector 读能力
3. LLM Connector
4. `analysis_generating`

交付标准：

- 能产出结构化分析文档内容

## 13.4 Batch 4：Confluence 分析页创建 + GitHub 分支创建

范围：

1. `analysis_page_creating`
2. `repo_resolving`
3. `branch_preparing`

交付标准：

- 能在 Confluence 落页
- 能创建 `<jira-key>` 分支

## 13.5 Batch 5：人工干预 + 恢复能力

范围：

1. `POST /actions`
2. 暂停 / 继续 / 重试 / 终止
3. `available-actions`
4. stage lease / heartbeat 恢复

交付标准：

- 用户能从前端接管流程

## 13.6 Batch 6：Evidence、审批与闭环回写

范围：

1. `GET/POST /evidence`
2. `confluence_result_updating`
3. `jira_status_updating`
4. 完成门禁

交付标准：

- 能完成 Jira + Confluence 回写闭环

---

## 14. 测试计划

## 14.1 单元测试

必须覆盖：

1. Jira Key 校验
2. Flow 冲突判定
3. 状态机流转
4. 阶段失败后的分流逻辑
5. Repo 映射
6. 分支命名规则
7. evidence payload 校验
8. lease 过期恢复

## 14.2 集成测试

必须覆盖：

1. 手动启动 -> Jira 拉取成功
2. Jira -> Confluence -> LLM -> 分析页
3. Repo 解析 -> 创建分支
4. 阻塞后人工恢复
5. 回写 Confluence 与 Jira
6. evidence 录入后推进到审批阶段

## 14.3 回归测试

每个 Batch 合入前至少验证：

1. Flow 列表 API 不回退
2. Flow 详情 API 不回退
3. 已实现阶段不被新增逻辑破坏

---

## 15. 风险与对策

## 15.1 外部系统不稳定

对策：

1. 超时控制
2. 固定次数重试
3. 失败后进入人工处理态

## 15.2 LLM 输出不稳定

对策：

1. 强约束 Prompt
2. 输出结构校验
3. 不合格则阻塞，不直接落页

## 15.3 GitHub 分支冲突

对策：

1. 启动前检查分支是否存在
2. 若已存在且可安全复用，记录 reused
3. 若已存在但与基线冲突，进入阻塞态并要求人工处理

## 15.4 闭环假完成

对策：

1. Confluence 回写前禁止更新 Jira
2. 验证未确认前禁止完成

---

## 16. 建议开发顺序

建议顺序如下：

1. 先把数据表和状态机骨架搭起来
2. 再接 Jira
3. 再接 Confluence 读取和 LLM
4. 再做 Confluence 落页与 GitHub 分支
5. 最后做人工干预和闭环回写

理由：

1. 没有状态机和持久化，后面所有能力都不稳定
2. Jira 是入口，不先打通就无法往后推进
3. LLM 与 Confluence 分析页是中段核心
4. GitHub 分支是关键工件，但依赖前面上下文
5. 人工干预和回写必须建立在主链路已存在的前提上

---

## 17. 完成定义

后端 MVP 只有在以下条件都满足时才算完成：

1. 能接收手动启动请求
2. 能稳定创建 FlowRun
3. 能真实打通 Jira / Confluence / GitHub / LLM Bridge
4. 能记录阶段、日志、错误
5. 能支持人工恢复
6. 能录入并校验 evidence
7. 能完成 Confluence 与 Jira 回写

这七项缺一不可。
