// ==UserScript==
// @name         GFRe Get Item
// @namespace    gfre.get.item
// @version      0.1.0
// @match        https://soraniwa.428.st/gf/*
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// @connect      docs.google.com
// @connect      googleusercontent.com
// ==/UserScript==
(() => {
  "use strict";

  // ===== 設定 =====
  const CFG = {
    sheetId: "1_FSfls7QF5V_pZqs047ts58lwss8s7ahLPjuiAOaDHU", // あなたのシートID
    gid: "210441810",                                        // シートのgid
    // 共有が「リンクを知っている全員」以上になっていれば export?format=csv で取得可能
    csvUrl() { return `https://docs.google.com/spreadsheets/d/${this.sheetId}/export?format=csv&id=${this.sheetId}&gid=${this.gid}`; },

    subMapSel: "#maparea_sub",
    xSel: "#map_x",
    ySel: "#map_y",
    overlayId: "gfre-stars-overlay-layer",
    viewSize: 15,
    worldSize: 201,
    markChar: "★",
    opacity: 0.7,
    zIndex: 10000
  };

  // ===== 内部状態 =====
  let coords = [];            // {x:1..201, y:1..201} の配列
  let rafScheduled = false;

  // ===== 汎用 =====
  const $ = sel => document.querySelector(sel);
  const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
  function isMapMoveActive() {
    const btn1 = document.getElementById("btn1");
    return !!(btn1 && btn1.classList.contains("enablebtn"));
  }

  // ===== シート取得・解析 =====
  function fetchCsv(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        responseType: "text",
        // Googleへのクロスオリジン取得。ログイン状態によってはCookie同送される
        onload: res => {
          if (res.status >= 200 && res.status < 300) resolve(res.responseText);
          else reject(new Error(`HTTP ${res.status}`));
        },
        onerror: err => reject(err)
      });
    });
  }

  function parseCoordsFromCsv(csv) {
    // 1行目がヘッダでもOK。A:X, B:Y を読み取る
    const lines = csv.replace(/\r/g, "").split("\n");
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      // CSVの単純分割。カンマのみ前提（座標にカンマは入らない）
      const parts = line.split(",");
      if (parts.length < 2) continue;
      const X = Number(parts[0].trim());
      const Y = Number(parts[1].trim());
      if (!Number.isFinite(X) || !Number.isFinite(Y)) continue;
      if (X < 1 || X > CFG.worldSize || Y < 1 || Y > CFG.worldSize) continue;
      out.push({ x: X, y: Y });
    }
    // 重複は除去
    const keyset = new Set();
    const uniq = [];
    for (const p of out) {
      const k = `${p.x},${p.y}`;
      if (!keyset.has(k)) { keyset.add(k); uniq.push(p); }
    }
    return uniq;
  }

  async function loadSheet() {
    try {
      const csv = await fetchCsv(CFG.csvUrl());
      coords = parseCoordsFromCsv(csv);
      rafDraw();
    } catch (e) {
      // 取得失敗時は座標表示なし
      coords = [];
      rafDraw();
    }
  }

  // ===== レイヤ管理 =====
  function ensureOverlay() {
    let layer = document.getElementById(CFG.overlayId);
    if (!layer) {
      layer = document.createElement("div");
      layer.id = CFG.overlayId;
      layer.style.position = "fixed";
      layer.style.pointerEvents = "none";
      layer.style.zIndex = String(CFG.zIndex);
      layer.style.display = "none";
      document.body.appendChild(layer);
    }
    return layer;
  }

  function getSubContentRect() {
    const sub = $(CFG.subMapSel);
    if (!sub) return null;
    const r = sub.getBoundingClientRect();
    const cs = getComputedStyle(sub);
    const bl = parseFloat(cs.borderLeftWidth)  || 0;
    const br = parseFloat(cs.borderRightWidth) || 0;
    const bt = parseFloat(cs.borderTopWidth)   || 0;
    const bb = parseFloat(cs.borderBottomWidth)|| 0;
    const width  = Math.max(0, Math.round(r.width  - bl - br));
    const height = Math.max(0, Math.round(r.height - bt - bb));
    if (width === 0 || height === 0) return null;
    return {
      left:  Math.round(r.left + bl),
      top:   Math.round(r.top  + bt),
      width,
      height
    };
  }

  function getPlayerXY0() {
    const x = Number($(CFG.xSel)?.textContent?.trim());
    const y = Number($(CFG.ySel)?.textContent?.trim());
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x0: x - 1, y0: y - 1 }; // 0始まり
  }

  // ===== 描画 =====
  function draw() {
    const layer = ensureOverlay();

    if (!isMapMoveActive()) {
      layer.style.display = "none";
      layer.innerHTML = "";
      return;
    }

    const rect = getSubContentRect();
    if (!rect) {
      layer.style.display = "none";
      layer.innerHTML = "";
      return;
    }

    const p = getPlayerXY0();
    if (!p) {
      layer.style.display = "none";
      layer.innerHTML = "";
      return;
    }

    layer.style.left   = `${rect.left}px`;
    layer.style.top    = `${rect.top}px`;
    layer.style.width  = `${rect.width}px`;
    layer.style.height = `${rect.height}px`;
    layer.style.display = "block";
    layer.innerHTML = "";

    const half = Math.floor(CFG.viewSize / 2);
    const H = CFG.worldSize, W = CFG.worldSize;
    const cw = rect.width  / CFG.viewSize;
    const ch = rect.height / CFG.viewSize;

    let marks = 0;
    // 視界に入る座標だけを描画
    for (const pt of coords) {
      const x0 = p.x0, y0 = p.y0;
      if (pt.x < x0 - half + 1 || pt.x > x0 + half + 1) continue; // 1始まり→+1
      if (pt.y < y0 - half + 1 || pt.y > y0 + half + 1) continue;

      // pt(1始まり)→視界内の列行
      const dx = (pt.x - 1) - x0;
      const dy = (pt.y - 1) - y0;
      const col = dx + half;
      const row = dy + half;
      if (col < 0 || col >= CFG.viewSize || row < 0 || row >= CFG.viewSize) continue;

      const cx = Math.round((col + 0.5) * cw);
      const cy = Math.round((row + 0.5) * ch);

      const m = document.createElement("div");
      m.textContent = CFG.markChar;
      m.style.position = "absolute";
      m.style.left = `${cx}px`;
      m.style.top  = `${cy}px`;
      m.style.transform = "translate(-50%,-50%)";
      m.style.fontWeight = "800";
      m.style.color = "#fff";
      m.style.textShadow = "0 1px 2px rgba(0,0,0,.7)";
      m.style.opacity = String(CFG.opacity);
      m.style.lineHeight = "1";
      m.style.fontSize = `${Math.max(14, Math.min(30, Math.round(ch * 0.7)))}px`;
      layer.appendChild(m);
      marks++;
    }

    if (marks === 0) {
      layer.style.display = "none";
      layer.innerHTML = "";
    }
  }

  function rafDraw() {
    if (rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(() => { rafScheduled = false; draw(); });
  }

  // ===== 監視 =====
  function setupObservers() {
    const sub = $(CFG.subMapSel);
    if (sub) {
      new MutationObserver(() => rafDraw())
        .observe(sub, { childList: true, subtree: true, characterData: true, attributes: true });
      new ResizeObserver(() => rafDraw()).observe(sub);
    }
    const xEl = $(CFG.xSel);
    const yEl = $(CFG.ySel);
    if (xEl) new MutationObserver(() => rafDraw()).observe(xEl, { childList: true, subtree: true, characterData: true });
    if (yEl) new MutationObserver(() => rafDraw()).observe(yEl, { childList: true, subtree: true, characterData: true });

    // タブ切替で必ず反映
    document.body.addEventListener("click", e => {
      const hit = e.target.closest?.("#btn1,#btn2,#btn3,#btn4,#btn5,#btn6,#btn7,#btn8,#btn9");
      if (hit) rafDraw();
    });

    // 縦スクロールやリサイズ
    window.addEventListener("resize", rafDraw);
    window.addEventListener("scroll", rafDraw, { passive: true });
  }

  // ===== 初期化 =====
  function init() {
    const ready = async () => {
      setupObservers();
      await loadSheet();      // 取得後に描画
      rafDraw();
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready);
    else ready();
  }

  init();
})();
