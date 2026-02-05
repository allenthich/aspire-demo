#:package Aspire.Hosting.JavaScript@13.1.0
#:package Aspire.Hosting.PostgreSQL@13.1.0
#:package CommunityToolkit.Aspire.Hosting.Bun@13.1.2-beta.515
#:sdk Aspire.AppHost.Sdk@13.1.0

var builder = DistributedApplication.CreateBuilder(args);

var postgres = builder.AddPostgres("postgres");
var postgresdb = postgres.AddDatabase("postgresdb");

// Bun API server (Hono + oRPC)
// Note: Bun has incomplete gRPC support, so we use HTTP/Protobuf for OTLP
var server = builder.AddBunApp("server", "./server", "src/index.ts")
    .WithBunPackageInstallation()
    .WithHttpEndpoint(port: 8080, env: "PORT")
    .WithHttpHealthCheck("/health")
    .WithOtlpExporter()
    .WithEnvironment("OTEL_EXPORTER_OTLP_PROTOCOL", "http/protobuf")
    .WithEnvironment("NODE_TLS_REJECT_UNAUTHORIZED", "0")
    .WaitFor(postgresdb)
    .WithReference(postgresdb);

// SvelteKit web app (Vite) - using Bun for package installation
var web = builder.AddBunApp("web", "./web", "dev")
    .WithBunPackageInstallation()
    .WaitFor(server);

builder.Build().Run();