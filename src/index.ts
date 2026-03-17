#!/usr/bin/env node
import crypto from "node:crypto";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  registerAppTool,
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import * as z from "zod/v4";
import { buildMindMapPrompt } from "./prompt.js";

const API_BASE_URL =
  process.env.API_BASE_URL || "https://api.navigatechat.com";

const DIST_DIR = path.join(import.meta.dirname, ".");
const DIAGRAM_RESOURCE_URI = "ui://chat-visualizer/diagram.html";

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

  registerAppTool(
    server,
    "create_public_diagram",
    {
      title: "Create Public Diagram",
      description:
        "Create a publicly shareable mind map diagram from a topic. Pass a topic string (e.g. 'Artificial Intelligence', 'History of Rome') and this tool returns instructions for generating the mind map JSON, which you MUST follow to produce the output. After generating the JSON, call create_public_diagram again with the generated JSON as json_content to publish it. Alternatively, pass pre-built diagram JSON directly to publish immediately.",
      inputSchema: {
        topic: z
          .string()
          .optional()
          .describe(
            "The topic to visualize as a mind map. When provided, returns prompt instructions for generating the diagram JSON."
          ),
        json_content: z
          .union([z.string(), z.record(z.string(), z.any())])
          .optional()
          .describe(
            "Pre-built diagram JSON to publish directly. Must have metadata, nodes (with label, type, summary, hoverSummary), edges, and hierarchy."
          ),
      },
      _meta: {
        ui: { resourceUri: DIAGRAM_RESOURCE_URI },
      },
    },
    async ({ topic, json_content }) => {
      // If topic is provided but no json_content, return the prompt instructions
      if (topic && !json_content) {
        const prompt = buildMindMapPrompt(topic);
        return {
          content: [
            {
              type: "text" as const,
              text: prompt + "\n\nIMPORTANT: After generating the JSON above, call create_public_diagram again with the generated JSON as the json_content parameter to publish it.",
            },
          ],
        };
      }

      // If json_content is provided, publish the diagram
      if (!json_content) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: Provide either a 'topic' string to generate a mind map, or 'json_content' with diagram JSON to publish.",
            },
          ],
          isError: true,
        };
      }

      const parsedContent =
        typeof json_content === "string"
          ? JSON.parse(json_content)
          : json_content;

      const response = await fetch(
        `${API_BASE_URL}/api/chat/diagram/public`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ json_content: parsedContent }),
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

  registerAppTool(
    server,
    "update_public_diagram",
    {
      title: "Update Public Diagram",
      description:
        "Update an existing public diagram's content at the same shareable link. Use this when a user wants to modify a previously created diagram — the URL stays the same and the TTL is extended.",
      inputSchema: {
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
      },
      _meta: {
        ui: { resourceUri: DIAGRAM_RESOURCE_URI },
      },
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

  registerAppResource(
    server,
    DIAGRAM_RESOURCE_URI,
    DIAGRAM_RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => {
      const html = await fs.readFile(
        path.join(DIST_DIR, "widget.html"),
        "utf-8"
      );
      return {
        contents: [
          {
            uri: DIAGRAM_RESOURCE_URI,
            mimeType: RESOURCE_MIME_TYPE,
            text: html,
            _meta: {
              ui: {
                prefersBorder: true,
              },
            },
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

// Session store: maps session IDs to their transport
const sessions = new Map<string, { transport: StreamableHTTPServerTransport }>();

function createSession(): StreamableHTTPServerTransport {
  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });

  transport.onclose = () => {
    const sid = transport.sessionId;
    if (sid) sessions.delete(sid);
  };

  server.connect(transport);
  return transport;
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
      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      // Existing session — route to its transport
      if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId)!;
        await session.transport.handleRequest(req, res);
        return;
      }

      // Unknown session ID — the client thinks it has a session but we don't
      // (e.g. after a redeploy). Return 404 so the client re-initializes.
      if (sessionId && !sessions.has(sessionId)) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Session not found. Please reinitialize." }));
        return;
      }

      // No session ID — new connection, create session
      const transport = createSession();
      await transport.handleRequest(req, res);

      // Store after init assigns a session ID
      const sid = transport.sessionId;
      if (sid) {
        sessions.set(sid, { transport });
      }
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
