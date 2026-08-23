import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { retailMcpFactory } from "./server.js";
const handle = serveStdio(retailMcpFactory());
for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => void handle.close());
}
//# sourceMappingURL=stdio.js.map