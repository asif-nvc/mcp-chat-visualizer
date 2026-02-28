#!/usr/bin/env node
import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import * as z from "zod/v4";
import { buildMindMapPrompt } from "./prompt.js";

const API_BASE_URL =
  process.env.API_BASE_URL || "https://api.navigatechat.com";

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
        "Visualize a conversation as a structured JSON mind map. Pass the conversation text. The tool returns exact instructions you MUST follow to produce raw JSON output. IMPORTANT: Output ONLY valid raw JSON — never output Mermaid, Markdown, or any other format.",
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

  server.registerTool(
    "create_public_diagram",
    {
      title: "Create Public Diagram",
      description:
        "Create a publicly shareable diagram link. Takes diagram JSON content (a NavigateChat mindmap/graph/sequence object) and returns a public URL that anyone can view without authentication.",
      inputSchema: z.object({
        json_content: z
          .union([z.string(), z.record(z.string(), z.any())])
          .describe(
            "The diagram JSON content — either a JSON string or an object with metadata, nodes, and edges"
          ),
      }),
    },
    async ({ json_content }) => {
      const body =
        typeof json_content === "string"
          ? { json_content: JSON.parse(json_content) }
          : { json_content };

      const response = await fetch(
        `${API_BASE_URL}/api/chat/diagram/public`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return {
          content: [
            {
              type: "text" as const,
              text: `Error creating public diagram (${response.status}): ${errorText}`,
            },
          ],
          isError: true,
        };
      }

      const data = await response.json();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                link: data.link,
                public_id: data.public_id,
                diagram_id: data.diagram_id,
                created_at: data.created_at,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "update_public_diagram",
    {
      title: "Update Public Diagram",
      description:
        "Update an existing public diagram's content at the same shareable link. Use this when a user wants to modify a previously created diagram — the URL stays the same and the TTL is extended.",
      inputSchema: z.object({
        public_id: z
          .string()
          .describe(
            "The public_id returned from a previous create_public_diagram call"
          ),
        json_content: z
          .union([z.string(), z.record(z.string(), z.any())])
          .describe(
            "The updated diagram JSON content — either a JSON string or an object with metadata, nodes, and edges"
          ),
      }),
    },
    async ({ public_id, json_content }) => {
      const body =
        typeof json_content === "string"
          ? { json_content: JSON.parse(json_content) }
          : { json_content };

      const response = await fetch(
        `${API_BASE_URL}/api/diagram/${public_id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return {
          content: [
            {
              type: "text" as const,
              text: `Error updating diagram (${response.status}): ${errorText}`,
            },
          ],
          isError: true,
        };
      }

      const data = await response.json();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                link: data.link,
                public_id: data.public_id,
                diagram_id: data.diagram_id,
                created_at: data.created_at,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "justify_content",
    {
      title: "Justify Content",
      description:
        "Validate and refactor JSON content to match the NavigateChat diagram structure. Pass raw or malformed diagram JSON and receive a corrected version that conforms to the expected schema.",
      inputSchema: z.object({
        user_json: z
          .string()
          .describe(
            "The JSON string to validate and refactor into NavigateChat diagram format"
          ),
      }),
    },
    async ({ user_json }) => {
      const response = await fetch(
        `${API_BASE_URL}/api/chat/justify_content`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_json }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return {
          content: [
            {
              type: "text" as const,
              text: `Error justifying content (${response.status}): ${errorText}`,
            },
          ],
          isError: true,
        };
      }

      const data = await response.json();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(data, null, 2),
          },
        ],
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
