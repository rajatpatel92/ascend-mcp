import { apiClient } from "../api-client.js";

export const getHoldingsTool = {
    name: "get_holdings",
    description: "Get the current quantity of a specific investment symbol",
    inputSchema: {
        type: "object",
        properties: {
            symbol: { type: "string" }
        },
        required: ["symbol"],
    },
};

export async function executeGetHoldings(args: any) {
    return await apiClient(`/holdings?symbol=${args.symbol}`);
}
