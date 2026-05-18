import { apiClient } from "../api-client.js";

export const listActivitiesTool = {
    name: "list_activities",
    description: "List recent portfolio activities/transactions",
    inputSchema: {
        type: "object",
        properties: {},
    },
};

export async function executeListActivities(args: any) {
    return await apiClient(`/activities`);
}
