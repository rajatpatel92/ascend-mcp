import { describe, it } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import path from 'path';

describe('MCP Protocol Integration Tests', () => {
    it('should complete initialize handshake and list tools successfully', async () => {
        // Set env vars so server doesn't warn loudly or crash
        const env = {
            ...process.env,
            PORTFOLIO_API_URL: 'http://test-api:4000/api',
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

        // Helper to wait for output containing a complete JSON line
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
            assert.strictEqual(tools.length, 5);

            // Check that all tools are present
            const toolNames = tools.map((t: any) => t.name);
            assert.ok(toolNames.includes('get_market_data'));
            assert.ok(toolNames.includes('get_portfolio_performance'));
            assert.ok(toolNames.includes('add_activity'));
            assert.ok(toolNames.includes('get_holdings'));
            assert.ok(toolNames.includes('list_activities'));

        } finally {
            // Clean up: terminate subprocess
            child.kill();
        }
    });
});
