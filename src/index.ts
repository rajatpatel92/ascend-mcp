import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
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
        
        const transports = new Map<string, SSEServerTransport>();

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

            if (url.pathname === "/sse" && req.method === "GET") {
                const transport = new SSEServerTransport("/message", res);
                transport.onerror = (error) => {
                    console.error(`[MCP-DEBUG] Transport Error:`, error);
                };
                transports.set(transport.sessionId, transport);
                
                res.on('close', () => {
                    transports.delete(transport.sessionId);
                });

                const server = createMcpServer();
                server.onerror = (error) => {
                    console.error(`[MCP-DEBUG] Server Error:`, error);
                };

                try {
                    await server.connect(transport);
                    console.error(`[MCP-DEBUG] Connected SSE client ${transport.sessionId}`);
                } catch (error) {
                    console.error(`[MCP-DEBUG] Transport connect error:`, error);
                }
                return;
            }

            if (url.pathname === "/message" && req.method === "POST") {
                const sessionId = url.searchParams.get("sessionId");
                if (!sessionId) {
                    res.writeHead(400, { "Content-Type": "text/plain" });
                    res.end("Missing sessionId");
                    return;
                }
                const transport = transports.get(sessionId);
                if (!transport) {
                    res.writeHead(404, { "Content-Type": "text/plain" });
                    res.end("Session not found");
                    return;
                }
                try {
                    await transport.handlePostMessage(req, res, parsedBody);
                } catch (error) {
                    console.error(`[MCP-DEBUG] Transport handlePostMessage error:`, error);
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


