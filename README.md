# Ascend MCP Server  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Model Context Protocol (MCP) server designed to bridge Large Language Models (LLMs) with **Ascend**, a self-hosted personal portfolio manager. This server allows AI tools (like Claude, Cursor, Zed, etc.) to query real-time market data, analyze portfolio allocations, read holdings and historical transaction sheets, track dividends, and record activities directly within your portfolio.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Key Features & Tools](#key-features--important-tools)
- [System Requirements](#system-requirements)
- [Environment Configuration](#environment-configuration)
  - [**CRITICAL SECURITY NOTE: MATCHING API KEYS**](#critical-security-note-matching-api-keys)
- [Getting Started (Local Execution without Docker)](#getting-started-local-execution-without-docker)
- [Deploying with Docker & Docker Compose](#deploying-with-docker--docker-compose)
- [Client Integration Guides](#client-integration-guides)
  - [Claude Desktop](#claude-desktop)
  - [Cursor IDE](#cursor-ide)
- [Open Source Credits & Dependencies](#open-source-credits--dependencies)
- [License](#license)

---

## Architecture Overview

The `ascend-mcp` server acts as a standard MCP compliant intermediary. When an LLM requests action via an approved tool, the MCP server receives the request, constructs the query, appends security headers (`x-api-key`), and relays it to your self-hosted **Ascend App instance API** (`/api/*`).

```
+------------+            +------------+            +---------------+
|            |    MCP     |            |    HTTP    |               |
|  LLM Host  | <--------> | Ascend MCP | <--------> |  Ascend App   |
|  (Client)  | (JSON-RPC) |   Server   |  (REST API)|  (Next.js Web)|
|            |            |            |            |               |
+------------+            +------------+            +---------------+
```

The server supports two distinct communication transports:
1. **Stdio Transport**: Standard Input/Output pipe, ideal for local integration in editors and desktop clients.
2. **SSE Transport (Server-Sent Events)**: Stateful HTTP-based communication running on port `3001` (with full CORS support) which is perfect for distributed or Docker container environments.

---

## Key Features & Important Tools

The Ascend MCP server exposes a rich suite of portfolio intelligence tools:

### Available MCP Tools

| Tool Name | Description | Required Arguments | Optional / Defaults |
| :--- | :--- | :--- | :--- |
| **`get_market_data`** | Search for a financial symbol (stock, ETF) and get its real-time or historical market pricing data. | `symbol` (e.g., `AAPL`, `VFV.TO`) | None |
| **`get_portfolio_performance`** | Get portfolio performance history, tracking total net asset value (NAV), market value, and dividend distributions over time. | None | `range` (`1M`, `3M`, `6M`, `1Y`, `YTD`, `ALL` - default: `1Y`), `currency` (default: `CAD`) |
| **`add_activity`** | Add a new investment transaction/activity sheet directly to the portfolio. | `symbol`, `type`, `date`, `quantity`, `price`, `currency`, `platformId` | `fee` (default: `0`), `accountId`, `name` |
| **`get_holdings`** | Get the current raw share quantity held in the portfolio for a specific investment symbol. | `symbol` | None |
| **`list_activities`** | Retrieve the log of recent transactions and historical activities across all portfolios. | None | None |
| **`get_holdings_data`** | Retrieve detailed holding analysis for a symbol, including average purchase cost, current unrealized gains, and account allocation. | `symbol` | None |

---

## System Requirements

- **Runtime**: [Node.js](https://nodejs.org/) v18.0.0 or higher.
- **Package Manager**: `npm` v9.0.0 or higher.
- **Compilation**: [TypeScript](https://www.typescriptlang.org/) v5.0+ (used during compilation phases).
- **Core Instance**: A running instance of the **Ascend Portfolio Manager App** (Next.js server).

---

## Environment Configuration

Configure the project by duplicating the environment template:

```bash
cp .env.example .env
```

Open `.env` in your editor and adjust parameters:

```env
# The endpoint of your running Ascend Next.js Web app API
PORTFOLIO_API_URL=http://localhost:3000/api

# A secure random token used for API requests authentication
MCP_API_KEY=your_secure_random_string_here

# MCP communication mechanism: 'stdio' or 'sse'
MCP_TRANSPORT=stdio

# The HTTP port utilized when running in 'sse' mode (default is 3001)
PORT=3001
```

---

> [!IMPORTANT]  
> ### CRITICAL SECURITY NOTE: MATCHING API KEYS
> To protect your financial data, the Ascend Portfolio App secures its API endpoints.
> 1. You **MUST** define the exact same `MCP_API_KEY` token on **both** your **Ascend App (Web Instance)** `.env` file **and** this **Ascend MCP Server** `.env` file.
> 2. Ensure your Ascend App's `.env` configuration contains:
>    ```env
>    MCP_API_KEY="your_secure_random_string_here"
>    ```
> 3. If these values are omitted or mismatched, requests made by the MCP server will receive a `401 Unauthorized` or `403 Forbidden` response.

---

## Getting Started (Local Execution without Docker)

To run the Ascend MCP server locally without using Docker, follow these steps:

### 1. Install Dependencies
Navigate to the `ascend-mcp` directory and install the necessary package packages:
```bash
npm install
```

### 2. Compile TypeScript
Build the JavaScript distribution files by compiling the TypeScript codebase:
```bash
npm run build
```

### 3. Configure the Environment
Ensure your `.env` contains correct matching values for `PORTFOLIO_API_URL` and `MCP_API_KEY`. Keep `MCP_TRANSPORT=stdio` for desktop clients.

### 4. Execute the Server
Start the production-ready server using the start command:
```bash
npm start
```

If `MCP_TRANSPORT=stdio` (default), the server will start up silently and wait for stdin JSON-RPC streams.
If `MCP_TRANSPORT=sse` is set, the server will output a startup message:
```text
[MCP-DEBUG] Connected server to StreamableHTTPServerTransport
[MCP-DEBUG] Ascend MCP Server running on HTTP/SSE/Streamable at port 3001
```

---

## Deploying with Docker & Docker Compose

For a unified production setup, you can deploy the Ascend MCP server in containerized environments.

### 1. Review the Dockerfile
The project uses a secure, lightweight two-stage `Dockerfile` based on Alpine Node.js:
- **Build Stage**: Compiles TypeScript.
- **Production Stage**: Installs only production dependencies and executes built files.

### 2. Run Container via Docker Compose
An example `docker-compose.yml` is provided at the root:

```yaml
version: '3.8'
services:
  ascend-mcp:
    build: .
    container_name: ascend-mcp
    restart: always
    environment:
      - PORTFOLIO_API_URL=${PORTFOLIO_API_URL:-http://portfolio-app:3000/api}
      - MCP_API_KEY=${MCP_API_KEY}
      - MCP_TRANSPORT=sse
      - PORT=3001
    ports:
      - "3001:3001"
    networks:
      - portfolio_network
    stdin_open: true
    tty: true

networks:
  portfolio_network:
    external: true
```

*Note: If your Next.js application is running in another Docker compose stack, ensure they share the same external network (e.g. `portfolio_network`) to allow communication.*

Run the server with the following command:
```bash
docker-compose up -d --build
```

---

## Client Integration Guides

### Claude Desktop

To use this server with the official Anthropic Claude Desktop client, append this configuration to your local config file.

- **macOS Path**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows Path**: `%APPDATA%\Claude\claude_desktop_config.json`

#### Stdio Mode (Recommended for Local setups)
```json
{
  "mcpServers": {
    "ascend-mcp": {
      "command": "node",
      "args": [
        "/Users/rajat/Repositories/ascend-mcp/build/index.js"
      ],
      "env": {
        "PORTFOLIO_API_URL": "http://localhost:3000/api",
        "MCP_API_KEY": "your_matching_secure_secret_string",
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

#### SSE Mode (Alternative)
Ensure the Ascend MCP Server is running first at port `3001` (e.g., via Docker):
```json
{
  "mcpServers": {
    "ascend-mcp": {
      "url": "http://localhost:3001/sse"
    }
  }
}
```

### Cursor IDE

To use Ascend MCP in Cursor:
1. Open Cursor and navigate to **Settings** > **Cursor Settings** > **Features** > **MCP**.
2. Click **+ Add New MCP Server**.
3. Fill in the fields:
   - **Name**: `Ascend`
   - **Type**: Choose `command` (for stdio) or `SSE` (if containerized).
   - **Command** (for stdio mode): `node /Users/rajat/Repositories/ascend-mcp/build/index.js`
   - **URL** (for SSE mode): `http://localhost:3001/sse`
4. Click **Save** and verify the green status light indicating a successful session initialize connection!

---

## Open Source Credits & Dependencies

This project relies on high-quality open-source software libraries:

- **[@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol)**: The official SDK for building Model Context Protocol servers in Node.js.
- **[dotenv](https://github.com/motdotla/dotenv)**: A zero-dependency module that loads environment variables from a `.env` file into `process.env`.
- **[zod](https://zod.dev)**: TypeScript-first schema validation with static type inference.
- **[TypeScript](https://www.typescriptlang.org/)**: A typed superset of JavaScript that compiles to plain JavaScript.

---

## License

MIT License

Copyright (c) 2026 rajatpatel92

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
