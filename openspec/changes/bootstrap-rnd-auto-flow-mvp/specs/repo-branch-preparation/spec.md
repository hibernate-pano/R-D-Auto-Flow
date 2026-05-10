Canonical Sources:
- `docs/canonical-workflow-spec.md` sections 4, 8, 10
- Shared ownership notes:
  - repo mapping inputs are shared with `runtime-configuration`
  - branch-preparation results feed `evidence-approval-closure`

## ADDED Requirements

### Requirement: 目标仓库解析优先级
系统 SHALL 以固定优先级解析当前 Ticket 的目标 GitHub 仓库。

#### Scenario: 使用显式仓库覆盖
- **WHEN** 启动请求或人工动作提供 `repoOverride`
- **THEN** 系统必须优先使用该仓库作为目标仓库

#### Scenario: 使用项目级映射
- **WHEN** 没有 `repoOverride` 且 Ticket 没有显式仓库字段
- **THEN** 系统必须回退到 YAML 配置文档中的 Jira Project 到 Repo 映射

### Requirement: 基线分支解析与记录
系统 SHALL 解析目标仓库的默认基线分支或显式覆盖基线分支，并记录分支名和基线提交。

#### Scenario: 仓库解析成功
- **WHEN** 流程进入 `repo_resolving`
- **THEN** 系统必须确定 `repo_name`、`repo_url` 和 `base_branch`

#### Scenario: 分支准备前记录基线提交
- **WHEN** 流程进入 `branch_preparing`
- **THEN** 系统必须记录 `base_commit_sha`
- **THEN** 该提交必须作为本次工作分支准备的基线快照

### Requirement: 工作分支创建与复用
系统 SHALL 使用 `<jira-key>` 作为唯一工作分支名，并定义创建、复用和阻塞语义。

#### Scenario: 工作分支不存在
- **WHEN** 目标仓库中不存在 `<jira-key>` 分支
- **THEN** 系统必须从解析出的 `base_branch` 创建该分支
- **THEN** 结果必须标记为 `created`

#### Scenario: 工作分支已存在且可复用
- **WHEN** 目标仓库已存在 `<jira-key>` 分支且其头指针符合预期基线谱系
- **THEN** 系统必须复用该分支
- **THEN** 结果必须标记为 `reused`

#### Scenario: 工作分支已存在但谱系冲突
- **WHEN** `<jira-key>` 分支已存在但与本次解析出的基线谱系冲突
- **THEN** 系统必须阻塞流程
- **THEN** 不得静默复用或改用隐藏分支名

### Requirement: 分支结果回写与证据化
系统 SHALL 将分支准备结果回写到 WorkItem、证据记录和分析页。

#### Scenario: 分支准备成功
- **WHEN** 分支创建或复用完成
- **THEN** 系统必须更新 `working_branch`
- **THEN** 系统必须写入至少一条 `branch_snapshot` 证据
- **THEN** 分析页必须追加当前仓库、基线分支、基线提交和工作分支结果

#### Scenario: 权限不足导致分支准备失败
- **WHEN** GitHub API 返回写权限不足
- **THEN** 系统必须返回稳定错误码 `GITHUB_ACCESS_DENIED` 或同级错误
- **THEN** 流程必须进入显式阻塞或失败态
