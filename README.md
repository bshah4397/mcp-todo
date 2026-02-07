# MCP Todo Server

Tool-only MCP server with three tools:
- add_todo
- list_todo
- edit_todo

## Local dev

1. Install deps

   npm install

2. Run

   npm run dev

3. MCP endpoint

   http://localhost:8787/mcp

## Deploy (Railway)

Set the Railway build and start commands:
- Build: npm run build
- Start: npm start

Railway will set PORT; the server respects process.env.PORT.
