import type { ConfluenceConnector, ConfluencePageSummary } from "../types.js";

export class RealConfluenceConnector implements ConfluenceConnector {
  constructor(
    private readonly token: string,
    private readonly baseUrl: string,
  ) {}

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}/wiki/rest/api${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
    if (!response.ok) {
      throw new Error(`Confluence API error ${response.status}: ${await response.text()}`);
    }
    return response.json() as Promise<T>;
  }

  async getPageByUrl(pageUrl: string): Promise<ConfluencePageSummary> {
    // Extract page ID or space/key from URL
    const match = pageUrl.match(/\/pages\/(\d+)/);
    if (!match) {
      throw new Error(`Cannot parse Confluence page URL: ${pageUrl}`);
    }
    const pageId = match[1] as string;
    return this.getPageById(pageId);
  }

  async getPageById(pageId: string): Promise<ConfluencePageSummary> {
    const data = await this.request<{
      id: string;
      title: string;
      body?: { storage?: { value?: string } };
      _links?: { webui?: string };
    }>(`/page/${pageId}?expand=body.storage,metadata`);
    return {
      url: `${this.baseUrl}/wiki${data._links?.webui ?? `/pages/${pageId}`}`,
      title: data.title,
      summary: this.extractSummary(data.body?.storage?.value ?? ""),
    };
  }

  async createAnalysisPage(input: {
    jiraKey: string;
    jiraTitle: string;
    space: string;
    parentPageId: string;
    markdown: string;
  }): Promise<{ pageId: string; pageUrl: string }> {
    const data = await this.request<{ id: string; _links: { webui: string } }>("/page", {
      method: "POST",
      body: JSON.stringify({
        title: `${input.jiraKey} Analysis`,
        space: { key: input.space },
        parent: { id: input.parentPageId },
        body: {
          storage: {
            value: this.markdownToStorage(input.markdown),
            representation: "storage",
          },
        },
      }),
    });
    return {
      pageId: data.id,
      pageUrl: `${this.baseUrl}/wiki${data._links.webui}`,
    };
  }

  async appendToAnalysisPage(pageId: string, markdown: string): Promise<void> {
    const existing = await this.getPageById(pageId);
    const newContent = existing.summary + "\n\n" + markdown;
    await this.request(`/page/${pageId}`, {
      method: "PUT",
      body: JSON.stringify({
        version: { number: 2 }, // Simplified; should fetch current version
        title: existing.title,
        body: {
          storage: {
            value: this.markdownToStorage(newContent),
            representation: "storage",
          },
        },
      }),
    });
  }

  private extractSummary(html: string): string {
    // Strip HTML tags to get plain text summary
    return html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);
  }

  private markdownToStorage(markdown: string): string {
    // Basic markdown to Confluence storage format conversion
    // This is a simplified conversion; a full implementation would use a library
    return markdown
      .replace(/^### (.+)$/gm, "<h3>$1</h3>")
      .replace(/^## (.+)$/gm, "<h2>$1</h2>")
      .replace(/^# (.+)$/gm, "<h1>$1</h1>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/\n\n/g, "<p></p>")
      .replace(/\n/g, "<br/>");
  }
}
