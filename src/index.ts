#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { buildMindMapPrompt } from "./prompt.js";

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
        .describe("The conversation text or summary to visualize as a mind map"),
    }),
  },
  async ({ conversation }) => {
    const prompt = buildMindMapPrompt(conversation);
    return {
      content: [{ type: "text" as const, text: prompt }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
