import { z } from "zod";

export const RepoMappingSchema = z.object({
  repoName: z.string().min(1),
  repoUrl: z.string().url(),
  baseBranch: z.string().min(1),
});

export const RuntimeConfigSchema = z.object({
  jira: z.object({
    doneStatusByProject: z.record(z.string(), z.string().min(1)),
  }),
  confluence: z.object({
    defaultSpaceByProject: z.record(z.string(), z.string().min(1)),
    defaultParentPageIdByProject: z.record(z.string(), z.string().min(1)),
  }),
  github: z.object({
    repoByProject: z.record(z.string(), RepoMappingSchema),
  }),
  workflow: z.object({
    jiraCommentWritebackEnabled: z.boolean().default(false),
    requireAnalysisApproval: z.boolean().default(true),
    requireVerificationApproval: z.boolean().default(true),
  }),
});

export const EnvConfigSchema = z.object({
  DATABASE_URL: z.string().default("memory://rdaf"),
  GITHUB_TOKEN: z.string().default("dev-github-token"),
  JIRA_TOKEN: z.string().default("dev-jira-token"),
  JIRA_BASE_URL: z.string().url().default("https://your-company.atlassian.net"),
  CONFLUENCE_TOKEN: z.string().default("dev-confluence-token"),
  CONFLUENCE_BASE_URL: z.string().url().default("https://your-company.atlassian.net"),
  LLM_API_KEY: z.string().default("dev-llm-key"),
  LLM_BASE_URL: z.string().url().default("http://127.0.0.1:14434"),
  LLM_MODEL: z.string().default("gpt-4o"),
  PORT: z.coerce.number().int().positive().default(3001),
});

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;
export type EnvConfig = z.infer<typeof EnvConfigSchema>;

export function redactConfigSummary(env: EnvConfig, config: RuntimeConfig) {
  return {
    env: {
      DATABASE_URL: env.DATABASE_URL.startsWith("memory://") ? env.DATABASE_URL : "[redacted]",
      GITHUB_TOKEN: "[redacted]",
      JIRA_TOKEN: "[redacted]",
      JIRA_BASE_URL: env.JIRA_BASE_URL,
      CONFLUENCE_TOKEN: "[redacted]",
      CONFLUENCE_BASE_URL: env.CONFLUENCE_BASE_URL,
      LLM_API_KEY: "[redacted]",
      LLM_BASE_URL: env.LLM_BASE_URL,
      LLM_MODEL: env.LLM_MODEL,
      PORT: env.PORT,
    },
    workflow: config.workflow,
    projects: Object.keys(config.github.repoByProject),
  };
}
