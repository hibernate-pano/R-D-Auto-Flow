# 规范工作流说明：R&D Auto Flow MVP

## 1. 文档目的

本文档是 MVP 阶段唯一的工作流规范真相源。

如果其他文档与本文档冲突，以本文档为准。

它在实现开始前固定以下八件事：

1. MVP 边界
2. 规范状态机
3. 人工动作与审批模型
4. 证据与关闭门禁模型
5. 重跑与恢复语义
6. 仓库与分支契约
7. 工作流执行器契约
8. 鉴权与操作者模型

---

## 2. MVP 边界

MVP 是一个编排与治理系统，不是一个全自动编码执行引擎。

在 MVP 中，系统必须做到：

1. 接收人工指定的 Jira Ticket
2. 拉取并标准化 Jira 上下文
3. 读取引用的 Confluence 页面
4. 生成并创建分析页
5. 解析目标 GitHub 仓库
6. 创建或校验工作分支
7. 将实现与验证作为一等工作流阶段追踪
8. 收集结构化实现证据与测试证据
9. 执行审批与关闭门禁
10. 将结果回写到 Confluence 和 Jira

在 MVP 中，系统不必做到：

1. 自动修改目标仓库代码
2. 自动在目标仓库内运行全部测试命令
3. 提供通用可配置审批引擎
4. 支持多仓库编排

解释如下：

- `implementation_waiting` 表示实现动作发生在工作流引擎之外，但工作流引擎仍然负责状态、证据、审计与关闭门禁。
- `verification_waiting` 表示验证证据生成在工作流引擎之外，但工作流引擎仍然负责证据采集、审批与最终关闭门禁。

### 2.1 参与者模型

MVP 有三类参与者：

1. `system`
   - 推进自动阶段的工作流执行器
2. `operator`
   - 启动流程、提交证据或执行人工动作的人
3. `external_executor`
   - 在工作流引擎外执行实现或验证的人或外部 Agent

规则如下：

1. 工作流引擎拥有编排状态的最终控制权
2. 实现和测试执行可以发生在工作流引擎外部
3. 关闭门禁依赖持久化证据，而不是自由文本声明
4. 每次人工动作、证据提交和审批决定都必须持久化不可变的操作者快照

---

## 3. 规范术语

### 3.1 总状态

以下是 MVP 允许的唯一流程级状态：

- `pending`
- `running`
- `waiting_manual_action`
- `paused`
- `failed`
- `completed`
- `cancelled`

### 3.2 阶段名称

以下是 MVP 允许的唯一阶段名称：

1. `manual_request_received`
2. `jira_ticket_fetching`
3. `jira_ticket_normalized`
4. `confluence_links_extracting`
5. `source_pages_fetching`
6. `analysis_generating`
7. `analysis_page_creating`
8. `analysis_approval_waiting`
9. `repo_resolving`
10. `branch_preparing`
11. `implementation_waiting`
12. `verification_waiting`
13. `verification_approval_waiting`
14. `confluence_result_updating`
15. `jira_status_updating`
16. `completed`

### 3.3 阶段状态

以下是 MVP 允许的唯一阶段执行状态：

- `pending`
- `running`
- `succeeded`
- `failed`
- `skipped`
- `waiting_manual_action`

### 3.4 阻塞模型

不要创建诸如 `awaiting-repo-resolution` 或 `branch-creation-failed` 之类的临时阶段。

阻塞必须通过以下字段表达：

1. 当前规范阶段
2. Flow 的 `overall_status`
3. `blocking_reason_code`
4. `blocking_reason_message`
5. `manual_action_required`
6. `manual_action_type`

其中：

- `blocking_reason_code` 用于稳定的程序处理
- `blocking_reason_message` 用于面向操作者的诊断提示

---

## 4. 规范阶段流

主路径如下：

`manual_request_received`
-> `jira_ticket_fetching`
-> `jira_ticket_normalized`
-> `confluence_links_extracting`
-> `source_pages_fetching`
-> `analysis_generating`
-> `analysis_page_creating`
-> `analysis_approval_waiting`
-> `repo_resolving`
-> `branch_preparing`
-> `implementation_waiting`
-> `verification_waiting`
-> `verification_approval_waiting`
-> `confluence_result_updating`
-> `jira_status_updating`
-> `completed`

---

## 5. 审批模型

MVP 只支持两个固定审批检查点，不引入通用可配置审批引擎。

### 5.1 固定检查点

1. 分析审批：分析页创建后、仓库与实现推进前
2. 验证审批：验证证据录入后、Confluence 最终回写与 Jira 完成前

### 5.2 审批结果

MVP 审批结果固定为：

- `approved`
- `rejected`
- `changes_requested`

### 5.3 审批动作

人工动作词表必须包含：

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

### 5.4 审批策略

虽然审批点固定，但审批记录必须是一等实体。

每次审批决定都必须持久化：

1. `checkpoint`
2. `outcome`
3. `note`
4. 不可变审批人快照
5. 决策时间戳

最小策略如下：

1. `approve_analysis` 与 `approve_verification` 需要显式能力
2. `skip_stage`、`cancel`、`set_repo_override` 需要显式能力
3. 是否允许自审必须由部署策略明确决定；若未允许，后端必须拒绝

---

## 6. 证据模型

MVP 必须持久化结构化证据，日志和自由文本摘要都不够。

### 6.1 证据记录类型

至少支持以下证据类型：

- `analysis_snapshot`
- `branch_snapshot`
- `implementation_note`
- `test_execution`
- `manual_verification`
- `approval_decision`
- `final_writeback`

### 6.2 最小测试证据载荷

每条测试证据至少应支持：

1. `command`
2. `result`
3. `summary`
4. `artifacts`
5. `coverage_note`
6. `risk_note`
7. `operator`
8. `recorded_at`

### 6.3 证据录入契约

系统必须暴露结构化证据录入接口。

最小 API 面包括：

1. `GET /api/flows/{flowRunId}/evidence`
2. `POST /api/flows/{flowRunId}/evidence`

证据必须支持按以下维度查询：

1. `stage`
2. `evidenceType`
3. `createdAt`
4. `operator`

### 6.4 关闭门禁

只有在以下条件全部满足时，Jira 才允许进入完成态：

1. 分析页已存在
2. 目标仓库已解析
3. 工作分支已准备完成
4. 实现完成事实已记录
5. 验证证据已存在
6. 验证审批结果为通过
7. Confluence 最终回写已完成

---

## 7. 重跑与恢复语义

### 7.1 触发模式

支持的触发模式如下：

- `manual_start`
- `rerun`
- `resume_from_failure`

`auto_assigned` 预留给 MVP 之后的阶段。

### 7.2 创建流程规则

`POST /api/flows` 必须支持：

1. `jiraKey`
2. `triggerMode`
3. `repoOverride`
4. `note`
5. `sourceFlowRunId`，用于 `rerun` 和 `resume_from_failure`
6. `resumeFromStage`，用于需要指定恢复起点的 `resume_from_failure`

### 7.3 语义差异

`manual_start`

- 创建一个与历史流程无依赖的新流程

`rerun`

- 创建一个关联历史流程的新流程
- 从规范工作流起点重新开始

`resume_from_failure`

- 创建一个关联历史流程的新流程或恢复流程
- 从某个规范阶段边界继续执行

### 7.4 冲突规则

如果同一个 Jira Ticket 已存在活动流程：

1. 默认创建请求必须以 `FLOW_CONFLICT` 拒绝
2. API 响应必须返回冲突流程的 ID、状态和阶段
3. 用户必须显式选择重跑或恢复

---

## 8. 仓库与分支契约

MVP 不能把 `master` 写死为唯一合法基线分支。

### 8.1 基线分支

基线分支来源只能是：

1. 解析得到的仓库默认分支，或
2. 显式配置的覆盖分支

并且必须同时持久化：

1. `base_branch`
2. `base_commit_sha`

### 8.2 工作分支

默认工作分支名为：

`<jira-key>`

### 8.3 分支准备规则

`branch_preparing` 必须覆盖：

1. 解析基线分支
2. 记录基线提交 `sha`
3. 检查工作分支是否已存在
4. 在需要时创建工作分支
5. 记录结果是创建还是复用

分支结果必须归类为：

1. `created`
2. `reused`
3. `blocked_diverged`
4. `blocked_permission_denied`

策略如下：

1. 若分支不存在，则从解析出的基线分支创建
2. 若分支存在且头指针与记录的分支意图一致，则复用
3. 若分支存在但与预期基线谱系冲突，则不得静默复用，必须阻塞并要求人工处理
4. MVP 中，重跑和恢复都不得生成隐藏的替代分支名
5. 工作分支名必须直接等于 `<jira-key>`

### 8.4 仓库解析策略

仓库解析优先级如下：

1. 显式 `repoOverride`
2. 工单级显式映射字段（若已配置）
3. 配置文档中的 Jira Project 到 Repo 映射

`POST /api/flows/precheck` 必须返回：

1. Ticket 是否存在
2. 仓库是否可解析
3. 解析得到的仓库名
4. 解析得到的基线分支
5. 是否已存在活动流程

---

## 9. 工作流执行器契约

MVP 不要求单独引入队列平台，但必须具备持久化执行器语义。

### 9.1 可执行阶段契约

只有满足以下条件时，阶段才可执行：

1. Flow 处于 `pending` 或 `running`
2. 当前阶段是规范阶段
3. 当前阶段不在等待人工动作
4. 同一阶段尝试上不存在活动租约

### 9.2 租约与恢复契约

每个运行中的阶段尝试必须支持：

1. 租约持有者
2. 租约过期时间
3. 心跳时间戳
4. 有界重试次数

规则如下：

1. 同一阶段尝试任一时刻只能有一个执行器持有活动租约
2. 过期租约允许被回收
3. 外部副作用必须包裹在幂等阶段逻辑中
4. 崩溃恢复必须从持久化阶段状态恢复，而不是依赖内存假设

### 9.3 人工动作竞争契约

如果某个人工动作作用于一个仍持有活动阶段租约的流程：

1. 该人工动作必须先持久化
2. 执行器在提交下一个状态迁移前必须重新检查流程状态
3. 如果冲突的暂停或取消已被接受，执行器不得继续推进阶段

---

## 10. 搜索与预检查契约

前端契约要求系统同时提供搜索与预检查能力。

MVP 应暴露：

1. `GET /api/jira/issues/search?query=...`
2. `POST /api/flows/precheck`

---

## 11. 最小鉴权契约

MVP 不需要完整 RBAC，但必须为敏感动作定义鉴权边界。

后端至少必须能拿到：

1. `operatorId`
2. `operatorEmail`
3. `operatorDisplayName`
4. `operatorCapabilities`

最小能力词表如下：

1. `flow:start`
2. `flow:pause`
3. `flow:resume`
4. `flow:cancel`
5. `flow:retry`
6. `flow:skip`
7. `flow:override-repo`
8. `flow:approve-analysis`
9. `flow:approve-verification`
10. `flow:submit-evidence`
