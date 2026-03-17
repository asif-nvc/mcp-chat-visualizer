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

// Strip the ESM export and assign to global
sdkCode = sdkCode.replace(/export\s*\{[^}]*\}\s*;?\s*$/, `\nvar App = ${internalName};\n`);

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
    #container { width: 100%; min-height: 500px; }
    #diagram-frame { width: 100%; height: 500px; border: none; border-radius: 8px; display: none; }
    #loading { display: flex; align-items: center; justify-content: center; min-height: 60px; color: #999; font-size: 14px; }
    #error { display: none; padding: 12px; color: #f66; font-size: 13px; word-break: break-all; }
  </style>
</head>
<body>
  <div id="container">
    <div id="loading">Loading diagram...</div>
    <div id="error"></div>
    <iframe id="diagram-frame" allowfullscreen></iframe>
  </div>
  <script>`);

htmlParts.push(sdkCode);

htmlParts.push(`</script>
  <script>
    var loadingEl = document.getElementById("loading");
    var errorEl = document.getElementById("error");
    var frameEl = document.getElementById("diagram-frame");
    var containerEl = document.getElementById("container");

    function extractLink(text) {
      try {
        var obj = JSON.parse(text);
        if (obj.link) return obj.link;
      } catch(e) {}
      var match = text.match(/link:\\s*(https?:\\/\\/[^\\s"]+)/);
      return match ? match[1] : null;
    }

    function showDiagram(url) {
      loadingEl.style.display = "none";
      errorEl.style.display = "none";
      frameEl.src = url;
      frameEl.style.display = "block";
      containerEl.style.minHeight = "500px";
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
        loadingEl.textContent = "Generating diagram...";
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
          var link = extractLink(textContent);
          if (link) {
            showDiagram(link);
          } else if (result.isError) {
            showError(textContent);
          } else {
            showError("Could not extract diagram link from: " + textContent.substring(0, 200));
          }
        } catch(e) {
          showError("Error processing result: " + e.message);
        }
      };

      app.ontoolcancelled = function() {
        showError("Diagram generation cancelled");
      };

      app.onhostcontextchanged = function(ctx) {};

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
