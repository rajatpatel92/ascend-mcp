import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert';

import { executeGetHoldings } from '../../tools/get_holdings.js';
import { executeAddActivity } from '../../tools/add_activity.js';
import { executeGetMarketData } from '../../tools/get_market_data.js';
import { executeGetPortfolioPerformance } from '../../tools/get_portfolio_performance.js';
import { executeListActivities } from '../../tools/list_activities.js';

// Import the API client module to mock it
import * as apiClientModule from '../../api-client.js';

describe('MCP Tools Unit Tests', () => {
    let mockApiClient: any;

    before(() => {
        // Create a mock for apiClient
        mockApiClient = mock.method(apiClientModule, 'apiClient', async (endpoint: string, options: any = {}) => {
            // Return simple mock details depending on the endpoint called
            if (endpoint.startsWith('/holdings')) {
                return { symbol: 'AAPL', quantity: 42 };
            } else if (endpoint === '/activities' && options.method === 'POST') {
                const body = JSON.parse(options.body);
                return { success: true, activity: body };
            } else if (endpoint === '/activities') {
                return { activities: [{ id: '1', symbol: 'AAPL', type: 'BUY' }] };
            } else if (endpoint.startsWith('/analysis')) {
                return { symbol: 'AAPL', price: 150.25, change: 1.5 };
            } else if (endpoint.startsWith('/portfolio/history')) {
                return { history: [{ date: '2026-05-20', value: 10000 }] };
            }
            throw new Error(`Unexpected endpoint mocked: ${endpoint}`);
        });
    });

    after(() => {
        mockApiClient.mock.restore();
    });

    it('should call get_holdings API endpoint correctly', async () => {
        const result = await executeGetHoldings({ symbol: 'AAPL' });
        assert.deepStrictEqual(result, { symbol: 'AAPL', quantity: 42 });
    });

    it('should call add_activity API endpoint with POST method and body', async () => {
        const payload = {
            symbol: 'AAPL',
            type: 'BUY',
            date: '2026-05-20',
            quantity: 10,
            price: 150.25,
            currency: 'USD',
            platformId: 'test-platform'
        };

        const result = await executeAddActivity(payload);
        assert.strictEqual(result.success, true);
        assert.deepStrictEqual(result.activity, payload);
    });

    it('should call get_market_data API endpoint for symbol analysis', async () => {
        const result = await executeGetMarketData({ symbol: 'AAPL' });
        assert.deepStrictEqual(result, { symbol: 'AAPL', price: 150.25, change: 1.5 });
    });

    it('should fallback to market-data endpoint when analysis endpoint returns error', async () => {
        // Intercept/mock to return 404 for analysis and succeed for market-data
        const fallbackMock = mock.method(apiClientModule, 'apiClient', async (endpoint: string) => {
            if (endpoint.startsWith('/analysis/MSFT')) {
                throw new Error('API Request failed (404): Investment not found');
            }
            if (endpoint.startsWith('/market-data?symbol=MSFT')) {
                return { symbol: 'MSFT', price: 340.50, change: 4.2 };
            }
            throw new Error(`Unexpected endpoint: ${endpoint}`);
        });

        const result = await executeGetMarketData({ symbol: 'MSFT' });
        assert.deepStrictEqual(result, { symbol: 'MSFT', price: 340.50, change: 4.2 });
        
        fallbackMock.mock.restore();
    });

    it('should call get_portfolio_performance history with correct defaults', async () => {
        const result = await executeGetPortfolioPerformance({});
        assert.deepStrictEqual(result, { history: [{ date: '2026-05-20', value: 10000 }] });
    });

    it('should call get_portfolio_performance history with custom range and currency', async () => {
        // Intercept/mock temporarily to verify args
        const localMock = mock.method(apiClientModule, 'apiClient', async (endpoint: string) => {
            assert.strictEqual(endpoint, '/portfolio/history?range=6M&currency=USD');
            return { custom: true };
        });

        const result = await executeGetPortfolioPerformance({ range: '6M', currency: 'USD' });
        assert.deepStrictEqual(result, { custom: true });
        
        localMock.mock.restore();
    });

    it('should call list_activities API endpoint correctly', async () => {
        const result = await executeListActivities({});
        assert.deepStrictEqual(result, { activities: [{ id: '1', symbol: 'AAPL', type: 'BUY' }] });
    });
});
