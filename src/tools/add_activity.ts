import { apiClient } from "../api-client.js";

export const addActivityTool = {
    name: "add_activity",
    description: "Add a new transaction/activity to the portfolio",
    inputSchema: {
        type: "object",
        properties: {
            symbol: { type: "string" },
            type: { type: "string", description: "BUY, SELL, DIVIDEND, SPLIT, DEPOSIT, WITHDRAWAL" },
            date: { type: "string", description: "YYYY-MM-DD" },
            quantity: { type: "number" },
            price: { type: "number" },
            fee: { type: "number", default: 0 },
            currency: { type: "string" },
            platformId: { type: "string", description: "ID of the platform" },
            accountId: { type: "string", description: "ID of the account (optional)" },
            name: { type: "string", description: "Name of the investment (optional)" }
        },
        required: ["symbol", "type", "date", "quantity", "price", "currency", "platformId"],
    },
};

export async function executeAddActivity(args: any) {
    return await apiClient(`/activities`, {
        method: 'POST',
        body: JSON.stringify(args)
    });
}
