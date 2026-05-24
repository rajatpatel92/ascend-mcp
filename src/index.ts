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
            cleanupTimeout?: NodeJS.Timeout;
        }>();

        const getSessionId = (req: http.IncomingMessage, url: URL): string | null => {
            // 1. Try query parameter
            const querySessionId = url.searchParams.get("sessionId");
            if (querySessionId) return querySessionId;

            // 2. Try headers (case-insensitive check)
            const headersToCheck = ["mcp-session-id", "session-id", "x-session-id"];
            for (const headerName of headersToCheck) {
                const headerValue = req.headers[headerName];
                if (typeof headerValue === "string") {
                    return headerValue;
                } else if (Array.isArray(headerValue) && headerValue[0]) {
                    return headerValue[0];
                }
            }
            return null;
        };

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

            const host = req.headers.host || "localhost";
            const url = new URL(req.url || "", `http://${host}`);

            if (url.pathname === "/sse" && req.method === "GET") {
                // Prevent proxy buffering for SSE stream
                res.setHeader("X-Accel-Buffering", "no");

                const transport = new SSEServerTransport("/sse/message", res);
                const sessionId = transport.sessionId;
                const server = createMcpServer();

                activeSessions.set(sessionId, { server, transport });
                console.error(`New SSE connection established. Session ID: ${sessionId}`);

                res.on("close", () => {
                    console.error(`SSE connection closed. Scheduling cleanup for Session ID: ${sessionId}`);
                    const session = activeSessions.get(sessionId);
                    if (session) {
                        // Clear any existing cleanup timeout
                        if (session.cleanupTimeout) {
                            clearTimeout(session.cleanupTimeout);
                        }
                        // Delay session removal by 60 seconds to handle transient client reconnects or in-flight requests
                        session.cleanupTimeout = setTimeout(() => {
                            activeSessions.delete(sessionId);
                            console.error(`Session ID: ${sessionId} cleaned up from memory`);
                        }, 60000);
                    }
                });

                await server.connect(transport);
            } else if ((url.pathname === "/message" || url.pathname === "/sse/message") && req.method === "POST") {
                const sessionId = getSessionId(req, url);
                if (!sessionId) {
                    res.writeHead(400, { "Content-Type": "text/plain" });
                    res.end("Missing sessionId parameter or header");
                    return;
                }

                const session = activeSessions.get(sessionId);
                if (!session) {
                    res.writeHead(404, { "Content-Type": "text/plain" });
                    res.end("Session not found");
                    return;
                }

                // If connection drops but a new POST comes in before cleanup, keep the session active
                if (session.cleanupTimeout) {
                    clearTimeout(session.cleanupTimeout);
                    session.cleanupTimeout = undefined;
                    console.error(`Cancelled cleanup for Session ID: ${sessionId} due to incoming request`);
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

