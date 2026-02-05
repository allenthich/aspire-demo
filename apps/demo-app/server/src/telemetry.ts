// IMPORTANT: Disable TLS verification for Aspire's self-signed certs (development only)
// This must be set BEFORE any HTTPS connections are made
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { Resource } from "@opentelemetry/resources";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

// Enable DEBUG level OpenTelemetry logging to see export attempts
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

const serviceName = process.env.OTEL_SERVICE_NAME || "server";
const protocol = process.env.OTEL_EXPORTER_OTLP_PROTOCOL || "http/protobuf";

// Get the endpoint from Aspire
// WithOtlpExporter() provides gRPC endpoint, but we need HTTP endpoint (usually port + 1)
function getHttpEndpoint(): string {
  const grpcEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  if (!grpcEndpoint) {
    console.warn("⚠️ OTEL_EXPORTER_OTLP_ENDPOINT not set - using default");
    return "http://localhost:4318";
  }

  // If protocol is http/protobuf and endpoint looks like a port, increment by 1
  // Aspire's HTTP OTLP is typically on gRPC port + 1
  if (protocol === "http/protobuf") {
    try {
      const url = new URL(grpcEndpoint);
      const port = parseInt(url.port, 10);
      if (port) {
        url.port = String(port + 1);
        return url.toString().replace(/\/$/, ""); // Remove trailing slash
      }
    } catch (e) {
      // URL parsing failed, use as-is
    }
  }

  return grpcEndpoint;
}

const httpEndpoint = getHttpEndpoint();

console.log("========== OTEL CONFIG ==========");
console.log(`OTEL_EXPORTER_OTLP_ENDPOINT (gRPC): ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "(not set)"}`);
console.log(`HTTP endpoint (calculated): ${httpEndpoint}`);
console.log(`OTEL_SERVICE_NAME: ${serviceName}`);
console.log(`OTEL_EXPORTER_OTLP_PROTOCOL: ${protocol}`);
console.log(`NODE_TLS_REJECT_UNAUTHORIZED: ${process.env.NODE_TLS_REJECT_UNAUTHORIZED}`);
console.log("=================================");

// Test connectivity to the HTTP endpoint
async function testEndpoint(url: string): Promise<void> {
  try {
    const response = await fetch(url, { method: "POST", body: "" });
    console.log(`📡 Endpoint test ${url}: ${response.status} ${response.statusText}`);
  } catch (error: any) {
    console.error(`❌ Endpoint test ${url}: ${error.message}`);
  }
}

// Test endpoint on startup (non-blocking)
setTimeout(() => {
  testEndpoint(`${httpEndpoint}/v1/traces`);
}, 2000);

const resource = new Resource({
  [ATTR_SERVICE_NAME]: serviceName,
});

// HTTP/Protobuf exporters with calculated HTTP endpoint
const traceExporter = new OTLPTraceExporter({
  url: `${httpEndpoint}/v1/traces`,
});

const metricExporter = new OTLPMetricExporter({
  url: `${httpEndpoint}/v1/metrics`,
});

const sdk = new NodeSDK({
  resource: resource,
  traceExporter: traceExporter,
  metricReader: new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 10000,
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": {
        enabled: false,
      },
    }),
  ],
});

sdk.start();
console.log(`✅ OpenTelemetry SDK started - exporting to ${httpEndpoint}`);

process.on("SIGTERM", () => {
  sdk
    .shutdown()
    .then(() => console.log("Tracing terminated"))
    .catch((error) => console.log("Error terminating tracing", error))
    .finally(() => process.exit(0));
});

export { sdk };
