import type { GithubConnector, PreparedBranchResult } from "../types.js";

export class RealGithubConnector implements GithubConnector {
  constructor(private readonly token: string) {}

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `https://api.github.com${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...options?.headers,
      },
    });
    if (!response.ok) {
      throw new Error(`GitHub API error ${response.status}: ${await response.text()}`);
    }
    return response.json() as Promise<T>;
  }

  async prepareBranch(input: {
    jiraKey: string;
    repoName: string;
    repoUrl: string;
    baseBranch: string;
  }): Promise<PreparedBranchResult> {
    // Extract owner/repo from repoUrl
    const match = input.repoUrl.match(/github\.com\/([^/]+\/[^/]+)/);
    if (!match) {
      return {
        repoName: input.repoName,
        repoUrl: input.repoUrl,
        baseBranch: input.baseBranch,
        baseCommitSha: "unknown",
        workingBranch: input.jiraKey,
        branchResult: "blocked_permission_denied",
      };
    }
    const repoPath = match[1] as string;
    const parts = repoPath.split("/");
    const owner = parts[0] as string;
    const repo = parts[1] as string;

    // Get base branch SHA
    const refData = await this.request<{ object: { sha: string } }>(
      `/repos/${owner}/${repo}/git/ref/heads/${input.baseBranch}`
    );
    const baseCommitSha = refData.object.sha;

    // Check if branch already exists
    const branchExists = await this.checkBranchExists(owner, repo, input.jiraKey);

    if (branchExists) {
      return {
        repoName: input.repoName,
        repoUrl: input.repoUrl,
        baseBranch: input.baseBranch,
        baseCommitSha,
        workingBranch: input.jiraKey,
        branchResult: "reused",
      };
    }

    // Create the branch
    try {
      await this.request(`/repos/${owner}/${repo}/git/refs`, {
        method: "POST",
        body: JSON.stringify({
          ref: `refs/heads/${input.jiraKey}`,
          sha: baseCommitSha,
        }),
      });
      return {
        repoName: input.repoName,
        repoUrl: input.repoUrl,
        baseBranch: input.baseBranch,
        baseCommitSha,
        workingBranch: input.jiraKey,
        branchResult: "created",
      };
    } catch (err) {
      if (err instanceof Error && err.message.includes("422")) {
        return {
          repoName: input.repoName,
          repoUrl: input.repoUrl,
          baseBranch: input.baseBranch,
          baseCommitSha,
          workingBranch: input.jiraKey,
          branchResult: "blocked_diverged",
        };
      }
      throw err;
    }
  }

  private async checkBranchExists(owner: string, repo: string, branch: string): Promise<boolean> {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/branches/${branch}`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github+json",
        },
      }
    );
    return response.status === 200;
  }
}
