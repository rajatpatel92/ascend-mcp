import { apiClient } from "../api-client.js";

export const getMarketDataTool = {
    name: "get_market_data",
    description: "Search for a symbol and get its market data",
    inputSchema: {
        type: "object",
        properties: {
            symbol: {
                type: "string",
                description: "The stock or ETF symbol to search for (e.g., AAPL, VFV.TO)",
            }
        },
        required: ["symbol"],
    },
};

export async function executeGetMarketData(args: any) {
    const { symbol } = args;
    return await apiClient(`/market-data?symbol=${symbol}`);
}
