import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert';

// We will dynamically require/import the apiClient to test different environment variable configurations.
function getApiClient() {
    // Clear cache to force reload of environment variables
    const resolvedPath = require.resolve('../../api-client.js');
    delete require.cache[resolvedPath];
    return require('../../api-client.js').apiClient;
}

describe('API Client Unit Tests', () => {
    let originalFetch: typeof globalThis.fetch;

    before(() => {
        originalFetch = globalThis.fetch;
    });

    after(() => {
        globalThis.fetch = originalFetch;
    });

    it('should inject x-api-key when MCP_API_KEY environment variable is set', async () => {
        // Set env vars
        process.env.PORTFOLIO_API_URL = 'http://test-api:4000/api';
        process.env.MCP_API_KEY = 'test-secret-key';

        const mockResponseData = { success: true };
        
        // Mock fetch on globalThis
        globalThis.fetch = mock.fn(async (url: any, options: any) => {
            assert.strictEqual(url, 'http://test-api:4000/api/holdings?symbol=AAPL');
            assert.strictEqual(options.headers.get('x-api-key'), 'test-secret-key');
            assert.strictEqual(options.headers.get('Content-Type'), 'application/json');
            
            return {
                ok: true,
                status: 200,
                statusText: 'OK',
                json: async () => mockResponseData
            } as any;
        });

        const apiClient = getApiClient();
        const result = await apiClient('/holdings?symbol=AAPL');

        assert.deepStrictEqual(result, mockResponseData);
        assert.strictEqual((globalThis.fetch as any).mock.callCount(), 1);
    });

    it('should omit x-api-key when MCP_API_KEY is not set', async () => {
        process.env.PORTFOLIO_API_URL = 'http://test-api:4000/api';
        process.env.MCP_API_KEY = '';

        globalThis.fetch = mock.fn(async (url: any, options: any) => {
            assert.strictEqual(url, 'http://test-api:4000/api/activities');
            assert.strictEqual(options.headers.has('x-api-key'), false);
            
            return {
                ok: true,
                status: 200,
                statusText: 'OK',
                json: async () => ({ activities: [] })
            } as any;
        });

        const apiClient = getApiClient();
        const result = await apiClient('/activities');

        assert.deepStrictEqual(result, { activities: [] });
    });

    it('should throw an error when the API response is not ok', async () => {
        process.env.PORTFOLIO_API_URL = 'http://test-api:4000/api';
        process.env.MCP_API_KEY = 'test-secret-key';

        globalThis.fetch = mock.fn(async (url: any, options: any) => {
            return {
                ok: false,
                status: 400,
                statusText: 'Bad Request',
                json: async () => ({ error: 'Invalid Symbol' })
            } as any;
        });

        const apiClient = getApiClient();
        
        await assert.rejects(
            async () => {
                await apiClient('/analysis/INVALID');
            },
            /API Request failed \(400\): Invalid Symbol/
        );
    });

    it('should fall back to statusText if response does not contain error json', async () => {
        process.env.PORTFOLIO_API_URL = 'http://test-api:4000/api';
        process.env.MCP_API_KEY = '';

        globalThis.fetch = mock.fn(async (url: any, options: any) => {
            return {
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
                json: async () => { throw new Error('Not JSON'); }
            } as any;
        });

        const apiClient = getApiClient();

        await assert.rejects(
            async () => {
                await apiClient('/activities');
            },
            /API Request failed \(500\): Internal Server Error/
        );
    });
});
