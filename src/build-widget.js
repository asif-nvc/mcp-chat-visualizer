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
html,body{width:100%;background:#212121;font-family:system-ui,-apple-system,sans-serif;overflow:hidden;color:#ececec}

/* Container */
#wrap{width:100%;min-height:200px;position:relative;overflow:hidden;background:#212121}
#canvas{width:100%;min-height:200px;cursor:grab;overflow:hidden}
#canvas:active{cursor:grabbing}
#canvas svg{transform-origin:0 0}

/* Status */
#status{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;justify-content:center;padding:16px;color:#8e8e8e;font-size:13px;gap:8px;z-index:5}
.spin{width:14px;height:14px;border:2px solid #424242;border-top-color:#10a37f;border-radius:50%;animation:sp .7s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}

/* Error */
#err{display:none;position:absolute;top:0;left:0;right:0;padding:14px;color:#ef4444;font-size:12px;z-index:5;text-align:center}

/* Toolbar */
#tb{position:absolute;bottom:0;left:0;right:0;display:none;padding:6px 10px;gap:5px;background:#171717;border-top:1px solid #2f2f2f;z-index:10;justify-content:space-between;align-items:center}
#tb .g{display:flex;gap:4px;align-items:center}
#tb button{padding:4px 8px;border-radius:5px;border:1px solid #424242;background:#2f2f2f;color:#ececec;font-size:11px;cursor:pointer;display:flex;align-items:center;gap:3px;transition:background .15s}
#tb button:hover{background:#424242}
#tb .sep{width:1px;height:16px;background:#424242;margin:0 2px}

/* Details panel */
#details{display:none;position:absolute;top:0;right:0;width:280px;height:100%;background:#171717;border-left:1px solid #2f2f2f;z-index:20;overflow-y:auto;padding:16px;font-size:12px}
#details .close{position:absolute;top:8px;right:8px;background:none;border:none;color:#8e8e8e;cursor:pointer;font-size:16px;padding:4px}
#details .close:hover{color:#ececec}
#details h3{font-size:15px;font-weight:600;margin-bottom:4px;color:#ececec}
#details .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;text-transform:uppercase;margin-bottom:10px}
#details .summary{color:#8e8e8e;line-height:1.5;margin-bottom:12px}
#details .children-title{font-size:11px;color:#8e8e8e;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px}
#details .child-item{padding:5px 8px;border-radius:4px;background:#2f2f2f;margin-bottom:3px;cursor:pointer;font-size:11px;color:#ececec;transition:background .15s;border:1px solid #424242}
#details .child-item:hover{background:#424242}

/* Tooltip */
.tt{position:fixed;background:#2f2f2f;color:#ececec;padding:8px 12px;border-radius:7px;font-size:11px;max-width:240px;pointer-events:none;z-index:50;display:none;box-shadow:0 4px 16px rgba(0,0,0,0.5);border:1px solid #424242;line-height:1.4}
.tt .tt-label{font-weight:600;color:#ececec;margin-bottom:3px;font-size:12px}
.tt .tt-type{display:inline-block;padding:1px 6px;border-radius:3px;font-size:9px;text-transform:uppercase;margin-bottom:5px;font-weight:600}

/* Light theme */
html[data-theme="light"],html[data-theme="light"] body{background:#ffffff;color:#0d0d0d}
html[data-theme="light"] #wrap{background:#ffffff}
html[data-theme="light"] #tb{background:#f9f9f9;border-top-color:#e5e5e5}
html[data-theme="light"] #tb button{border-color:#e5e5e5;background:#f7f7f8;color:#0d0d0d}
html[data-theme="light"] #tb button:hover{background:#ececec}
html[data-theme="light"] #details{background:#f9f9f9;border-left-color:#e5e5e5}
html[data-theme="light"] #details h3{color:#0d0d0d}
html[data-theme="light"] #details .summary{color:#6b6b6b}
html[data-theme="light"] #details .child-item{background:#f7f7f8;color:#0d0d0d;border-color:#e5e5e5}
html[data-theme="light"] #details .child-item:hover{background:#ececec}
html[data-theme="light"] #details .close{color:#6b6b6b}
html[data-theme="light"] #details .close:hover{color:#0d0d0d}
html[data-theme="light"] #details .children-title{color:#6b6b6b}
html[data-theme="light"] .tt{background:#ffffff;color:#0d0d0d;border-color:#e5e5e5;box-shadow:0 4px 16px rgba(0,0,0,0.1)}
html[data-theme="light"] .tt .tt-label{color:#0d0d0d}
html[data-theme="light"] #status{color:#6b6b6b}
html[data-theme="light"] .spin{border-color:#e5e5e5;border-top-color:#10a37f}
</style>
</head>
<body>
<div id="wrap">
  <div id="status"><div class="spin"></div>Loading diagram...</div>
  <div id="err"></div>
  <div id="canvas"></div>
  <div id="tb">
    <div class="g">
      <button id="z-fit" title="Fit view">⊡ Fit</button>
      <div class="sep"></div>
      <button id="z-layout" title="Toggle layout">☰ Linear</button>
      <div class="sep"></div>
      <button id="z-cup" title="Collapse one level">▲ Collapse</button>
      <button id="z-cdn" title="Expand one level">▼ Expand</button>
      <div class="sep"></div>
      <button id="z-lock" title="Lock/unlock interaction">🔓 Unlocked</button>
      <button id="z-reset" title="Reset node positions">↺ Reset</button>
    </div>
    <div class="g">
      <button id="btn-theme" title="Toggle dark/light mode">◐ Theme</button>
      <button id="btn-open">↗ Open</button>
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
// NavigateChat exact color scheme
var COLORS=["#ef4444","#f97316","#eab308","#22c55e","#3b82f6","#a855f7"];
var BADGE_COLORS={root:"#10a37f",category:"#3b82f6",leaf:"#8b5cf6"};
var ROOT_CLR="#10a37f";
// Theme palette
var DARK={bg:"#212121",card:"#2f2f2f",shell:"#171717",border:"#424242",text:"#ececec",muted:"#8e8e8e",nodeFill:"#2f2f2f",edgeClr:"#424242"};
var LIGHT={bg:"#ffffff",card:"#f7f7f8",shell:"#f9f9f9",border:"#e5e5e5",text:"#0d0d0d",muted:"#6b6b6b",nodeFill:"#ffffff",edgeClr:"#e5e5e5"};
var HS=280,VS=12,NH=38,RADIAL_BASE=280,RADIAL_INC=220;

// ========== STATE ==========
var graphData=null,nodeMap={},adjList={},parentMap={},positions={};
var collapsed={},currentLayout="linear",diagramLink="",selectedId=null;
var scale=1,panX=0,panY=0,isDragging=false,dragStartX=0,dragStartY=0,dragPanX=0,dragPanY=0;
var nodeDragId=null,nodeDragStartX=0,nodeDragStartY=0,nodeDragOrigX=0,nodeDragOrigY=0;
var darkMode=true;
var locked=false;
// Custom position overrides (set by dragging)
var customPos={};

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
  // Apply custom positions from drag overrides
  Object.keys(customPos).forEach(function(id){
    if(positions[id]){
      positions[id].x=customPos[id].x;
      positions[id].y=customPos[id].y;
    }
  });
}

// ========== DRILL UP/DOWN (Collapse/Expand by Level) ==========
function calcLevels(){
  var levels={};
  function walk(id,d){levels[id]=d;(adjList[id]||[]).forEach(function(c){walk(c,d+1);});}
  var root=findRoot();if(root)walk(root.id,0);
  return levels;
}

function isHiddenByAncestor(id){
  var cur=id;
  while(parentMap[cur]){
    if(collapsed[parentMap[cur]])return true;
    cur=parentMap[cur];
  }
  return false;
}

function drillUp(){
  var levels=calcLevels();
  // Find max visible level
  var maxLvl=0;
  Object.keys(levels).forEach(function(id){
    if(!isHiddenByAncestor(id)&&levels[id]>maxLvl)maxLvl=levels[id];
  });
  if(maxLvl<=0)return;
  var target=maxLvl-1;
  // Collapse all nodes at target level that have children
  Object.keys(levels).forEach(function(id){
    if(levels[id]===target&&(adjList[id]||[]).length>0){
      collapsed[id]=true;
    }
  });
  customPos={};
  redraw();fitView();setTimeout(reportSize,100);
}

function drillDown(){
  var levels=calcLevels();
  // Find lowest collapsed level that is visible
  var minCollapsed=Infinity;
  Object.keys(collapsed).forEach(function(id){
    if(collapsed[id]&&!isHiddenByAncestor(id)){
      var lvl=levels[id]||0;
      if(lvl<minCollapsed)minCollapsed=lvl;
    }
  });
  if(minCollapsed===Infinity)return;
  // Expand all collapsed nodes at that level
  Object.keys(collapsed).forEach(function(id){
    if(collapsed[id]&&(levels[id]||0)===minCollapsed){
      collapsed[id]=false;
    }
  });
  customPos={};
  redraw();fitView();setTimeout(reportSize,100);
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
    var ec=darkMode?DARK.edgeClr:LIGHT.edgeClr;
    if(currentLayout==="radial"){
      s+='<line x1="'+sp.x+'" y1="'+sp.y+'" x2="'+tp.x+'" y2="'+tp.y+'" stroke="'+ec+'" stroke-width="2"/>';
    }else{
      var sx=sp.x+sw,sy=sp.y,tx=tp.x,ty=tp.y,mx=sx+(tx-sx)*0.5;
      s+='<path d="M'+sx+','+sy+' C'+mx+','+sy+' '+mx+','+ty+' '+tx+','+ty+'" fill="none" stroke="'+ec+'" stroke-width="2"/>';
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
    var T=darkMode?DARK:LIGHT;
    var nodeFill=T.nodeFill;
    var textFill=T.text;
    s+='<rect x="'+rx+'" y="'+ry+'" width="'+w+'" height="'+NH+'" rx="8" ';
    s+='fill="'+nodeFill+'" stroke="'+clr+'" stroke-width="'+(tp==="root"?2.5:isSelected?2:1.5)+'" ';
    s+='style="transition:stroke-width 0.15s"/>';

    // Label
    s+='<text x="'+(rx+w/2)+'" y="'+(p.y+1)+'" text-anchor="middle" dominant-baseline="middle" ';
    s+='font-size="'+(tp==="root"?13:11)+'" font-weight="'+(tp==="root"?"600":"400")+'" fill="'+textFill+'">'+esc(lb)+'</text>';

    // Collapse indicator
    if((adjList[id]||[]).length>0){
      var ix=rx+w-2,iy=ry-2;
      var ciFill=darkMode?DARK.card:LIGHT.card;
      var ciText=darkMode?DARK.muted:LIGHT.muted;
      s+='<circle cx="'+ix+'" cy="'+iy+'" r="7" fill="'+ciFill+'" stroke="'+clr+'" stroke-width="1"/>';
      s+='<text x="'+ix+'" y="'+(iy+1)+'" text-anchor="middle" dominant-baseline="middle" font-size="9" fill="'+ciText+'">'+(isCollapsed?"+":"−")+'</text>';
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

var nodeClickTimer=null,nodeWasDragged=false;

function bindNodeEvents(){
  document.querySelectorAll(".nd").forEach(function(el){
    var id=el.getAttribute("data-id");

    // Drag start (only if not locked)
    el.addEventListener("mousedown",function(ev){
      if(locked)return;
      ev.stopPropagation();
      nodeDragId=id;
      nodeWasDragged=false;
      nodeDragStartX=ev.clientX;
      nodeDragStartY=ev.clientY;
      var p=positions[id];
      if(p){nodeDragOrigX=p.x;nodeDragOrigY=p.y;}
      el.style.cursor="grabbing";
    });

    el.addEventListener("click",function(ev){
      ev.stopPropagation();
      if(locked||nodeWasDragged)return;
      showDetails(id);
    });

    el.addEventListener("dblclick",function(ev){
      ev.stopPropagation();
      if(locked)return;
      if((adjList[id]||[]).length>0){
        collapsed[id]=!collapsed[id];
        customPos={}; // reset custom positions on collapse
        redraw();fitView();setTimeout(reportSize,100);
      }
    });

    el.addEventListener("mouseenter",function(ev){if(!locked&&!nodeDragId)showTT(ev,id);});
    el.addEventListener("mousemove",function(ev){if(!locked&&!nodeDragId){ttEl.style.left=Math.min(ev.clientX+12,window.innerWidth-260)+"px";ttEl.style.top=(ev.clientY-10)+"px";}});
    el.addEventListener("mouseleave",hideTT);
  });
}

// Global mouse move for node dragging
window.addEventListener("mousemove",function(ev){
  if(nodeDragId){
    var dx=(ev.clientX-nodeDragStartX)/scale;
    var dy=(ev.clientY-nodeDragStartY)/scale;
    if(Math.abs(dx)>3||Math.abs(dy)>3) nodeWasDragged=true;
    var newX=nodeDragOrigX+dx;
    var newY=nodeDragOrigY+dy;
    customPos[nodeDragId]={x:newX,y:newY};
    positions[nodeDragId].x=newX;
    positions[nodeDragId].y=newY;
    // Update SVG without full recalc
    redrawFast();
    hideTT();
  }
});
window.addEventListener("mouseup",function(){
  if(nodeDragId){
    document.querySelectorAll(".nd").forEach(function(el){el.style.cursor="pointer";});
    nodeDragId=null;
  }
});

// Fast redraw: re-render SVG without recalculating layout
function redrawFast(){
  var svg=renderSVGFromPositions();
  document.getElementById("canvas").innerHTML=svg;
  applyTransform();
  bindNodeEvents();
}

function renderSVGFromPositions(){
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

  (graphData.edges||[]).forEach(function(e){
    var sp=positions[e.source],tp=positions[e.target];if(!sp||!tp)return;
    if(collapsed[e.source])return;
    var T=darkMode?DARK:LIGHT;
    var sn=nodeMap[e.source],sl=(sn&&sn.data&&sn.data.label)||e.source,sw=mW(sl,12);
    if(currentLayout==="radial"){
      s+='<line x1="'+sp.x+'" y1="'+sp.y+'" x2="'+tp.x+'" y2="'+tp.y+'" stroke="'+T.edgeClr+'" stroke-width="2"/>';
    }else{
      var sx=sp.x+sw,sy=sp.y,tx=tp.x,ty=tp.y,mx=sx+(tx-sx)*0.5;
      s+='<path d="M'+sx+','+sy+' C'+mx+','+sy+' '+mx+','+ty+' '+tx+','+ty+'" fill="none" stroke="'+T.edgeClr+'" stroke-width="2"/>';
    }
  });

  ids.forEach(function(id){
    var p=positions[id],n=nodeMap[id];if(!n)return;
    var lb=(n.data&&n.data.label)||id,tp=(n.data&&n.data.type)||"leaf";
    var w=mW(lb,12),clr=tp==="root"?ROOT_CLR:COLORS[p.d%COLORS.length];
    var isSelected=selectedId===id;
    var rx=currentLayout==="radial"?p.x-w/2:p.x,ry=p.y-NH/2;
    var T2=darkMode?DARK:LIGHT;
    var nf=T2.nodeFill;
    var tf=T2.text;
    s+='<g class="nd" data-id="'+id+'" style="cursor:pointer">';
    if(isSelected)s+='<rect x="'+(rx-3)+'" y="'+(ry-3)+'" width="'+(w+6)+'" height="'+(NH+6)+'" rx="10" fill="none" stroke="'+clr+'" stroke-width="1" opacity="0.3"/>';
    s+='<rect x="'+rx+'" y="'+ry+'" width="'+w+'" height="'+NH+'" rx="8" fill="'+nf+'" stroke="'+clr+'" stroke-width="'+(tp==="root"?2.5:isSelected?2:1.5)+'"/>';
    s+='<text x="'+(rx+w/2)+'" y="'+(p.y+1)+'" text-anchor="middle" dominant-baseline="middle" font-size="'+(tp==="root"?13:11)+'" font-weight="'+(tp==="root"?"600":"400")+'" fill="'+tf+'">'+esc(lb)+'</text>';
    if((adjList[id]||[]).length>0){
      var ix=rx+w-2,iy=ry-2;
      var cif=T2.card;
      var cit=T2.muted;
      var isC=collapsed[id];
      s+='<circle cx="'+ix+'" cy="'+iy+'" r="7" fill="'+cif+'" stroke="'+clr+'" stroke-width="1"/>';
      s+='<text x="'+ix+'" y="'+(iy+1)+'" text-anchor="middle" dominant-baseline="middle" font-size="9" fill="'+cit+'">'+(isC?"+":"\\u2212")+'</text>';
    }
    s+='</g>';
  });

  s+='</g></svg>';
  return s;
}

// ========== INIT ==========
function reportSize(){
  try{
    var svg=document.querySelector("#canvas svg");
    if(!svg)return;
    var svgH=parseFloat(svg.getAttribute("height"))||400;
    var svgW=parseFloat(svg.getAttribute("width"))||600;
    // Content height = SVG scaled + toolbar(~36px) + padding
    var contentH=Math.max(300,Math.min(Math.round(svgH*scale)+50,800));
    var contentW=Math.ceil(document.documentElement.scrollWidth);
    // Resize the canvas to fit
    var canvasEl=document.getElementById("canvas");
    var wrapEl=document.getElementById("wrap");
    canvasEl.style.height=contentH+"px";
    wrapEl.style.height=(contentH+36)+"px";
    sendNotif("ui/notifications/size-changed",{width:contentW,height:contentH+36});
  }catch(e){}
}

function initDiagram(data){
  graphData=data;
  buildTree(data);
  diagramLink=data._link||"";
  document.getElementById("status").style.display="none";
  document.getElementById("tb").style.display="flex";
  redraw();
  setTimeout(function(){fitView();reportSize();},50);
  // Re-report on resize
  if(typeof ResizeObserver!=="undefined"){
    new ResizeObserver(function(){reportSize();}).observe(document.getElementById("wrap"));
  }
}

// ========== EVENT BINDINGS ==========
var canvasEl=document.getElementById("canvas");
canvasEl.addEventListener("mousedown",function(ev){if(!nodeDragId&&(ev.target===canvasEl||ev.target.tagName==="svg"||ev.target.tagName==="SVG")){isDragging=true;dragStartX=ev.clientX;dragStartY=ev.clientY;dragPanX=panX;dragPanY=panY;}});
window.addEventListener("mousemove",function(ev){if(isDragging){panX=dragPanX+(ev.clientX-dragStartX);panY=dragPanY+(ev.clientY-dragStartY);applyTransform();}});
window.addEventListener("mouseup",function(){isDragging=false;});
canvasEl.addEventListener("wheel",function(ev){ev.preventDefault();var r=canvasEl.getBoundingClientRect();zoomBy(ev.deltaY>0?-0.1:0.1,ev.clientX-r.left,ev.clientY-r.top);},{passive:false});
canvasEl.addEventListener("click",function(ev){if(ev.target===canvasEl||ev.target.tagName==="svg"){hideDetails();}});

document.getElementById("z-fit").onclick=function(){fitView();setTimeout(reportSize,100);};
document.getElementById("z-layout").onclick=function(){
  currentLayout=currentLayout==="linear"?"radial":"linear";
  customPos={};
  var btn=document.getElementById("z-layout");
  btn.textContent=currentLayout==="linear"?"☰ Linear":"◎ Radial";
  redraw();setTimeout(function(){fitView();reportSize();},50);
};
document.getElementById("z-cup").onclick=drillUp;
document.getElementById("z-cdn").onclick=drillDown;
document.getElementById("z-lock").onclick=function(){
  locked=!locked;
  var btn=document.getElementById("z-lock");
  btn.textContent=locked?"🔒 Locked":"🔓 Unlocked";
};
document.getElementById("z-reset").onclick=function(){customPos={};redraw();setTimeout(function(){fitView();reportSize();},50);};
document.getElementById("btn-theme").onclick=function(){
  darkMode=!darkMode;
  document.documentElement.setAttribute("data-theme",darkMode?"dark":"light");
  redraw();
};
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
