# RPD：Jira - Confluence - GitHub 研发闭环工作流

## Authority

- Authority level: Product context and rationale, subordinate to `docs/canonical-workflow-spec.md`
- Primary upstream source: `docs/canonical-workflow-spec.md`
- Usage rule: This document explains product motivation, goals, and derived elaboration. It must not override the canonical workflow/MVP rules.
- Conflict rule: If this document conflicts with canonical workflow behavior, state semantics, approval semantics, or MVP scope, `docs/canonical-workflow-spec.md` wins.

## 1. 文档定位

- 文档类型：RPD / 产品需求与方案说明
- 项目名称：R&D Auto Flow
- 规范基线：[canonical-workflow-spec.md](/Users/panbo/Code/Work-HSBC/R&D-Auto-Flow/docs/canonical-workflow-spec.md)
- 项目目标：构建一个从 Jira 新指派 Ticket 开始，到分析、设计、开发、测试、文档回写、Jira 完成状态更新为止的端到端闭环工作流
- 核心原则：文档先行，开发跟随，验证后关闭
- 已确认实施基础：
  - 已有可复用的 LLM Bridge，地址为 `http://127.0.0.1:14434`
  - Bridge 暴露 OpenAI 兼容协议
  - 底层模型能力来自 VS Code GitHub Copilot 插件
  - 已具备 GitHub、Confluence、Jira 的访问 Token

---

## 2. 背景与问题定义

当前研发流程中的需求接收、方案分析、文档整理、代码开发、测试验证、状态回写分散在 Jira、Confluence、GitHub 三个系统中，整体存在以下问题：

1. Jira Ticket 被指派后，需求上下文常常不完整。
2. Ticket 中即使带有 Confluence 链接，也未必会被系统化纳入分析过程。
3. 分析、设计、架构思考经常停留在聊天记录或个人脑中，难以沉淀为可执行文档。
4. Git 分支通常手工创建，命名不统一，与 Ticket 的追踪关系不稳定。
5. 测试深度依赖个人习惯，需求覆盖与测试覆盖之间缺乏明确映射。
6. Jira 状态可能在文档补全和验证完成前就被更新为完成。
7. 最终交付结果、测试证据、文档更新之间缺少强约束，无法形成稳定审计闭环。

结果是：

- 需求理解容易漂移
- 设计质量不稳定
- 开发动作与文档脱节
- 测试证明不足
- 交付闭环依赖人为自觉，缺少系统约束

因此，本项目的目标不是做一个“自动拉 Ticket”的小工具，而是做一个具备执行约束能力的研发闭环编排系统。

---

## 3. 产品愿景

构建一个可执行的研发工作流系统，使其能够：

1. 支持用户手动指定 Jira Ticket 启动执行。
2. 获取并整理 Ticket 的完整上下文。
3. 从 Ticket 中提取 Confluence 文档链接，并按需拉取补充信息。
4. 基于 Jira 内容与 Confluence 内容生成一份详尽、可执行、可追踪的分析设计文档。
5. 按 Jira 编号在指定 GitHub 仓库中从解析出的基线分支创建开发分支。
6. 严格依据文档中的实施步骤推进开发。
7. 强制补充足量 UT，并完成对应测试。
8. 在开发和测试完成后，回写 Confluence 与 Jira，形成真正的交付闭环。
9. 在后续阶段支持 Jira 新指派事件自动触发。

该系统应当表现得像一位严格、可靠、文档意识强的资深工程师兼架构师，而不是一个只会拼接接口的浅层自动化脚本。

---

## 4. 产品目标

### 4.1 一级目标

1. 标准化 Jira 需求接收流程。
2. 将 Ticket 上下文转化为可直接指导实施的 Confluence 分析文档。
3. 确保每项开发任务都有与 Jira Key 强绑定的 GitHub 分支。
4. 建立需求、设计、实现、测试之间的一致性约束。
5. 输出完整、可审计、可复盘的交付闭环。
6. 提供可视化工作台，使执行阶段、运行日志、阻塞原因和人工干预动作可被直观看到和操作。
7. 将手动指定 Jira Ticket 启动 Flow 作为 MVP 必备入口。

### 4.2 二级目标

1. 降低每个 Ticket 的前置准备成本。
2. 提高编码前的方案完整度。
3. 提高 UT 覆盖和需求到测试点的映射质量。
4. 让交付文档可复用、可维护、可用于后续评审和追责。
5. 降低黑盒自动化风险，让操作者能够在关键节点接管、修正和恢复流程。
6. 在 MVP 稳定后，再逐步引入自动触发与更强的事件驱动能力。

### 4.3 非目标

1. 不替代 Jira、Confluence、GitHub 作为权威源系统。
2. 不在 v1 中试图替代人类完成所有开发决策。
3. 不在 v1 中扩展到 Jira / Confluence / GitHub 以外的通用 ALM 系统。
4. 不处理企业级项目组合管理、资源排期、跨团队治理等更上层问题。

---

## 5. 目标用户

### 5.1 主要用户

- 接收 Jira Ticket 并负责落地开发的工程师

### 5.2 次要用户

- 审核方案质量与实施可行性的 Tech Lead
- 关注需求完整性与交付一致性的产品经理
- 需要核对实现与测试是否匹配需求的 QA 或 Reviewer
- 需要监控流程运行、排查异常、执行人工干预的流程管理员或值班工程师

---

## 6. 核心产品原则

1. 文档是生产资产，不是开发附属品。
2. Confluence 分析页必须足够详细，能够直接指导实施。
3. GitHub 开发必须遵循文档方案，而不是绕过文档直接编码。
4. 测试证据必须同时对应 Jira 需求和 Confluence 设计。
5. 任何闭环工件缺失时，Jira 不允许更新为完成。
6. 每个 Ticket 最终都必须形成如下链路：

`Jira 需求 -> 可选源文档 -> 分析页 -> 开发分支 -> 代码实现 -> 测试证据 -> 结果回写 -> Ticket 完成`

---

## 7. 端到端范围

本工作流从“用户手动指定一个 Jira Ticket 发起执行”开始，到以下条件全部满足时结束：

1. Jira Ticket 内容已获取并结构化。
2. Ticket 中引用的 Confluence 文档已识别并读取，若不存在则明确标记为空。
3. 已在 Confluence 创建新的任务分析页。
4. 已在指定 GitHub 仓库从解析出的基线分支创建开发分支，且分支名直接等于 Jira Key。
5. 已按分析页中的步骤完成开发。
6. 已补充足量 UT，并完成必要测试。
7. 已在 Confluence 分析页中回写实现结果和测试结果。
8. 已将 Jira Ticket 状态更新为完成。

---

## 7.1 已确认的 v1 前提

以下事实已作为 v1 的既定前提：

1. LLM 能力不是阻塞项，已有可直接接入的 Bridge，端口为 `14434`。
2. 该 Bridge 底层能力来自 VS Code GitHub Copilot。
3. GitHub、Jira、Confluence 所需 Token 已经具备。
4. 运行环境能够访问：
   - Jira API
   - Confluence API
   - GitHub API
   - `127.0.0.1:14434` 上的 LLM Bridge

这些前提意味着 v1 不需要先解决模型接入和权限申请问题，可以直接聚焦在流程编排、文档生成质量、状态控制和闭环约束上。

---

## 8. 功能需求

## 8.0 前端工作台与人工干预

### FR-0：流程可视化工作台

系统必须提供一个前端工作台，用于直观展示每个 Ticket 对应 Flow 的执行情况。

工作台至少应展示：

1. 当前运行中的任务列表
2. 每个任务当前所处阶段
3. 每个阶段的开始时间、结束时间、耗时
4. 成功、失败、阻塞、等待人工处理等状态
5. 关联的 Jira Key、Confluence 分析页、GitHub 分支

建议展示形式：

- 列表页：用于浏览所有 Flow
- 详情页：用于查看单个 Flow 的完整阶段轨迹与日志
- 阶段时间线：用于直观看到执行进度和失败位置

工作台还必须提供手动启动入口，允许用户直接输入或选择 Jira Ticket 并发起执行。

### FR-0A：阶段进度可见性

前端必须能够清晰展示 Flow 所处阶段，而不是只展示一个笼统的“运行中”状态。

建议展示的关键阶段包括：

1. 已接收手动启动请求
2. 已获取 Jira 内容
3. 已解析源文档
4. 已生成 Confluence 分析页
5. 已完成 Repo 解析
6. 已创建分支
7. 开发中
8. 测试中
9. Confluence 回写中
10. Jira 更新中
11. 已完成
12. 已阻塞

### FR-0B：日志查看能力

前端必须支持查看 Flow 执行日志，且日志应当分层展示，避免只有原始输出堆叠。

日志至少应分为：

1. 系统级事件日志
2. 外部系统调用日志
3. LLM 调用日志
4. 人工干预日志
5. 错误日志

每条日志至少应包含：

- 时间
- 阶段
- 动作名称
- 结果
- 错误摘要
- 关联对象

日志展示要求：

1. 支持按 Jira Key / Flow ID 搜索
2. 支持按阶段过滤
3. 支持按错误状态过滤
4. 支持查看单次失败上下文
5. 对敏感字段进行脱敏

### FR-0C：人工干预能力

系统必须支持在关键节点进行人工干预，而不是要求流程全自动且不可控。

人工干预至少应支持以下动作：

1. 暂停 Flow
2. 继续 Flow
3. 终止 Flow
4. 从失败节点重试
5. 跳过某个可跳过步骤
6. 手工指定目标 Repo
7. 手工补充或修正 Confluence 源链接
8. 手工确认分析页后再进入开发阶段
9. 手工确认验证结果后再关闭 Jira
10. 手工指定某个 Jira Ticket 立即启动 Flow

### FR-0F：手动启动 Flow

系统必须支持用户手动指定 Jira Ticket 启动执行，而不是仅依赖“新指派 Ticket 自动触发”。

手动启动方式至少包括：

1. 在前端工作台输入 Jira Key 启动
2. 在前端工作台从可检索列表中选择 Jira Ticket 启动
3. 对已执行过的 Jira Ticket 重新发起一次 Flow

手动启动时，系统至少需要校验：

1. Jira Ticket 是否存在
2. 当前用户是否有权访问该 Ticket
3. 该 Ticket 是否已经存在运行中的 Flow
4. 若已存在历史 Flow，当前是新建执行还是重新执行

对于重复执行，系统应明确区分：

- 首次执行
- 重跑执行
- 从失败节点恢复执行

### FR-0D：人工审批点

MVP 应支持固定审批点，以适配当前治理要求。

v1 固定支持以下审批点：

1. 分析页生成后，进入开发前
2. 测试完成后，关闭 Jira 前

审批动作至少包括：

- 通过
- 要求补充信息

更复杂的可配置审批编排不属于 MVP。

### FR-0E：异常与阻塞态处理

前端必须对异常和阻塞态提供明确可操作反馈，而不是只展示失败结果。

当 Flow 进入阻塞态时，前端至少应显示：

1. 当前阻塞原因
2. 失败步骤
3. 最近一次错误信息
4. 建议处理动作
5. 可执行的人工干预入口

---

## 8.1 触发与接单

### FR-1：手动指定 Jira Ticket 启动

系统必须支持用户手动指定某个 Jira Ticket，并立即发起 Flow 执行。

该能力是 MVP 必备能力，不可后置。

支持方式至少包括：

1. 在前端工作台输入 Jira Key 启动
2. 在前端工作台从可检索列表中选择一个 Jira Ticket 启动
3. 对历史执行过的 Ticket 进行重跑
4. 对失败 Ticket 从中断点恢复

系统至少需要校验：

1. Jira Ticket 是否存在
2. 当前用户是否有权访问该 Ticket
3. 是否已有正在运行的 Flow
4. 当前操作是首次执行、重跑执行，还是失败恢复

### FR-1A：自动触发能力

> Note: This section is informational for post-MVP direction. It must not be treated as an MVP implementation requirement.

系统可支持“新 Jira Ticket 被指派给当前用户后自动触发 Flow”，但该能力不属于 MVP 必备项。

该能力应作为后续增强项设计，支持以下模式：

1. 轮询模式：定时从 Jira 查询新分配的问题单
2. Webhook 模式：由 Jira 主动推送指派事件

v1 / MVP 建议：

- 优先交付手动触发
- 自动触发延后到后续阶段

### FR-2：Jira Ticket 内容获取与标准化

系统在用户手动指定 Ticket 后，必须拉取完整问题单内容，并标准化为统一内部任务对象。
需要获取的基础字段包括但不限于：

- Jira 问题单 Key
- 标题
- 描述
- 问题类型
- Priority
- Assignee
- Reporter
- 标签
- 关联问题单
- 附件（如可访问）

标准化阶段至少应抽取：

- 结构化字段信息
- 纯文本描述
- 文本中的 URL
- 显式验收标准
- 提及的系统、模块、仓库、接口

---

## 8.2 Confluence 源文档解析

### FR-3：Confluence 链接发现

系统必须扫描 Jira 描述、评论等文本区域中的 Confluence 链接。

规则如下：

1. 若不存在 Confluence 链接，流程继续执行，但需显式标注“无源文档”。
2. 若存在一个或多个链接，系统必须逐个尝试读取。
3. 若部分页面不可访问，必须在分析页中明确记录失败原因。
4. 若源文档不可访问且 Ticket 本身信息不足，则任务应进入阻塞状态，而不是继续伪闭环。

### FR-4：Confluence 内容抽取

对于每个有效的 Confluence 页面，系统应提取：

- 页面标题
- 页面 URL
- 页面正文
- 标题层级结构
- 关键需求描述
- 约束条件
- 涉及的系统、接口、依赖

系统应在进入分析生成前，形成一份结构化的“源文档摘要”。

---

## 8.3 分析页生成

### FR-5：Confluence 分析页创建

系统必须为当前 Jira Ticket 创建一份新的 Confluence 分析页。

建议标题格式：

`[JIRA-KEY] 任务分析与实施方案 - <Ticket 标题>`

建议挂载位置：

- 可配置的 Confluence Space
- 可配置的父页面

### FR-6：分析页内容要求

分析页必须详实、可执行、逻辑闭环，不能只是摘要性内容。

最低必备章节建议如下：

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

### FR-7：分析页质量标准

生成的文档必须足以直接指导开发，而不是让开发者继续猜测。

这意味着实施计划中必须明确：

- 实施顺序
- 可能涉及的模块、仓库、目录
- 需要调整的数据契约
- 边界条件与异常路径
- 与需求条目对应的测试点
- 每个主要实施块的完成标准

### FR-7A：LLM 调用规范

系统必须使用现有 `14434` 端口上的 OpenAI 兼容 Bridge 作为文档生成和推理后端。

要求如下：

1. 必须支持以下配置项：
   - `base_url`
   - `model`
   - `timeout`
   - `retry_policy`
2. 提示词必须围绕以下输出目标组织：
   - 需求分析
   - 任务拆解
   - 技术设计
   - 架构影响
   - 测试计划
   - 最终实现总结
3. LLM 输出必须经过结构校验后才能落入 Confluence。
4. 原始 LLM 输出不能直接驱动 Jira 完成状态变更，必须经过后续验证门禁。

---

## 8.4 GitHub 分支与开发准备

### FR-8：目标仓库解析

系统必须能够根据当前 Jira Ticket 确定目标 GitHub 仓库。

推荐的解析方式：

1. Jira Project -> Repo 的映射配置
2. Ticket 自定义字段映射
3. 手工规则配置

v1 建议：

- 采用 YAML 配置文档维护 Jira Project 与 GitHub Repo 的映射关系

### FR-9：开发分支创建

系统必须从目标仓库解析出的基线分支创建开发分支。

建议分支命名：

`<jira-key>`

示例：

`RD-1234`

规则如下：

1. 分支必须从解析出的基线分支切出。
2. 分支名必须直接等于 Jira Key。
3. 创建结果必须回写到分析页中。
4. 必须记录基线分支和基线 commit sha。
5. 若分支已存在且与目标基线一致，可复用并记录 `reused`。
6. 若分支已存在但与目标基线不一致，必须阻塞并要求人工处理，不能静默复用。

---

## 8.5 开发执行

### FR-10：严格依据分析页实施

开发过程必须以生成的 Confluence 分析页作为主导工件。

其约束范围包括：

- 开发范围
- 实施顺序
- 架构边界
- 测试要求
- 完成定义

这并不意味着系统必须亲自执行代码修改或测试命令，而是意味着任何实现偏离都必须被识别、说明、提交 evidence，并最终回写。

### FR-11：单元测试要求

系统必须强制要求补充足量 UT，并要求通过结构化 evidence 记录测试执行结果。

v1 质量基线：

- 若有新增或修改逻辑，则默认必须新增或更新 UT
- 若某部分不适合做 UT，必须记录明确理由

UT 至少应覆盖：

- 正常路径
- 边界路径
- 异常路径
- 新增分支逻辑
- 与需求项对应的关键行为

---

## 8.6 测试与验证

### FR-12：测试执行

开发完成后，系统必须确保有足量测试被执行并有结构化证据，测试范围必须同时对应：

1. Jira 原始需求
2. Confluence 分析页
3. 实际代码变更

测试类型包括：

- 单元测试
- 集成测试
- 回归测试
- 自动化不足时的人工验证

### FR-13：测试证据记录

系统必须保留测试证据，至少包括：

- 执行过的命令
- 测试项通过 / 失败结果
- 覆盖说明（如可得）
- 人工验证清单
- 剩余风险与已知缺口

---

## 8.7 回写与闭环

### FR-14：Confluence 结果回写

开发与验证完成后，系统必须在原分析页中补充：

1. 实现结果摘要
2. 实际代码改动说明
3. 与原方案的偏差说明
4. 测试结果
5. 剩余风险
6. 最终交付结论

### FR-15：Jira 状态更新

Jira Issue 只能在全部闭环条件满足后，才允许被移动到完成态。

关闭门禁包括：

- 分析页已创建
- 开发分支已创建
- 实现已完成
- 测试证据已记录
- Confluence 分析页已回写最终结果

### FR-16：完整闭环记录

系统最终必须保留下列关联关系：

- Jira 问题单 Key
- 源 Confluence 页面 URL 列表
- 新建分析页 URL
- GitHub 分支名
- 测试证据摘要
- Jira 最终状态

---

## 9. 用户流程

### 9.1 主成功路径

1. 用户手动指定一个 Jira Ticket。
2. 系统获取 Jira 内容。
3. 系统扫描 Ticket 中的 Confluence 链接。
4. 如存在链接，系统获取源文档内容并生成摘要。
5. 系统在 Confluence 创建任务分析页。
6. 系统解析目标 GitHub Repo。
7. 系统从解析出的基线分支创建一个直接等于 Jira Key 的开发分支。
8. 开发依据分析页执行。
9. 补充 UT 并完成相关测试。
10. 系统在 Confluence 回写实现结果与测试结果。
11. 系统更新 Jira 状态为完成。
12. 工作流关闭。

### 9.2 异常与分支路径

1. 无 Confluence 链接：
   基于 Jira 内容继续执行，但分析页中必须标明“无源文档输入”。

2. Confluence 链接存在但不可访问：
   若 Jira 信息仍足够，继续执行并记录风险；若信息不足，则进入阻塞态。

3. Repo 无法解析：
   停留在 `repo_resolving`，并进入 `waiting_manual_action`。

4. 分支创建失败：
   停留在 `branch_preparing`，并进入 `waiting_manual_action` 或 `failed`。

5. 测试失败：
   返回开发态，不允许闭环。

6. Confluence 回写失败：
   即使代码完成，也不允许将 Jira 更新为完成。

---

## 10. 状态机设计

状态机以 [canonical-workflow-spec.md](/Users/panbo/Code/Work-HSBC/R&D-Auto-Flow/docs/canonical-workflow-spec.md) 为唯一真相源。

本 RPD 不再单独维护一套竞争性的状态枚举。

RPD 只定义产品要求：

1. 状态流转必须显式
2. 状态流转必须可持久化
3. 状态流转必须可恢复
4. 阻塞原因必须通过结构化字段表达，而不是通过发散的新状态名表达

---

## 11. 系统架构

### 11.1 高层组件

1. 触发服务
   - 接收用户手动发起的 Ticket 执行请求
   - 后续可扩展为轮询 Jira 或接收 Jira 事件

2. Jira Connector
   - 获取 Issue 元信息、描述、评论、状态、链接

3. Confluence Connector
   - 读取源页面
   - 创建分析页
   - 更新分析页

4. 上下文处理器
   - 抽取 URL
   - 标准化内容
   - 生成源文档摘要

5. LLM Bridge Client
   - 调用 `14434` 上现有 OpenAI 兼容端点
   - 处理模型选择、超时、重试、响应解析

6. 分析生成器
   - 生成结构化、可执行的任务分析内容

7. 仓库编排器
   - 解析目标 Repo
   - 解析基线分支与基线提交
   - 创建或复用开发分支

8. 交付执行器
   - 编排人工或外部 Agent 完成后的推进、证据回填和回写动作
   - 支持人工、Agent 或混合执行模式

9. 验证引擎
   - 检查测试完成度和关闭门禁

10. 前端工作台
   - 展示 Flow 列表、详情、阶段、日志、阻塞状态
   - 提供人工干预入口与审批操作

11. 审计 / 持久化层
   - 存储状态、证据、错误、链路关系

### 11.2 推荐架构风格

v1 建议采用：

- 一个工作流编排核心
- 三个外部系统 Connector
- 一个独立的 LLM Client Adapter
- 一个前端工作台
- 一个状态持久化层
- 一个 Confluence 模板生成层
- 一个 GitHub 执行层

不建议一开始只写成纯脚本集合。原因是该问题天然具备：

- 多步骤
- 跨系统
- 有状态
- 需要重试
- 需要恢复
- 需要审计

### 11.3 LLM 集成设计

LLM 在该系统中不是“可有可无的增强项”，而是文档生成质量的核心能力。

推荐调用流程：

1. 获取 Jira Ticket 内容
2. 获取可选 Confluence 源文档
3. 组装标准化任务上下文
4. 向 `127.0.0.1:14434` 发起结构化请求
5. 获取分析输出
6. 校验输出章节完整性
7. 持久化到 Confluence

LLM Client 的职责应包括：

- OpenAI 兼容请求封装
- Model 配置管理
- Timeout / Retry 控制
- 输出结构校验
- 调用日志记录
- 敏感信息脱敏

v1 不建议过早做“多模型供应商抽象”。既然现有 Bridge 已经可用，就应优先围绕它构建稳定能力。

---

## 12. 数据模型

### 12.1 核心实体：WorkItem

建议字段：

- `work_item_id`
- `jira_issue_key`
- `jira_issue_url`
- `jira_summary`
- `jira_description`
- `jira_status`
- `jira_project_key`
- `assignee`
- `confluence_source_urls[]`
- `confluence_analysis_page_url`
- `source_digest`
- `repo_name`
- `repo_url`
- `base_branch`
- `base_commit_sha`
- `working_branch`
- `implementation_summary`
- `test_summary`

说明：

- `WorkItem` 保存 Ticket 维度稳定事实
- 执行态字段如当前阶段、阻塞原因、验证结论、完成时间、错误摘要应放在 `FlowRun` 或其关联实体中

### 12.2 证据实体：Evidence

- `evidence_id`
- `flow_run_id`
- `type`
  - `analysis_snapshot`
  - `branch_snapshot`
  - `implementation_note`
  - `test_execution`
  - `manual_verification`
  - `approval_decision`
  - `final_writeback`
- `payload`
- `created_at`
- `source_system`

建议补充：

- `stage_name`
- `operator_id`
- `operator_email`
- `operator_display_name`

MVP 必须将 Evidence 作为正式持久化实体，而不是只保留 `test_summary` 这类摘要字段。

### 12.3 流程运行实体：FlowRun

建议字段：

- `flow_run_id`
- `work_item_id`
- `trigger_mode`
- `current_stage`
- `overall_status`
- `stage_history[]`
- `blocking_reason_code`
- `blocking_reason_message`
- `manual_action_required`
- `manual_action_type`
- `operator_id`
- `operator_email`
- `operator_display_name`
- `started_at`
- `updated_at`
- `completed_at`

其中 `trigger_mode` 建议支持：

- `manual_start`
- `rerun`
- `resume_from_failure`

### 12.4 日志实体：FlowLog

建议字段：

- `log_id`
- `flow_run_id`
- `stage`
- `level`
- `event_type`
- `message`
- `details`
- `related_object`
- `created_at`
- `redacted`

---

## 13. 集成需求

## 13.1 Jira 集成

至少需要具备以下能力：

- 按 Jira Key 查询指定问题单
- 获取问题单详情
- 获取评论
- 更新问题单状态
- 可选：在 Jira 评论中回写分析页链接与分支链接

## 13.2 Confluence 集成

至少需要具备以下能力：

- 按 URL 或 Page ID 读取页面
- 在目标 Space 中创建页面
- 更新页面内容
- 维持页面标题和链接稳定

## 13.3 GitHub 集成

至少需要具备以下能力：

- 定位目标仓库
- 获取解析后的基线分支
- 创建分支
- 可选：推送分支
- 后续可扩展：创建 PR

## 13.4 LLM Bridge 集成

至少需要具备以下能力：

- 通过现有 Bridge 调用 OpenAI 兼容接口
- 配置 Copilot Bridge 对应的模型名
- 支持较长上下文输入，承载 Jira + Confluence 内容
- 通过模板化提示词生成结构稳定的输出
- 支持超时、重试、结构化校验

建议配置项：

- `LLM_BASE_URL=http://127.0.0.1:14434`
- `LLM_API_KEY`（如 Bridge 需要）
- `LLM_MODEL`
- `LLM_TIMEOUT_MS`

设计要求：

- Bridge 适配逻辑必须被隔离，不能散落到 Jira / Confluence / GitHub 编排逻辑中

---

## 14. 安全与权限模型

该系统同时读写 Jira、Confluence、GitHub，安全与权限不是附属问题，而是主设计约束。

要求如下：

1. 使用最小权限原则管理访问能力。
2. 尽量区分读权限和写权限。
3. Token 必须通过环境变量或安全存储注入，禁止写死在配置或代码中。
4. 日志允许记录操作结果，但不得泄露 Token、敏感请求体或企业内部敏感信息。
5. 必须遵守目标仓库和目标 Confluence Space 的权限模型。
6. 所有写操作都应具备可审计记录。
7. Jira、Confluence、GitHub、LLM Bridge 的凭据都只能作为运行时 Secret 使用。
8. 不得将 Token、Secret 写入 Confluence 页面、测试报告或运行日志。

### 14.1 Token 管理要求

由于 GitHub、Jira、Confluence Token 已具备，v1 的重点不在“重新设计认证”，而在于规范使用方式。

要求如下：

1. 所有 Token 通过环境变量或 Secret Manager 注入。
2. 每个 Connector 只读取自己所需的凭据。
3. 启动时必须校验关键配置是否齐全。
4. 权限不足时必须返回明确的可操作错误，而不是笼统失败。

建议配置项：

- `GITHUB_TOKEN`
- `JIRA_BASE_URL`
- `JIRA_TOKEN`
- `CONFLUENCE_BASE_URL`
- `CONFLUENCE_TOKEN`
- `LLM_BASE_URL`
- `LLM_MODEL`

---

## 15. 分析页质量标准

本项目成败的关键不在于“是否生成了一页 Confluence”，而在于这页文档是否真的可用。

一份分析页只有同时满足以下条件，才算成功：

1. 对当前 Ticket 有针对性
2. 真实使用了 Jira 与源文档上下文
3. 能明确指导实现
4. 能直接推导测试点
5. 内部逻辑一致
6. 能支持后续审阅、修改、追责和复盘

建议采用如下内部评分维度：

- 完整性
- 可追踪性
- 架构清晰度
- 实施具体性
- 测试具体性
- 闭环充分性

---

## 15.1 前端工作台质量标准

前端工作台不是装饰性页面，而是流程可控性的核心组成部分。

一套可用的前端工作台至少应满足：

1. 能让用户在 10 秒内判断一个 Flow 当前卡在哪个阶段
2. 能让用户快速定位最近一次失败的上下文
3. 能让用户在需要时执行人工干预
4. 能区分“运行中”、“等待人工处理”、“失败”、“已完成”等状态
5. 能从页面直接跳转到 Jira、Confluence、GitHub 对应对象

---

## 16. 验收标准

### AC-1：需求接收

给定用户手动指定一个 Jira Ticket，
当工作流启动时，
则系统能够获取并标准化完整问题单内容。

### AC-1A：手动指定 Ticket 启动

给定用户在前端工作台输入一个有效的 Jira Key，
当用户发起执行时，
则系统能够创建对应 Flow，并进入正常执行流程。

### AC-1B：重复执行控制

给定某个 Jira Ticket 已存在运行中的 Flow，
当用户再次手动发起执行时，
则系统必须提示冲突或明确要求选择“重跑”或“恢复”，不能无提示重复创建并发 Flow。

### AC-2：源文档处理

给定 Ticket 中存在 Confluence 链接，
当工作流执行时，
则系统能够读取页面并将内容纳入分析上下文。

### AC-3：无链接容错

给定 Ticket 中不存在 Confluence 链接，
当工作流执行时，
则系统仍能基于 Jira 内容创建有效分析页。

### AC-4：分析页完整性

给定一个有效 Ticket，
当分析页生成后，
则其必须包含规定章节，并提供具体实施步骤。

### AC-4A：流程阶段可视化

给定一个正在执行的 Flow，
当用户打开前端工作台时，
则能够清晰看到当前阶段、历史阶段、状态和耗时。

### AC-4B：日志可见性

给定一个 Flow 执行失败，
当用户打开详情页时，
则能够查看对应阶段的错误日志和上下文信息。

### AC-5：分支可追踪性

给定 Repo 映射已配置，
当工作流进入开发准备阶段，
则系统能够从解析出的基线分支创建一个直接等于 Jira Key 的分支。

### AC-6：测试约束

给定代码已完成修改，
当工作流进入验证阶段，
则必须已有 UT 和必要测试执行 evidence 记录。

### AC-7：关闭门禁

给定实现已完成，
当测试证据或 Confluence 回写缺失时，
则 Jira 不允许更新为完成。

### AC-7A：人工干预

给定 Flow 进入阻塞态，
当用户在前端工作台执行人工干预动作时，
则系统能够记录该动作，并根据动作结果继续、重试、暂停或终止流程。

### AC-8：完整闭环

给定所有步骤都成功，
当工作流结束时，
则 Jira 状态、Confluence 页面、分支信息、测试证据之间保持一致。

---

## 17. 非功能需求

1. 可靠性
   - 外部 API 失败后可安全重试
   - 工作流可恢复执行

2. 可追踪性
   - 关键动作必须有时间戳和链路记录

3. 幂等性
   - 重复执行不能无控制地产生重复页面或重复分支

4. 可观测性
   - 能查看当前状态、上一个成功步骤、失败原因、阶段耗时、人工处理记录

5. 可配置性
   - Jira 状态映射、Repo 映射、Confluence Space、轮询频率等均可配置

6. 可扩展性
   - 后续可平滑扩展 PR 创建、Code Review、部署、通知等能力

7. 易操作性
   - 前端工作台必须支持快速定位、快速筛选、快速干预，不能成为新的操作负担

---

## 18. 错误处理与重试策略

### 18.1 可重试错误

- Jira API 短暂失败
- Confluence API 短暂失败
- GitHub API 或网络临时错误
- LLM Bridge 超时或瞬时异常

### 18.2 不可直接重试或需人工介入的问题

- Repo 映射缺失
- Token 权限不足
- Confluence URL 无效
- 分支命名冲突且无自动解决策略
- Jira / Confluence 内容严重不足，无法支撑分析页生成

### 18.3 升级规则

以下情况应进入显式人工介入态：

- 目标仓库无法确定
- 源文档不可访问且 Ticket 信息不足
- 测试持续失败
- Jira / Confluence / GitHub 写权限被拒绝

---

## 19. 建议的 v1 范围

为了保证 v1 可落地，建议范围收敛为：

1. 支持手动指定 Jira Ticket 启动 Flow
2. 解析 Ticket 中的 Confluence 链接
3. 拉取 Confluence 源文档
4. 基于固定模板生成详尽分析页
5. 从解析出的基线分支创建开发分支，不写死 `master`
6. 记录实现与测试结果
7. 只有在关闭门禁通过后才更新 Jira 为完成
8. 统一使用现有 `14434` Copilot Bridge 作为唯一 LLM 后端
9. 提供基础前端工作台，支持阶段展示、日志查看和有限人工干预

明确延后到后续阶段的能力：

1. 自动创建 PR
2. 自动分配 Code Review
3. 自动部署
4. 单 Ticket 多 Repo 协同
5. 跨团队治理型流程扩展
6. 复杂审批流编排
7. 细粒度角色权限系统
8. Jira 新指派事件的自动触发

---

## 20. 建议的 v1 实施阶段

### 第一阶段：接单与文档生成

- 手动指定 Jira Ticket 启动
- Jira 内容标准化
- Confluence 链接抽取
- 源文档获取
- 分析页生成

### 第二阶段：开发准备与仓库编排

- Repo 映射
- 分支创建
- 分支信息回写

### 第三阶段：验证与闭环

- 测试证据记录
- Confluence 结果回写
- Jira 状态门禁
- 工作流完成归档

---

## 21. 关键风险

1. 源信息质量风险
   - Jira 与 Confluence 本身可能不完整、冲突或过时。

2. 文档“看起来很详细但实际上不可用”的风险
   - 若只追求篇幅，不追求结构与可实施性，系统会产生伪文档。

3. 权限风险
   - 企业内部权限模型可能阻塞端到端自动化。

4. Repo 路由风险
   - 一个 Jira Ticket 不一定天然对应单个 Repo。

5. 验证标准漂移风险
   - 若“足量测试”没有明确标准，闭环质量会持续下滑。

6. 流程落地风险
   - 某些团队可能要求在建分支前、回写前、完成前插入人工审批点。

---

## 22. MVP 决策摘录（派生摘要，规范仍以 canonical 为准）

> Note: This section is a derived summary for readability. It must stay aligned with `docs/canonical-workflow-spec.md` and must not be treated as a separate normative source.

为避免文档闭环看似完整但实现时仍大量返工，MVP 采用以下定稿策略：

1. 分析页生成后必须进入 `analysis_approval_waiting`，默认需要人工确认通过后才能进入仓库与开发准备阶段。
2. Jira 的“完成态”不写死在代码中，统一通过项目级配置映射，例如 `jiraDoneStatusName`。
3. Jira Comment 回写不作为 MVP 关闭门禁必需项，可配置开启；门禁只强依赖 Jira 状态更新与 Confluence 最终回写。
4. Jira Project 到 GitHub Repo 的映射由 YAML 配置文档维护，MVP 不引入数据库配置表和自助式后台配置界面。
5. v1 固定为单 Ticket 单 Repo，不支持一个 Ticket 同时编排多个 Repo。
6. v1 只负责创建或复用工作分支，不纳入 PR 自动创建。
7. “足量测试”的最低标准为：进入验证审批前，必须至少存在一条 `implementation_note`，以及一条 `test_execution` 或 `manual_verification`；若未提供自动化测试，必须在 `manual_verification` 中说明原因、范围和风险。
8. 若实现偏离原分析页，必须在 `implementation_note` 与 Confluence 最终回写中显式记录偏离原因、实际实现和影响范围。
9. 同一 Ticket 在 v1 维持单一分析页，重复执行采用在原分析页中追加新的执行记录与结果章节，不创建隐藏副本。
10. 编码与验证动作允许人工、外部 Agent 或混合模式完成，但工作流系统只基于结构化证据推进。
11. Bridge 使用的具体模型由 `LLM_MODEL` 运行时配置决定，文档不把模型名写死为固定型号。
12. `LLM_API_KEY` 作为可选运行时配置保留；如果 Bridge 不要求鉴权，则允许留空。
13. v1 以内部中心化服务为默认部署形态，前端与后端统一部署，鉴权依赖现有企业登录态或网关；相关业务规则默认通过配置文档维护。
14. 自动触发属于后续能力，默认设计方向为 webhook 优先、轮询兜底，但不纳入 MVP 实现范围。

---

## 23. 建议的产品决策

为了形成一个既强约束又可落地的 v1，建议采用以下模式：

1. 手动指定 Jira Ticket 作为 MVP 主入口
2. Confluence 源文档收集自动化
3. Confluence 分析页生成自动化
4. GitHub 分支创建自动化
5. 开发执行采用人工或 Agent 辅助方式，但必须遵循分析页
6. 测试证据记录必须强制执行
7. 关闭 Jira 前必须通过显式门禁校验
8. v1 统一复用现有 VS Code GitHub Copilot Bridge，不做多模型扩展
9. 统一通过运行时 Secret 使用 GitHub / Jira / Confluence Token，不引入额外认证体系
10. 自动触发作为后续增强能力设计，不作为 MVP 上线门槛

该方案的优点是：

- 足够有价值
- 足够可实施
- 能形成真正闭环
- 不会因为过度设计而推迟上线

---

## 24. 总结

这个项目的正确定位，不是“把 Jira、Confluence、GitHub 串起来”，而是建立一个受约束的研发交付闭环系统。

它的核心价值不在于单点自动化，而在于将以下对象绑定到同一条可审计链路上：

- 需求输入
- 源文档上下文
- 分析与设计
- 开发分支
- 代码实现
- 测试证据
- 文档回写
- 状态完成

如果设计正确，它最终会成为：

1. 一个需求接收层
2. 一个设计文档引擎
3. 一个开发编排器
4. 一个测试门禁系统
5. 一个交付闭环控制器

这是这个想法更准确、也更有产品价值的定义。
