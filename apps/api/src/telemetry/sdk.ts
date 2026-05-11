/**
 * OpenTelemetry SDK initialization.
 * MUST be imported before the Fastify app is loaded (i.e., at the top of index.ts).
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";

const traceExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318/v1/traces",
});

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [SEMRESATTRS_SERVICE_NAME]: "rdaf-api",
    [SEMRESATTRS_SERVICE_VERSION]: "0.1.1",
  }),
  traceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      // Disable fs auto-instrumentation — too noisy for a workflow engine
      "@opentelemetry/instrumentation-fs": { enabled: false },
    }),
  ],
});

sdk.start();

process.on("SIGTERM", () => {
  sdk.shutdown().then(
    () => console.log("OTel SDK shut down"),
    (err) => console.error("OTel shutdown error", err),
  );
});

export { sdk };
