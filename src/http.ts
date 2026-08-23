import { createMcpFastifyApp } from "@modelcontextprotocol/fastify";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { retailMcpFactory } from "./server.js";

const host = process.env.RETAIL_MCP_HOST?.trim() || "127.0.0.1";
const port = Number(process.env.RETAIL_MCP_PORT ?? 3210);
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("RETAIL_MCP_PORT must be a valid TCP port");

const split = (value: string | undefined): string[] | undefined => {
  const values = value?.split(",").map(item => item.trim()).filter(Boolean) ?? [];
  return values.length ? values : undefined;
};
const allowedHosts = split(process.env.RETAIL_MCP_ALLOWED_HOSTS);
const allowedOrigins = split(process.env.RETAIL_MCP_ALLOWED_ORIGINS);
if ((host === "0.0.0.0" || host === "::") && !allowedHosts) {
  throw new Error("RETAIL_MCP_ALLOWED_HOSTS is required when binding on all interfaces");
}

const app = createMcpFastifyApp({ host, allowedHosts, allowedOrigins });
const handler = createMcpHandler(retailMcpFactory(), { responseMode: "json" });
const nodeHandler = toNodeHandler(handler);

app.get("/health", async () => ({ ok: true, service: "letisim-retail-mcp" }));
app.all("/retail", (request, reply) => nodeHandler(request.raw, reply.raw, request.body));

app.addHook("onClose", async () => {
  await handler.close();
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void app.close());
}

await app.listen({ host, port });
