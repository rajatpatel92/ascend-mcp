import { apiClient } from "../api-client.js";

export const listActivitiesTool = {
    name: "list_activities",
    description: "List recent portfolio activities/transactions with optional pagination",
    inputSchema: {
        type: "object",
        properties: {
            limit: {
                type: "number",
                description: "Optional maximum number of activities to return",
            },
            offset: {
                type: "number",
                description: "Optional offset for pagination",
            },
        },
    },
};

export async function executeListActivities(args: any) {
    const params = new URLSearchParams();
    if (args?.limit !== undefined && args?.limit !== null) {
        params.set('limit', String(args.limit));
    }
    if (args?.offset !== undefined && args?.offset !== null) {
        params.set('offset', String(args.offset));
    }
    const query = params.toString() ? `?${params.toString()}` : '';
    return await apiClient(`/activities${query}`);
}
