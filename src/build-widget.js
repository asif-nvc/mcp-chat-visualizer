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
    html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
    #diagram-frame {
      width: 100%;
      height: 100%;
      border: none;
      border-radius: 8px;
    }
    #loading {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      font-family: system-ui, -apple-system, sans-serif;
      color: #666;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div id="loading">Loading diagram...</div>
  <iframe id="diagram-frame" style="display:none;" allowfullscreen></iframe>

  <script>
    // Inlined @modelcontextprotocol/ext-apps App SDK
    ${sdkCode}
  </script>
  <script>
    // Use the App class from the inlined SDK
    // The bundle defines App in the module scope — we access it via the last defined class
    const app = new App({ name: "NavigateChat Diagram Viewer", version: "1.0.0" }, {}, { autoResize: true });

    function extractLink(text) {
      try {
        const obj = JSON.parse(text);
        if (obj.link) return obj.link;
      } catch {}
      const match = text.match(/link:\\s*(https?:\\/\\/[^\\s]+)/);
      return match ? match[1] : null;
    }

    function showDiagram(url) {
      document.getElementById("loading").style.display = "none";
      const frame = document.getElementById("diagram-frame");
      frame.src = url;
      frame.style.display = "block";
    }

    app.ontoolresult = (result) => {
      const textContent = result?.content?.find(c => c.type === "text")?.text;
      if (textContent) {
        const link = extractLink(textContent);
        if (link) showDiagram(link);
      }
    };

    app.ontoolcancelled = () => {
      document.getElementById("loading").textContent = "Diagram cancelled.";
    };

    app.onhostcontextchanged = (ctx) => {};

    app.connect();
  </script>
</body>
</html>`;

if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, "widget.html"), html, "utf-8");
console.log("Built dist/widget.html with inlined App SDK");
