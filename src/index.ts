import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { registerTools, executeTool } from "./tools/index.js";
import http from "node:http";
import { randomUUID } from "node:crypto";

function createMcpServer() {
    const server = new Server({
        name: "ascend-mcp",
        version: "1.0.0",
    }, {
        capabilities: {
            tools: {}
        }
    });

    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
            tools: registerTools()
        };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        try {
            const result = await executeTool(request.params.name, request.params.arguments);
            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
            };
        } catch (error: any) {
            return {
                content: [{ type: "text", text: `Error executing tool ${request.params.name}: ${error.message}` }],
                isError: true,
            };
        }
    });

    return server;
}

async function main() {
    const transportType = process.env.MCP_TRANSPORT || "stdio";

    if (transportType === "sse") {
        const PORT = parseInt(process.env.PORT || "3001", 10);
        
        const server = createMcpServer();
        
        // Instantiate StreamableHTTPServerTransport in stateful mode
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
        });

        await server.connect(transport);
        console.error("[MCP-DEBUG] Connected server to StreamableHTTPServerTransport");

        const httpServer = http.createServer(async (req, res) => {
            // Enable CORS headers
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Headers", "*");
            res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE");

            if (req.method === "OPTIONS") {
                res.writeHead(204);
                res.end();
                return;
            }

            const host = req.headers.host || "localhost";
            const url = new URL(req.url || "", `http://${host}`);

            // Detailed request logging for remote debugging
            console.error(`[MCP-DEBUG] Incoming Request: ${req.method} ${url.pathname}${url.search}`);
            console.error(`[MCP-DEBUG] Headers: ${JSON.stringify(req.headers)}`);

            // Route all /sse requests (GET, POST, DELETE) to StreamableHTTPServerTransport
            if (url.pathname === "/sse" || url.pathname === "/sse/message" || url.pathname === "/message") {
                try {
                    await transport.handleRequest(req, res);
                } catch (error) {
                    console.error(`[MCP-DEBUG] Transport handleRequest error:`, error);
                    res.writeHead(500, { "Content-Type": "text/plain" });
                    res.end("Internal Server Error");
                }
            } else {
                res.writeHead(404, { "Content-Type": "text/plain" });
                res.end("Not Found");
            }
        });

        httpServer.listen(PORT, () => {
            console.error(`[MCP-DEBUG] Ascend MCP Server running on HTTP/SSE/Streamable at port ${PORT}`);
        });

    } else {
        const server = createMcpServer();
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error("Ascend MCP Server running on stdio");
    }
}

main().catch(console.error);


