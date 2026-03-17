#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = import.meta.dirname;
const DIST = path.join(ROOT, "..", "dist");

// NO SDK bundle — we implement the postMessage protocol directly
// This avoids any issues with the 320KB bundle crashing in sandbox

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;background:transparent;font-family:system-ui,-apple-system,sans-serif}
#status{padding:12px 16px;color:#888;font-size:13px}
#error{display:none;padding:12px 16px;color:#e55;font-size:13px}
#mindmap{display:none;width:100%}
#mindmap svg{width:100%;display:block}
#toolbar{display:none;padding:6px 10px;gap:6px;border-top:1px solid rgba(128,128,128,.2);justify-content:flex-end}
#toolbar button{padding:4px 10px;border-radius:5px;border:1px solid rgba(128,128,128,.3);background:0 0;color:inherit;font-size:11px;cursor:pointer}
#toolbar button:hover{background:rgba(128,128,128,.1)}
.tt{position:fixed;background:#1a1a2e;color:#eee;padding:6px 10px;border-radius:5px;font-size:11px;max-width:220px;pointer-events:none;z-index:99;display:none;box-shadow:0 2px 8px rgba(0,0,0,.4)}
</style>
</head>
<body>
<div id="status">Widget HTML loaded</div>
<noscript><div style="color:red;padding:12px">JavaScript is disabled in this sandbox</div></noscript>
<div id="error"></div>
<div id="mindmap"></div>
<div id="toolbar">
  <button id="btn-open">Open in NavigateChat</button>
  <button id="btn-fs">Fullscreen</button>
</div>
<div class="tt" id="tt"></div>
<script>document.getElementById("status").textContent="JS running";</script>
<script>
// ---- Minimal MCP Apps postMessage protocol ----
var reqId = 0;
var diagramLink = "";

function send(msg) { window.parent.postMessage(msg, "*"); }
function sendReq(method, params) { var id = ++reqId; send({jsonrpc:"2.0",id:id,method:method,params:params||{}}); return id; }
function sendNotif(method, params) { send({jsonrpc:"2.0",method:method,params:params||{}}); }
function sendResp(id, result) { send({jsonrpc:"2.0",id:id,result:result||{}}); }

// ---- SVG Renderer ----
var COLORS = ["#ef4444","#f97316","#eab308","#22c55e","#3b82f6","#a855f7"];
var ROOT_CLR = "#10a37f";
var HS = 280, VS = 10, NH = 36;

function buildAdj(edges) {
  var a={},p={};
  (edges||[]).forEach(function(e){if(!a[e.source])a[e.source]=[];a[e.source].push(e.target);p[e.target]=e.source;});
  return {a:a,p:p};
}

function stH(id,a) {
  var c=a[id]||[];
  if(!c.length) return NH;
  var t=0; c.forEach(function(ci){t+=stH(ci,a)+VS;}); return t-VS;
}

function lay(id,a,nm,x,y,d,pos) {
  pos[id]={x:x,y:y,d:d};
  var c=a[id]||[];
  if(!c.length)return;
  var tot=0,hs=[];
  c.forEach(function(ci){var h=stH(ci,a);tot+=h;hs.push(h);});
  tot+=(c.length-1)*VS;
  var sy=y-tot/2;
  c.forEach(function(ci,i){var cy=sy+hs[i]/2;lay(ci,a,nm,x+HS,cy,d+1,pos);sy+=hs[i]+VS;});
}

function mTxt(t,fs){return t.length*fs*0.55+24;}
function esc(s){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");}

function render(data) {
  var nodes=data.nodes||[],edges=data.edges||[];
  var nm={}; nodes.forEach(function(n){nm[n.id]=n;});
  var t=buildAdj(edges);
  var root=nodes.find(function(n){return !t.p[n.id];})||nodes[0];
  if(!root)return null;

  var pos={};
  lay(root.id,t.a,nm,40,0,0,pos);

  var mnX=1e9,mxX=-1e9,mnY=1e9,mxY=-1e9;
  Object.keys(pos).forEach(function(id){
    var p=pos[id],n=nm[id],lb=(n&&n.data&&n.data.label)||id,w=mTxt(lb,12);
    if(p.x-5<mnX)mnX=p.x-5;if(p.x+w+5>mxX)mxX=p.x+w+5;
    if(p.y-NH/2-5<mnY)mnY=p.y-NH/2-5;if(p.y+NH/2+5>mxY)mxY=p.y+NH/2+5;
  });

  var W=mxX-mnX+30,H=mxY-mnY+30,ox=-mnX+15,oy=-mnY+15;
  var s='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+W+' '+H+'">';
  s+='<g transform="translate('+ox+','+oy+')">';

  // edges
  edges.forEach(function(e){
    var sp=pos[e.source],tp=pos[e.target];if(!sp||!tp)return;
    var sn=nm[e.source],sl=(sn&&sn.data&&sn.data.label)||e.source,sw=mTxt(sl,12);
    var sx=sp.x+sw,sy=sp.y,tx=tp.x,ty=tp.y,mx=sx+(tx-sx)*0.5;
    s+='<path d="M'+sx+','+sy+' C'+mx+','+sy+' '+mx+','+ty+' '+tx+','+ty+'" fill="none" stroke="rgba(128,128,128,0.2)" stroke-width="1.5"/>';
  });

  // nodes
  Object.keys(pos).forEach(function(id){
    var p=pos[id],n=nm[id];if(!n)return;
    var lb=(n.data&&n.data.label)||id,tp=(n.data&&n.data.type)||"leaf";
    var sm=(n.data&&n.data.hoverSummary)||(n.data&&n.data.summary)||"";
    var w=mTxt(lb,12),clr=tp==="root"?ROOT_CLR:COLORS[p.d%COLORS.length];
    var rx=p.x,ry=p.y-NH/2;
    s+='<g class="nd" data-s="'+esc(sm)+'" style="cursor:default">';
    s+='<rect x="'+rx+'" y="'+ry+'" width="'+w+'" height="'+NH+'" rx="7" fill="rgba(25,25,25,0.7)" stroke="'+clr+'" stroke-width="'+(tp==="root"?2.5:1.5)+'"/>';
    s+='<text x="'+(rx+w/2)+'" y="'+(p.y+1)+'" text-anchor="middle" dominant-baseline="middle" font-size="'+(tp==="root"?13:11)+'" font-weight="'+(tp==="root"?"600":"400")+'" fill="#ddd">'+esc(lb)+'</text>';
    s+='</g>';
  });

  s+='</g></svg>';
  return {svg:s,w:W,h:H};
}

// ---- UI ----
var statusEl=document.getElementById("status");
var errorEl=document.getElementById("error");
var mmEl=document.getElementById("mindmap");
var tbEl=document.getElementById("toolbar");
var ttEl=document.getElementById("tt");

function showErr(m){statusEl.style.display="none";errorEl.textContent=m;errorEl.style.display="block";}
function log(m){statusEl.textContent=m;}

function showMindMap(data){
  var r=render(data);
  if(!r){showErr("Render failed");return;}
  statusEl.style.display="none";
  mmEl.innerHTML=r.svg;
  mmEl.style.display="block";
  tbEl.style.display="flex";

  // tooltips
  mmEl.querySelectorAll(".nd").forEach(function(el){
    el.addEventListener("mouseenter",function(ev){
      var s=el.getAttribute("data-s");
      if(s){ttEl.textContent=s;ttEl.style.display="block";ttEl.style.left=(ev.clientX+10)+"px";ttEl.style.top=(ev.clientY-28)+"px";}
    });
    el.addEventListener("mousemove",function(ev){ttEl.style.left=(ev.clientX+10)+"px";ttEl.style.top=(ev.clientY-28)+"px";});
    el.addEventListener("mouseleave",function(){ttEl.style.display="none";});
  });

  // tell host our size
  try{
    var el=document.documentElement;
    sendReq("ui/notifications/size-changed",{width:Math.ceil(el.scrollWidth),height:Math.ceil(el.scrollHeight)});
  }catch(e){}
}

// ---- Protocol handler ----
window.addEventListener("message", function(ev) {
  var msg = ev.data;
  if (!msg || msg.jsonrpc !== "2.0") return;

  // Initialize response from host
  if (msg.id && msg.result && msg.result.protocolVersion) {
    log("Connected...");
    sendNotif("ui/notifications/initialized");
    return;
  }

  // Tool input partial (streaming)
  if (msg.method === "ui/notifications/tool-input-partial") {
    log("Generating...");
    return;
  }

  // Tool input (final args)
  if (msg.method === "ui/notifications/tool-input") {
    log("Rendering...");
    return;
  }

  // Tool result — this is what we render
  if (msg.method === "ui/notifications/tool-result") {
    var params = msg.params || {};
    var content = params.content || [];
    var textBlock = content.find(function(c){return c.type==="text";});
    if (!textBlock || !textBlock.text) { showErr("No content received"); return; }

    try {
      var data = JSON.parse(textBlock.text);
      if (!data.nodes) { showErr("Invalid diagram data"); return; }
      diagramLink = data._link || "";
      showMindMap(data);
    } catch(e) {
      showErr("Parse error: " + e.message);
    }
    return;
  }

  // Cancelled
  if (msg.method === "ui/notifications/tool-cancelled") {
    showErr("Cancelled");
    return;
  }

  // Teardown
  if (msg.method === "ui/resource-teardown") {
    sendResp(msg.id, {});
    return;
  }

  // Host context changed (theme etc)
  if (msg.method === "ui/notifications/host-context-changed") {
    return;
  }
});

// Toolbar
document.getElementById("btn-open").onclick = function() {
  if (diagramLink) {
    sendReq("ui/open-link", {url: diagramLink});
  }
};
document.getElementById("btn-fs").onclick = function() {
  sendReq("ui/request-display-mode", {mode: "fullscreen"});
};

// Start handshake
sendReq("ui/initialize", {
  protocolVersion: "2025-03-26",
  appInfo: { name: "NavigateChat Mind Map", version: "1.0.0" },
  appCapabilities: {}
});
</script>
</body>
</html>`;

if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, "widget.html"), html, "utf-8");
console.log("Built dist/widget.html (" + Math.round(html.length/1024) + "KB, no SDK)");
