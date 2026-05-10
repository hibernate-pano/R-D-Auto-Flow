# MVP 技术方案：Jira - Confluence - GitHub 研发闭环工作流

## Authority

- Authority level: Architecture/design expansion, subordinate to `docs/canonical-workflow-spec.md`
- Primary upstream sources:
  - `docs/canonical-workflow-spec.md`
  - `docs/rpd-jira-confluence-github-workflow.md`
- Usage rule: This document expands implementation-oriented design choices without redefining canonical workflow rules.
- Conflict rule: Canonical workflow and MVP boundary decisions must follow `docs/canonical-workflow-spec.md`.

## 1. 文档定位

- 文档类型：MVP 技术方案
- 对应 PRD：[rpd-jira-confluence-github-workflow.md](/Users/panbo/Code/Work-HSBC/R&D-Auto-Flow/docs/rpd-jira-confluence-github-workflow.md)
- 规范基线：[canonical-workflow-spec.md](/Users/panbo/Code/Work-HSBC/R&D-Auto-Flow/docs/canonical-workflow-spec.md)
- 目标：将 PRD 收敛为可开发、可拆分、可验证的工程实现方案
- 范围：仅覆盖 MVP

MVP 的首要目标不是“自动接单”，而是“手动指定 Jira Ticket 后，系统可以稳定跑完整个闭环，并且前端可见、可查、可人工干预”。

---

## 2. MVP 范围定义

### 2.1 必做范围

1. 前端工作台
2. 手动输入 Jira Key 启动 Flow
3. Jira 内容拉取与标准化
4. Jira 中 Confluence 链接提取
5. Confluence 源页面读取
6. 调用现有 `127.0.0.1:14434` LLM Bridge 生成分析文档
7. 在 Confluence 创建分析页
8. 根据规则解析目标 GitHub Repo
9. 从目标仓库解析出的基线分支创建以 `<jira-key>` 命名的分支
10. 记录执行阶段、日志、错误和人工动作
11. 支持暂停、继续、重试、终止等基本人工干预
12. 回写 Confluence 结果
13. 更新 Jira 状态为完成

### 2.3 MVP 边界澄清

MVP 是一个编排与治理系统，不是一个在目标仓库内全自动编码和跑测的执行引擎。

这意味着：

1. 系统负责生成分析页、准备分支、推进状态机、记录日志、记录证据、执行审批门禁
2. 实际代码修改和大部分测试执行可以发生在工作流系统外部
3. `implementation_waiting` 和 `verification_waiting` 是一等阶段，但主要职责是承载人工或外部 Agent 完成后的证据回填与推进

### 2.2 明确不在 MVP 中

1. Jira 自动指派触发
2. PR 自动创建
3. 自动 Code Review
4. 自动部署
5. 单 Ticket 多 Repo 编排
6. 复杂审批流
7. 细粒度 RBAC

---

## 3. 总体架构

## 3.1 架构原则

1. 以状态机为中心，而不是以脚本顺序调用为中心
2. 前端工作台是一等能力，不是附加页面
3. 外部系统访问必须通过独立 Connector
4. LLM 调用必须隔离在独立 Adapter 中
5. 人工干预必须可持久化、可审计、可恢复

## 3.2 组件划分

建议拆分为以下逻辑模块：

1. `web-app`
   - 前端工作台
   - 启动 Flow
   - 查看阶段与日志
   - 执行人工干预

2. `api-server`
   - 对前端暴露 API
   - 管理 FlowRun、WorkItem、FlowLog
   - 接收启动请求和人工动作

3. `workflow-engine`
   - 核心状态机
   - 步骤调度
   - 重试控制
   - 阻塞判定

4. `connectors/jira`
   - Jira 查询、详情读取、状态更新

5. `connectors/confluence`
   - 页面读取、页面创建、页面更新

6. `connectors/github`
   - Repo 解析、准备基线分支、创建或复用工作分支

7. `connectors/llm`
   - 调用 `127.0.0.1:14434`
   - 结构化提示词
   - 响应解析与校验

8. `evidence-service`
   - 证据录入
   - 证据校验
   - 关闭门禁判断

9. `storage`
   - 持久化 Flow 运行状态、日志、证据

10. `governance`
   - 审批点判断
   - 关闭门禁判断
   - 人工动作矩阵

## 3.3 推荐部署方式

MVP 建议使用单体服务优先，而不是微服务拆分。

推荐结构：

- 一个前端应用
- 一个后端应用
- 一个数据库
- 后端内部包含 workflow engine 与 connectors

理由：

1. 当前业务边界还在快速收敛
2. 外部依赖已足够复杂
3. MVP 目标是闭环可用，不是服务拆分优雅

## 3.4 推荐技术栈

为了与当前文档已经确定的约束保持一致，MVP 建议采用 TypeScript 单仓实现：

- `apps/web`：前端工作台
- `apps/api`：后端 API 与工作流执行器
- `packages/*`：共享领域模型、接口契约、配置契约与 Connector 抽象
- `config/`：版本化 YAML 配置文档

推荐技术栈如下：

1. 前端
   - `React + TypeScript + Vite`
   - `TanStack Router`
   - `TanStack Query`
   - `React Hook Form + Zod`
   - `Ant Design`

2. 后端
   - `Node.js 20 + TypeScript + Fastify`
   - `Zod` 作为接口、配置、证据与外部响应校验层
   - `Kysely` 作为 SQL 查询构建层
   - 手写 SQL migration，配合 `dbmate` 或 `node-pg-migrate`

3. 数据与运行时
   - `PostgreSQL 16`
   - 后端内置持久化 `runner`，基于数据库表实现 lease、heartbeat、重试与恢复
   - 敏感配置走环境变量，业务规则走 YAML 配置文档

4. 测试与可观测性
   - `Vitest`
   - `Testcontainers`
   - `Playwright`
   - `Pino`
   - `OpenTelemetry`

采用这套技术栈的主要原因：

1. 当前系统是内部工作台，不存在 SSR 或 SEO 驱动，`React + Vite` 足以支撑列表、详情、日志、抽屉和弹窗式交互
2. 当前复杂度核心在状态机、审批门禁、恢复与审计，而不是 Web 框架能力，因此优先选择更轻的单体后端组合
3. 当前数据模型明显偏关系型，并且需要精确控制租约、索引、追加式历史与 `jsonb` 字段，不宜过早引入较重的抽象层
4. canonical 已明确 MVP 不要求单独队列平台，因此优先将执行器收敛在后端进程内，而不是引入 Redis、Kafka 或独立编排引擎

---

## 4. 前端工作台设计

## 4.1 页面结构

MVP 至少包含以下页面：

1. Flow 列表页
2. Flow 详情页
3. 手动启动弹窗
4. 人工干预弹窗

## 4.2 Flow 列表页

### 页面目标

让用户快速看到当前有哪些 Flow，它们运行到哪里，哪里失败了，哪里需要人工处理。

### 关键区域

1. 顶部操作区
   - 手动启动按钮
   - 搜索框
   - 状态筛选
   - 阶段筛选

2. 列表区
   - Jira Key
   - Ticket 标题
   - 当前阶段
   - 当前状态
   - 最近更新时间
   - 是否需要人工处理
   - 关联链接入口

3. 快速操作列
   - 查看详情
   - 重试
   - 暂停
   - 继续
   - 终止

## 4.3 手动启动弹窗

### 必备字段

1. Jira Key 输入框
2. 可选 Repo 覆盖字段
3. 可选备注
4. 启动模式
   - 首次执行
   - 重跑
   - 从失败节点恢复

### 校验逻辑

1. Jira Key 非空
2. Jira Key 格式合法
3. 对应 Ticket 存在
4. 当前用户可访问
5. 若已有运行中的 Flow，必须显式确认冲突处理

## 4.4 Flow 详情页

### 页面目标

让用户完整理解一个 Flow 的执行轨迹、输入上下文、输出工件、失败原因和可执行动作。

### 建议布局

1. 顶部摘要卡
   - Jira Key
   - Ticket 标题
   - 当前状态
   - 当前阶段
   - 启动方式
   - 开始时间 / 更新时间 / 耗时

2. 阶段时间线
   - 每个阶段的状态
   - 开始结束时间
   - 是否重试过
   - 是否由人工推进

3. 关联对象区
   - Jira 链接
   - Confluence 源页面链接
   - Confluence 分析页链接
   - GitHub Repo / Branch 链接

4. 日志区
   - 支持按阶段筛选
   - 支持只看错误
   - 支持查看某一步的详细上下文

5. 人工操作区
   - 暂停
   - 继续
   - 重试当前阶段
   - 跳过阶段
   - 终止

## 4.5 前端交互原则

1. 用户应在 10 秒内知道 Flow 卡在哪
2. 所有危险操作必须二次确认
3. 所有人工操作必须留下操作人和时间
4. 日志默认展示摘要，详情按需展开

---

## 5. 后端模块设计

## 5.1 API Server 责任

1. 提供前端 API
2. 保存与读取 Flow 数据
3. 触发 workflow engine
4. 接收人工干预命令
5. 执行权限校验

## 5.2 Workflow Engine 责任

1. 驱动状态流转
2. 管理每个阶段执行器
3. 记录阶段状态
4. 记录运行日志
5. 管理重试策略
6. 识别阻塞态
7. 支持恢复执行

## 5.3 Connector 责任边界

### Jira Connector

1. 按 Jira Key 获取 Ticket 详情
2. 获取 Comment
3. 更新状态
4. 可选回写 Comment

### Confluence Connector

1. 读取源页面
2. 创建分析页
3. 更新分析页

### GitHub Connector

1. 解析 Repo
2. 解析基线分支与基线提交
3. 创建或复用 `<jira-key>` 分支

### LLM Connector

1. 组装提示词
2. 调用 Bridge
3. 校验结构化输出
4. 返回分析页内容草案

---

## 6. 状态机设计

本节只补充技术设计视角的实现说明。

规范状态名、阶段名、审批检查点和主状态路径以 `docs/canonical-workflow-spec.md` 为准，不在此重复定义第二份真相源。

## 6.1 Flow 总状态与阻塞字段

实现上必须统一暴露以下阻塞字段：

1. `blocking_reason_code`
2. `blocking_reason_message`

## 6.2 阶段定义

阶段集合与顺序请直接复用 canonical。这里仅强调几个实现含义：

- `analysis_approval_waiting` 与 `verification_approval_waiting` 是 MVP 固定审批点
- `implementation_waiting` 和 `verification_waiting` 是人工或外部 Agent 执行节点
- 即使编码和测试本身不由系统全自动完成，系统也必须管理它们在闭环中的位置、证据和门禁

## 6.3 状态流转规则

主路径以 canonical 为准。技术实现上需要补充以下异常流转语义：

1. 任一自动步骤失败：
   - 若可重试，进入 `running` 且标记重试
   - 若需人工介入，进入 `waiting_manual_action`

2. 审批未通过：
   - 进入 `waiting_manual_action`
   - 停留在对应审批阶段

3. 用户点击暂停：
   - 进入 `paused`

4. 用户点击终止：
   - 进入 `cancelled`

5. 用户从失败节点恢复：
   - 回到对应阶段重新执行

---

## 7. 关键数据结构

## 7.1 WorkItem

建议字段：

- `id`
- `jira_key`
- `jira_url`
- `jira_title`
- `jira_description`
- `jira_status`
- `jira_project_key`
- `assignee`
- `source_confluence_urls`
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

## 7.2 FlowRun

建议字段：

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
- `started_at`
- `updated_at`
- `completed_at`

`trigger_mode` 建议值：

- `manual_start`
- `rerun`
- `resume_from_failure`

## 7.3 FlowStageRun

用于记录每个阶段的执行历史。

建议字段：

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

## 7.4 FlowLog

建议字段：

- `id`
- `flow_run_id`
- `stage_name`
- `level`
- `event_type`
- `message`
- `details_json`
- `related_object_type`
- `related_object_id`
- `created_at`
- `redacted`

## 7.5 ManualAction

建议字段：

- `id`
- `flow_run_id`
- `action_type`
- `payload_json`
- `operator_id`
- `operator_email`
- `operator_display_name`
- `created_at`
- `result`

---

## 8. 外部系统接口设计

## 8.1 Jira API

MVP 需要的能力：

1. 根据 Jira Key 查询 Ticket
2. 获取 Ticket 的描述、评论、状态
3. 搜索 Ticket
4. 更新 Ticket 状态

建议封装内部方法：

- `get_ticket_by_key(jira_key)`
- `get_ticket_comments(jira_key)`
- `search_tickets(query)`
- `transition_ticket(jira_key, target_status)`

## 8.2 Confluence API

MVP 需要的能力：

1. 通过 URL 解析并读取页面
2. 创建分析页
3. 更新分析页

建议封装内部方法：

- `get_page_by_url(url)`
- `create_analysis_page(payload)`
- `update_analysis_page(page_id, payload)`

## 8.3 GitHub API / Git 操作

MVP 需要的能力：

1. 根据映射规则确定 Repo
2. 解析 repo 默认分支或配置覆盖的基线分支
3. 记录基线 commit sha
4. 创建或复用 `<jira-key>` 分支

建议封装内部方法：

- `resolve_repo(jira_project_key, jira_ticket)`
- `prepare_base_branch(repo)`
- `create_or_reuse_branch(repo, branch_name)`

## 8.4 LLM Bridge API

Bridge 地址：

- `http://127.0.0.1:14434`

MVP 需要的能力：

1. 接受结构化上下文
2. 生成结构化分析文档
3. 在失败时返回可追踪错误

建议封装内部方法：

- `generate_analysis_document(task_context)`
- `generate_result_summary(task_context)`

---

## 9. 后端 API 设计

## 9.1 Flow 列表

`GET /api/flows`

参数建议：

- `status`
- `stage`
- `jira_key`
- `page`
- `page_size`

返回内容：

- Flow 基本列表
- 当前状态
- 当前阶段
- 更新时间
- 是否需人工处理

## 9.2 Flow 详情

`GET /api/flows/{flowRunId}`

返回内容：

- WorkItem 信息
- FlowRun 信息
- 阶段历史
- 日志摘要
- 关联对象链接
- 可执行操作

## 9.3 手动启动

`POST /api/flows`

请求体建议：

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

响应内容：

- `flowRunId`
- `workItemId`
- 初始状态

## 9.4 人工操作

`POST /api/flows/{flowRunId}/actions`

请求体建议：

```json
{
  "actionType": "retry_stage",
  "payload": {
    "stage": "analysis_generating"
  }
}
```

支持动作建议：

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

## 9.5 日志查询

`GET /api/flows/{flowRunId}/logs`

参数建议：

- `stage`
- `level`
- `cursor`
- `only_error`

## 9.6 Jira 搜索

`GET /api/jira/issues/search?query=RD-12`

---

## 10. 提示词设计

## 10.1 分析文档生成提示词

输入应包括：

1. Jira Ticket 基本信息
2. Jira 原始描述
3. Jira 评论摘要
4. Confluence 源页面摘要
5. 目标输出模板

输出必须约束为固定章节，并与 RPD 保持一致：

1. Ticket 基本信息
2. Jira 原始需求摘要
3. 源文档摘要
4. 问题定义
5. 范围与非范围
6. 假设与约束
7. 功能分析
8. 技术方案
9. 架构影响分析
10. 数据模型 / 接口影响
11. 依赖分析
12. 风险分析
13. 分步实施计划
14. 单元测试计划
15. 集成 / 回归测试计划
16. 验收清单
17. 回滚 / 降级说明

## 10.2 提示词设计原则

1. 强约束输出结构
2. 禁止泛泛而谈
3. 要求与 Jira 内容逐项对应
4. 要求输出可以直接落入 Confluence
5. 避免让 LLM 直接产出未经约束的自由文本

---

## 11. 错误处理与恢复

## 11.1 错误分类

1. 用户输入错误
   - Jira Key 非法
   - Ticket 不存在

2. 权限错误
   - Jira 无访问权限
   - Confluence 无写权限
   - GitHub 无分支创建权限

3. 系统依赖错误
   - LLM Bridge 不可用
   - 外部 API 超时

4. 业务错误
   - Repo 无法解析
   - Confluence 页面不可访问
   - 分支已存在且策略不明确

## 11.2 恢复策略

1. 可自动重试的，最多重试固定次数
2. 重试后仍失败的，进入 `waiting_manual_action`
3. 用户修正上下文后支持恢复执行
4. 所有恢复动作必须保留痕迹
5. 阶段执行必须有租约、过期时间和心跳
6. 进程重启后只能从持久化状态恢复，不能依赖内存态

---

## 12. 安全设计

1. GitHub / Jira / Confluence / LLM 配置通过环境变量注入
2. 日志默认脱敏
3. 前端不直接接触第三方 Token
4. 后端统一代理所有第三方访问
5. 人工操作必须记录操作人

---

## 13. MVP 开发拆解

## 13.1 第一批：最小闭环骨架

1. 数据库表结构
2. Flow 状态机骨架
3. 手动启动 API
4. `POST /api/flows/precheck`
5. Flow 列表页基础版
6. Flow 详情页基础版

交付标准：

- 能手动提交 Jira Key
- 能生成 FlowRun
- 能在前端看到 Flow

## 13.2 第二批：外部系统接入

1. Jira Connector
2. Confluence Connector
3. GitHub Connector
4. Repo 映射规则（默认来自 YAML 配置文档）

交付标准：

- 能真实拉取 Jira 内容
- 能真实读取 Confluence 页面
- 能真实创建 GitHub 分支

## 13.3 第三批：LLM 与分析页生成

1. LLM Bridge Client
2. 提示词模板
3. 分析页生成与 Confluence 创建

交付标准：

- 能生成结构稳定的分析页
- 能在 Confluence 落页

## 13.4 第四批：日志、人工干预、恢复

1. FlowLog
2. 人工操作 API
3. 暂停 / 恢复 / 重试 / 终止
4. 阻塞态展示
5. stage lease / heartbeat 恢复

交付标准：

- 能看到错误位置
- 能执行人工接管

## 13.5 第五批：Evidence + 审批 + 闭环回写

1. Evidence API 与页面
2. 审批点
3. Confluence 结果回写
4. Jira 状态更新
5. 完成态门禁

交付标准：

- 能完成真正闭环

---

## 14. 测试策略

## 14.1 单元测试

至少覆盖：

1. Jira Key 校验
2. 状态机流转
3. 阶段重试逻辑
4. Repo 映射逻辑
5. 提示词结构拼装

## 14.2 集成测试

至少覆盖：

1. 手动启动 -> Flow 创建
2. Jira 拉取 -> Confluence 解析 -> 分析页创建
3. Repo 解析 -> 分支创建
4. 人工重试 -> Flow 恢复

## 14.3 前端验证

至少验证：

1. 列表页展示
2. 详情页时间线展示
3. 日志过滤
4. 手动启动弹窗校验
5. 人工干预操作链路

---

## 15. 上线建议

MVP 建议按以下顺序上线：

1. 先在单用户、单 Repo、单 Space 条件下跑通
2. 再开放给小范围内部试用
3. 收集真实 Ticket 的失败样本
4. 修正提示词、状态机和人工干预点
5. 再考虑自动触发

---

## 16. 总结

这个 MVP 的关键不是自动化程度，而是闭环可信度。

只要以下四件事同时成立，这个 MVP 就是成功的：

1. 用户可以手动指定一个 Jira Ticket 启动
2. 系统可以生成可用的 Confluence 分析页并创建 GitHub 分支
3. 前端可以清晰展示 Flow 的阶段、日志和阻塞原因
4. 用户可以在必要时人工接管，并最终完成闭环

在此基础上，再引入自动触发，才是合理的第二阶段。
