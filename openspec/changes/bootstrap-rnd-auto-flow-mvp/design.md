## Context

当前仓库已经有一套相对完整的中文需求与技术文档，核心结论已经定稿：

1. MVP 是“编排 + 门禁 + 审计”系统，而不是自动编码执行器。
2. 主线围绕 Jira、Confluence、GitHub 和本地 LLM Bridge 展开。
3. 手动指定 Jira Ticket、阶段可视化、日志查看、人工干预、结构化证据和审批门禁都是 MVP 必做能力。
4. 运行配置默认采用“敏感项走环境变量，业务规则走 YAML 配置文档”的双层方式。

当前没有任何代码实现，因此这次设计不仅要解释“怎么做”，还要把后续开发的落地顺序、模块边界和跨模块契约提前定死，避免后续实现期再次返工。

约束与相关方：

- 相关方：工程师操作者、Tech Lead、Reviewer、流程管理员
- 外部依赖：Jira API、Confluence API、GitHub API、本地 `http://127.0.0.1:14434` LLM Bridge
- 关键非目标：不自动在目标仓库中编码，不自动跑全量测试，不支持多 Repo 编排，不引入复杂 RBAC 和后台配置中心

## Goals / Non-Goals

**Goals:**

1. 把现有文档收束成一套能直接指导开发的 OpenSpec 产物。
2. 明确后端模块边界、前端页面边界、数据模型边界和连接器责任。
3. 明确自动阶段、人工阶段、审批阶段和关闭门禁之间的数据流。
4. 明确配置文档策略、异常分流策略和恢复策略。
5. 给出可执行的开发顺序和验证顺序。

**Non-Goals:**

1. 不在本次设计中选择具体前端或后端技术栈实现细节，例如 React 框架或 Node 框架的精确版本。
2. 不引入 PR 自动创建、Code Review 自动化、部署自动化等后续能力。
3. 不把 MVP 配置方式升级为数据库配置表或后台配置页面。
4. 不把 OpenSpec 产物扩展成企业级通用流程平台设计。

## Decisions

### 1. 用单 change 承载当前 MVP 的全量规划拆解

决策：

- 使用 `bootstrap-rnd-auto-flow-mvp` 作为当前主 change。
- 在该 change 下按 capability 拆出多个 spec，而不是为每一篇已有文档单独建 change。

原因：

- 当前仓库还没有代码，也没有已归档主 specs，先形成一份完整规划更利于后续整体开发。
- 这些文档描述的是同一个 MVP 边界，拆成多个 change 会让跨能力依赖反而更难追踪。

备选方案：

- 备选 1：每个模块一个 change。
  - 放弃原因：当前仍处于项目级规划阶段，过早碎片化会增加同步成本。

### 2. 以 capability 而不是文档章节做 spec 拆分

决策：

- specs 按能力域拆分为 7 个 capability：
  - `flow-lifecycle-orchestration`
  - `operator-workbench`
  - `external-context-ingestion`
  - `repo-branch-preparation`
  - `evidence-approval-closure`
  - `runtime-configuration`
  - `audit-observability-recovery`

原因：

- 能力域更接近后续代码模块和测试模块。
- 同一 capability 可以横跨多份现有文档，但对开发更直接。

备选方案：

- 备选 1：按 PRD、API、数据库、前端页面等文档维度拆分。
  - 放弃原因：会重复描述同一能力，不利于后续实现和验证。

### 3. 后端采用单体服务内聚合工作流引擎与连接器

决策：

- MVP 采用一个前端应用 + 一个后端应用 + 一个数据库的单体方案。
- 工作流引擎、API Server、连接器、证据服务、治理逻辑都以内聚模块形式存在于后端中。

原因：

- 当前真正复杂的是业务编排和闭环约束，不是服务拆分。
- 单体形态更适合快速实现和验证状态机契约。

备选方案：

- 备选 1：把 workflow-engine、connectors、evidence-service 拆成多个独立服务。
  - 放弃原因：过早拆分会把精力耗在基础设施与分布式契约上。

### 4. Flow 与 WorkItem 分层建模

决策：

- `work_items` 保存 Ticket 维度稳定事实。
- `flow_runs` 保存一次执行的运行态。
- `flow_stage_runs` 保存阶段历史与重试历史。
- `manual_actions`、`evidence_records`、`flow_logs` 作为独立审计对象。

原因：

- 同一 Ticket 会有重跑和恢复，需要执行态与稳定事实解耦。
- 证据和人工动作需要独立检索和审计，不能埋在单个 JSON 字段里。

备选方案：

- 备选 1：把当前状态、证据摘要和阶段历史都塞进 `work_items`。
  - 放弃原因：无法支撑多次执行、审计和恢复。

### 5. 自动阶段与人工阶段通过显式状态边界衔接

决策：

- 自动阶段仅负责可机器执行的步骤。
- `implementation_waiting` 和 `verification_waiting` 被视为一等阶段，但动作在系统外完成。
- 推进依赖结构化 evidence，而不是自由文本承诺。

原因：

- 这与当前 MVP “不自动写代码、不自动跑完整测试”的边界完全一致。
- 可以先把流程治理做好，再考虑未来接入 Agent 自动执行。

备选方案：

- 备选 1：把实现和验证当成流程外行为，不在状态机中建模。
  - 放弃原因：这样会丢掉闭环、门禁和审计价值。

### 6. 审批与门禁采用固定检查点

决策：

- 只保留分析审批和验证审批两个固定检查点。
- 关闭 Jira 必须经过显式门禁检查。

原因：

- 固定检查点足以满足当前治理需要，且实现成本可控。
- 审批点太多会拖慢 MVP 交付。

备选方案：

- 备选 1：做通用可配置审批流。
  - 放弃原因：范围过大，不符合 MVP。

### 7. 配置策略采用环境变量 + YAML 配置文档

决策：

- 敏感配置走环境变量。
- Jira 完成态映射、Repo 映射、Confluence 默认目标、治理开关走 `config/*.yaml`。

原因：

- 文档已明确这是用户当前认可的 MVP 策略。
- YAML 最适合当前无代码仓库、强评审、低复杂度的阶段。

备选方案：

- 备选 1：数据库配置表。
  - 放弃原因：会过早引入配置中心问题。
- 备选 2：后台配置页面。
  - 放弃原因：不是 MVP 必需项。

### 8. 开发顺序按“配置与数据模型 → 工作流引擎 → 外部接入 → API → 前端 → 门禁回写 → 恢复验证”推进

决策：

- 优先把底层契约和状态机骨架做稳，再接外部系统与页面。

原因：

- 这条顺序最符合当前文档和风险分布。
- 如果状态机与数据层不稳，前端和连接器越早做，返工越多。

### 9. 初始代码骨架采用 `apps + packages + config` 分层

决策：

- 初始仓库骨架按以下目录边界组织：
  - `apps/api/`: 后端 API Server、workflow engine、connectors、evidence service、audit/logging、config bootstrap
  - `apps/web/`: 前端 operator workbench、flow 列表页、详情页、日志与证据录入界面
  - `packages/domain/`: 共享类型、状态机枚举、错误码、DTO、证据载荷定义
  - `packages/config-contract/`: YAML 配置结构、校验契约、配置摘要模型
  - `config/`: 项目级 YAML 配置样例与本地运行配置文档
  - `scripts/`: 本地开发辅助脚本与最小验证脚本
- 首批实现先落“目录与模块边界”，暂不在 OpenSpec 层绑定具体框架版本。

原因：

- 该分层与当前单体后端 + 单独前端 + 共享契约的 MVP 结构一致。
- 它能先把模块边界定稳，同时保留后续选择具体 Node/React 工具链的空间。
- `packages/domain` 与 `packages/config-contract` 可以直接承接任务 1.4 和 2.x 的共享契约工作。

备选方案：

- 备选 1：只创建单一 `src/` 目录，后续再按功能重构。
  - 放弃原因：会推迟模块边界澄清，后续拆分 workflow、connector、API 与前端契约时返工更大。

## Risks / Trade-offs

- [风险] 文档已经很细，但具体技术栈尚未最终落库，部分目录结构需要实现期补一个代码级骨架说明。  
  → Mitigation：第一批任务先建立代码骨架与模块目录，再进入功能开发。

- [风险] 外部系统权限或企业网络限制会让连接器联调比预期更慢。  
  → Mitigation：连接器按独立模块开发，优先提供契约测试与 stub 验证。

- [风险] LLM 输出质量不稳定，可能导致分析页“有结构但不可用”。  
  → Mitigation：分析输出必须过结构校验；不合格时阻塞，不直接落页。

- [风险] 人工验证替代自动化测试可能导致关闭门禁被形式化满足但质量不足。  
  → Mitigation：要求 `manual_verification` 必填原因、范围和风险，并在审批环节显式审阅。

- [风险] 单分析页追加执行记录会让页面内容不断增长。  
  → Mitigation：先采用固定章节模板；若未来页面过长，再考虑版本化策略，但不在 MVP 现在引入。

## Migration Plan

1. 初始化项目骨架并引入 OpenSpec 产物作为当前开发执行基线，并始终以 `docs/canonical-workflow-spec.md` 作为规范来源。
2. 落地 YAML 配置加载、数据库模型和后端模块目录。
3. 实现状态机与 runner 的最小闭环，不接外部系统时先用 stub 跑通。
4. 逐步接入 Jira、Confluence、LLM Bridge、GitHub 四类外部依赖。
5. 暴露 API 并接入前端工作台。
6. 最后落证据、审批、最终回写和恢复验证。

回滚策略：

- 当前仓库尚无生产代码，因此不存在运行中系统回滚问题。
- 后续实现期按 capability 分批合入，任何批次失败都应能回退到上一个稳定批次。

## Open Questions

1. 后端和前端最终技术栈如何选择仍未写入现有文档，但这不影响当前 OpenSpec 规划拆解。
2. Confluence 分析页与结果回写的最终页面模板是否要单独形成一份模板文档，后续可按实现需要补充。
3. 连接器联调是否需要单独的本地模拟层，取决于实际企业网络与权限环境，建议在实施第一阶段验证后决定。

## Authority

- Authority level: OpenSpec implementation design, subordinate to `docs/canonical-workflow-spec.md`
- Primary upstream sources:
  - `docs/canonical-workflow-spec.md`
  - `docs/mvp-technical-design.md`
- Usage rule: This file records development-facing design decisions taken under the already-approved canonical MVP boundary.
- Conflict rule: It may refine execution structure, but it may not redefine canonical workflow semantics or product scope.
