import "./telemetry";

import { createContext } from "@aspire-demo/api/context";
import { appRouter } from "@aspire-demo/api/routers/index";
import { env } from "@aspire-demo/env/server";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { trace, metrics, context } from "@opentelemetry/api";

const tracer = trace.getTracer("weather-api-nodejs");
const meter = metrics.getMeter("weather-api-nodejs");
const apiRequestCounter = meter.createCounter("api.requests", {
	description: "Total number of API requests",
});

const app = new Hono();

app.use(logger());
app.use(
	"/*",
	cors({
		origin: env.CORS_ORIGIN,
		allowMethods: ["GET", "POST", "OPTIONS"],
	}),
);

export const apiHandler = new OpenAPIHandler(appRouter, {
	plugins: [
		new OpenAPIReferencePlugin({
			schemaConverters: [new ZodToJsonSchemaConverter()],
		}),
	],
	interceptors: [
		onError((error) => {
			console.error(error);
		}),
	],
});

export const rpcHandler = new RPCHandler(appRouter, {
	interceptors: [
		onError((error) => {
			console.error(error);
		}),
	],
});

app.use("/*", async (c, next) => {
	const context = await createContext({ context: c });

	const rpcResult = await rpcHandler.handle(c.req.raw, {
		prefix: "/rpc",
		context: context,
	});

	if (rpcResult.matched) {
		return c.newResponse(rpcResult.response.body, rpcResult.response);
	}

	const apiResult = await apiHandler.handle(c.req.raw, {
		prefix: "/api-reference",
		context: context,
	});

	if (apiResult.matched) {
		return c.newResponse(apiResult.response.body, apiResult.response);
	}

	await next();
});

app.get("/api/weatherforecast", async (c) => {
	const span = tracer.startSpan("get-weather-forecast");

	// Set this span as active so child spans are properly nested
	return context.with(trace.setSpan(context.active(), span), async () => {
		try {
			const forecasts = [
				{
					date: "2024-01-01",
					temperatureC: 25,
					temperatureF: 77,
					summary: "Sunny",
				},
				{
					date: "2024-01-02",
					temperatureC: 20,
					temperatureF: 68,
					summary: "Cloudy",
				},
				{
					date: "2024-01-03",
					temperatureC: 22,
					temperatureF: 72,
					summary: "Partly Cloudy",
				},
				{
					date: "2024-01-04",
					temperatureC: 18,
					temperatureF: 64,
					summary: "Rainy",
				},
				{
					date: "2024-01-05",
					temperatureC: 28,
					temperatureF: 82,
					summary: "Hot",
				},
			];

			apiRequestCounter.add(1, { endpoint: "/api/weatherforecast" });

			// Child span - will be nested under get-weather-forecast
			const fetchSpan = tracer.startSpan("fetch-example-com", {
				attributes: {
					"http.method": "GET",
					"http.url": "http://example.com",
				},
			});
			try {
				const response = await fetch("http://example.com");
				fetchSpan.setAttributes({
					"http.status_code": response.status,
				});
			} catch (error) {
				fetchSpan.setAttributes({
					error: true,
					"error.message":
						error instanceof Error ? error.message : "Unknown error",
				});
			} finally {
				fetchSpan.end();
			}

			span.setAttributes({
				"forecast.count": forecasts.length,
				endpoint: "/api/weatherforecast",
			});

			console.log("Returning weather forecast data!");
			return c.json(forecasts);
		} finally {
			span.end();
		}
	});
});

app.get("/", (c) => {
	return c.text("OK");
});

app.get("/health", (c) => {
	return c.text("OK");
});

export default app;
