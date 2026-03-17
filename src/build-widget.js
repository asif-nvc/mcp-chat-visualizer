#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = import.meta.dirname;
const DIST = path.join(ROOT, "..", "dist");

const sdkPath = path.join(ROOT, "..", "node_modules", "@modelcontextprotocol", "ext-apps", "dist", "src", "app-with-deps.js");
let sdkCode = fs.readFileSync(sdkPath, "utf-8");

const appMatch = sdkCode.match(/(\w+)\s+as\s+App[,}]/);
if (!appMatch) throw new Error("Could not find App export");
sdkCode = sdkCode.replace(/export\s*\{[^}]*\}\s*;?\s*$/, `\nvar App = ${appMatch[1]};\n`);

const htmlParts = [];

htmlParts.push(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;background:transparent;font-family:system-ui,-apple-system,sans-serif;overflow:hidden}
#loading{display:flex;align-items:center;justify-content:center;padding:20px;color:#888;font-size:14px;gap:8px}
.spinner{width:16px;height:16px;border:2px solid #444;border-top-color:#4f8ff7;border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
#error{display:none;padding:16px;color:#e55;font-size:13px}
#mindmap{display:none;width:100%}
#mindmap svg{width:100%;display:block}
#toolbar{display:none;padding:6px 10px;gap:6px;border-top:1px solid rgba(128,128,128,.2);justify-content:flex-end}
#toolbar button{padding:4px 10px;border-radius:5px;border:1px solid rgba(128,128,128,.3);background:0 0;color:inherit;font-size:11px;cursor:pointer;display:flex;align-items:center;gap:4px}
#toolbar button:hover{background:rgba(128,128,128,.1)}
.node-tooltip{position:absolute;background:#1a1a2e;color:#eee;padding:8px 12px;border-radius:6px;font-size:11px;max-width:250px;pointer-events:none;z-index:10;box-shadow:0 2px 8px rgba(0,0,0,.3);opacity:0;transition:opacity .15s}
</style>
</head>
<body>
<div id="loading"><div class="spinner"></div>Creating diagram...</div>
<div id="error"></div>
<div id="mindmap"></div>
<div id="toolbar">
  <button id="btn-open" title="Open in NavigateChat">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
    Open in NavigateChat
  </button>
  <button id="btn-fs" title="Fullscreen">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
  </button>
</div>
<div class="node-tooltip" id="tooltip"></div>
<script>`);

htmlParts.push(sdkCode);

htmlParts.push(`</script>
<script>
// ---- Pure SVG Mind Map Renderer (no external deps) ----
// Ported from NavigateChat frontend layout-utils.ts

var COLORS = ["#ef4444","#f97316","#eab308","#22c55e","#3b82f6","#a855f7"];
var ROOT_COLOR = "#10a37f";
var H_SPACING = 300;
var V_SPACING = 10;
var NODE_H = 40;
var NODE_PADDING_X = 16;
var NODE_PADDING_Y = 8;

function buildAdj(edges) {
  var adj = {}, parent = {};
  (edges||[]).forEach(function(e) {
    if (!adj[e.source]) adj[e.source] = [];
    if (adj[e.source].indexOf(e.target) === -1) adj[e.source].push(e.target);
    parent[e.target] = e.source;
  });
  return { adj: adj, parent: parent };
}

function findRoot(nodes, parentMap) {
  var r = nodes.find(function(n) { return !parentMap[n.id]; });
  return r || nodes[0];
}

function subtreeHeight(nodeId, adj, nodeMap) {
  var children = adj[nodeId] || [];
  if (children.length === 0) return NODE_H;
  var total = 0;
  children.forEach(function(cid) { total += subtreeHeight(cid, adj, nodeMap) + V_SPACING; });
  return total - V_SPACING;
}

function layoutTree(nodeId, adj, nodeMap, x, y, depth, positions) {
  positions[nodeId] = { x: x, y: y, depth: depth };
  var children = adj[nodeId] || [];
  if (children.length === 0) return;
  var totalH = 0;
  var heights = children.map(function(cid) { var h = subtreeHeight(cid, adj, nodeMap); totalH += h; return h; });
  totalH += (children.length - 1) * V_SPACING;
  var startY = y - totalH / 2;
  children.forEach(function(cid, i) {
    var cy = startY + heights[i] / 2;
    layoutTree(cid, adj, nodeMap, x + H_SPACING, cy, depth + 1, positions);
    startY += heights[i] + V_SPACING;
  });
}

function measureText(text, fontSize) {
  // Approximate: 0.6 * fontSize per char
  return text.length * fontSize * 0.58 + NODE_PADDING_X * 2;
}

function renderMindMap(data) {
  var nodes = data.nodes || [];
  var edges = data.edges || [];
  var nodeMap = {};
  nodes.forEach(function(n) { nodeMap[n.id] = n; });

  var tree = buildAdj(edges);
  var root = findRoot(nodes, tree.parent);
  if (!root) return;

  var positions = {};
  layoutTree(root.id, tree.adj, nodeMap, 60, 0, 0, positions);

  // Calculate bounds
  var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  Object.keys(positions).forEach(function(id) {
    var p = positions[id];
    var n = nodeMap[id];
    var label = (n && n.data && n.data.label) || id;
    var w = measureText(label, 13);
    if (p.x - 10 < minX) minX = p.x - 10;
    if (p.x + w + 10 > maxX) maxX = p.x + w + 10;
    if (p.y - NODE_H/2 - 10 < minY) minY = p.y - NODE_H/2 - 10;
    if (p.y + NODE_H/2 + 10 > maxY) maxY = p.y + NODE_H/2 + 10;
  });

  var svgW = maxX - minX + 40;
  var svgH = maxY - minY + 40;
  var offsetX = -minX + 20;
  var offsetY = -minY + 20;

  var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + svgW + ' ' + svgH + '" style="background:transparent">';
  svg += '<g transform="translate(' + offsetX + ',' + offsetY + ')">';

  // Draw edges
  edges.forEach(function(e) {
    var sp = positions[e.source], tp = positions[e.target];
    if (!sp || !tp) return;
    var sn = nodeMap[e.source], tn = nodeMap[e.target];
    var sLabel = (sn && sn.data && sn.data.label) || e.source;
    var sw = measureText(sLabel, 13);
    var sx = sp.x + sw;
    var sy = sp.y;
    var tx = tp.x;
    var ty = tp.y;
    var mx = sx + (tx - sx) * 0.5;
    svg += '<path d="M' + sx + ',' + sy + ' C' + mx + ',' + sy + ' ' + mx + ',' + ty + ' ' + tx + ',' + ty + '" fill="none" stroke="rgba(128,128,128,0.25)" stroke-width="1.5"/>';
  });

  // Draw nodes
  Object.keys(positions).forEach(function(id) {
    var p = positions[id];
    var n = nodeMap[id];
    if (!n) return;
    var label = (n.data && n.data.label) || id;
    var summary = (n.data && n.data.hoverSummary) || (n.data && n.data.summary) || "";
    var type = (n.data && n.data.type) || "leaf";
    var w = measureText(label, 13);
    var h = NODE_H;
    var color = type === "root" ? ROOT_COLOR : COLORS[p.depth % COLORS.length];
    var rx = p.x, ry = p.y - h/2;

    svg += '<g class="mm-node" data-id="' + id + '" data-summary="' + summary.replace(/"/g, "&quot;") + '">';
    svg += '<rect x="' + rx + '" y="' + ry + '" width="' + w + '" height="' + h + '" rx="8" ';
    svg += 'fill="rgba(30,30,30,0.6)" stroke="' + color + '" stroke-width="' + (type === "root" ? 2.5 : 1.5) + '"/>';
    svg += '<text x="' + (rx + w/2) + '" y="' + (p.y + 1) + '" text-anchor="middle" dominant-baseline="middle" ';
    svg += 'font-size="' + (type === "root" ? 14 : 12) + '" font-weight="' + (type === "root" ? "bold" : "normal") + '" fill="#e0e0e0">';
    svg += label.replace(/&/g,"&amp;").replace(/</g,"&lt;");
    svg += '</text></g>';
  });

  svg += '</g></svg>';
  return svg;
}

// ---- MCP App Wiring ----
var loadingEl = document.getElementById("loading");
var errorEl = document.getElementById("error");
var mindmapEl = document.getElementById("mindmap");
var toolbarEl = document.getElementById("toolbar");
var tooltipEl = document.getElementById("tooltip");
var diagramLink = "";

function showError(msg) {
  loadingEl.style.display = "none";
  errorEl.textContent = msg;
  errorEl.style.display = "block";
}

var app = new App({ name: "NavigateChat Mind Map", version: "1.0.0" });

app.ontoolresult = function(result) {
  try {
    var textItem = result.content && result.content.find(function(c) { return c.type === "text"; });
    var text = textItem && textItem.text;
    if (!text) { showError("No content"); return; }

    var data;
    try { data = JSON.parse(text); } catch(e) { showError("Invalid JSON"); return; }

    if (!data.nodes || !data.edges) { showError("Missing nodes/edges"); return; }

    diagramLink = data._link || "";

    var svgHtml = renderMindMap(data);
    if (!svgHtml) { showError("Could not render mind map"); return; }

    loadingEl.style.display = "none";
    mindmapEl.innerHTML = svgHtml;
    mindmapEl.style.display = "block";
    toolbarEl.style.display = "flex";

    // Tooltip on hover
    mindmapEl.querySelectorAll(".mm-node").forEach(function(el) {
      el.style.cursor = "pointer";
      el.addEventListener("mouseenter", function(evt) {
        var s = el.getAttribute("data-summary");
        if (s) {
          tooltipEl.textContent = s;
          tooltipEl.style.opacity = "1";
          tooltipEl.style.left = (evt.clientX + 12) + "px";
          tooltipEl.style.top = (evt.clientY - 30) + "px";
        }
      });
      el.addEventListener("mouseleave", function() { tooltipEl.style.opacity = "0"; });
    });

    // Tell host our size
    requestAnimationFrame(function() {
      var el = document.documentElement;
      app.sendSizeChanged({ width: Math.ceil(el.scrollWidth), height: Math.ceil(el.scrollHeight) });
    });
  } catch(e) {
    showError("Error: " + e.message);
  }
};

app.ontoolcancelled = function() { showError("Cancelled"); };
app.onhostcontextchanged = function() {};

document.getElementById("btn-open").onclick = function() {
  if (diagramLink && app.openLink) app.openLink({ url: diagramLink });
};
document.getElementById("btn-fs").onclick = function() {
  if (app.requestDisplayMode) app.requestDisplayMode({ mode: "fullscreen" });
};

app.connect();
</script>
</body>
</html>`);

const html = htmlParts.join("\n");
if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, "widget.html"), html, "utf-8");
console.log("Built dist/widget.html (" + Math.round(html.length/1024) + "KB)");
