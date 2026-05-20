import dotenv from 'dotenv';
dotenv.config();

if (!process.env.MCP_API_KEY) {
    console.warn('WARNING: MCP_API_KEY is not set. Requests to portfolio-app may be rejected.');
}

export async function apiClient(endpoint: string, options: RequestInit = {}) {
    const apiUrl = process.env.PORTFOLIO_API_URL || 'http://portfolio-app:3000/api';
    const apiKey = process.env.MCP_API_KEY;
    const url = `${apiUrl}${endpoint}`;
    
    const headers = new Headers(options.headers || {});
    if (apiKey) {
        headers.set('x-api-key', apiKey);
    }
    headers.set('Content-Type', 'application/json');

    const response = await fetch(url, { ...options, headers });
    
    if (!response.ok) {
        let errorMsg = response.statusText;
        try {
            const errorJson = await response.json();
            errorMsg = errorJson.error || errorMsg;
        } catch (e) {
            // ignore JSON parse error
        }
        throw new Error(`API Request failed (${response.status}): ${errorMsg}`);
    }

    return response.json();
}
