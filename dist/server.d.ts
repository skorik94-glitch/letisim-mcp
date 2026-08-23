import { McpServer } from "@modelcontextprotocol/server";
import { RetailApiClient } from "./client.js";
export declare function createRetailMcpServer(api: RetailApiClient): McpServer;
export declare function retailMcpFactory(env?: NodeJS.ProcessEnv): () => McpServer;
