import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const PORT = Number(process.env.PORT ?? 8787);

type Todo = {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
};

const todos: Todo[] = [];

const nowIso = () => new Date().toISOString();

const createServer = () => {
  const server = new McpServer({
    name: "todo-server",
    version: "1.0.0",
  });

  server.tool(
    "add_todo",
    "Add a todo item",
    {
      text: z.string().min(1),
      completed: z.boolean().optional(),
    },
    async ({ text, completed }) => {
      const timestamp = nowIso();
      const todo: Todo = {
        id: randomUUID(),
        text,
        completed: completed ?? false,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      todos.push(todo);

      return {
        content: [{ type: "text", text: `Added todo: ${todo.text}` }],
        structuredContent: { todo },
      };
    }
  );

  server.tool(
    "list_todo",
    "List todos",
    {
      completed: z.boolean().optional(),
    },
    async ({ completed }) => {
      const filtered =
        typeof completed === "boolean"
          ? todos.filter((t) => t.completed === completed)
          : todos;

      return {
        content: [
          {
            type: "text",
            text:
              filtered.length === 0
                ? "No todos."
                : filtered
                    .map(
                      (t) =>
                        `- ${t.completed ? "[x]" : "[ ]"} ${t.text} (${t.id})`
                    )
                    .join("\n"),
          },
        ],
        structuredContent: { todos: filtered },
      };
    }
  );

  server.tool(
    "edit_todo",
    "Edit a todo item",
    {
      id: z.string().min(1),
      text: z.string().min(1).optional(),
      completed: z.boolean().optional(),
    },
    async ({ id, text, completed }) => {
      const todo = todos.find((t) => t.id === id);
      if (!todo) {
        return {
          content: [{ type: "text", text: `Todo not found: ${id}` }],
          structuredContent: { error: "Todo not found", id },
        };
      }

      if (typeof text === "string") {
        todo.text = text;
      }
      if (typeof completed === "boolean") {
        todo.completed = completed;
      }
      todo.updatedAt = nowIso();

      return {
        content: [{ type: "text", text: `Updated todo: ${todo.text}` }],
        structuredContent: { todo },
      };
    }
  );

  return server;
};

const app = express();
app.use(express.json({ limit: "1mb" }));

const sessions: Record<
  string,
  { transport: StreamableHTTPServerTransport; server: McpServer }
> = {};

app.all("/mcp", async (req, res) => {
  try {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let session = sessionId ? sessions[sessionId] : undefined;
    let transport = session?.transport;

    if (!transport) {
      if (req.method !== "POST" || !isInitializeRequest(req.body)) {
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32600, message: "Invalid or missing session" },
          id: null,
        });
        return;
      }

      const server = createServer();

      const newTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          sessions[newSessionId] = { transport: newTransport, server };
        },
      });

      newTransport.onclose = () => {
        if (newTransport.sessionId) {
          delete sessions[newTransport.sessionId];
        }
      };

      await server.connect(newTransport);
      transport = newTransport;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP request failed", error);
    res.status(500).json({
      jsonrpc: "2.0",
      error: { code: -32603, message: "Internal error" },
      id: null,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Todo MCP server listening on http://localhost:${PORT}/mcp`);
});
