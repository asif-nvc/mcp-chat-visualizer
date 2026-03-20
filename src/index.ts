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
        "Create and display an interactive mind map diagram. Pass the diagram JSON content (with metadata, nodes, edges, hierarchy). Each node must have id and data with label, type (root/category/leaf), summary, and hoverSummary. The tool renders the mind map inline and publishes it to a shareable link. IMPORTANT: Use visualize_chat first to get the correct JSON schema, then pass the generated JSON here. CRITICAL: The response includes a public_id — if the user asks to modify the diagram, you MUST use update_public_diagram with that public_id instead of creating a new one.",
      inputSchema: {
        json_content: z
          .union([z.string(), z.record(z.string(), z.any())])
          .describe(
            "The mind map JSON with metadata, nodes (each with data.label, data.type, data.summary, data.hoverSummary), edges, and hierarchy"
          ),
      },
      _meta: {
        ui: { resourceUri: DIAGRAM_RESOURCE_URI },
      },
    },
    async ({ json_content }) => {
      const parsedContent =
        typeof json_content === "string"
          ? JSON.parse(json_content)
          : json_content;

      // Publish to NavigateChat API
      let link = "";
      let public_id = "";
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/chat/diagram/public`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ json_content: parsedContent }),
          }
        );
        if (response.ok) {
          const data = await response.json();
          link = data.link || "";
          public_id = data.public_id || "";
        }
      } catch {
        // Publishing failed, still return the JSON for widget rendering
      }

      // Return the diagram JSON as text — the widget renders it directly
      // (same pattern as draw.io returning XML)
      const result = { ...parsedContent, _link: link, _public_id: public_id };
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result),
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
        "Update an existing public diagram at the SAME shareable link. ALWAYS use this instead of create_public_diagram when the user wants to modify, add to, remove from, or change an existing diagram. Requires the public_id from the original create_public_diagram response. The URL stays the same and the TTL is extended. Use visualize_chat with the modification request to regenerate the full JSON, then pass it here with the original public_id.",
      inputSchema: {
        public_id: z
          .string()
          .describe(
            "The public_id from the original create_public_diagram response. This MUST be the same public_id to update the existing diagram."
          ),
        json_content: z
          .union([z.string(), z.record(z.string(), z.any())])
          .describe(
            "The complete updated diagram JSON with metadata, nodes (each with data.label, data.type, data.summary, data.hoverSummary), edges, and hierarchy"
          ),
      },
      _meta: {
        ui: { resourceUri: DIAGRAM_RESOURCE_URI },
      },
    },
    async ({ public_id, json_content }) => {
      const parsedContent =
        typeof json_content === "string"
          ? JSON.parse(json_content)
          : json_content;

      const response = await fetch(
        `${API_BASE_URL}/api/diagram/${public_id}`,
        {
          method: "PUT",
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
              text: `Error updating diagram (${response.status}): ${errorText}`,
            },
          ],
          isError: true,
        };
      }

      const data = await response.json();
      // Return full JSON for widget rendering (same as create)
      const result = {
        ...parsedContent,
        _link: data.link || "",
        _public_id: data.public_id || public_id,
      };
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result),
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
