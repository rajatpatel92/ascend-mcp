import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
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
        
        // Setup Streamable HTTP Server Transport
        const streamableTransport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
        });
        streamableTransport.onerror = (error) => {
            console.error(`[MCP-DEBUG] Streamable Transport Error:`, error);
        };
        const streamableServer = createMcpServer();
        streamableServer.onerror = (error) => {
            console.error(`[MCP-DEBUG] Streamable Server Error:`, error);
        };
        
        // Setup Legacy SSEServerTransport Map
        const legacyTransports = new Map<string, SSEServerTransport>();

        // Start Streamable HTTP server connection
        await streamableServer.connect(streamableTransport);
        console.error(`[MCP-DEBUG] Connected server to StreamableHTTPServerTransport`);

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
            
            let parsedBody: any = undefined;
            if (req.method === "POST") {
                try {
                    const chunks: Buffer[] = [];
                    for await (const chunk of req) {
                        chunks.push(chunk as Buffer);
                    }
                    const bodyText = Buffer.concat(chunks).toString("utf-8");
                    if (bodyText) {
                        parsedBody = JSON.parse(bodyText);
                    }
                } catch (e: any) {
                    console.error(`[MCP-DEBUG] Failed to parse POST body:`, e.message);
                }
            }

            // Route Streamable HTTP endpoints (unified endpoint at /sse)
            // Streamable HTTP uses POST /sse, GET /sse (with session ID), and DELETE /sse
            if (url.pathname === "/sse") {
                const sessionIdHeader = req.headers["mcp-session-id"];
                const isStreamableGet = req.method === "GET" && sessionIdHeader !== undefined;
                const isStreamablePost = req.method === "POST";
                const isStreamableDelete = req.method === "DELETE";

                if (isStreamableGet || isStreamablePost || isStreamableDelete) {
                    console.error(`[MCP-DEBUG] Routing to Streamable HTTP (${req.method} /sse)`);
                    try {
                        await streamableTransport.handleRequest(req, res, parsedBody);
                    } catch (error) {
                        console.error(`[MCP-DEBUG] Streamable HTTP handleRequest error:`, error);
                        res.writeHead(500, { "Content-Type": "text/plain" });
                        res.end("Internal Server Error");
                    }
                    return;
                }
            }

            // Route Legacy SSE GET /sse (without mcp-session-id header)
            if (url.pathname === "/sse" && req.method === "GET") {
                console.error(`[MCP-DEBUG] Routing to Legacy SSE (GET /sse)`);
                // Prevent Nginx and other reverse proxies from buffering SSE streams by intercepting writeHead
                const originalWriteHead = res.writeHead;
                res.writeHead = function (this: any, statusCode: number, ...args: any[]) {
                    res.setHeader("X-Accel-Buffering", "no");
                    res.setHeader("Cache-Control", "no-cache, no-transform");
                    return originalWriteHead.call(this, statusCode, ...args);
                } as any;
                
                const transport = new SSEServerTransport("/message", res);
                transport.onerror = (error) => {
                    console.error(`[MCP-DEBUG] Legacy SSE Transport Error:`, error);
                };
                legacyTransports.set(transport.sessionId, transport);
                
                res.on('close', () => {
                    console.error(`[MCP-DEBUG] Legacy SSE connection closed for client ${transport.sessionId}. Starting 15s grace period.`);
                    // Grace period of 15 seconds before deleting the session
                    // to survive temporary proxy disconnects/reconnects during initialization
                    setTimeout(() => {
                        console.error(`[MCP-DEBUG] Legacy SSE grace period expired. Deleting session ${transport.sessionId}`);
                        legacyTransports.delete(transport.sessionId);
                    }, 15000);
                });

                const server = createMcpServer();
                server.onerror = (error) => {
                    console.error(`[MCP-DEBUG] Server Error:`, error);
                };

                try {
                    await server.connect(transport);
                    console.error(`[MCP-DEBUG] Connected Legacy SSE client ${transport.sessionId}`);
                } catch (error) {
                    console.error(`[MCP-DEBUG] Legacy SSE Transport connect error:`, error);
                }
                return;
            }

            // Route Legacy SSE POST /message
            if (url.pathname === "/message" && req.method === "POST") {
                const sessionId = url.searchParams.get("sessionId");
                console.error(`[MCP-DEBUG] Legacy POST /message lookup: sessionId="${sessionId}", availableKeys=${JSON.stringify(Array.from(legacyTransports.keys()))}`);
                if (!sessionId) {
                    res.writeHead(400, { "Content-Type": "text/plain" });
                    res.end("Missing sessionId");
                    return;
                }
                const transport = legacyTransports.get(sessionId);
                if (!transport) {
                    res.writeHead(404, { "Content-Type": "text/plain" });
                    res.end("Session not found");
                    return;
                }
                try {
                    await transport.handlePostMessage(req, res, parsedBody);
                } catch (error) {
                    console.error(`[MCP-DEBUG] Legacy Transport handlePostMessage error:`, error);
                    res.writeHead(500, { "Content-Type": "text/plain" });
                    res.end("Internal Server Error");
                }
                return;
            }

            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("Not Found");
        });

        httpServer.listen(PORT, () => {
            console.error(`[MCP-DEBUG] Ascend MCP Server running on HTTP/SSE at port ${PORT}`);
        });

    } else {
        const server = createMcpServer();
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error("Ascend MCP Server running on stdio");
    }
}

main().catch(console.error);


