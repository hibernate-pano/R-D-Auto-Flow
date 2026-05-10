Canonical Sources:
- `docs/canonical-workflow-spec.md` sections 8, 10
- Owns canonical concerns: env-vs-YAML config boundary, repo mapping inputs, governance switches affecting execution

## ADDED Requirements

### Requirement: 环境变量与配置文档分层
系统 SHALL 将敏感配置与业务规则配置分离管理。

#### Scenario: 敏感信息通过环境变量注入
- **WHEN** 服务启动
- **THEN** `DATABASE_URL`、`GITHUB_TOKEN`、`JIRA_TOKEN`、`CONFLUENCE_TOKEN`、`LLM_API_KEY` 等敏感项必须从环境变量读取
- **THEN** 不得把这些值写入 YAML 配置文档

#### Scenario: 业务规则通过 YAML 配置文档注入
- **WHEN** 服务启动
- **THEN** Jira 完成态映射、Jira Project 到 Repo 映射、Confluence 默认目标和治理开关必须从 YAML 配置文档读取

### Requirement: YAML 配置加载与校验
系统 SHALL 在启动时加载并校验 YAML 配置文档，配置非法时不得静默运行。

#### Scenario: 配置文件语法或结构不合法
- **WHEN** 配置文件无法解析或缺少必填结构
- **THEN** 服务必须拒绝启动，或至少拒绝相关依赖阶段的执行
- **THEN** 日志中必须给出明确的配置错误说明

#### Scenario: 配置加载成功
- **WHEN** YAML 配置文档校验通过
- **THEN** 系统必须生成一份脱敏后的配置摘要日志

### Requirement: Jira Project 到 Repo 配置文档映射
系统 SHALL 使用 YAML 配置文档维护 Jira Project 到 GitHub Repo 的映射关系。

#### Scenario: 存在项目级仓库映射
- **WHEN** 流程处理某个 Jira Project 的 Ticket
- **THEN** 系统必须能够从配置文档中读到 `repoName`、`repoUrl` 和 `baseBranch`

#### Scenario: 项目级映射缺失
- **WHEN** 当前 Jira Project 在配置文档中没有对应的仓库映射
- **THEN** 流程必须在 `repo_resolving` 阶段阻塞
- **THEN** 系统必须返回可操作的配置缺失提示

### Requirement: 审批与回写治理开关
系统 SHALL 支持通过配置文档控制分析审批、验证审批和 Jira Comment 回写等治理行为。

#### Scenario: 配置要求分析审批
- **WHEN** `workflow.requireAnalysisApproval=true`
- **THEN** 分析页创建完成后必须进入分析审批等待态

#### Scenario: 配置关闭 Jira Comment 回写
- **WHEN** `workflow.jiraCommentWritebackEnabled=false`
- **THEN** 系统不得把 Jira Comment 回写作为关闭门禁必要条件
