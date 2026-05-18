import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { registerTools, executeTool } from "./tools/index.js";

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

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Ascend MCP Server running on stdio");
}

main().catch(console.error);
