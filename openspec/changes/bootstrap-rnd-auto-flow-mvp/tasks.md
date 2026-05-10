## Traceability Rule

- Authority level: Implementation task breakdown, subordinate to canonical workflow rules and derived OpenSpec capability specs
- Primary upstream sources:
  - `docs/canonical-workflow-spec.md`
  - `openspec/changes/bootstrap-rnd-auto-flow-mvp/specs/*`
- Usage rule: Task completion is only meaningful when the linked capability specs and canonical concerns are satisfied.
- Conflict rule: If a task seems to imply behavior outside canonical or the linked capability specs, fix the task instead of expanding behavior ad hoc.

## 1. OpenSpec 基线与代码骨架

Linked specs:
- `flow-lifecycle-orchestration`
- `runtime-configuration`

- [x] 1.1 基于当前 change 复核 proposal、specs、design 与现有 `docs/` 的一致性
- [x] 1.2 确定后端应用、前端应用和共享模块的代码目录骨架
- [ ] 1.3 建立配置加载入口与基础运行时启动流程
- [ ] 1.4 建立共享类型、错误码和枚举定义，确保与规范状态机一致

## 2. 配置与治理能力

Linked specs:
- `runtime-configuration`
- `audit-observability-recovery`

- [ ] 2.1 实现环境变量读取与必填校验
- [ ] 2.2 实现 YAML 配置文档读取、语法校验和结构校验
- [ ] 2.3 定义 Jira 完成态映射、Repo 映射、Confluence 默认目标和治理开关的数据结构
- [ ] 2.4 输出脱敏后的启动配置摘要日志
- [ ] 2.5 为配置缺失、配置非法和配置冲突定义稳定错误码

## 3. 数据模型与持久化

Linked specs:
- `flow-lifecycle-orchestration`
- `evidence-approval-closure`
- `audit-observability-recovery`

- [ ] 3.1 落地 `work_items`、`flow_runs`、`flow_stage_runs`、`flow_logs`、`manual_actions`、`evidence_records` 表结构
- [ ] 3.2 为关键字段建立索引、唯一约束和外键约束
- [ ] 3.3 定义数据访问层接口，覆盖 Flow、Stage、Log、Action、Evidence 的读写
- [ ] 3.4 为重跑、恢复和冲突检测补齐仓储查询方法
- [ ] 3.5 为日志脱敏和 JSON 载荷存储建立统一封装

## 4. 工作流状态机与 Runner

Linked specs:
- `flow-lifecycle-orchestration`
- `audit-observability-recovery`

- [ ] 4.1 实现规范阶段与规范状态的枚举和迁移规则
- [ ] 4.2 实现创建 Flow、推进阶段、阻塞、失败、暂停、取消的状态机服务
- [ ] 4.3 实现 StageRun 的 attempt、started_at、finished_at 和错误摘要写入
- [ ] 4.4 实现租约、心跳、过期回收和 crash recovery 基础逻辑
- [ ] 4.5 实现活动 Flow 冲突检测和 `FLOW_CONFLICT` 返回
- [ ] 4.6 实现重跑与失败恢复的来源关系和恢复边界校验

## 5. Jira、Confluence 与 LLM Bridge 接入

Linked specs:
- `external-context-ingestion`

- [ ] 5.1 实现 Jira Ticket 搜索接口和按 Key 拉取详情能力
- [ ] 5.2 实现 Jira 内容标准化和 WorkItem 写入
- [ ] 5.3 实现 Confluence 链接抽取与源页读取
- [ ] 5.4 实现源页摘要结构化存储
- [ ] 5.5 实现 LLM Bridge 请求封装、超时控制、重试策略和错误映射
- [ ] 5.6 实现分析文档提示词拼装
- [ ] 5.7 实现分析输出结构校验
- [ ] 5.8 实现 Confluence 分析页创建与单页面追加策略

## 6. GitHub 仓库解析与分支准备

Linked specs:
- `repo-branch-preparation`
- `runtime-configuration`

- [ ] 6.1 实现基于 `repoOverride`、Ticket 显式字段和 YAML 配置的仓库解析
- [ ] 6.2 实现基线分支和基线提交解析
- [ ] 6.3 实现 `<jira-key>` 分支存在性检查
- [ ] 6.4 实现分支创建、复用和谱系冲突阻塞逻辑
- [ ] 6.5 实现 `branch_snapshot` 证据写入和分析页分支信息回写

## 7. API Server 与权限边界

Linked specs:
- `operator-workbench`
- `flow-lifecycle-orchestration`
- `evidence-approval-closure`

- [ ] 7.1 实现 `GET /api/jira/issues/search`
- [ ] 7.2 实现 `POST /api/flows/precheck`
- [ ] 7.3 实现 `POST /api/flows`
- [ ] 7.4 实现 `GET /api/flows`
- [ ] 7.5 实现 `GET /api/flows/{flowRunId}`
- [ ] 7.6 实现 `GET /api/flows/{flowRunId}/logs`
- [ ] 7.7 实现 `GET /api/flows/{flowRunId}/evidence`
- [ ] 7.8 实现 `POST /api/flows/{flowRunId}/evidence`
- [ ] 7.9 实现 `GET /api/flows/{flowRunId}/available-actions`
- [ ] 7.10 实现人工动作提交接口和能力校验

## 8. 证据、审批与关闭门禁

Linked specs:
- `evidence-approval-closure`
- `operator-workbench`

- [ ] 8.1 实现 `implementation_note`、`test_execution`、`manual_verification` 载荷校验
- [ ] 8.2 实现 `approval_decision` 的系统写入逻辑
- [ ] 8.3 实现分析审批检查点和验证审批检查点
- [ ] 8.4 实现实现阶段、验证阶段和审批阶段的门禁校验
- [ ] 8.5 实现最终 Confluence 结果回写
- [ ] 8.6 实现 Jira 完成态更新和缺口阻塞逻辑

## 9. 前端工作台

Linked specs:
- `operator-workbench`

- [ ] 9.1 实现 Flow 列表页基础布局、查询和筛选
- [ ] 9.2 实现手动启动弹窗、预检查和冲突弹窗
- [ ] 9.3 实现 Flow 详情页摘要区、关联对象区和阶段时间线
- [ ] 9.4 实现日志列表、日志详情抽屉和过滤器
- [ ] 9.5 实现证据区与证据录入弹窗
- [ ] 9.6 实现人工操作区与动作表单弹窗
- [ ] 9.7 实现基于 `availableActions` 的按钮显示和刷新逻辑

## 10. 审计、可观测性与恢复

Linked specs:
- `audit-observability-recovery`
- `flow-lifecycle-orchestration`

- [ ] 10.1 为所有自动阶段写入结构化摘要日志
- [ ] 10.2 为所有人工动作写入审计记录
- [ ] 10.3 实现日志脱敏策略和大载荷裁剪策略
- [ ] 10.4 实现恢复事件、租约回收事件和阻塞事件的可观测日志
- [ ] 10.5 在详情页中展示最近成功阶段、失败原因和推荐下一步动作

## 11. 验证与收尾

Linked specs:
- `flow-lifecycle-orchestration`
- `external-context-ingestion`
- `repo-branch-preparation`
- `evidence-approval-closure`
- `audit-observability-recovery`

- [ ] 11.1 为状态机、冲突检测、门禁校验和 Repo 映射编写单元测试
- [ ] 11.2 为 Jira/Confluence/LLM/GitHub 连接器编写集成测试或契约测试
- [ ] 11.3 为关键前端页面编写交互级验证
- [ ] 11.4 运行端到端最小闭环验证：手动启动 → 分析页创建 → 分支准备 → 证据录入 → 审批 → 回写
- [ ] 11.5 对实现结果与 OpenSpec 产物执行一次 `verify`/人工比对，确保规范与实现一致
