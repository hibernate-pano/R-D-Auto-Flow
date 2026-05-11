/**
 * Structured logger factory using Pino.
 * Produces JSON logs (for production) or pretty-printed human-readable logs (for development).
 * Wraps OpenTelemetry trace context so all log entries are correlated with their trace.
 */

import pino from "pino";
import { trace, context, isSpanContextValid } from "@opentelemetry/api";

const isDev = process.env.NODE_ENV !== "production";

/** Create a child logger with optional trace context injected. */
export function createLogger(name: string): pino.Logger {
  return pino({
    base: {
      name,
      // Inject active trace/span IDs if any
      ...injectTraceContext(),
    },
    level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
    ...(isDev
      ? {
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "HH:MM:ss",
              ignore: "pid,hostname",
            },
          },
        }
      : {}),
  });
}

/** Inject OpenTelemetry trace context fields into the log record. */
function injectTraceContext(): Record<string, string | undefined> {
  const span = trace.getSpan(context.active());
  if (!span) return {};

  const spanContext = span.spanContext();
  if (!isSpanContextValid(spanContext)) return {};

  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
    traceFlags: spanContext.traceFlags.toString(),
  };
}
