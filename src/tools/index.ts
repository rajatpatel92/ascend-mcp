import { getMarketDataTool, executeGetMarketData } from './get_market_data.js';
import { getPortfolioPerformanceTool, executeGetPortfolioPerformance } from './get_portfolio_performance.js';
import { addActivityTool, executeAddActivity } from './add_activity.js';
import { getHoldingsTool, executeGetHoldings } from './get_holdings.js';
import { listActivitiesTool, executeListActivities } from './list_activities.js';

export function registerTools() {
    return [
        getMarketDataTool,
        getPortfolioPerformanceTool,
        addActivityTool,
        getHoldingsTool,
        listActivitiesTool
    ];
}

export async function executeTool(name: string, args: any) {
    switch (name) {
        case 'get_market_data':
            return await executeGetMarketData(args);
        case 'get_portfolio_performance':
            return await executeGetPortfolioPerformance(args);
        case 'add_activity':
            return await executeAddActivity(args);
        case 'get_holdings':
            return await executeGetHoldings(args);
        case 'list_activities':
            return await executeListActivities(args);
        default:
            throw new Error(`Tool ${name} not found`);
    }
}
