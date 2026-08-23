import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { retailMcpFactory } from "./server.js";

const handle = serveStdio(retailMcpFactory());
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void handle.close());
}
