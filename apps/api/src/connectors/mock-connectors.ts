import {
  DomainError,
  errorCodes,
} from "@rdaf/domain";
import type { RuntimeConfig } from "@rdaf/config-contract";
import type {
  AnalysisResult,
  ConfluenceConnector,
  ConfluencePageSummary,
  GithubConnector,
  JiraConnector,
  JiraTicket,
  LlmConnector,
  PreparedBranchResult,
} from "../types.js";

function extractProjectKey(jiraKey: string): string {
  return jiraKey.split("-")[0] ?? "";
}

export class MockJiraConnector implements JiraConnector {
  constructor(private readonly config: RuntimeConfig) {}

  async searchTickets(query: string) {
    if (!query) {
      return [];
    }

    const normalized = query.toUpperCase();
    return [normalized].map((jiraKey) => ({
      jiraKey,
      summary: `Mock ticket for ${jiraKey}`,
      status: "In Progress",
    }));
  }

  async getTicketByKey(jiraKey: string): Promise<JiraTicket> {
    const project = extractProjectKey(jiraKey);
    if (!this.config.github.repoByProject[project]) {
      throw new DomainError(errorCodes.ticketNotFound, `Mock ticket ${jiraKey} cannot be resolved`, {
        jiraKey,
      });
    }

    return {
      jiraKey,
      title: `Mock implementation for ${jiraKey}`,
      description: `Implement workflow changes for ${jiraKey}. See https://confluence.example.com/${jiraKey.toLowerCase()}`,
      status: "In Progress",
      jiraProjectKey: project,
      assignee: "panbo",
      comments: [`Follow the canonical workflow for ${jiraKey}.`],
    };
  }

  async transitionTicket(): Promise<void> {
    return;
  }
}

export class MockConfluenceConnector implements ConfluenceConnector {
  private readonly pages = new Map<string, string>();

  async getPageByUrl(url: string): Promise<ConfluencePageSummary> {
    return {
      url,
      title: `Summary for ${url}`,
      summary: `Parsed summary from ${url}`,
    };
  }

  async createAnalysisPage(input: {
    jiraKey: string;
    jiraTitle: string;
    space: string;
    parentPageId: string;
    markdown: string;
  }) {
    const pageId = `${input.jiraKey}-analysis`;
    const pageUrl = `https://confluence.example.com/pages/${pageId}`;
    this.pages.set(pageId, input.markdown);
    return { pageId, pageUrl };
  }

  async appendToAnalysisPage(pageId: string, markdown: string): Promise<void> {
    const existing = this.pages.get(pageId) ?? "";
    this.pages.set(pageId, `${existing}\n\n${markdown}`);
  }
}

export class MockGithubConnector implements GithubConnector {
  private readonly branches = new Map<string, { baseCommitSha: string; baseBranch: string }>();

  async prepareBranch(input: {
    jiraKey: string;
    repoName: string;
    repoUrl: string;
    baseBranch: string;
  }): Promise<PreparedBranchResult> {
    if (input.jiraKey.endsWith("999")) {
      return {
        repoName: input.repoName,
        repoUrl: input.repoUrl,
        baseBranch: input.baseBranch,
        baseCommitSha: "deadbeef999",
        workingBranch: input.jiraKey,
        branchResult: "blocked_diverged",
      };
    }

    const existing = this.branches.get(input.jiraKey);
    const result: PreparedBranchResult = {
      repoName: input.repoName,
      repoUrl: input.repoUrl,
      baseBranch: input.baseBranch,
      baseCommitSha: existing?.baseCommitSha ?? `base-${input.jiraKey.toLowerCase()}`,
      workingBranch: input.jiraKey,
      branchResult: existing ? "reused" : "created",
    };

    this.branches.set(input.jiraKey, {
      baseCommitSha: result.baseCommitSha,
      baseBranch: input.baseBranch,
    });

    return result;
  }
}

export class MockLlmConnector implements LlmConnector {
  async generateAnalysis(input: {
    ticket: JiraTicket;
    sourcePages: ConfluencePageSummary[];
  }): Promise<AnalysisResult> {
    const sections = [
      "Ticket 基本信息",
      "Jira 原始需求摘要",
      "源文档摘要",
      "问题定义",
      "范围与非范围",
      "假设与约束",
      "功能分析",
      "技术方案",
      "架构影响分析",
      "数据模型 / 接口影响",
      "依赖分析",
      "风险分析",
      "分步实施计划",
      "单元测试计划",
      "集成 / 回归测试计划",
      "验收清单",
      "回滚 / 降级说明",
    ];

    const markdown = sections
      .map((section) => `## ${section}\n\n- Ticket: ${input.ticket.jiraKey}\n- Source pages: ${input.sourcePages.length}`)
      .join("\n\n");

    return {
      title: `${input.ticket.jiraKey} Analysis`,
      markdown,
      sections,
    };
  }
}
