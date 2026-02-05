#:package Aspire.Hosting.JavaScript@13.1.0
#:package CommunityToolkit.Aspire.Hosting.Bun@13.1.2-beta.515
#:sdk Aspire.AppHost.Sdk@13.1.0

var builder = DistributedApplication.CreateBuilder(args);

// Bun API server (Hono + oRPC)
var server = builder.AddBunApp("server", "./server", "src/index.ts")
    .WithBunPackageInstallation()
    .WithHttpEndpoint(port: 8080, env: "PORT")
    .WithHttpHealthCheck("/health");

// SvelteKit web app (Vite) - using Bun for package installation
var web = builder.AddBunApp("web", "./web", "dev")
    .WithBunPackageInstallation()
    .WaitFor(server);

builder.Build().Run();