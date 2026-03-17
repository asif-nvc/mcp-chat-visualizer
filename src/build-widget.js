#!/usr/bin/env node
/**
 * Builds widget.html by inlining the @modelcontextprotocol/ext-apps App SDK.
 * Sandboxed iframes can't use ES modules, so we convert the ESM export to a global var.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = import.meta.dirname;
const DIST = path.join(ROOT, "..", "dist");

// Read the app-with-deps bundle (ESM with all deps inlined)
const sdkPath = path.join(ROOT, "..", "node_modules", "@modelcontextprotocol", "ext-apps", "dist", "src", "app-with-deps.js");
let sdkCode = fs.readFileSync(sdkPath, "utf-8");

// The bundle ends with export{...Uc as App}
// Find the internal class name for App and assign to global
const appMatch = sdkCode.match(/(\w+)\s+as\s+App[,}]/);
const internalName = appMatch ? appMatch[1] : null;
if (!internalName) throw new Error("Could not find App export in SDK bundle");

// Also find PostMessageTransport and applyDocumentTheme exports
const transportMatch = sdkCode.match(/(\w+)\s+as\s+PostMessageTransport[,}]/);
const transportName = transportMatch ? transportMatch[1] : "null";

// Strip the ESM export and assign to globals
sdkCode = sdkCode.replace(/export\s*\{[^}]*\}\s*;?\s*$/, `
var App = ${internalName};
var PostMessageTransport = ${transportName};
`);

// Build HTML parts separately to avoid template literal escaping issues
const htmlParts = [];

htmlParts.push(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NavigateChat Diagram</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; background: transparent; font-family: system-ui, -apple-system, sans-serif; }

    #loading {
      display: flex; align-items: center; justify-content: center;
      padding: 16px; color: #888; font-size: 14px;
    }

    #error {
      display: none; padding: 12px 16px;
      color: #e55; font-size: 13px; word-break: break-word;
    }

    #card {
      display: none;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 12px;
      overflow: hidden;
      background: rgba(255,255,255,0.04);
    }

    #card-header {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }

    #card-header svg { flex-shrink: 0; }

    #card-title {
      font-size: 14px; font-weight: 600;
      color: rgba(255,255,255,0.9);
    }

    #card-body { padding: 16px; }

    #card-link {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 16px;
      background: #4f8ff7; color: #fff;
      border-radius: 8px; text-decoration: none;
      font-size: 13px; font-weight: 500;
      cursor: pointer; border: none;
    }

    #card-link:hover { background: #3a7de8; }

    #card-meta {
      margin-top: 10px; font-size: 12px;
      color: rgba(255,255,255,0.45);
    }

    /* Light theme overrides */
    html[data-theme="light"] #card { border-color: rgba(0,0,0,0.1); background: rgba(0,0,0,0.02); }
    html[data-theme="light"] #card-header { border-bottom-color: rgba(0,0,0,0.06); }
    html[data-theme="light"] #card-title { color: rgba(0,0,0,0.85); }
    html[data-theme="light"] #card-meta { color: rgba(0,0,0,0.4); }
  </style>
</head>
<body>
  <div id="loading">Loading diagram...</div>
  <div id="error"></div>
  <div id="card">
    <div id="card-header">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #4f8ff7">
        <circle cx="12" cy="12" r="3"/>
        <line x1="12" y1="3" x2="12" y2="7"/>
        <line x1="12" y1="17" x2="12" y2="21"/>
        <line x1="3" y1="12" x2="7" y2="12"/>
        <line x1="17" y1="12" x2="21" y2="12"/>
        <line x1="5.6" y1="5.6" x2="8.5" y2="8.5"/>
        <line x1="15.5" y1="15.5" x2="18.4" y2="18.4"/>
        <line x1="5.6" y1="18.4" x2="8.5" y2="15.5"/>
        <line x1="15.5" y1="8.5" x2="18.4" y2="5.6"/>
      </svg>
      <span id="card-title">NavigateChat Mind Map</span>
    </div>
    <div id="card-body">
      <button id="card-link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
          <polyline points="15 3 21 3 21 9"/>
          <line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
        Open Interactive Diagram
      </button>
      <div id="card-meta"></div>
    </div>
  </div>

  <script>`);

htmlParts.push(sdkCode);

htmlParts.push(`</script>
  <script>
    var loadingEl = document.getElementById("loading");
    var errorEl = document.getElementById("error");
    var cardEl = document.getElementById("card");
    var cardTitleEl = document.getElementById("card-title");
    var cardLinkEl = document.getElementById("card-link");
    var cardMetaEl = document.getElementById("card-meta");

    function extractData(text) {
      try {
        return JSON.parse(text);
      } catch(e) {}
      // Fallback: extract link from text
      var match = text.match(/link['":]\\s*['"](https?:\\/\\/[^\\s"']+)/);
      return match ? { link: match[1] } : null;
    }

    function showCard(data) {
      loadingEl.style.display = "none";
      errorEl.style.display = "none";

      if (data.link) {
        cardLinkEl.onclick = function() {
          if (typeof app !== "undefined" && app.openLink) {
            app.openLink({ url: data.link });
          } else {
            window.open(data.link, "_blank");
          }
        };
      }

      var meta = [];
      if (data.public_id) meta.push("ID: " + data.public_id);
      if (data.created_at) meta.push(new Date(data.created_at).toLocaleString());
      cardMetaEl.textContent = meta.join(" · ");

      cardEl.style.display = "block";
    }

    function showError(msg) {
      loadingEl.style.display = "none";
      errorEl.textContent = msg;
      errorEl.style.display = "block";
    }

    try {
      var app = new App(
        { name: "NavigateChat Diagram Viewer", version: "1.0.0" },
        {},
        { autoResize: true }
      );

      app.ontoolinput = function(params) {
        loadingEl.textContent = "Creating diagram...";
      };

      app.ontoolresult = function(result) {
        try {
          var content = result && result.content;
          var textItem = content && content.find(function(c) { return c.type === "text"; });
          var textContent = textItem && textItem.text;
          if (!textContent) {
            showError("No content in tool result");
            return;
          }

          // If this is a prompt response (topic mode), don't show card
          if (textContent.indexOf("You are an expert") !== -1) {
            loadingEl.textContent = "Generating mind map JSON...";
            return;
          }

          var data = extractData(textContent);
          if (data && data.link) {
            showCard(data);
          } else if (result.isError) {
            showError(textContent);
          } else {
            showError("No diagram link found");
          }
        } catch(e) {
          showError("Error: " + e.message);
        }
      };

      app.ontoolcancelled = function() {
        showError("Cancelled");
      };

      app.onhostcontextchanged = function(ctx) {
        if (ctx.theme) {
          document.documentElement.setAttribute("data-theme", ctx.theme);
        }
      };

      app.connect().catch(function(err) {
        showError("Connection failed: " + err.message);
      });
    } catch(err) {
      showError("Init error: " + err.message);
    }
  </script>
</body>
</html>`);

const html = htmlParts.join("\n");

if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, "widget.html"), html, "utf-8");
console.log("Built dist/widget.html with inlined App SDK");
