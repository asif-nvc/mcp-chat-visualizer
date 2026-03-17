#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = import.meta.dirname;
const DIST = path.join(ROOT, "..", "dist");

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:transparent;font-family:system-ui,-apple-system,sans-serif;overflow:hidden;color:#e0e0e0}

/* Container */
#wrap{width:100%;height:100%;position:relative;overflow:hidden}
#canvas{width:100%;height:100%;cursor:grab;overflow:hidden}
#canvas:active{cursor:grabbing}
#canvas svg{transform-origin:0 0}

/* Status */
#status{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;justify-content:center;padding:16px;color:#888;font-size:13px;gap:8px;z-index:5}
.spin{width:14px;height:14px;border:2px solid #444;border-top-color:#4f8ff7;border-radius:50%;animation:sp .7s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}

/* Error */
#err{display:none;position:absolute;top:0;left:0;right:0;padding:14px;color:#e55;font-size:12px;z-index:5;text-align:center}

/* Toolbar */
#tb{position:absolute;bottom:0;left:0;right:0;display:none;padding:6px 10px;gap:5px;background:rgba(20,20,20,0.85);backdrop-filter:blur(8px);border-top:1px solid rgba(255,255,255,0.08);z-index:10;justify-content:space-between;align-items:center}
#tb .g{display:flex;gap:4px;align-items:center}
#tb button{padding:4px 8px;border-radius:5px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.05);color:#ccc;font-size:11px;cursor:pointer;display:flex;align-items:center;gap:3px;transition:background .15s}
#tb button:hover{background:rgba(255,255,255,0.12)}
#tb .sep{width:1px;height:16px;background:rgba(255,255,255,0.1);margin:0 2px}

/* Details panel */
#details{display:none;position:absolute;top:0;right:0;width:280px;height:100%;background:rgba(20,20,20,0.92);backdrop-filter:blur(12px);border-left:1px solid rgba(255,255,255,0.08);z-index:20;overflow-y:auto;padding:16px;font-size:12px}
#details .close{position:absolute;top:8px;right:8px;background:none;border:none;color:#888;cursor:pointer;font-size:16px;padding:4px}
#details .close:hover{color:#fff}
#details h3{font-size:15px;font-weight:600;margin-bottom:4px;color:#fff}
#details .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;text-transform:uppercase;margin-bottom:10px}
#details .summary{color:#aaa;line-height:1.5;margin-bottom:12px}
#details .children-title{font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px}
#details .child-item{padding:5px 8px;border-radius:4px;background:rgba(255,255,255,0.04);margin-bottom:3px;cursor:pointer;font-size:11px;color:#bbb;transition:background .15s}
#details .child-item:hover{background:rgba(255,255,255,0.08);color:#fff}

/* Tooltip */
.tt{position:fixed;background:rgba(15,15,25,0.95);color:#ddd;padding:8px 12px;border-radius:7px;font-size:11px;max-width:240px;pointer-events:none;z-index:50;display:none;box-shadow:0 4px 16px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.06);line-height:1.4}
.tt .tt-label{font-weight:600;color:#fff;margin-bottom:3px;font-size:12px}
.tt .tt-type{display:inline-block;padding:1px 6px;border-radius:3px;font-size:9px;text-transform:uppercase;margin-bottom:5px;font-weight:600}

/* Light theme */
html[data-theme="light"]{color:#222}
html[data-theme="light"] #tb{background:rgba(255,255,255,0.9)}
html[data-theme="light"] #tb button{border-color:rgba(0,0,0,0.1);background:rgba(0,0,0,0.03);color:#444}
html[data-theme="light"] #details{background:rgba(255,255,255,0.95);border-left-color:rgba(0,0,0,0.08)}
html[data-theme="light"] #details h3{color:#111}
html[data-theme="light"] #details .summary{color:#555}
html[data-theme="light"] .tt{background:rgba(255,255,255,0.97);color:#333;border-color:rgba(0,0,0,0.08)}
html[data-theme="light"] .tt .tt-label{color:#111}
</style>
</head>
<body>
<div id="wrap">
  <div id="status"><div class="spin"></div>Loading diagram...</div>
  <div id="err"></div>
  <div id="canvas"></div>
  <div id="tb">
    <div class="g">
      <button id="z-in" title="Zoom in">+</button>
      <button id="z-out" title="Zoom out">−</button>
      <button id="z-fit" title="Fit view">⊡ Fit</button>
      <div class="sep"></div>
      <button id="z-linear" title="Linear layout">☰ Linear</button>
      <button id="z-radial" title="Radial layout">◎ Radial</button>
    </div>
    <div class="g">
      <button id="btn-open">↗ Open in NavigateChat</button>
      <button id="btn-fs">⛶</button>
    </div>
  </div>
  <div id="details">
    <button class="close" id="det-close">×</button>
    <h3 id="det-title"></h3>
    <div class="badge" id="det-badge"></div>
    <div class="summary" id="det-summary"></div>
    <div class="children-title" id="det-ch-title"></div>
    <div id="det-children"></div>
  </div>
</div>
<div class="tt" id="tt"></div>

<script>
// ========== CONFIG ==========
var COLORS=["#ef4444","#f97316","#eab308","#22c55e","#3b82f6","#a855f7"];
var BADGE_COLORS={root:"#10a37f",category:"#3b82f6",leaf:"#8b5cf6"};
var ROOT_CLR="#10a37f";
var HS=280,VS=12,NH=38,RADIAL_BASE=280,RADIAL_INC=220;

// ========== STATE ==========
var graphData=null,nodeMap={},adjList={},parentMap={},positions={};
var collapsed={},currentLayout="linear",diagramLink="",selectedId=null;
var scale=1,panX=0,panY=0,isDragging=false,dragStartX=0,dragStartY=0,dragPanX=0,dragPanY=0;

// ========== LAYOUT: LINEAR ==========
function stH(id){var c=(adjList[id]||[]).filter(function(x){return !collapsed[id];}); if(collapsed[id])c=[];else c=adjList[id]||[];if(!c.length)return NH;var t=0;c.forEach(function(ci){t+=stH(ci)+VS;});return t-VS;}

function layLinear(id,x,y,d){
  positions[id]={x:x,y:y,d:d};
  if(collapsed[id])return;
  var c=adjList[id]||[];if(!c.length)return;
  var tot=0,hs=[];c.forEach(function(ci){var h=stH(ci);tot+=h;hs.push(h);});
  tot+=(c.length-1)*VS;var sy=y-tot/2;
  c.forEach(function(ci,i){var cy=sy+hs[i]/2;layLinear(ci,x+HS,cy,d+1);sy+=hs[i]+VS;});
}

// ========== LAYOUT: RADIAL ==========
function countDesc(id){if(collapsed[id])return 1;var c=adjList[id]||[];if(!c.length)return 1;var t=1;c.forEach(function(ci){t+=countDesc(ci);});return t;}

function layRadial(id,cx,cy,startA,endA,radius,d){
  positions[id]={x:cx,y:cy,d:d};
  if(collapsed[id])return;
  var c=adjList[id]||[];if(!c.length)return;
  var weights=c.map(function(ci){return countDesc(ci);});
  var totalW=0;weights.forEach(function(w){totalW+=w;});
  var angleRange=endA-startA,curA=startA;
  c.forEach(function(ci,i){
    var share=weights[i]/totalW*angleRange;
    var midA=curA+share/2;
    var nx=cx+radius*Math.cos(midA);
    var ny=cy+radius*Math.sin(midA);
    layRadial(ci,nx,ny,curA,curA+share,radius+RADIAL_INC*(d<2?1:0.7),d+1);
    curA+=share;
  });
}

// ========== BUILD TREE ==========
function buildTree(data){
  nodeMap={};adjList={};parentMap={};
  (data.nodes||[]).forEach(function(n){nodeMap[n.id]=n;});
  (data.edges||[]).forEach(function(e){
    if(!adjList[e.source])adjList[e.source]=[];
    if(adjList[e.source].indexOf(e.target)===-1)adjList[e.source].push(e.target);
    parentMap[e.target]=e.source;
  });
}

function findRoot(){
  var nodes=graphData.nodes||[];
  var r=nodes.find(function(n){return !parentMap[n.id];});
  return r||nodes[0];
}

function calcLayout(){
  positions={};
  var root=findRoot();if(!root)return;
  if(currentLayout==="radial"){
    layRadial(root.id,0,0,0,Math.PI*2,RADIAL_BASE,0);
  }else{
    layLinear(root.id,40,0,0);
  }
}

// ========== RENDER SVG ==========
function mW(t,fs){return Math.max(60,t.length*fs*0.55+28);}
function esc(s){return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");}

function renderSVG(){
  calcLayout();
  var ids=Object.keys(positions);if(!ids.length)return "";
  var mnX=1e9,mxX=-1e9,mnY=1e9,mxY=-1e9;
  ids.forEach(function(id){
    var p=positions[id],n=nodeMap[id],lb=(n&&n.data&&n.data.label)||id,w=mW(lb,12);
    mnX=Math.min(mnX,p.x-10);mxX=Math.max(mxX,p.x+w+10);
    mnY=Math.min(mnY,p.y-NH/2-10);mxY=Math.max(mxY,p.y+NH/2+10);
  });
  var W=mxX-mnX+40,H=mxY-mnY+40,ox=-mnX+20,oy=-mnY+20;

  var s='<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'">';
  s+='<g transform="translate('+ox+','+oy+')">';

  // Edges
  (graphData.edges||[]).forEach(function(e){
    var sp=positions[e.source],tp=positions[e.target];if(!sp||!tp)return;
    if(collapsed[parentMap[e.target]]&&parentMap[e.target]!==e.source)return;
    if(collapsed[e.source])return;
    var sn=nodeMap[e.source],sl=(sn&&sn.data&&sn.data.label)||e.source,sw=mW(sl,12);
    if(currentLayout==="radial"){
      s+='<line x1="'+sp.x+'" y1="'+sp.y+'" x2="'+tp.x+'" y2="'+tp.y+'" stroke="rgba(128,128,128,0.15)" stroke-width="1.5"/>';
    }else{
      var sx=sp.x+sw,sy=sp.y,tx=tp.x,ty=tp.y,mx=sx+(tx-sx)*0.5;
      s+='<path d="M'+sx+','+sy+' C'+mx+','+sy+' '+mx+','+ty+' '+tx+','+ty+'" fill="none" stroke="rgba(128,128,128,0.2)" stroke-width="1.5"/>';
    }
  });

  // Nodes
  ids.forEach(function(id){
    var p=positions[id],n=nodeMap[id];if(!n)return;
    var lb=(n.data&&n.data.label)||id,tp=(n.data&&n.data.type)||"leaf";
    var w=mW(lb,12),clr=tp==="root"?ROOT_CLR:COLORS[p.d%COLORS.length];
    var isCollapsed=collapsed[id]&&(adjList[id]||[]).length>0;
    var isSelected=selectedId===id;
    var rx=currentLayout==="radial"?p.x-w/2:p.x;
    var ry=p.y-NH/2;

    s+='<g class="nd" data-id="'+id+'" style="cursor:pointer">';

    // Selection glow
    if(isSelected){
      s+='<rect x="'+(rx-3)+'" y="'+(ry-3)+'" width="'+(w+6)+'" height="'+(NH+6)+'" rx="10" fill="none" stroke="'+clr+'" stroke-width="1" opacity="0.3"/>';
    }

    // Node box
    s+='<rect x="'+rx+'" y="'+ry+'" width="'+w+'" height="'+NH+'" rx="8" ';
    s+='fill="rgba(25,25,30,0.8)" stroke="'+clr+'" stroke-width="'+(tp==="root"?2.5:isSelected?2:1.5)+'" ';
    s+='style="transition:stroke-width 0.15s"/>';

    // Label
    s+='<text x="'+(rx+w/2)+'" y="'+(p.y+1)+'" text-anchor="middle" dominant-baseline="middle" ';
    s+='font-size="'+(tp==="root"?13:11)+'" font-weight="'+(tp==="root"?"600":"400")+'" fill="#ddd">'+esc(lb)+'</text>';

    // Collapse indicator
    if((adjList[id]||[]).length>0){
      var ix=rx+w-2,iy=ry-2;
      s+='<circle cx="'+ix+'" cy="'+iy+'" r="7" fill="rgba(25,25,30,0.9)" stroke="'+clr+'" stroke-width="1"/>';
      s+='<text x="'+ix+'" y="'+(iy+1)+'" text-anchor="middle" dominant-baseline="middle" font-size="9" fill="#ccc">'+(isCollapsed?"+":"−")+'</text>';
    }

    s+='</g>';
  });

  s+='</g></svg>';
  return s;
}

// ========== PAN & ZOOM ==========
function applyTransform(){
  var svg=document.querySelector("#canvas svg");
  if(svg)svg.style.transform="translate("+panX+"px,"+panY+"px) scale("+scale+")";
}

function zoomBy(delta,cx,cy){
  var oldS=scale;
  scale=Math.max(0.1,Math.min(3,scale+delta));
  var ratio=scale/oldS;
  panX=cx-(cx-panX)*ratio;
  panY=cy-(cy-panY)*ratio;
  applyTransform();
}

function fitView(){
  var svg=document.querySelector("#canvas svg");
  var wrap=document.getElementById("canvas");
  if(!svg||!wrap)return;
  var sw=parseFloat(svg.getAttribute("width")),sh=parseFloat(svg.getAttribute("height"));
  var ww=wrap.clientWidth,wh=wrap.clientHeight;
  scale=Math.min(ww/sw,wh/sh,1.5)*0.9;
  panX=(ww-sw*scale)/2;
  panY=(wh-sh*scale)/2;
  applyTransform();
}

// ========== DETAILS PANEL ==========
function showDetails(id){
  var n=nodeMap[id];if(!n)return;
  selectedId=id;
  document.getElementById("det-title").textContent=(n.data&&n.data.label)||id;
  var tp=(n.data&&n.data.type)||"leaf";
  var badge=document.getElementById("det-badge");
  badge.textContent=tp;badge.style.background=BADGE_COLORS[tp]||"#666";badge.style.color="#fff";
  document.getElementById("det-summary").textContent=(n.data&&n.data.summary)||"No details available.";
  var children=adjList[id]||[];
  var chTitle=document.getElementById("det-ch-title");
  var chList=document.getElementById("det-children");
  chList.innerHTML="";
  if(children.length){
    chTitle.textContent="Children ("+children.length+")";chTitle.style.display="block";
    children.forEach(function(cid){
      var cn=nodeMap[cid];if(!cn)return;
      var div=document.createElement("div");div.className="child-item";
      div.textContent=(cn.data&&cn.data.label)||cid;
      div.onclick=function(){showDetails(cid);redraw();};
      chList.appendChild(div);
    });
  }else{chTitle.style.display="none";}
  document.getElementById("details").style.display="block";
  redraw();
}

function hideDetails(){selectedId=null;document.getElementById("details").style.display="none";redraw();}

// ========== TOOLTIP ==========
var ttEl=document.getElementById("tt");
function showTT(ev,id){
  var n=nodeMap[id];if(!n)return;
  var tp=(n.data&&n.data.type)||"leaf";
  var hs=(n.data&&n.data.hoverSummary)||(n.data&&n.data.summary)||"";
  var clr=BADGE_COLORS[tp]||"#666";
  ttEl.innerHTML='<div class="tt-label">'+esc((n.data&&n.data.label)||id)+'</div><div class="tt-type" style="background:'+clr+';color:#fff">'+tp+'</div>'+(hs?'<div>'+esc(hs)+'</div>':'');
  ttEl.style.display="block";
  ttEl.style.left=Math.min(ev.clientX+12,window.innerWidth-260)+"px";
  ttEl.style.top=(ev.clientY-10)+"px";
}
function hideTT(){ttEl.style.display="none";}

// ========== MAIN DRAW ==========
function redraw(){
  var svg=renderSVG();
  document.getElementById("canvas").innerHTML=svg;
  applyTransform();
  bindNodeEvents();
}

function bindNodeEvents(){
  document.querySelectorAll(".nd").forEach(function(el){
    var id=el.getAttribute("data-id");
    el.addEventListener("click",function(ev){
      ev.stopPropagation();
      // Click on collapse indicator?
      var bbox=el.getBoundingClientRect();
      showDetails(id);
    });
    el.addEventListener("dblclick",function(ev){
      ev.stopPropagation();
      if((adjList[id]||[]).length>0){
        collapsed[id]=!collapsed[id];
        redraw();fitView();
      }
    });
    el.addEventListener("mouseenter",function(ev){showTT(ev,id);});
    el.addEventListener("mousemove",function(ev){ttEl.style.left=Math.min(ev.clientX+12,window.innerWidth-260)+"px";ttEl.style.top=(ev.clientY-10)+"px";});
    el.addEventListener("mouseleave",hideTT);
  });
}

// ========== INIT ==========
function initDiagram(data){
  graphData=data;
  buildTree(data);
  diagramLink=data._link||"";
  document.getElementById("status").style.display="none";
  document.getElementById("tb").style.display="flex";
  redraw();
  setTimeout(fitView,50);
  // Tell host our size
  try{
    var el=document.documentElement;
    sendNotif("ui/notifications/size-changed",{width:Math.ceil(el.scrollWidth),height:Math.max(400,Math.ceil(el.scrollHeight))});
  }catch(e){}
}

// ========== EVENT BINDINGS ==========
var canvasEl=document.getElementById("canvas");
canvasEl.addEventListener("mousedown",function(ev){if(ev.target===canvasEl||ev.target.tagName==="svg"||ev.target.tagName==="SVG"){isDragging=true;dragStartX=ev.clientX;dragStartY=ev.clientY;dragPanX=panX;dragPanY=panY;}});
window.addEventListener("mousemove",function(ev){if(isDragging){panX=dragPanX+(ev.clientX-dragStartX);panY=dragPanY+(ev.clientY-dragStartY);applyTransform();}});
window.addEventListener("mouseup",function(){isDragging=false;});
canvasEl.addEventListener("wheel",function(ev){ev.preventDefault();var r=canvasEl.getBoundingClientRect();zoomBy(ev.deltaY>0?-0.1:0.1,ev.clientX-r.left,ev.clientY-r.top);},{passive:false});
canvasEl.addEventListener("click",function(ev){if(ev.target===canvasEl||ev.target.tagName==="svg"){hideDetails();}});

document.getElementById("z-in").onclick=function(){var r=canvasEl.getBoundingClientRect();zoomBy(0.2,r.width/2,r.height/2);};
document.getElementById("z-out").onclick=function(){var r=canvasEl.getBoundingClientRect();zoomBy(-0.2,r.width/2,r.height/2);};
document.getElementById("z-fit").onclick=fitView;
document.getElementById("z-linear").onclick=function(){currentLayout="linear";redraw();setTimeout(fitView,50);};
document.getElementById("z-radial").onclick=function(){currentLayout="radial";redraw();setTimeout(fitView,50);};
document.getElementById("btn-open").onclick=function(){if(diagramLink)sendReq("ui/open-link",{url:diagramLink});};
document.getElementById("btn-fs").onclick=function(){sendReq("ui/request-display-mode",{mode:"fullscreen"});};
document.getElementById("det-close").onclick=hideDetails;

// ========== MCP PROTOCOL ==========
var reqId=0;
function send(m){window.parent.postMessage(m,"*");}
function sendReq(method,params){var id=++reqId;send({jsonrpc:"2.0",id:id,method:method,params:params||{}});return id;}
function sendNotif(method,params){send({jsonrpc:"2.0",method:method,params:params||{}});}
function sendResp(id,result){send({jsonrpc:"2.0",id:id,result:result||{}});}

function showErr(m){document.getElementById("status").style.display="none";document.getElementById("err").textContent=m;document.getElementById("err").style.display="block";}

window.addEventListener("message",function(ev){
  var msg=ev.data;if(!msg||msg.jsonrpc!=="2.0")return;

  if(msg.id&&msg.result&&msg.result.protocolVersion){sendNotif("ui/notifications/initialized");return;}
  if(msg.method==="ui/notifications/tool-input-partial"){document.getElementById("status").innerHTML='<div class="spin"></div>Generating...';return;}
  if(msg.method==="ui/notifications/tool-input"){document.getElementById("status").innerHTML='<div class="spin"></div>Rendering...';return;}

  if(msg.method==="ui/notifications/tool-result"){
    var params=msg.params||{},content=params.content||[];
    var tb=content.find(function(c){return c.type==="text";});
    if(!tb||!tb.text){showErr("No content");return;}
    try{var data=JSON.parse(tb.text);if(!data.nodes){showErr("Invalid data");return;}initDiagram(data);}
    catch(e){showErr("Parse error: "+e.message);}
    return;
  }

  if(msg.method==="ui/notifications/tool-cancelled"){showErr("Cancelled");return;}
  if(msg.method==="ui/resource-teardown"){sendResp(msg.id);return;}
  if(msg.method==="ui/notifications/host-context-changed"){
    var ctx=msg.params||{};
    if(ctx.theme)document.documentElement.setAttribute("data-theme",ctx.theme);
    return;
  }
});

sendReq("ui/initialize",{protocolVersion:"2025-03-26",appInfo:{name:"NavigateChat Mind Map",version:"1.0.0"},appCapabilities:{}});
</script>
</body>
</html>`;

if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, "widget.html"), html, "utf-8");
console.log("Built dist/widget.html (" + Math.round(html.length/1024) + "KB)");
