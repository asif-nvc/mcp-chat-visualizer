# mcp-chat-visualizer

An MCP (Model Context Protocol) server that visualizes conversations as structured hierarchical mind maps.

When you call the `visualize_chat` tool, it injects a mind map generation prompt into the conversation. The LLM then generates a structured JSON mind map of your chat — no API keys or external calls needed.

## Installation

```bash
npm install -g mcp-chat-visualizer
```

Or use directly with `npx`:

```bash
npx mcp-chat-visualizer
```

## Setup

Add to your MCP client config (Claude Code, Claude Desktop, etc.):

```json
{
  "mcpServers": {
    "chat-visualizer": {
      "command": "npx",
      "args": ["mcp-chat-visualizer"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add chat-visualizer -- npx mcp-chat-visualizer
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "chat-visualizer": {
      "command": "npx",
      "args": ["mcp-chat-visualizer"]
    }
  }
}
```

## Usage

Once configured, ask your LLM to visualize the conversation:

> "Visualize this conversation as a mind map"

The LLM will call the `visualize_chat` tool and generate a JSON mind map like:

```json
{
  "metadata": { "topic": "...", "contentType": "mindmap", "nodeCount": 12 },
  "nodes": [
    { "id": "root", "data": { "label": "Main Topic", "type": "root", "summary": "...", "hoverSummary": "..." } },
    { "id": "cat1", "data": { "label": "Category", "type": "category", "summary": "...", "hoverSummary": "..." } },
    { "id": "leaf1", "data": { "label": "Detail", "type": "leaf", "summary": "...", "hoverSummary": "..." } }
  ],
  "edges": [
    { "id": "e1", "source": "root", "target": "cat1", "type": "connects" },
    { "id": "e2", "source": "cat1", "target": "leaf1", "type": "connects" }
  ],
  "hierarchy": {
    "root": ["cat1"],
    "cat1": ["leaf1"]
  }
}
```

## JSON Schema

| Field | Description |
|-------|-------------|
| `metadata` | Topic name, content type, total node count |
| `nodes` | Array of nodes with `id`, `label`, `type` (root/category/leaf), `summary`, `hoverSummary` |
| `edges` | Connections between nodes (`source` → `target`) |
| `hierarchy` | Parent-children mapping matching the edges |

### Node Types

- **root** — Central topic of the conversation
- **category** — High-level grouping (4-6 per map)
- **leaf** — Specific details, facts, or examples

The mind map goes 3-4 levels deep: Root → Categories → Sub-categories → Leaves.

## How It Works

1. You ask the LLM to visualize the conversation
2. The LLM calls the `visualize_chat` tool with the conversation text
3. The tool returns structured prompt instructions
4. The LLM follows the instructions and generates the mind map JSON
5. You get the JSON in the chat, ready to use in your UI

No external API calls. No API keys. The server is a lightweight prompt delivery mechanism — the LLM does all the generation.

## License

ISC
