import { apiClient } from "../api-client.js";

export const getHoldingsDataTool = {
    name: "get_holdings_data",
    description: "Get detailed portfolio holdings, average cost, unrealized returns, and allocations across all accounts for a specific symbol",
    inputSchema: {
        type: "object",
        properties: {
            symbol: {
                type: "string",
                description: "The stock or ETF symbol to search for (e.g., AAPL, MSFT)",
            }
        },
        required: ["symbol"],
    },
};

export async function executeGetHoldingsData(args: any) {
    const { symbol } = args;
    return await apiClient(`/analysis/${symbol}`);
}
