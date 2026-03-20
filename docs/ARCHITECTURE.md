# MCP Chat Visualizer — Architecture Documentation

## Overview

MCP Chat Visualizer is an MCP (Model Context Protocol) server that transforms conversations into interactive, hierarchical mind maps rendered directly inside Claude's chat interface. It uses the **MCP Apps** extension to display an inline SVG-based mind map widget with pan, zoom, collapse/expand, node dragging, and a details panel — all without leaving the conversation.

The server is deployed as a remote HTTP endpoint (Railway) and connects to Claude via the **Connectors** feature on claude.ai.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     claude.ai (Host)                     │
│                                                         │
│  User: "Create a mind map about cats"                   │
│           │                                              │
│           ▼                                              │
│  ┌─────────────────┐    JSON-RPC / HTTP     ┌─────────┐│
│  │   Claude LLM     │◄────────────────────►│  MCP     ││
│  │                   │   (StreamableHTTP)    │  Server  ││
│  │  1. calls         │                       │          ││
│  │     visualize_chat│                       │ Railway  ││
│  │  2. generates JSON│                       │          ││
│  │  3. calls         │                       └─────────┘│
│  │     create_public │                                   │
│  │     _diagram      │                                   │
│  └─────────┬─────────┘                                   │
│            │                                              │
│            ▼                                              │
│  ┌─────────────────────────────────────────┐             │
│  │         MCP Apps Widget (iframe)         │             │
│  │                                          │             │
│  │  ┌────────────────────────────────────┐ │             │
│  │  │     SVG Mind Map Renderer          │ │             │
│  │  │  • Tree layout (linear/radial)     │ │             │
│  │  │  • Pan, zoom, drag nodes           │ │             │
│  │  │  • Click → details panel           │ │             │
│  │  │  • Hover → tooltips                │ │             │
│  │  │  • Collapse/expand                 │ │             │
│  │  │  • Dark/light theme                │ │             │
│  │  └────────────────────────────────────┘ │             │
│  │  ┌────────────────────────────────────┐ │             │
│  │  │  Toolbar: Zoom | Layout | Theme    │ │             │
│  │  │  Open in NavigateChat | Fullscreen │ │             │
│  │  └────────────────────────────────────┘ │             │
│  └─────────────────────────────────────────┘             │
│            │                                              │
│            │ postMessage (JSON-RPC)                       │
│            ▼                                              │
│  Host receives size changes, link opens, etc.            │
└─────────────────────────────────────────────────────────┘
                         │
                         │ HTTPS
                         ▼
              ┌─────────────────────┐
              │  NavigateChat API    │
              │  api.navigatechat.com│
              │                     │
              │  POST /api/chat/    │
              │    diagram/public   │
              │  PUT /api/diagram/  │
              │    :public_id       │
              │  POST /api/chat/    │
              │    justify_content  │
              └─────────────────────┘
```

---

## How It Works — Step by Step

### Phase 1: Schema Generation

1. **User asks** Claude to create a mind map (e.g., "mind map about cats")
2. **Claude calls `visualize_chat`** with the topic text
3. The tool returns a **structured prompt** (from `src/prompt.ts`) that instructs Claude to generate mind map JSON following the exact NavigateChat schema
4. Claude follows the prompt and **generates valid JSON** with:
   - `metadata` — topic, contentType, nodeCount
   - `nodes[]` — each with `id`, `data.label`, `data.type`, `data.summary`, `data.hoverSummary`
   - `edges[]` — each with `id`, `source`, `target`
   - `hierarchy` — parent-to-children mapping

### Phase 2: Publishing & Inline Rendering

5. **Claude calls `create_public_diagram`** with the generated JSON
6. The server **publishes** the JSON to the NavigateChat API (`POST /api/chat/diagram/public`), receiving a shareable link
7. The server returns the **full diagram JSON + link** as the tool result text (same pattern as draw.io returning XML)
8. Because `create_public_diagram` is registered with `_meta.ui.resourceUri`, the **host (claude.ai) renders the MCP Apps widget**:
   - Fetches the HTML resource from `ui://chat-visualizer/diagram.html`
   - Renders it in a sandboxed iframe
   - The widget receives the tool result via `postMessage` JSON-RPC
   - The widget parses the JSON and **renders an interactive SVG mind map** inline

---

## MCP Protocol Details

### Transport: Streamable HTTP with Sessions

The server uses `StreamableHTTPServerTransport` with session management:

```
Client                          Server
  │                                │
  │  POST /mcp (no session ID)    │
  │  { initialize }               │
  │──────────────────────────────►│
  │                                │  Creates McpServer + Transport
  │  200 + Mcp-Session-Id header  │  Generates session UUID
  │◄──────────────────────────────│
  │                                │
  │  POST /mcp                     │
  │  Mcp-Session-Id: <uuid>       │
  │  { tools/list }                │
  │──────────────────────────────►│  Routes to existing session
  │                                │
  │  POST /mcp                     │
  │  { tools/call: create_public  │
  │    _diagram }                  │
  │──────────────────────────────►│  Executes tool, returns result
  │                                │
  │  GET /mcp                      │
  │  Mcp-Session-Id: <uuid>       │
  │──────────────────────────────►│  SSE stream for notifications
```

**Session lifecycle:**
- New connection (no `Mcp-Session-Id` header) → creates a new `McpServer` + `StreamableHTTPServerTransport` with a random UUID session ID
- Subsequent requests include `Mcp-Session-Id` header → routed to the existing session
- Stale session ID (e.g., after redeploy) → returns 404, client re-initializes
- Session cleaned up on transport close

### Tools Registered

| Tool | Type | MCP Apps | Description |
|------|------|----------|-------------|
| `visualize_chat` | `server.registerTool` | No | Returns prompt instructions for the LLM to generate schema-compliant mind map JSON |
| `create_public_diagram` | `registerAppTool` | Yes | Publishes diagram JSON to NavigateChat API, returns full JSON for widget rendering |
| `update_public_diagram` | `registerAppTool` | Yes | Updates an existing diagram at the same shareable URL |
| `justify_content` | `server.registerTool` | No | Validates/normalizes raw JSON to NavigateChat schema |

### MCP Apps Extension

Tools registered with `registerAppTool` include `_meta.ui.resourceUri` pointing to `ui://chat-visualizer/diagram.html`. When the host calls such a tool:

1. The host sees the `_meta.ui.resourceUri` in the `tools/list` response
2. On tool call, the host fetches the HTML resource via `resources/read`
3. The HTML is rendered in a **sandboxed iframe** with `allow-scripts`
4. The host sends tool results to the iframe via `postMessage` JSON-RPC

---

## Widget Architecture

### File: `src/build-widget.js`

A build script that generates `dist/widget.html` — a **self-contained 24KB HTML file** with zero external dependencies. No SDK bundle, no CDN loads.

### postMessage Protocol (Raw Implementation)

The widget implements the MCP Apps postMessage protocol directly instead of using the `@modelcontextprotocol/ext-apps` App SDK (which at 320KB was crashing in the sandbox). The protocol is JSON-RPC 2.0 over `window.parent.postMessage`:

```
Widget (iframe)                          Host (claude.ai)
     │                                        │
     │  ui/initialize (request)               │
     │  { protocolVersion, appInfo,           │
     │    appCapabilities }                   │
     │───────────────────────────────────────►│
     │                                        │
     │  initialize response                   │
     │  { protocolVersion, hostInfo,          │
     │    hostCapabilities, hostContext }      │
     │◄───────────────────────────────────────│
     │                                        │
     │  ui/notifications/initialized          │
     │───────────────────────────────────────►│
     │                                        │
     │  ui/notifications/tool-input-partial   │  (streaming)
     │◄───────────────────────────────────────│
     │                                        │
     │  ui/notifications/tool-input           │  (final args)
     │◄───────────────────────────────────────│
     │                                        │
     │  ui/notifications/tool-result          │  (tool output)
     │◄───────────────────────────────────────│
     │                                        │
     │  Widget parses JSON, renders SVG       │
     │                                        │
     │  ui/notifications/size-changed         │  (report height)
     │───────────────────────────────────────►│
     │                                        │
     │  ui/open-link (request)                │  (Open in NavigateChat)
     │───────────────────────────────────────►│
     │                                        │
     │  ui/request-display-mode               │  (Fullscreen)
     │───────────────────────────────────────►│
```

### SVG Mind Map Renderer

The widget includes a **pure SVG renderer** ported from the NavigateChat frontend's layout algorithms (`layout-utils.ts`). No D3, no React Flow — just math and SVG string building.

**Two layout algorithms:**

1. **Linear (Horizontal Tree)**
   - Root node on the left, children branch to the right
   - Recursive subtree height calculation for balanced spacing
   - Horizontal spacing: 280px between levels
   - Vertical spacing: 12px between siblings
   - Edges: cubic Bezier curves

2. **Radial (Circular)**
   - Root at center (0, 0)
   - Children distributed in concentric circles
   - Angle distribution weighted by subtree descendant count
   - Radius increases per level (280px base, 220px increment)
   - Edges: straight lines

**Rendering pipeline:**
```
Mind Map JSON
    │
    ▼
buildTree(data)          → builds adjacency list + parent map
    │
    ▼
calcLayout()             → runs linear or radial layout algorithm
    │                      → applies custom positions from drag overrides
    ▼
renderSVG()              → generates SVG string with:
    │                      • Bezier/straight edges
    │                      • Rounded rect nodes with colored borders
    │                      • Text labels
    │                      • Collapse indicators (+/−)
    │                      • Selection glow
    ▼
innerHTML = svg          → inject into DOM
    │
    ▼
applyTransform()         → CSS transform for pan + zoom
    │
    ▼
bindNodeEvents()         → attach click, dblclick, drag, hover handlers
    │
    ▼
reportSize()             → tell host our dimensions
```

### Interactivity Features

| Feature | Trigger | Behavior |
|---------|---------|----------|
| **Select node** | Click | Opens details panel with summary, type badge, children list |
| **Collapse/Expand** | Double-click | Hides/shows descendants, recalculates layout |
| **Hover tooltip** | Mouse enter | Shows label, type badge, hoverSummary |
| **Drag node** | Mouse down + move | Repositions node, edges follow in real-time |
| **Pan canvas** | Drag empty area | Translates the viewport |
| **Zoom** | Scroll wheel | Scales around cursor position (0.1x – 3x) |
| **Fit view** | Toolbar button | Auto-scales and centers the diagram |
| **Layout switch** | Toolbar button | Toggles between linear and radial |
| **Reset positions** | Toolbar button | Clears drag overrides, re-applies auto layout |
| **Dark/Light mode** | Toolbar button | Toggles theme, SVG nodes adapt |
| **Open in NavigateChat** | Toolbar button | Uses `ui/open-link` to open shareable URL |
| **Fullscreen** | Toolbar button | Uses `ui/request-display-mode` |

### Color Scheme

Matches NavigateChat's frontend exactly:

**Dark mode (default):**
| Element | Color |
|---------|-------|
| Background | `#212121` |
| Node fill | `#2f2f2f` |
| Shell/toolbar | `#171717` |
| Borders/edges | `#424242` |
| Text | `#ececec` |
| Muted text | `#8e8e8e` |

**Light mode:**
| Element | Color |
|---------|-------|
| Background | `#ffffff` |
| Node fill | `#ffffff` |
| Shell/toolbar | `#f9f9f9` |
| Borders/edges | `#e5e5e5` |
| Text | `#0d0d0d` |
| Muted text | `#6b6b6b` |

**Node border colors (by tree depth):**
| Level | Color |
|-------|-------|
| Root | `#10a37f` (teal) |
| 0 | `#ef4444` (red) |
| 1 | `#f97316` (orange) |
| 2 | `#eab308` (yellow) |
| 3 | `#22c55e` (green) |
| 4 | `#3b82f6` (blue) |
| 5 | `#a855f7` (purple) |

---

## Mind Map JSON Schema

```json
{
  "metadata": {
    "topic": "Cats",
    "contentType": "mindmap",
    "nodeCount": 25
  },
  "nodes": [
    {
      "id": "root",
      "data": {
        "label": "Cats",
        "type": "root",
        "summary": "Domestic cats are small carnivorous mammals...",
        "hoverSummary": "Overview of domestic cats"
      }
    },
    {
      "id": "breeds",
      "data": {
        "label": "Breeds",
        "type": "category",
        "summary": "There are over 70 recognized cat breeds...",
        "hoverSummary": "Major cat breed categories"
      }
    },
    {
      "id": "persian",
      "data": {
        "label": "Persian",
        "type": "leaf",
        "summary": "Persian cats are known for their long fur...",
        "hoverSummary": "Long-haired luxury breed"
      }
    }
  ],
  "edges": [
    { "id": "e1", "source": "root", "target": "breeds", "type": "connects" },
    { "id": "e2", "source": "breeds", "target": "persian", "type": "connects" }
  ],
  "hierarchy": {
    "root": ["breeds"],
    "breeds": ["persian"]
  }
}
```

**Node types:**
- `root` — central topic (1 per diagram)
- `category` — high-level grouping (4-6 recommended)
- `leaf` — specific detail or fact

**Required fields per node:**
- `id` — unique identifier
- `data.label` — short display text (1-4 words)
- `data.type` — one of root/category/leaf
- `data.summary` — detailed description (2-3 sentences)
- `data.hoverSummary` — one-line tooltip text

---

## File Structure

```
src/
├── index.ts           # HTTP server, MCP server, session management,
│                      # tool registration, resource serving
├── prompt.ts          # Mind map generation prompt template
└── build-widget.js    # Build script: generates dist/widget.html
                       # with SVG renderer, layout algorithms,
                       # interactivity, and postMessage protocol

dist/                  # Built output (gitignored)
├── index.js           # Compiled server
├── prompt.js          # Compiled prompt
└── widget.html        # Self-contained 24KB MCP Apps widget
```

---

## Deployment

**Railway** (`railway.toml`):
- Build: `npm install && npm run build`
- Start: `npm start`
- Health check: `GET /health`

**Environment variables:**
- `PORT` — HTTP port (Railway sets this automatically, default 3000)
- `API_BASE_URL` — NavigateChat API base (default `https://api.navigatechat.com`)

**Endpoints:**
- `POST /mcp` — MCP protocol endpoint (Streamable HTTP)
- `GET /mcp` — SSE stream for session notifications
- `GET /health` — Health check
- `GET /` — Health check (alias)

---

## Connecting to Claude

### claude.ai (Web)

Settings → Connectors → Add custom connector:
```
URL: https://mcp-chat-visualizer-production-dcf6.up.railway.app/mcp
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

### Claude Code (CLI)

```bash
claude mcp add chat-visualizer -- npx mcp-chat-visualizer
```

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/sdk` | MCP server framework (McpServer, StreamableHTTPServerTransport) |
| `@modelcontextprotocol/ext-apps` | MCP Apps extension (registerAppTool, registerAppResource, RESOURCE_MIME_TYPE) |
| `zod` (v4) | Input schema validation for tool parameters |

---

## Design Decisions

### Why raw postMessage instead of the App SDK?

The `@modelcontextprotocol/ext-apps` App SDK bundle (`app-with-deps.js`) is 320KB of minified JavaScript. When inlined into the widget HTML, it crashed silently in the MCP Apps sandbox — likely due to the sandbox's CSP restrictions on eval or module-scoped variables. The raw postMessage protocol is ~200 lines of vanilla JS and works reliably.

### Why SVG instead of Canvas/React Flow?

The NavigateChat frontend uses React Flow (React + ReactFlow library), which requires React, ReactDOM, and the ReactFlow package — far too large to bundle into a widget. Pure SVG string building with vanilla JS gives us the same visual output at a fraction of the size (24KB total), with full interactivity.

### Why session-based transport?

The initial stateless approach (new McpServer per request) caused `getClientCapabilities()` to return `undefined`, because the client's capabilities from the `initialize` request weren't preserved for subsequent `tools/list` and `resources/read` calls. Session-based transport maintains state across the full MCP lifecycle.

### Why two-step tool flow (visualize_chat → create_public_diagram)?

The LLM cannot reliably generate NavigateChat's exact JSON schema without explicit prompt instructions. `visualize_chat` returns a detailed prompt with the exact schema, field requirements, and constraints. The LLM follows this prompt to generate valid JSON, which is then passed to `create_public_diagram` for rendering and publishing. This ensures correct JSON every time.
