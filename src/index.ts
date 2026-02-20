#!/usr/bin/env node
import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import * as z from "zod/v4";
import { buildMindMapPrompt } from "./prompt.js";

function createServer(): McpServer {
  const server = new McpServer({
    name: "chat-visualizer",
    version: "1.0.0",
  });

  server.registerTool(
    "visualize_chat",
    {
      title: "Visualize Chat",
      description:
        "Visualize a conversation as a hierarchical mind map. Pass the conversation text and receive structured instructions. Follow the returned instructions to generate the mind map JSON.",
      inputSchema: z.object({
        conversation: z
          .string()
          .describe(
            "The conversation text or summary to visualize as a mind map"
          ),
      }),
    },
    async ({ conversation }) => {
      const prompt = buildMindMapPrompt(conversation);
      return {
        content: [{ type: "text" as const, text: prompt }],
      };
    }
  );

  return server;
}

const PORT = Number(process.env.PORT) || 3000;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Accept, Authorization, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

function setCors(res: http.ServerResponse) {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(key, value);
  }
}

const httpServer = http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/mcp") {
    try {
      const server = createServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (err) {
      console.error("MCP request error:", err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    }
    return;
  }

  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", name: "mcp-chat-visualizer" }));
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

httpServer.listen(PORT, () => {
  console.log(`mcp-chat-visualizer running on port ${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
});
