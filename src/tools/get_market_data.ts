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
    try {
        // Try fetching rich analysis data from portfolio app first (succeeds if symbol is owned)
        return await apiClient(`/analysis/${symbol}`);
    } catch (error: any) {
        // If portfolio analysis fails, fallback to general market-data endpoint (works for any valid symbol)
        try {
            return await apiClient(`/market-data?symbol=${symbol}`);
        } catch (fallbackError: any) {
            throw new Error(`Failed to retrieve market data for ${symbol}: ${fallbackError.message}`);
        }
    }
}
