Canonical Sources:
- `docs/canonical-workflow-spec.md` sections 4-6, 7, 10
- Shared ownership notes:
  - approvals and action vocabulary are shared with `evidence-approval-closure`
  - flow conflict and precheck semantics are shared with `flow-lifecycle-orchestration`

## ADDED Requirements

### Requirement: Flow 列表工作台
系统 SHALL 提供 Flow 列表工作台，使操作者能够在第一屏识别运行状态、阻塞位置和关键入口。

#### Scenario: 列表加载成功
- **WHEN** 用户进入工作台首页
- **THEN** 系统必须返回 Flow 列表、分页信息、当前阶段、当前状态、最近更新时间和是否需要人工处理
- **THEN** 页面必须支持按 Jira Key、标题关键字、流程 ID 搜索

#### Scenario: 列表支持核心筛选
- **WHEN** 用户使用状态、阶段、启动方式或时间范围筛选
- **THEN** 系统必须返回与筛选条件一致的 Flow 集合

### Requirement: 手动启动与预检查体验
系统 SHALL 提供手动启动入口，并在真正创建 Flow 前执行预检查与冲突检测。

#### Scenario: 合法 Jira Key 启动
- **WHEN** 用户输入合法 Jira Key 并提交启动
- **THEN** 前端必须先触发 Jira 搜索或预检查
- **THEN** 后端必须校验 Ticket 是否存在、仓库是否可解析以及是否存在活动流程

#### Scenario: 发现冲突流程
- **WHEN** 预检查发现当前 Ticket 已存在活动 Flow
- **THEN** 前端必须显示冲突弹窗
- **THEN** 用户必须显式选择查看现有流程、重跑或失败恢复中的一种

### Requirement: Flow 详情工作台
系统 SHALL 提供 Flow 详情页，使操作者可以在单页内查看摘要、阶段时间线、关联对象、证据和日志。

#### Scenario: 详情页展示关键摘要
- **WHEN** 用户打开某个 Flow 详情页
- **THEN** 页面必须展示 Jira Key、标题、当前状态、当前阶段、启动方式、开始时间、更新时间、总耗时和阻塞原因摘要

#### Scenario: 详情页展示阶段轨迹
- **WHEN** 页面渲染阶段时间线
- **THEN** 每个阶段必须展示状态、开始时间、结束时间、耗时、重试次数和错误摘要

### Requirement: 日志查看与定位
系统 SHALL 提供结构化日志视图，而不是只暴露原始日志堆叠。

#### Scenario: 按阶段和级别过滤日志
- **WHEN** 用户使用关键字、阶段、级别或仅错误开关过滤日志
- **THEN** 页面必须返回符合条件的日志集合
- **THEN** 单条日志必须支持展开查看脱敏后的 `details`

#### Scenario: 从阶段时间线联动日志
- **WHEN** 用户点击某个阶段
- **THEN** 页面必须定位并高亮与该阶段相关的日志

### Requirement: 证据录入操作面
系统 SHALL 在详情页提供结构化证据录入能力，支持实现记录、测试执行和人工验证三类证据。

#### Scenario: 新增实现说明
- **WHEN** 用户在 `implementation_waiting` 阶段录入 `implementation_note`
- **THEN** 系统必须要求至少填写摘要和说明
- **THEN** 录入成功后页面必须刷新证据摘要和关闭门禁缺口

#### Scenario: 未提供自动化测试时录入人工验证
- **WHEN** 用户仅提交 `manual_verification`
- **THEN** 表单必须要求填写验证结论、验证范围、风险说明以及未提供自动化测试的原因说明

### Requirement: 人工干预操作面
系统 SHALL 只展示后端允许的人工动作，并对破坏性操作执行二次确认。

#### Scenario: 后端返回可执行动作
- **WHEN** 页面获取 `availableActions`
- **THEN** 前端必须仅显示被授权且当前状态允许的动作
- **THEN** 不得在前端硬编码额外动作按钮

#### Scenario: 执行破坏性动作
- **WHEN** 用户执行 `cancel`、`skip_stage` 或其他破坏性动作
- **THEN** 页面必须进行二次确认
- **THEN** 操作成功后必须刷新详情页并显示新的状态结果
