import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import path from 'path';
import http from 'node:http';

describe('MCP Protocol Integration Tests', () => {
    let mockServer: http.Server;
    const PORT = 4000;

    before(() => {
        // Start a mock HTTP server to simulate the Ascend Portfolio API
        mockServer = http.createServer((req, res) => {
            // Verify authentication headers and Content-Type
            if (req.headers['x-api-key'] !== 'test-secret-key') {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Unauthorized: Invalid x-api-key' }));
                return;
            }

            if (req.url === '/api/holdings?symbol=AAPL' && req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ symbol: 'AAPL', quantity: 42 }));
            } else if (req.url === '/api/activities' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => {
                    body += chunk.toString();
                });
                req.on('end', () => {
                    try {
                        const parsed = JSON.parse(body);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, activity: parsed }));
                    } catch (e) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
                    }
                });
            } else if (req.url === '/api/analysis/AAPL' && req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ symbol: 'AAPL', price: 150.25, change: 1.5, personalCostBasis: 120.00 }));
            } else if (req.url === '/api/market-data?symbol=AAPL' && req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ symbol: 'AAPL', price: 150.25, change: 1.5 }));
            } else if (req.url === '/api/market-data?symbol=MSFT' && req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ symbol: 'MSFT', price: 340.50, change: 4.2 }));
            } else if (req.url === '/api/portfolio/history?range=1Y&currency=CAD' && req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ history: [{ date: '2026-05-20', value: 10000 }] }));
            } else if (req.url === '/api/activities' && req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ activities: [{ id: '1', symbol: 'AAPL', type: 'BUY' }] }));
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: `Not found: ${req.url}` }));
            }
        });

        mockServer.listen(PORT);
    });

    after(() => {
        if (mockServer) {
            mockServer.close();
        }
    });

    it('should complete initialize handshake, list tools, and call all tools successfully', async () => {
        // Set env vars pointing to our mock local server
        const env = {
            ...process.env,
            PORTFOLIO_API_URL: `http://localhost:${PORT}/api`,
            MCP_API_KEY: 'test-secret-key'
        };

        // Spawn the compiled MCP server
        const serverPath = path.resolve(process.cwd(), 'build/index.js');
        const child = spawn('node', [serverPath], { env });

        // Buffer standard output and standard error
        let stdoutData = '';
        let stderrData = '';

        child.stdout.on('data', (data: any) => {
            stdoutData += data.toString();
        });

        child.stderr.on('data', (data: any) => {
            stderrData += data.toString();
        });

        // Helper to wait for output containing a complete JSON line with matching ID
        const waitForMessage = (id: number, timeoutMs = 8000): Promise<any> => {
            return new Promise((resolve, reject) => {
                const startTime = Date.now();
                const interval = setInterval(() => {
                    const lines = stdoutData.split('\n');
                    for (const line of lines) {
                        if (!line.trim()) continue;
                        try {
                            const parsed = JSON.parse(line);
                            if (parsed.id === id) {
                                clearInterval(interval);
                                resolve(parsed);
                                return;
                            }
                        } catch (e) {
                            // Line is not fully received or invalid JSON, skip
                        }
                    }

                    if (Date.now() - startTime > timeoutMs) {
                        clearInterval(interval);
                        reject(new Error(
                            `Timeout waiting for response to JSON-RPC id ${id}.\n` +
                            `STDOUT so far: ${stdoutData}\n` +
                            `STDERR so far: ${stderrData}`
                        ));
                    }
                }, 100);
            });
        };

        try {
            // 1. Send 'initialize' request
            const initRequest = {
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: {
                    protocolVersion: '2024-11-05',
                    capabilities: {},
                    clientInfo: {
                        name: 'integration-test-client',
                        version: '1.0.0'
                    }
                }
            };
            child.stdin.write(JSON.stringify(initRequest) + '\n');

            // 2. Wait for initialize response
            const initResponse = await waitForMessage(1);
            assert.strictEqual(initResponse.jsonrpc, '2.0');
            assert.strictEqual(initResponse.id, 1);
            assert.ok(initResponse.result);
            assert.strictEqual(initResponse.result.serverInfo.name, 'ascend-mcp');
            assert.ok(initResponse.result.capabilities.tools);

            // 3. Send 'initialized' notification (requires no response)
            const initializedNotification = {
                jsonrpc: '2.0',
                method: 'notifications/initialized'
            };
            child.stdin.write(JSON.stringify(initializedNotification) + '\n');

            // 4. Send 'tools/list' request
            const listRequest = {
                jsonrpc: '2.0',
                id: 2,
                method: 'tools/list'
            };
            child.stdin.write(JSON.stringify(listRequest) + '\n');

            // 5. Wait for tools/list response
            const listResponse = await waitForMessage(2);
            assert.strictEqual(listResponse.jsonrpc, '2.0');
            assert.strictEqual(listResponse.id, 2);
            assert.ok(listResponse.result);
            
            const tools = listResponse.result.tools;
            assert.ok(Array.isArray(tools));
            assert.strictEqual(tools.length, 6);

            // Check that all tools are present in tools list
            const toolNames = tools.map((t: any) => t.name);
            assert.ok(toolNames.includes('get_market_data'));
            assert.ok(toolNames.includes('get_portfolio_performance'));
            assert.ok(toolNames.includes('add_activity'));
            assert.ok(toolNames.includes('get_holdings'));
            assert.ok(toolNames.includes('list_activities'));
            assert.ok(toolNames.includes('get_holdings_data'));

            // 6. Test 'get_holdings' tool execution (aggregate quantity)
            const holdingsRequest = {
                jsonrpc: '2.0',
                id: 3,
                method: 'tools/call',
                params: {
                    name: 'get_holdings',
                    arguments: { symbol: 'AAPL' }
                }
            };
            child.stdin.write(JSON.stringify(holdingsRequest) + '\n');
            const holdingsResponse = await waitForMessage(3);
            assert.strictEqual(holdingsResponse.jsonrpc, '2.0');
            assert.strictEqual(holdingsResponse.id, 3);
            assert.ok(holdingsResponse.result);
            assert.ok(!holdingsResponse.isError);
            const holdingsContent = JSON.parse(holdingsResponse.result.content[0].text);
            assert.deepStrictEqual(holdingsContent, { symbol: 'AAPL', quantity: 42 });

            // 7. Test 'add_activity' tool execution
            const addActivityPayload = {
                symbol: 'AAPL',
                type: 'BUY',
                date: '2026-05-20',
                quantity: 10,
                price: 150.25,
                currency: 'USD',
                platformId: 'test-platform'
            };
            const addActivityRequest = {
                jsonrpc: '2.0',
                id: 4,
                method: 'tools/call',
                params: {
                    name: 'add_activity',
                    arguments: addActivityPayload
                }
            };
            child.stdin.write(JSON.stringify(addActivityRequest) + '\n');
            const addActivityResponse = await waitForMessage(4);
            assert.strictEqual(addActivityResponse.jsonrpc, '2.0');
            assert.strictEqual(addActivityResponse.id, 4);
            assert.ok(addActivityResponse.result);
            assert.ok(!addActivityResponse.isError);
            const addActivityContent = JSON.parse(addActivityResponse.result.content[0].text);
            assert.strictEqual(addActivityContent.success, true);
            assert.deepStrictEqual(addActivityContent.activity, addActivityPayload);

            // 8. Test 'get_market_data' tool execution (strictly public price details)
            const marketDataRequest = {
                jsonrpc: '2.0',
                id: 5,
                method: 'tools/call',
                params: {
                    name: 'get_market_data',
                    arguments: { symbol: 'AAPL' }
                }
            };
            child.stdin.write(JSON.stringify(marketDataRequest) + '\n');
            const marketDataResponse = await waitForMessage(5);
            assert.strictEqual(marketDataResponse.jsonrpc, '2.0');
            assert.strictEqual(marketDataResponse.id, 5);
            assert.ok(marketDataResponse.result);
            assert.ok(!marketDataResponse.isError);
            const marketDataContent = JSON.parse(marketDataResponse.result.content[0].text);
            assert.deepStrictEqual(marketDataContent, { symbol: 'AAPL', price: 150.25, change: 1.5 });

            // 9. Test 'get_portfolio_performance' tool execution
            const performanceRequest = {
                jsonrpc: '2.0',
                id: 6,
                method: 'tools/call',
                params: {
                    name: 'get_portfolio_performance',
                    arguments: { range: '1Y', currency: 'CAD' }
                }
            };
            child.stdin.write(JSON.stringify(performanceRequest) + '\n');
            const performanceResponse = await waitForMessage(6);
            assert.strictEqual(performanceResponse.jsonrpc, '2.0');
            assert.strictEqual(performanceResponse.id, 6);
            assert.ok(performanceResponse.result);
            assert.ok(!performanceResponse.isError);
            const performanceContent = JSON.parse(performanceResponse.result.content[0].text);
            assert.deepStrictEqual(performanceContent, { history: [{ date: '2026-05-20', value: 10000 }] });

            // 10. Test 'list_activities' tool execution
            const listActivitiesRequest = {
                jsonrpc: '2.0',
                id: 7,
                method: 'tools/call',
                params: {
                    name: 'list_activities',
                    arguments: {}
                }
            };
            child.stdin.write(JSON.stringify(listActivitiesRequest) + '\n');
            const listActivitiesResponse = await waitForMessage(7);
            assert.strictEqual(listActivitiesResponse.jsonrpc, '2.0');
            assert.strictEqual(listActivitiesResponse.id, 7);
            assert.ok(listActivitiesResponse.result);
            assert.ok(!listActivitiesResponse.isError);
            const listActivitiesContent = JSON.parse(listActivitiesResponse.result.content[0].text);
            assert.deepStrictEqual(listActivitiesContent, { activities: [{ id: '1', symbol: 'AAPL', type: 'BUY' }] });

            // 11. Test new 'get_holdings_data' tool execution (rich portfolio statistics and account allocations)
            const holdingsDataRequest = {
                jsonrpc: '2.0',
                id: 8,
                method: 'tools/call',
                params: {
                    name: 'get_holdings_data',
                    arguments: { symbol: 'AAPL' }
                }
            };
            child.stdin.write(JSON.stringify(holdingsDataRequest) + '\n');
            const holdingsDataResponse = await waitForMessage(8);
            assert.strictEqual(holdingsDataResponse.jsonrpc, '2.0');
            assert.strictEqual(holdingsDataResponse.id, 8);
            assert.ok(holdingsDataResponse.result);
            assert.ok(!holdingsDataResponse.isError);
            const holdingsDataContent = JSON.parse(holdingsDataResponse.result.content[0].text);
            assert.deepStrictEqual(holdingsDataContent, { symbol: 'AAPL', price: 150.25, change: 1.5, personalCostBasis: 120.00 });

        } finally {
            // Clean up: terminate subprocess
            child.kill();
        }
    });
});
