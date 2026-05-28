import { apiClient } from "../api-client.js";

export const getAccountsTool = {
    name: "get_accounts",
    description: "Get all available accounts from Ascend. Optionally filter by platformId.",
    inputSchema: {
        type: "object",
        properties: {
            platformId: { type: "string", description: "Optional platform UUID to filter accounts" }
        },
        required: [],
    },
};

export async function executeGetAccounts(args: any) {
    let url = `/accounts`;
    if (args && args.platformId) {
        url += `?platformId=${args.platformId}`;
    }
    return await apiClient(url, {
        method: 'GET'
    });
}
