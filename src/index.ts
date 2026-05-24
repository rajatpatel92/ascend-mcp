import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { registerTools, executeTool } from "./tools/index.js";
import http from "node:http";

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
        
        // Map to hold active sessions
        const activeSessions = new Map<string, {
            server: Server;
            transport: SSEServerTransport;
        }>();

        const httpServer = http.createServer(async (req, res) => {
            // Enable CORS headers
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Headers", "*");
            res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

            if (req.method === "OPTIONS") {
                res.writeHead(204);
                res.end();
                return;
            }

            const url = new URL(req.url || "", `http://${req.headers.host}`);

            if (url.pathname === "/sse" && req.method === "GET") {
                // Prevent proxy buffering for SSE stream
                res.setHeader("X-Accel-Buffering", "no");

                const transport = new SSEServerTransport("/message", res);
                const sessionId = transport.sessionId;
                const server = createMcpServer();

                activeSessions.set(sessionId, { server, transport });
                console.error(`New SSE connection established. Session ID: ${sessionId}`);

                res.on("close", () => {
                    activeSessions.delete(sessionId);
                    console.error(`SSE connection closed. Removed Session ID: ${sessionId}`);
                });

                await server.connect(transport);
            } else if (url.pathname === "/message" && req.method === "POST") {
                const sessionId = url.searchParams.get("sessionId");
                if (!sessionId) {
                    res.writeHead(400, { "Content-Type": "text/plain" });
                    res.end("Missing sessionId parameter");
                    return;
                }

                const session = activeSessions.get(sessionId);
                if (!session) {
                    res.writeHead(404, { "Content-Type": "text/plain" });
                    res.end("Session not found");
                    return;
                }

                await session.transport.handlePostMessage(req, res);
            } else {
                res.writeHead(404, { "Content-Type": "text/plain" });
                res.end("Not Found");
            }
        });

        httpServer.listen(PORT, () => {
            console.error(`Ascend MCP Server running on HTTP/SSE at port ${PORT}`);
        });

    } else {
        const server = createMcpServer();
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error("Ascend MCP Server running on stdio");
    }
}

main().catch(console.error);

