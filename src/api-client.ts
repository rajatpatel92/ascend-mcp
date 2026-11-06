import dotenv from 'dotenv';
dotenv.config();

if (!process.env.MCP_API_KEY) {
    console.warn('WARNING: MCP_API_KEY is not set. Requests to portfolio-app may be rejected.');
}

export async function apiClient(endpoint: string, options: RequestInit = {}) {
    const rawApiUrl = process.env.PORTFOLIO_API_URL || 'http://ascend:3000/api';
    const apiUrl = rawApiUrl.replace(/\/+$/, '');
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const apiKey = process.env.MCP_API_KEY;
    const url = `${apiUrl}${cleanEndpoint}`;
    
    const headers = new Headers(options.headers || {});
    if (apiKey) {
        headers.set('x-api-key', apiKey);
    }
    headers.set('Content-Type', 'application/json');

    const signal = options.signal || AbortSignal.timeout(15000);
    const response = await fetch(url, { ...options, headers, signal });
    
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
