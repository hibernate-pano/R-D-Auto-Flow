Canonical Sources:
- `docs/canonical-workflow-spec.md` sections 4, 6
- Owns canonical concerns: Jira normalization, Confluence source ingestion, structured analysis generation, analysis page persistence

## ADDED Requirements

### Requirement: Jira 上下文获取与标准化
系统 SHALL 在流程开始阶段获取 Jira Ticket 的结构化上下文，并将其写入稳定的 WorkItem 字段。

#### Scenario: 拉取 Jira Ticket 成功
- **WHEN** 流程进入 `jira_ticket_fetching` 和 `jira_ticket_normalized`
- **THEN** 系统必须获取 Jira Key、标题、描述、状态、项目、处理人和可用评论或补充信息
- **THEN** 标准化结果必须写入 `work_items`

#### Scenario: Jira Ticket 不存在或无权限
- **WHEN** Jira 返回未找到或权限不足
- **THEN** 系统必须终止当前阶段
- **THEN** 返回稳定错误码，例如 `TICKET_NOT_FOUND` 或 `JIRA_ACCESS_DENIED`

### Requirement: Confluence 链接抽取与源页读取
系统 SHALL 从 Jira 内容中抽取 Confluence 链接，并将可读取的页面内容纳入分析上下文。

#### Scenario: Jira 中存在可访问的 Confluence 链接
- **WHEN** 流程进入 `confluence_links_extracting` 和 `source_pages_fetching`
- **THEN** 系统必须抽取链接列表并尝试读取页面
- **THEN** 读取结果必须以结构化摘要形式保存

#### Scenario: Confluence 链接缺失或不可访问
- **WHEN** Ticket 中没有 Confluence 链接，或部分页面不可访问
- **THEN** 系统必须记录风险
- **THEN** 若 Jira 信息仍足以支撑分析，流程可以继续
- **THEN** 若 Jira 与源页信息都不足，则流程必须阻塞等待人工补充

### Requirement: LLM Bridge 分析生成
系统 SHALL 通过现有本地 LLM Bridge 生成结构化分析内容，并在落页前校验输出质量。

#### Scenario: 生成结构化分析文档
- **WHEN** 流程进入 `analysis_generating`
- **THEN** 系统必须向 `http://127.0.0.1:14434` 发起 OpenAI 兼容请求
- **THEN** 输入必须包含 Jira 上下文、Confluence 摘要和固定章节要求
- **THEN** 输出必须经过结构校验后才能继续

#### Scenario: Bridge 不可用或输出结构不合法
- **WHEN** Bridge 超时、不可访问或返回的文档结构不符合要求
- **THEN** 系统必须返回稳定错误码
- **THEN** 不得将不合格内容直接写入 Confluence

### Requirement: 分析页创建与链接回填
系统 SHALL 将通过校验的分析内容写入 Confluence 分析页，并在 WorkItem 中持久化分析页信息。

#### Scenario: 首次创建分析页
- **WHEN** 流程进入 `analysis_page_creating`
- **THEN** 系统必须在目标 Confluence Space 与父页面下创建分析页
- **THEN** 必须记录 `analysis_page_url` 和 `analysis_page_id`

#### Scenario: 重复执行沿用单分析页
- **WHEN** 同一 Ticket 发生重跑或恢复
- **THEN** 系统必须在原分析页上追加执行记录与结果章节
- **THEN** 不得生成隐藏副本或不透明的新页面
