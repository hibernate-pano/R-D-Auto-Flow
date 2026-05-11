import type { ConfluenceConnector, ConfluencePageSummary, JiraConnector, JiraTicket, LlmConnector, AnalysisResult } from "../types.js";

export class RealLlmConnector implements LlmConnector {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly model: string = "gpt-4o",
  ) {}

  async generateAnalysis(input: {
    ticket: JiraTicket;
    sourcePages: ConfluencePageSummary[];
  }): Promise<AnalysisResult> {
    const systemPrompt = `You are a senior R&D workflow analyst. Generate a structured analysis document based on the provided Jira ticket and source documents.

Your output must follow this exact structure:
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

Be concise and specific. Use markdown format.`;

    const userPrompt = `## Jira Ticket: ${input.ticket.jiraKey}

**Title:** ${input.ticket.title}
**Status:** ${input.ticket.status}
**Project:** ${input.ticket.jiraProjectKey}
**Assignee:** ${input.ticket.assignee ?? "Unassigned"}

**Description:**
${input.ticket.description}

**Comments:**
${input.ticket.comments.map((c) => `- ${c}`).join("\n")}

## Source Documents:
${input.sourcePages.map((p, i) => `### Source ${i + 1}: ${p.title}\n${p.summary}`).join("\n\n")}`;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM API error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };
    const content = data.choices[0]?.message?.content ?? "";

    // Parse sections from the content
    const sections = content.match(/^## (.+)$/gm)?.map((s) => s.replace("## ", "")) ?? [];

    return {
      title: `${input.ticket.jiraKey} Analysis`,
      markdown: content,
      sections,
    };
  }
}
