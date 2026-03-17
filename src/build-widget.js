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

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NavigateChat Diagram</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; overflow: hidden; background: transparent; }
    #container {
      width: 100%;
      height: 500px;
      position: relative;
    }
    #diagram-frame {
      width: 100%;
      height: 500px;
      border: none;
      border-radius: 8px;
    }
    #loading {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 500px;
      font-family: system-ui, -apple-system, sans-serif;
      color: #999;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div id="container">
    <div id="loading">Loading diagram...</div>
    <iframe id="diagram-frame" style="display:none;" allowfullscreen></iframe>
  </div>

  <script>
    // Inlined @modelcontextprotocol/ext-apps App SDK
    ${sdkCode}
  </script>
  <script>
    const loadingEl = document.getElementById("loading");
    const frameEl = document.getElementById("diagram-frame");

    function extractLink(text) {
      try {
        const obj = JSON.parse(text);
        if (obj.link) return obj.link;
      } catch {}
      const match = text.match(/link:\\s*(https?:\\/\\/[^\\s]+)/);
      return match ? match[1] : null;
    }

    function showDiagram(url) {
      loadingEl.style.display = "none";
      frameEl.src = url;
      frameEl.style.display = "block";
    }

    function showError(msg) {
      loadingEl.textContent = msg;
      loadingEl.style.color = "#f66";
    }

    try {
      const app = new App({ name: "NavigateChat Diagram Viewer", version: "1.0.0" }, {}, { autoResize: false });

      app.ontoolinput = (params) => {
        // Try to extract link from input args early
        loadingEl.textContent = "Generating diagram...";
      };

      app.ontoolresult = (result) => {
        const textContent = result?.content?.find(c => c.type === "text")?.text;
        if (textContent) {
          const link = extractLink(textContent);
          if (link) {
            showDiagram(link);
          } else if (result?.isError) {
            showError("Error: " + textContent);
          } else {
            showError("No diagram link found");
          }
        }
      };

      app.ontoolcancelled = () => {
        showError("Diagram generation cancelled");
      };

      app.onhostcontextchanged = (ctx) => {};

      app.connect().catch((err) => {
        showError("Connection failed: " + err.message);
      });
    } catch (err) {
      loadingEl.textContent = "Error: " + err.message;
      loadingEl.style.color = "#f66";
    }
  </script>
</body>
</html>`;

if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, "widget.html"), html, "utf-8");
console.log("Built dist/widget.html with inlined App SDK");
