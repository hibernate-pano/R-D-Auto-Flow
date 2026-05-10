# 配置文档规范：R&D Auto Flow MVP

## Authority

- Authority level: Derived configuration policy, subordinate to canonical workflow rules
- Primary upstream sources:
  - `docs/canonical-workflow-spec.md`
  - `docs/mvp-technical-design.md`
- Usage rule: This document defines how approved workflow/configuration decisions are represented in config surfaces.
- Conflict rule: If configuration behavior conflicts with canonical workflow semantics or MVP scope, canonical wins.

## 1. 文档定位

- 文档类型：运行配置规范
- 对应文档：
  - [canonical-workflow-spec.md](/Users/panbo/Code/Work-HSBC/R&D-Auto-Flow/docs/canonical-workflow-spec.md)
  - [rpd-jira-confluence-github-workflow.md](/Users/panbo/Code/Work-HSBC/R&D-Auto-Flow/docs/rpd-jira-confluence-github-workflow.md)
  - [mvp-technical-design.md](/Users/panbo/Code/Work-HSBC/R&D-Auto-Flow/docs/mvp-technical-design.md)
  - [backend-implementation-plan.md](/Users/panbo/Code/Work-HSBC/R&D-Auto-Flow/docs/backend-implementation-plan.md)
- 目标：明确 MVP 阶段所有业务配置默认通过配置文档管理，而不是数据库配置表或后台配置页面

---

## 2. 总体原则

MVP 阶段所有需要人工维护的运行配置，默认使用配置文档管理。

不作为 MVP 范围的能力：

1. 配置后台
2. 配置表管理界面
3. 数据库存储的动态业务配置中心

建议格式：

- YAML

原因：

1. 可读性高
2. 适合版本管理
3. 便于代码评审和变更追踪
4. 实现成本低，适合 MVP

---

## 3. 配置分类

配置分为两类：

### 3.1 环境变量

用于保存敏感信息或部署环境差异，例如：

- `DATABASE_URL`
- `GITHUB_TOKEN`
- `JIRA_TOKEN`
- `CONFLUENCE_TOKEN`
- `LLM_API_KEY`

### 3.2 配置文档

用于保存非敏感、需要人工维护的业务规则，例如：

1. Jira Project 到 GitHub Repo 的映射
2. Jira 完成态名称映射
3. 默认 Confluence Space
4. 默认 Confluence 父页面
5. 是否开启 Jira Comment 回写
6. 基线分支覆盖规则

---

## 4. 默认配置文件

MVP 建议提供一个主配置文件，例如：

`config/rnd-auto-flow.config.yaml`

如后续环境差异明显，可扩展为：

- `config/rnd-auto-flow.config.yaml`
- `config/rnd-auto-flow.config.local.yaml`
- `config/rnd-auto-flow.config.prod.yaml`

但 MVP 第一阶段只需要一份主配置文件即可。

---

## 5. 建议配置结构

建议结构如下：

```yaml
jira:
  doneStatusByProject:
    RD: Done
    RISK: Closed

confluence:
  defaultSpaceByProject:
    RD: RDSPACE
    RISK: RISKSPACE
  defaultParentPageIdByProject:
    RD: "123456"
    RISK: "789012"

github:
  repoByProject:
    RD:
      repoName: hsbc-rd-service
      repoUrl: https://github.com/org/hsbc-rd-service
      baseBranch: main
    RISK:
      repoName: hsbc-risk-engine
      repoUrl: https://github.com/org/hsbc-risk-engine
      baseBranch: master

workflow:
  jiraCommentWritebackEnabled: false
  requireAnalysisApproval: true
  requireVerificationApproval: true
```

---

## 6. 核心配置项说明

### 6.1 Jira 完成态映射

`jira.doneStatusByProject`

作用：

- 按项目定义 Jira 完成态名称
- 避免把“Done”或其他状态名写死在代码中

规则：

1. 以 Jira Project Key 为键
2. 值为该项目对应的完成态状态名
3. 若缺失，启动时应报警并拒绝推进到 `jira_status_updating`

### 6.2 Jira Project 到 Repo 映射

`github.repoByProject`

作用：

- 将 Jira Project Key 映射到目标 GitHub Repo

最小字段：

1. `repoName`
2. `repoUrl`
3. `baseBranch`

规则：

1. MVP 默认只支持单 Ticket 单 Repo
2. 若配置缺失，则在 `repo_resolving` 阶段阻塞
3. `baseBranch` 是默认基线分支，可被更高优先级规则覆盖

### 6.3 Confluence 默认目标

`confluence.defaultSpaceByProject`
`confluence.defaultParentPageIdByProject`

作用：

- 为不同 Jira Project 指定默认落页位置

规则：

1. 若 Ticket 或显式规则未给出目标位置，则回落到该配置
2. 若缺失且系统无法确定落页位置，则在分析页创建前阻塞

### 6.4 工作流治理开关

`workflow.*`

MVP 推荐至少保留：

1. `jiraCommentWritebackEnabled`
2. `requireAnalysisApproval`
3. `requireVerificationApproval`

规则：

1. 默认值应偏保守
2. 开关变更必须走配置文件变更，而不是运行时随意修改

---

## 7. 配置加载规则

后端启动时必须完成以下动作：

1. 读取配置文档
2. 校验 YAML 语法
3. 校验必填字段
4. 对配置结构做类型校验
5. 生成启动时配置摘要日志

若配置不合法：

1. 服务应拒绝启动，或
2. 至少拒绝进入依赖该配置的相关阶段

不得出现“配置缺失但继续静默运行”的行为。

---

## 8. 配置变更原则

MVP 阶段配置变更必须满足：

1. 配置文件纳入版本管理
2. 配置变更可审计
3. 配置结构稳定，避免频繁重命名
4. 敏感信息不得进入配置文档

推荐方式：

1. 通过 Pull Request 修改 YAML
2. 代码评审时同时评估配置影响

---

## 9. MVP 结论

MVP 阶段的默认策略如下：

1. 敏感项走环境变量
2. 业务规则走 YAML 配置文档
3. 不引入配置表
4. 不引入后台配置页面

这样可以用最低复杂度支撑当前开发与上线，同时保留后续向配置中心演进的空间。
