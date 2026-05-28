import { apiClient } from "../api-client.js";

export const getPlatformsTool = {
    name: "get_platforms",
    description: "Get all available platforms (brokerages/institutions) from Ascend",
    inputSchema: {
        type: "object",
        properties: {},
        required: [],
    },
};

export async function executeGetPlatforms(args: any) {
    return await apiClient(`/platforms`, {
        method: 'GET'
    });
}
