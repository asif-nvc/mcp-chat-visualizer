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
import * as storage from "./storage.js";

const API_BASE_URL =
  process.env.API_BASE_URL || "https://api.navigatechat.com";

const DIST_DIR = path.join(import.meta.dirname, ".");
const DIAGRAM_RESOURCE_URI = "ui://chat-visualizer/diagram.html";
const WHITEBOARD_RESOURCE_URI = "ui://chat-visualizer/whiteboard.html";

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
        "Create a NEW mind map diagram. ONLY use this for the FIRST diagram in a conversation. Pass diagram JSON (metadata, nodes, edges, hierarchy). Each node needs id + data with label, type (root/category/leaf), summary, hoverSummary. Use visualize_chat first for the schema. The response contains a public_id — you MUST remember it. For ANY subsequent changes (add nodes, remove nodes, rename, restructure), ALWAYS use update_public_diagram with that public_id. NEVER call create_public_diagram twice in the same conversation.",
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

      // Return the diagram JSON for widget rendering + metadata for the LLM
      const result = { ...parsedContent, _link: link, _public_id: public_id };
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result),
          },
          {
            type: "text" as const,
            text: `DIAGRAM CREATED. public_id="${public_id}" link="${link}". IMPORTANT: For any modifications to this diagram, use update_public_diagram with public_id="${public_id}". Do NOT create a new diagram.`,
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
        "Update an EXISTING diagram. Use this for ANY change to a previously created diagram: adding nodes, removing nodes, renaming, restructuring, expanding branches — any modification at all. Requires the public_id from the previous create_public_diagram call. The shareable URL stays the same. You must pass the COMPLETE updated JSON (not just the diff). To modify: take the original JSON, apply the user's requested changes, then pass the full updated JSON here with the same public_id.",
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

  // Whiteboard tools
  server.registerTool(
    "create_whiteboard",
    {
      title: "Create Whiteboard",
      description: "Create a new whiteboard with an infinite canvas. Whiteboards can hold multiple diagrams (images, mind maps, draw.io diagrams) that can be arranged and positioned on the canvas.",
      inputSchema: z.object({
        name: z.string().describe("The name/title for the whiteboard"),
      }),
    },
    async ({ name }) => {
      const whiteboard = await storage.createWhiteboard(name);
      const shareableLink = `/whiteboard/${whiteboard.id}`;
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ id: whiteboard.id, name: whiteboard.name, link: shareableLink }),
          },
          {
            type: "text" as const,
            text: `Whiteboard created: "${whiteboard.name}" (id: ${whiteboard.id}). Access at: ${shareableLink}`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "list_whiteboards",
    {
      title: "List Whiteboards",
      description: "List all whiteboards with their basic information (id, name, creation date, diagram count).",
      inputSchema: z.object({}),
    },
    async () => {
      const whiteboards = await storage.listWhiteboards();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(whiteboards.map(wb => ({
              ...wb,
              whiteboardUrl: `/whiteboard/${wb.id}`,
            })), null, 2),
          },
        ],
      };
    }
  );

  server.registerTool(
    "get_whiteboard",
    {
      title: "Get Whiteboard",
      description: "Get the full details of a whiteboard including all diagrams and their positions.",
      inputSchema: z.object({
        whiteboardId: z.string().describe("The ID of the whiteboard to retrieve"),
      }),
    },
    async ({ whiteboardId }) => {
      const whiteboard = await storage.getWhiteboard(whiteboardId);
      if (!whiteboard) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Whiteboard not found: ${whiteboardId}`,
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              ...whiteboard,
              whiteboardUrl: `/whiteboard/${whiteboardId}`,
            }),
          },
        ],
      };
    }
  );

  registerAppTool(
    server,
    "add_diagram_to_whiteboard",
    {
      title: "Add Diagram to Whiteboard",
      description: "Add a diagram (image URL, mind map JSON, or draw.io XML) to an existing whiteboard. The diagram will appear at the specified position on the infinite canvas.",
      inputSchema: {
        whiteboardId: z.string().describe("The ID of the whiteboard to add the diagram to"),
        diagramType: z.enum(["image", "mindmap", "drawio"]).describe("The type of diagram"),
        content: z.string().describe("The content: URL for images, JSON for mind maps, XML for drawio diagrams"),
        label: z.string().optional().describe("Optional label for the diagram"),
        x: z.number().describe("Initial X position on the canvas"),
        y: z.number().describe("Initial Y position on the canvas"),
        width: z.number().optional().describe("Width of the diagram (default: 400 for images, 500 for mindmap/drawio)"),
        height: z.number().optional().describe("Height of the diagram (default: 300 for images, 400 for mindmap/drawio)"),
      },
      _meta: {
        ui: { resourceUri: WHITEBOARD_RESOURCE_URI },
      },
    },
    async ({ whiteboardId, diagramType, content, label, x, y, width, height }) => {
      const defaultWidth = diagramType === "image" ? 400 : 500;
      const defaultHeight = diagramType === "image" ? 300 : 400;
      
      const diagram = await storage.addDiagram(whiteboardId, {
        type: diagramType,
        content,
        x,
        y,
        width: width || defaultWidth,
        height: height || defaultHeight,
        label,
      });
      
      if (!diagram) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to add diagram. Whiteboard not found: ${whiteboardId}`,
            },
          ],
          isError: true,
        };
      }
      
      const whiteboard = await storage.getWhiteboard(whiteboardId);
      const whiteboardUrl = `/whiteboard/${whiteboardId}`;
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              diagramId: diagram.id,
              whiteboardId: whiteboardId,
              whiteboardUrl: whiteboardUrl,
            }),
          },
        ],
      };
    }
  );

  registerAppTool(
    server,
    "update_diagram_position",
    {
      title: "Update Diagram Position",
      description: "Update the position and/or size of a diagram on a whiteboard.",
      inputSchema: {
        whiteboardId: z.string().describe("The ID of the whiteboard"),
        diagramId: z.string().describe("The ID of the diagram to update"),
        x: z.number().describe("New X position"),
        y: z.number().describe("New Y position"),
        width: z.number().optional().describe("New width"),
        height: z.number().optional().describe("New height"),
      },
      _meta: {
        ui: { resourceUri: WHITEBOARD_RESOURCE_URI },
      },
    },
    async ({ whiteboardId, diagramId, x, y, width, height }) => {
      const diagram = await storage.updateDiagramPosition(whiteboardId, diagramId, x, y, width, height);
      
      if (!diagram) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to update diagram. Whiteboard or diagram not found.`,
            },
          ],
          isError: true,
        };
      }
      
      const whiteboard = await storage.getWhiteboard(whiteboardId);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(whiteboard),
          },
        ],
      };
    }
  );

  server.registerTool(
    "delete_whiteboard",
    {
      title: "Delete Whiteboard",
      description: "Delete a whiteboard and all its diagrams.",
      inputSchema: z.object({
        whiteboardId: z.string().describe("The ID of the whiteboard to delete"),
      }),
    },
    async ({ whiteboardId }) => {
      const deleted = await storage.deleteWhiteboard(whiteboardId);
      if (!deleted) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Whiteboard not found: ${whiteboardId}`,
            },
          ],
          isError: true,
        };
      }
      return {
        content: [
          {
            type: "text" as const,
            text: `Whiteboard deleted: ${whiteboardId}`,
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

  // Whiteboard widget resource
  registerAppResource(
    server,
    WHITEBOARD_RESOURCE_URI,
    WHITEBOARD_RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async () => {
      const html = await fs.readFile(
        path.join(DIST_DIR, "whiteboard-widget.html"),
        "utf-8"
      );
      return {
        contents: [
          {
            uri: WHITEBOARD_RESOURCE_URI,
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

      // Existing session — route to its transport (GET for SSE, POST for requests)
      if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId)!;
        await session.transport.handleRequest(req, res);
        return;
      }

      // Unknown session ID — return 404 so client re-initializes
      if (sessionId && !sessions.has(sessionId)) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Session not found. Please reinitialize." }));
        return;
      }

      // No session ID
      if (req.method === "GET") {
        // GET without session ID — return server info (for discovery/health)
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          name: "mcp-chat-visualizer",
          version: "1.0.0",
          protocol: "mcp",
          description: "MCP server that visualizes conversations as hierarchical mind maps",
        }));
        return;
      }

      // POST without session ID — new connection, create session
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

  // Whiteboard page route - returns the whiteboard data for the widget
  const whiteboardMatch = req.url?.match(/^\/whiteboard\/([\w_]+)$/);
  if (whiteboardMatch) {
    const whiteboardId = whiteboardMatch[1];
    const whiteboard = await storage.getWhiteboard(whiteboardId);
    if (!whiteboard) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Whiteboard not found" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(whiteboard));
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

httpServer.listen(PORT, () => {
  console.log(`mcp-chat-visualizer running on port ${PORT}`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
});
