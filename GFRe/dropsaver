// ==UserScript==
// @name         GFRe Drop Saver
// @namespace    gfre.drop
// @version      1.0.0
// @match        https://soraniwa.428.st/gf/*
// @run-at       document-end
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==
(function(){
  "use strict";

  const KEY_MASTER = "gfre_dlist";
  const FILE_XLS = "drop.list.xls";
  const FILE_JSON = "drop_list_backup.json";
  const MAX_COLS = 10;
  const HEADER_BG = "#ddebf7";
  const NON_COLOR_HEX = "#ccbbaa";
  const YELLOW_BG = "#ffff99"; // アイテム色強調用のみ

  function loadMaster(){
    try{
      const raw = GM_getValue(KEY_MASTER, "");
      if(!raw) return {version:1, records:[], seen:{}};
      const o = JSON.parse(raw);
      if(!o || typeof o!=="object") return {version:1, records:[], seen:{}};
      if(!Array.isArray(o.records)) o.records = [];
      if(!o.seen || typeof o.seen!=="object") o.seen = {};
      if(!o.version) o.version = 1;
      return o;
    }catch(_){
      return {version:1, records:[], seen:{}};
    }
  }
  function saveMaster(state){ GM_setValue(KEY_MASTER, JSON.stringify(state)); }
  const state = loadMaster();

  function ensureButtons(){
    const base = document.querySelector("#tansaku");
    if(!base) return;
    if(document.querySelector("#gfre-toolbar")) return;

    const wrap = document.createElement("span");
    wrap.id = "gfre-toolbar";
    wrap.style.marginLeft = "8px";

    const mk = (label, onClick)=>{
      const b = document.createElement("div");
      b.className = "queryButton";
      b.textContent = label;
      b.style.display = "inline-block";
      b.style.marginLeft = "4px";
      b.addEventListener("pointerdown", e=>e.stopPropagation(), {capture:true});
      b.addEventListener("click", e=>{ e.stopPropagation(); e.preventDefault(); onClick(); }, {capture:true});
      return b;
    };
    wrap.appendChild(mk("記録", doRecord));
    wrap.appendChild(mk("出力", exportXls));
    wrap.appendChild(mk("バックアップ", exportJson));
    wrap.appendChild(mk("復元", importJson));

    base.parentElement.appendChild(wrap);
  }
  const mo = new MutationObserver(ensureButtons);
  mo.observe(document.body, {childList:true, subtree:true});
  ensureButtons();

  function getDropItems(){
    const drop = document.querySelector("#drop");
    if(!drop) return [];
    const parentColor = getComputedStyle(drop).color;
    const out = [];
    drop.childNodes.forEach(node=>{
      if(node.nodeType === Node.TEXT_NODE){
        const txt = node.textContent.replace(/\s+/g," ").trim();
        if(txt) out.push({text:txt, color:parentColor});
      }else if(node.nodeType === Node.ELEMENT_NODE){
        if(node.tagName.toLowerCase()==="br") return;
        const txt = node.textContent.replace(/\s+/g," ").trim();
        if(txt) out.push({text:txt, color:getComputedStyle(node).color});
      }
    });
    while(out.length && !out[out.length-1].text) out.pop();
    return out;
  }

  let recordBusy = false;
  function doRecord(){
    if(recordBusy) return;
    recordBusy = true;
    setTimeout(()=>recordBusy=false, 400);

    const place = document.querySelector("#maptipname")?.textContent.trim() || "";
    const xs = document.querySelector("#map_x")?.textContent.trim() || "";
    const ys = document.querySelector("#map_y")?.textContent.trim() || "";
    if(!xs || !ys){ alert("座標が取得できない"); return; }
    const x = parseInt(xs,10), y = parseInt(ys,10);
    if(Number.isNaN(x)||Number.isNaN(y)){ alert("座標が数値でない"); return; }
    const key = `${x},${y}`;
    if(state.seen[key]){ alert("この座標は既に記録済み"); return; }
    const items = getDropItems();
    if(items.length===0){ alert("ドロップが空です"); return; }

    state.records.push({place, x, y, items});
    state.seen[key] = 1;
    saveMaster(state);
    alert("記録した");
  }

  function colorCssToHex(css){
    if(!css) return "#000000";
    const s = css.trim();
    if(s.startsWith("#")){
      if(s.length===4) return "#" + s.slice(1).split("").map(c=>c+c).join("");
      if(s.length>=7) return s.slice(0,7).toLowerCase();
    }
    const m = s.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if(m){
      const to2 = n=>Number(n).toString(16).padStart(2,"0");
      return ("#"+to2(m[1])+to2(m[2])+to2(m[3])).toLowerCase();
    }
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.fillStyle = s;
    const mm = ctx.fillStyle.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if(mm){
      const to2 = n=>Number(n).toString(16).padStart(2,"0");
      return ("#"+to2(mm[1])+to2(mm[2])+to2(mm[3])).toLowerCase();
    }
    return "#000000";
  }
  function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

  function exportXls(){
    if(state.records.length===0){ alert("記録がありません"); return; }
    const headers = ["地名","X","Y"];
    for(let i=1;i<=MAX_COLS;i++) headers.push(String(i));

    // 列幅: A=125px, B=45px, C=45px, D〜M=200px
    const widths = [125,45,45];
    for(let i=0;i<MAX_COLS;i++) widths.push(200);

    let html = "";
    html += '<html xmlns:o="urn:schemas-microsoft-com:office:office" ';
    html += 'xmlns:x="urn:schemas-microsoft-com:office:excel" ';
    html += 'xmlns="http://www.w3.org/TR/REC-html40">';
    html += "<head><meta charset=\"utf-8\">";
    html += "<style>";
    html += "table{border-collapse:collapse}";
    html += "td,th{font-family:'Meiryo UI',Meiryo,'Segoe UI',Arial;font-size:11pt;text-align:center;vertical-align:middle;";
    html += "border:0.5pt solid #000;padding:2px 4px;}";
    html += "th{font-weight:bold;}";
    html += "</style>";
    html += "</head><body>";
    html += "<table>";
    html += "<colgroup>";
    widths.forEach(w=>{ html += `<col style="width:${w}px">`; });
    html += "</colgroup>";

    // 見出し行のみbgcolor属性を追加して確実に色を付ける
    html += "<thead><tr>";
    for(const h of headers){
      html += `<th bgcolor="#ddebf7" style="background-color:#ddebf7">${esc(h)}</th>`;
    }
    html += "</tr></thead><tbody>";

    state.records.forEach(rec=>{
      html += "<tr>";
      html += `<td>${esc(rec.place)}</td>`;
      html += `<td>${rec.x}</td>`;
      html += `<td>${rec.y}</td>`;
      for(let i=0;i<MAX_COLS;i++){
        const it = rec.items[i];
        if(it){
          const colorHex = colorCssToHex(it.color);
          // 文字色が #ccbbaa のセルは背景なし。それ以外は黄色
          const style = (colorHex === NON_COLOR_HEX) ? "" : ` style="background-color:${YELLOW_BG}"`;
          html += `<td${style}>${esc(it.text)}</td>`;
        }else{
          // 空セルは完全な無色
          html += `<td></td>`;
        }
      }
      html += "</tr>";
    });

    html += "</tbody></table></body></html>";

    // UTF-8 BOM付き
    const bom = new Uint8Array([0xEF,0xBB,0xBF]);
    const blob = new Blob([bom, html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = FILE_XLS;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 600);
  }

  function exportJson(){
    const backup = {version:state.version||1, records:state.records, seen:state.seen};
    const bom = new Uint8Array([0xEF,0xBB,0xBF]);
    const blob = new Blob([bom, JSON.stringify(backup, null, 2)], {type:"application/json;charset=utf-8"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = FILE_JSON;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 600);
  }

  function importJson(){
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.style.display = "none";
    input.addEventListener("change", ()=>{
      const f = input.files && input.files[0];
      if(!f) return;
      const rd = new FileReader();
      rd.onload = ()=>{
        try{
          const obj = JSON.parse(String(rd.result||"{}"));
          const recs = Array.isArray(obj.records) ? obj.records : [];
          const seen = obj.seen && typeof obj.seen==="object" ? obj.seen : {};
          let added = 0;
          recs.forEach(r=>{
            const x = parseInt(r.x,10), y = parseInt(r.y,10);
            if(Number.isNaN(x)||Number.isNaN(y)) return;
            const key = `${x},${y}`;
            if(state.seen[key]) return;
            const items = Array.isArray(r.items) ? r.items.map(it=>({text:String(it.text||"").trim(), color:String((it.color||"")).trim()})) : [];
            state.records.push({place:String(r.place||"").trim(), x, y, items});
            state.seen[key] = 1;
            added++;
          });
          for(const k in seen){ if(Object.prototype.hasOwnProperty.call(seen,k) && !state.seen[k]) state.seen[k]=1; }
          saveMaster(state);
          alert("復元完了 件数:"+added);
        }catch(e){
          alert("復元失敗");
        }
      };
      rd.readAsText(f, "utf-8");
    });
    document.body.appendChild(input);
    input.click();
    setTimeout(()=>input.remove(), 0);
  }

})();
