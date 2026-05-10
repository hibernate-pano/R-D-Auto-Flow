## Why

当前仓库已经形成了一组相互引用的中文产品与技术文档，但它们仍然主要是“设计资料”，还没有被拆成面向开发执行的 OpenSpec 产物。后续如果直接进入编码，很容易在模块边界、实现优先级、验收口径和跨文档约束上再次漂移。

现在需要把现有文档收束成一套足够细的 OpenSpec 变更，使后续开发可以围绕明确 capability、设计说明和任务清单推进，而不是在实现期重新做产品与架构决策。

## What Changes

- 将现有 `docs/` 中已经定稿的产品、规范、接口、表结构、前后端设计，重组为一套可执行的 OpenSpec 规划产物。
- 为 MVP 拆分一组稳定 capability，分别覆盖工作流编排、前端工作台、外部系统接入、仓库与分支准备、证据与审批门禁、运行配置、审计恢复等核心能力。
- 在设计文档中明确模块边界、关键数据流、阻塞与异常分支、配置加载规则、开发批次与验证策略。
- 在任务文档中提供足够细的实施拆解，使后续开发可以按 capability 或批次逐步实现。
- 不新增产品范围，不修改既有 MVP 边界；本次变更的目标是把已有结论转成可开发工件。

## Capabilities

### New Capabilities
- `flow-lifecycle-orchestration`: 规范 FlowRun、StageRun、状态迁移、阻塞模型、重跑恢复、租约心跳与恢复语义。
- `operator-workbench`: 定义前端工作台、手动启动、详情页、日志查看、证据录入和人工干预操作面。
- `external-context-ingestion`: 定义 Jira、Confluence、LLM Bridge 的上下文拉取、分析生成与回写前输入组织能力。
- `repo-branch-preparation`: 定义目标仓库解析、基线分支解析、工作分支创建/复用/阻塞策略。
- `evidence-approval-closure`: 定义结构化证据、分析审批、验证审批、关闭门禁与最终回写约束。
- `runtime-configuration`: 定义环境变量与 YAML 配置文档边界、配置加载校验、项目级映射与治理开关。
- `audit-observability-recovery`: 定义摘要日志、审计记录、错误码、运行可观测性与 crash recovery 最小要求。

### Modified Capabilities

- 无

## Impact

- 影响范围覆盖整个项目的后续开发基线，而不是单一模块。
- 直接影响后端 API、状态机、数据库表结构、连接器、前端页面、配置加载与验证策略。
- 不引入新的第三方依赖或新的产品目标，但会显著提高后续实现的确定性。
- 产出将位于 `openspec/changes/bootstrap-rnd-auto-flow-mvp/` 下，并作为当前 MVP 的开发执行依据之一；若与 canonical workflow 规则冲突，以 `docs/canonical-workflow-spec.md` 为准。

## Authority

- Authority level: OpenSpec change motivation and planning scope, subordinate to `docs/canonical-workflow-spec.md`
- Primary upstream source: `docs/canonical-workflow-spec.md`
- Usage rule: This file justifies why a derived OpenSpec change exists and what implementation-facing capabilities it should cover.
- Conflict rule: It must not be used to override canonical workflow behavior or MVP scope.
