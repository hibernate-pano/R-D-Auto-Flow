Canonical Sources:
- `docs/canonical-workflow-spec.md` sections 4, 7, 9, 10
- Shared ownership notes:
  - lease/crash-recovery mechanics are shared with `flow-lifecycle-orchestration`
  - operator/audit semantics overlap with `operator-workbench`

## ADDED Requirements

### Requirement: 结构化运行日志
系统 SHALL 为每个阶段写入结构化运行日志，以支持前端摘要展示、错误排查和审计追踪。

#### Scenario: 写入阶段摘要日志
- **WHEN** 任一阶段开始、成功、失败、阻塞或重试
- **THEN** 系统必须记录 `stage_name`、`level`、`event_type`、`message` 和 `created_at`

#### Scenario: 详细内容脱敏
- **WHEN** 日志包含请求体、Token、内部敏感信息或长文本上下文
- **THEN** 系统必须在持久化前完成脱敏或裁剪

### Requirement: 人工动作审计
系统 SHALL 记录所有人工动作的操作者快照、动作参数和结果。

#### Scenario: 执行人工动作成功
- **WHEN** 用户执行 `pause`、`retry_stage`、`set_repo_override`、`approve_analysis` 等动作
- **THEN** 系统必须在 `manual_actions` 中写入 `action_type`、`payload_json`、`note`、操作者信息和 `result`

#### Scenario: 人工动作被拒绝
- **WHEN** 用户没有能力或当前状态不允许执行某动作
- **THEN** 系统必须拒绝该动作
- **THEN** 必须同时返回稳定错误码与可读错误说明

### Requirement: 稳定错误码体系
系统 SHALL 对外暴露统一错误码，而不是直接透传第三方原始错误。

#### Scenario: 外部系统权限不足
- **WHEN** Jira、Confluence 或 GitHub 返回权限错误
- **THEN** 系统必须映射为稳定错误码，例如 `JIRA_ACCESS_DENIED`、`CONFLUENCE_ACCESS_DENIED`、`GITHUB_ACCESS_DENIED`

#### Scenario: 上游超时或 Bridge 不可用
- **WHEN** 外部调用超时或 LLM Bridge 不可达
- **THEN** 系统必须映射为 `UPSTREAM_TIMEOUT`、`LLM_BRIDGE_UNAVAILABLE` 或同级错误码

### Requirement: 恢复可观测性
系统 SHALL 让操作者可以看见流程当前卡点、上一次成功步骤和恢复建议。

#### Scenario: 流程进入失败或阻塞态
- **WHEN** Flow 执行失败或等待人工处理
- **THEN** Flow 详情必须能显示当前阻塞原因、失败阶段、最近成功阶段和推荐的下一步动作

#### Scenario: 租约恢复发生
- **WHEN** 某个阶段因租约过期被重新回收执行
- **THEN** 系统必须记录恢复事件日志
- **THEN** 操作者必须能在日志中区分普通重试和 crash recovery
