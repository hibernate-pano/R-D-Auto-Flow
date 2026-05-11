import type { JiraConnector, JiraTicket } from "../types.js";
import type { EnvConfig } from "@rdaf/config-contract";

export class RealJiraConnector implements JiraConnector {
  constructor(
    private readonly token: string,
    private readonly baseUrl: string,
  ) {}

  private async request<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}/rest/api/3${path}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(this.token).toString("base64")}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(`Jira API error ${response.status}: ${await response.text()}`);
    }
    return response.json() as Promise<T>;
  }

  async searchTickets(query: string) {
    if (!query) return [];
    const data = await this.request<{ issues: Array<{ key: string; fields: { summary: string; status: { name: string } } }> }>(
      `/search?jql=${encodeURIComponent(`summary ~ "${query}" OR key = "${query.toUpperCase()}"`)}&fields=summary,status&maxResults=10`
    );
    return data.issues.map((issue) => ({
      jiraKey: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status.name,
    }));
  }

  async getTicketByKey(jiraKey: string): Promise<JiraTicket> {
    const data = await this.request<{
      key: string;
      fields: {
        summary: string;
        description?: { content?: Array<{ content?: Array<{ text?: string }> }> };
        status: { name: string };
        project: { key: string };
        assignee?: { displayName?: string };
        comment?: { comments?: Array<{ body?: { content?: Array<{ content?: Array<{ text?: string }> }> } }> };
      };
    }>(`/issue/${jiraKey}?fields=summary,description,status,project,assignee,comment`);

    const description = this.extractText(data.fields.description);
    const comments = (data.fields.comment?.comments ?? [])
      .map((c) => this.extractText(c.body))
      .filter(Boolean);

    return {
      jiraKey: data.key,
      title: data.fields.summary,
      description,
      status: data.fields.status.name,
      jiraProjectKey: data.fields.project.key,
      assignee: data.fields.assignee?.displayName ?? null,
      comments,
    };
  }

  async transitionTicket(jiraKey: string, targetStatus: string): Promise<void> {
    // First get the transition id for the target status
    const transitions = await this.request<{ transitions: Array<{ id: string; name: string }> }>(
      `/issue/${jiraKey}/transitions`
    );
    const transition = transitions.transitions.find((t) => t.name.toLowerCase() === targetStatus.toLowerCase());
    if (!transition) {
      throw new Error(`No transition found for status: ${targetStatus}`);
    }
    await fetch(`${this.baseUrl}/rest/api/3/issue/${jiraKey}/transitions`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(this.token).toString("base64")}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ transition: { id: transition.id } }),
    });
  }

  private extractText(content: unknown): string {
    if (!content) return "";
    if (typeof content === "string") return content;
    try {
      const parts: string[] = [];
      const walk = (node: unknown): void => {
        if (typeof node === "string") {
          parts.push(node);
        } else if (Array.isArray(node)) {
          node.forEach(walk);
        } else if (typeof node === "object" && node !== null) {
          const obj = node as Record<string, unknown>;
          if (obj.text) parts.push(String(obj.text));
          for (const value of Object.values(obj)) {
            walk(value);
          }
        }
      };
      walk(content);
      return parts.join("\n");
    } catch {
      return "";
    }
  }
}
