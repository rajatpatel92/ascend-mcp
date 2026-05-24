import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { registerTools, executeTool } from "./tools/index.js";
import http from "node:http";

async function main() {
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

    const transportType = process.env.MCP_TRANSPORT || "stdio";

    if (transportType === "sse") {
        const PORT = parseInt(process.env.PORT || "3001", 10);
        let sseTransport: SSEServerTransport | null = null;

        const httpServer = http.createServer(async (req, res) => {
            const url = new URL(req.url || "", `http://${req.headers.host}`);

            if (url.pathname === "/sse" && req.method === "GET") {
                sseTransport = new SSEServerTransport("/message", res);
                await server.connect(sseTransport);
                console.error("New SSE connection established");
            } else if (url.pathname === "/message" && req.method === "POST") {
                if (sseTransport) {
                    await sseTransport.handlePostMessage(req, res);
                } else {
                    res.writeHead(400, { "Content-Type": "text/plain" });
                    res.end("SSE transport not initialized. Connect to /sse first.");
                }
            } else {
                res.writeHead(404, { "Content-Type": "text/plain" });
                res.end("Not Found");
            }
        });

        httpServer.listen(PORT, () => {
            console.error(`Ascend MCP Server running on HTTP/SSE at port ${PORT}`);
        });

    } else {
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error("Ascend MCP Server running on stdio");
    }
}

main().catch(console.error);
