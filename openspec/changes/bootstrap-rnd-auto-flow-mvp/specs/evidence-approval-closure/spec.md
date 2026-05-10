Canonical Sources:
- `docs/canonical-workflow-spec.md` sections 5-6
- Shared ownership notes:
  - operator action presentation is shared with `operator-workbench`
  - final writeback is downstream of `external-context-ingestion` and `repo-branch-preparation`

## ADDED Requirements

### Requirement: 结构化证据录入
系统 SHALL 提供统一证据录入接口，并对证据类型和载荷执行结构化校验。

#### Scenario: 提交测试执行证据
- **WHEN** 操作者提交 `test_execution`
- **THEN** 系统必须校验 `command`、`result`、`summary`、`artifacts`、`coverage_note`、`risk_note` 等字段结构
- **THEN** 记录必须与当前 `flow_run_id` 和 `stage_name` 关联

#### Scenario: 提交人工验证证据替代自动化测试
- **WHEN** 操作者仅提交 `manual_verification`
- **THEN** 系统必须要求提交验证结论、范围、风险以及未提供自动化测试的原因

### Requirement: 分析审批检查点
系统 SHALL 在分析页创建完成后强制进入分析审批检查点。

#### Scenario: 分析页创建后等待审批
- **WHEN** `analysis_page_creating` 成功结束
- **THEN** 流程必须进入 `analysis_approval_waiting`
- **THEN** 在审批通过前不得继续推进到 `repo_resolving`

#### Scenario: 分析审批通过
- **WHEN** 具备 `flow:approve-analysis` 能力的操作者执行 `approve_analysis`
- **THEN** 系统必须持久化 `approval_decision`
- **THEN** 流程才允许继续进入仓库与分支准备阶段

### Requirement: 验证审批检查点
系统 SHALL 在验证证据到位后强制进入验证审批检查点。

#### Scenario: 实现记录后推进到验证阶段
- **WHEN** `implementation_waiting` 准备推进到 `verification_waiting`
- **THEN** 系统必须先检查至少存在一条 `implementation_note`

#### Scenario: 验证阶段准备审批
- **WHEN** `verification_waiting` 准备推进到 `verification_approval_waiting`
- **THEN** 系统必须先检查至少存在一条 `test_execution` 或 `manual_verification`

#### Scenario: 验证审批通过
- **WHEN** 具备 `flow:approve-verification` 能力的操作者执行 `approve_verification`
- **THEN** 系统必须写入 `approval_decision`
- **THEN** 流程才允许进入最终回写阶段

### Requirement: 关闭门禁与最终回写
系统 SHALL 仅在全部关闭门禁满足后才允许更新 Confluence 最终结果并推进 Jira 到完成态。

#### Scenario: 关闭门禁满足
- **WHEN** 分析页已存在、目标仓库已解析、工作分支已准备、实现记录已存在、验证证据已存在且验证审批通过
- **THEN** 系统才允许进入 `confluence_result_updating` 和 `jira_status_updating`

#### Scenario: 门禁缺失阻止 Jira 完成
- **WHEN** 任一门禁缺失，例如没有测试证据、没有验证审批或 Confluence 最终回写失败
- **THEN** 系统不得更新 Jira 为完成态
- **THEN** 必须返回明确的缺口说明供前端展示
