import { apiClient } from "../api-client.js";

export const getPortfolioPerformanceTool = {
    name: "get_portfolio_performance",
    description: "Get portfolio performance history including market value, nav, and dividends.",
    inputSchema: {
        type: "object",
        properties: {
            range: {
                type: "string",
                description: "Date range (e.g., 1M, 3M, 6M, 1Y, YTD, ALL)",
                default: "1Y"
            },
            currency: {
                type: "string",
                description: "Target currency for evaluation (e.g., CAD, USD)",
                default: "CAD"
            }
        }
    },
};

export async function executeGetPortfolioPerformance(args: any) {
    const range = args.range || "1Y";
    const currency = args.currency || "CAD";
    return await apiClient(`/portfolio/history?range=${range}&currency=${currency}`);
}
