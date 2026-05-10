Canonical Sources:
- `docs/canonical-workflow-spec.md` sections 3-4, 7, 9, 10
- Owns canonical concerns: total statuses, stage list, blocking model, rerun/recovery, flow conflict, lease/heartbeat baseline semantics

## ADDED Requirements

### Requirement: Flow 生命周期状态机
系统 SHALL 使用规范状态机管理每一次 Flow 执行，并只允许使用既定的流程级状态和阶段级状态。

#### Scenario: 创建新流程时初始化状态
- **WHEN** 操作者提交合法的手动启动请求并通过预检查
- **THEN** 系统必须创建新的 `FlowRun`
- **THEN** `FlowRun.overall_status` 必须初始化为 `pending` 或 `running`
- **THEN** `FlowRun.current_stage` 必须从 `manual_request_received` 开始

#### Scenario: 阶段推进必须遵循规范路径
- **WHEN** 自动阶段执行成功
- **THEN** 系统必须仅推进到规范定义的下一个阶段
- **THEN** 不得创建临时阶段名替代阻塞或失败语义

### Requirement: 阶段执行历史记录
系统 SHALL 为每个规范阶段记录独立的阶段执行历史，用于审计、重试和恢复。

#### Scenario: 阶段开始时创建 StageRun
- **WHEN** 某个阶段被工作流执行器选中准备运行
- **THEN** 系统必须创建或更新对应的 `flow_stage_runs` 记录
- **THEN** 记录中必须包含 `stage_name`、`attempt_no`、`started_at` 和 `status=running`

#### Scenario: 阶段结束时固化结果
- **WHEN** 某个阶段执行完成、失败、跳过或等待人工处理
- **THEN** 系统必须写入最终 `status`
- **THEN** 系统必须记录 `finished_at`、`duration_ms` 和必要的错误摘要

### Requirement: 阻塞与人工处理语义
系统 SHALL 使用阻塞字段和人工动作字段表达人工介入需求，而不是通过新增状态或隐藏条件表达。

#### Scenario: 自动阶段遇到需人工处理的问题
- **WHEN** 仓库无法解析、分支谱系冲突、上下文信息不足或审批未通过
- **THEN** `FlowRun.overall_status` 必须进入 `waiting_manual_action` 或 `failed`
- **THEN** 系统必须同时写入 `blocking_reason_code`、`blocking_reason_message`、`manual_action_required=true`

#### Scenario: 前端查询可操作态
- **WHEN** 前端读取 Flow 详情
- **THEN** 系统必须返回当前阻塞原因和期待的人工作类型
- **THEN** 前端不得自行推导隐藏的人工动作条件

### Requirement: 重跑与失败恢复
系统 SHALL 区分首次执行、重跑和失败恢复，并在流程数据中保留来源关系。

#### Scenario: 重跑从头开始
- **WHEN** 操作者显式选择 `rerun`
- **THEN** 系统必须创建新的 `FlowRun`
- **THEN** 新 `FlowRun` 必须关联 `source_flow_run_id`
- **THEN** 流程必须从 `manual_request_received` 重新开始

#### Scenario: 失败恢复从规范边界继续
- **WHEN** 操作者显式选择 `resume_from_failure`
- **THEN** 系统必须创建新的恢复流程或恢复执行记录
- **THEN** 系统必须记录 `resume_from_stage`
- **THEN** 恢复起点只能是规范阶段边界

### Requirement: 单 Ticket 活动流程冲突控制
系统 SHALL 阻止同一 Jira Ticket 在未显式确认的情况下产生并发活动流程。

#### Scenario: 存在活动流程时默认拒绝新建
- **WHEN** 同一 Jira Ticket 已存在 `running`、`waiting_manual_action` 或 `paused` 状态的 Flow
- **THEN** 默认创建请求必须返回 `FLOW_CONFLICT`
- **THEN** 响应中必须包含冲突流程的 `id`、`overall_status` 和 `current_stage`

#### Scenario: 用户显式选择重跑或恢复
- **WHEN** 操作者在冲突提示后显式选择 `rerun` 或 `resume_from_failure`
- **THEN** 系统才允许继续创建新的 Flow

### Requirement: 阶段租约、心跳与 crash recovery
系统 SHALL 为可执行阶段提供租约、心跳和恢复语义，以支持单执行器排他和进程崩溃后的恢复。

#### Scenario: 同一阶段尝试只允许单执行器持有租约
- **WHEN** 多个执行器同时尝试获取同一阶段尝试的执行权
- **THEN** 系统必须只允许一个执行器持有活动租约
- **THEN** 其他执行器必须被拒绝或重试等待

#### Scenario: 租约过期后可恢复执行
- **WHEN** 阶段执行器崩溃或长时间失去心跳导致租约过期
- **THEN** 系统必须允许其他执行器回收该阶段
- **THEN** 恢复执行必须从持久化状态继续，而不是从内存假设重新开始
