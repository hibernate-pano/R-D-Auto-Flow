import { readFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import {
  EnvConfigSchema,
  redactConfigSummary,
  RuntimeConfigSchema,
  type EnvConfig,
  type RuntimeConfig,
} from "@rdaf/config-contract";
import { DomainError, errorCodes } from "@rdaf/domain";

export function loadRuntimeConfig(cwd: string): { env: EnvConfig; config: RuntimeConfig; summary: unknown } {
  const env = EnvConfigSchema.parse(process.env);
  const configPath = path.join(cwd, "config", "rnd-auto-flow.config.yaml");
  const source = readFileSync(configPath, "utf8");
  const parsed = YAML.parse(source);
  const config = RuntimeConfigSchema.safeParse(parsed);

  if (!config.success) {
    throw new DomainError(errorCodes.configInvalid, "Runtime YAML config is invalid", {
      issues: config.error.flatten(),
    });
  }

  return {
    env,
    config: config.data,
    summary: redactConfigSummary(env, config.data),
  };
}
