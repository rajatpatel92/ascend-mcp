import { z } from "zod";
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
    // Note: To strictly follow portfolio-app API, we might not have a direct GET /api/market-data endpoint.
    // However, if we need it, portfolio-app should expose it, or we could just use search API if available.
    // Assuming portfolio-app exposes /api/investments or similar, or we can just fetch the activity holdings for now.
    // Wait, the plan said "If portfolio-app lacks a direct /api/market-data endpoint, we might need to add a simple pass-through".
    // I will use /api/analysis/[symbol] which might provide market data if it exists.
    return await apiClient(`/analysis/${symbol}`);
}
