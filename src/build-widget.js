#!/usr/bin/env node
/**
 * Builds widget.html by inlining the @modelcontextprotocol/ext-apps App SDK.
 * Renders mind maps directly using D3.js loaded from CDN.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = import.meta.dirname;
const DIST = path.join(ROOT, "..", "dist");

// Read the app-with-deps bundle
const sdkPath = path.join(ROOT, "..", "node_modules", "@modelcontextprotocol", "ext-apps", "dist", "src", "app-with-deps.js");
let sdkCode = fs.readFileSync(sdkPath, "utf-8");

// Find internal name for App export
const appMatch = sdkCode.match(/(\w+)\s+as\s+App[,}]/);
if (!appMatch) throw new Error("Could not find App export in SDK bundle");

// Strip ESM export and assign globals
sdkCode = sdkCode.replace(/export\s*\{[^}]*\}\s*;?\s*$/, `\nvar App = ${appMatch[1]};\n`);

const htmlParts = [];

htmlParts.push(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; background: transparent; font-family: system-ui, -apple-system, sans-serif; overflow: hidden; }

  #loading {
    display: flex; align-items: center; justify-content: center;
    padding: 24px; color: #888; font-size: 14px; gap: 8px;
  }
  #loading .spinner {
    width: 16px; height: 16px; border: 2px solid #444; border-top-color: #4f8ff7;
    border-radius: 50%; animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  #error { display: none; padding: 16px; color: #e55; font-size: 13px; }

  #mindmap-container { display: none; width: 100%; }
  #mindmap-container svg { width: 100%; display: block; }

  #toolbar {
    display: none; padding: 8px 12px; gap: 8px;
    border-top: 1px solid rgba(128,128,128,0.2);
    justify-content: flex-end;
  }
  #toolbar button {
    padding: 5px 12px; border-radius: 6px; border: 1px solid rgba(128,128,128,0.3);
    background: transparent; color: inherit; font-size: 12px; cursor: pointer;
    display: flex; align-items: center; gap: 4px;
  }
  #toolbar button:hover { background: rgba(128,128,128,0.1); }
</style>
</head>
<body>
<div id="loading"><div class="spinner"></div> Creating diagram...</div>
<div id="error"></div>
<div id="mindmap-container"></div>
<div id="toolbar">
  <button id="btn-open">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
    Open in NavigateChat
  </button>
  <button id="btn-fullscreen">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
    Fullscreen
  </button>
</div>

<script src="https://d3js.org/d3.v7.min.js" async></script>
<script>`);

htmlParts.push(sdkCode);

htmlParts.push(`</script>
<script>
var loadingEl = document.getElementById("loading");
var errorEl = document.getElementById("error");
var containerEl = document.getElementById("mindmap-container");
var toolbarEl = document.getElementById("toolbar");
var diagramLink = null;

function showError(msg) {
  loadingEl.style.display = "none";
  errorEl.textContent = msg;
  errorEl.style.display = "block";
}

function waitForD3(timeout) {
  return new Promise(function(resolve, reject) {
    var start = Date.now();
    (function check() {
      if (typeof d3 !== "undefined") return resolve();
      if (Date.now() - start > timeout) return reject(new Error("D3 load timeout"));
      setTimeout(check, 100);
    })();
  });
}

function buildTree(nodes, edges, hierarchy) {
  var nodeMap = {};
  nodes.forEach(function(n) { nodeMap[n.id] = n; });

  var rootNode = nodes.find(function(n) { return n.data && n.data.type === "root"; });
  if (!rootNode) rootNode = nodes[0];

  function buildChildren(parentId) {
    var childIds = hierarchy[parentId] || [];
    return childIds.map(function(cid) {
      var node = nodeMap[cid];
      if (!node) return null;
      return {
        id: node.id,
        name: node.data.label || node.id,
        summary: node.data.summary || "",
        hoverSummary: node.data.hoverSummary || "",
        type: node.data.type || "leaf",
        children: buildChildren(cid)
      };
    }).filter(Boolean);
  }

  return {
    id: rootNode.id,
    name: rootNode.data.label || "Root",
    summary: rootNode.data.summary || "",
    hoverSummary: rootNode.data.hoverSummary || "",
    type: "root",
    children: buildChildren(rootNode.id)
  };
}

async function renderMindMap(data) {
  await waitForD3(10000);

  var nodes = data.nodes || [];
  var edges = data.edges || [];
  var hierarchy = data.hierarchy || {};

  var treeData = buildTree(nodes, edges, hierarchy);

  var root = d3.hierarchy(treeData);

  // Calculate dimensions based on tree size
  var leafCount = root.leaves().length;
  var height = Math.max(400, leafCount * 28);
  var width = Math.max(600, root.height * 220 + 200);

  var treeLayout = d3.tree().size([height - 40, width - 200]);
  treeLayout(root);

  containerEl.innerHTML = "";

  var svg = d3.select(containerEl).append("svg")
    .attr("viewBox", "0 0 " + width + " " + height)
    .attr("preserveAspectRatio", "xMidYMid meet");

  var g = svg.append("g").attr("transform", "translate(100, 20)");

  // Draw links
  g.selectAll(".link")
    .data(root.links())
    .enter().append("path")
    .attr("class", "link")
    .attr("fill", "none")
    .attr("stroke", "rgba(128,128,128,0.3)")
    .attr("stroke-width", 1.5)
    .attr("d", d3.linkHorizontal()
      .x(function(d) { return d.y; })
      .y(function(d) { return d.x; })
    );

  // Color scale by depth
  var colors = ["#4f8ff7", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#ec4899"];

  // Draw nodes
  var nodeG = g.selectAll(".node")
    .data(root.descendants())
    .enter().append("g")
    .attr("class", "node")
    .attr("transform", function(d) { return "translate(" + d.y + "," + d.x + ")"; });

  nodeG.append("circle")
    .attr("r", function(d) { return d.depth === 0 ? 8 : 5; })
    .attr("fill", function(d) { return colors[d.depth % colors.length]; })
    .attr("stroke", "rgba(255,255,255,0.2)")
    .attr("stroke-width", 1);

  nodeG.append("text")
    .attr("dy", "0.35em")
    .attr("x", function(d) { return d.children ? -12 : 10; })
    .attr("text-anchor", function(d) { return d.children ? "end" : "start"; })
    .attr("font-size", function(d) { return d.depth === 0 ? "14px" : "11px"; })
    .attr("font-weight", function(d) { return d.depth === 0 ? "bold" : "normal"; })
    .attr("fill", "currentColor")
    .text(function(d) { return d.data.name; });

  // Add title tooltips
  nodeG.append("title")
    .text(function(d) { return d.data.hoverSummary || d.data.summary || d.data.name; });

  // Show and resize
  loadingEl.style.display = "none";
  containerEl.style.display = "block";
  toolbarEl.style.display = "flex";

  requestAnimationFrame(function() {
    var el = document.documentElement;
    var w = Math.ceil(el.scrollWidth);
    var h = Math.ceil(el.scrollHeight);
    if (app && app.sendSizeChanged) {
      app.sendSizeChanged({ width: w, height: h });
    }
  });
}

function extractResult(text) {
  try { return JSON.parse(text); } catch(e) {}
  return null;
}

// --- MCP App Setup ---
var app = new App({ name: "NavigateChat Mind Map", version: "1.0.0" });

app.ontoolinput = function(params) {
  loadingEl.querySelector(".spinner") || null;
};

app.ontoolresult = function(result) {
  try {
    var content = result && result.content;
    var textItem = content && content.find(function(c) { return c.type === "text"; });
    var text = textItem && textItem.text;

    if (!text) { showError("No content received"); return; }

    // Skip prompt responses (topic mode first call)
    if (text.indexOf("You are an expert") !== -1) {
      loadingEl.innerHTML = '<div class="spinner"></div> Generating mind map...';
      return;
    }

    var data = extractResult(text);

    // If it's a published diagram response (has link), extract the original JSON from input
    if (data && data.link) {
      diagramLink = data.link;

      // We need the diagram JSON — try to get it from the tool input
      // The ontoolinput should have the json_content
      if (window._pendingDiagramJson) {
        renderMindMap(window._pendingDiagramJson);
      } else {
        // Fallback: show a card linking to the diagram
        loadingEl.style.display = "none";
        containerEl.innerHTML = '<div style="padding:24px;text-align:center;color:#888">' +
          '<p style="margin-bottom:12px">Mind map created successfully!</p>' +
          '<button onclick="openDiagram()" style="padding:8px 20px;background:#4f8ff7;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px">Open Interactive Diagram</button></div>';
        containerEl.style.display = "block";
        toolbarEl.style.display = "flex";

        requestAnimationFrame(function() {
          var el = document.documentElement;
          if (app.sendSizeChanged) app.sendSizeChanged({ width: Math.ceil(el.scrollWidth), height: Math.ceil(el.scrollHeight) });
        });
      }
      return;
    }

    // If it's raw diagram JSON (has nodes/edges), render directly
    if (data && data.nodes) {
      window._pendingDiagramJson = data;
      renderMindMap(data);
      return;
    }

    showError("Unexpected response format");
  } catch(e) {
    showError("Error: " + e.message);
  }
};

app.ontoolinputpartial = function(params) {
  // Try to capture json_content from the tool input for later rendering
  if (params && params.arguments && params.arguments.json_content) {
    try {
      var jc = params.arguments.json_content;
      var parsed = typeof jc === "string" ? JSON.parse(jc) : jc;
      if (parsed && parsed.nodes) window._pendingDiagramJson = parsed;
    } catch(e) {}
  }
};

app.ontoolinput = function(params) {
  if (params && params.arguments && params.arguments.json_content) {
    try {
      var jc = params.arguments.json_content;
      var parsed = typeof jc === "string" ? JSON.parse(jc) : jc;
      if (parsed && parsed.nodes) window._pendingDiagramJson = parsed;
    } catch(e) {}
  }
};

app.ontoolcancelled = function() { showError("Cancelled"); };

app.onhostcontextchanged = function(ctx) {
  if (ctx && ctx.theme) document.documentElement.setAttribute("data-theme", ctx.theme);
};

window.openDiagram = function() {
  if (diagramLink && app.openLink) app.openLink({ url: diagramLink });
};

document.getElementById("btn-open").onclick = function() {
  if (diagramLink && app.openLink) app.openLink({ url: diagramLink });
};

document.getElementById("btn-fullscreen").onclick = function() {
  if (app.requestDisplayMode) app.requestDisplayMode({ mode: "fullscreen" });
};

app.connect();
</script>
</body>
</html>`);

const html = htmlParts.join("\n");

if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, "widget.html"), html, "utf-8");
console.log("Built dist/widget.html with inlined App SDK + D3 mind map renderer");
