// ==UserScript==
// @name         GFRe Map Guide
// @namespace    https://github.com/Sinistella/42ste114
// @version      0.2.0
// @description  マップの座標を表示し、対象セルを赤枠で強調
// @match        https://soraniwa.428.st/gf/?mode=action
// ==/UserScript==

(function () {
  'use strict';

  const CONFIG = {
    MAP_AREA_SELECTOR: '#maparea_sub',
    CURRENT_X_SELECTOR: '#map_x',
    CURRENT_Y_SELECTOR: '#map_y',
    GRID_CONTAINER_SELECTOR: '.strollmaparea_close, .strollmaparea_full, .strollmaparea, .layout',
    TILE_SIZE_FALLBACK: 35,
    ASSUME_CENTERED_ON_SELF: true,
    SELF_ICON_SELECTOR: '',
    TIP_OFFSET_X: 6,   // ② マウス直下に寄せるためのXオフセット
    TIP_OFFSET_Y: 10,  // ② マウス直下に寄せるためのYオフセット
    HILITE_BORDER: '2px solid #ff3333', // ① 赤枠
    HILITE_BOXSHADOW: '0 0 0 2px rgba(255,255,255,0.5) inset', // ① 視認性補助
    HILITE_FILL_ALPHA: 0.08 // ① 薄い塗りを併用
  };

  const tip = document.createElement('div');
  tip.id = 'sg-coord-tip';
  Object.assign(tip.style, {
    position: 'fixed',
    zIndex: '99999',
    pointerEvents: 'none',
    background: '#221111cc',
    color: '#ffffee',
    fontSize: '12px',
    padding: '2px 6px',
    borderRadius: '4px',
    lineHeight: '1.4',
    display: 'none',
    whiteSpace: 'nowrap'
  });
  document.documentElement.appendChild(tip);

  // ① ホバー中セルの強調枠
  const hilite = document.createElement('div');
  hilite.id = 'sg-cell-hilite';
  Object.assign(hilite.style, {
    position: 'fixed',
    zIndex: '99998',
    pointerEvents: 'none',
    border: CONFIG.HILITE_BORDER,
    boxSizing: 'border-box',
    background: `rgba(255,0,0,${CONFIG.HILITE_FILL_ALPHA})`,
    boxShadow: CONFIG.HILITE_BOXSHADOW,
    display: 'none'
  });
  document.documentElement.appendChild(hilite);

  const $ = (sel, root = document) => root.querySelector(sel);

  let gridInfo = null;

  function getCurrentPos() {
    const xNode = $(CONFIG.CURRENT_X_SELECTOR);
    const yNode = $(CONFIG.CURRENT_Y_SELECTOR);
    if (xNode && yNode) {
      const x = Number(xNode.textContent.trim());
      const y = Number(yNode.textContent.trim());
      if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
    }
    const label = $('.labelbright.labelbrightcell2');
    if (label) {
      const m = label.textContent.match(/x:\s*(\d+)\s*,\s*y:\s*(\d+)/i);
      if (m) return { x: Number(m[1]), y: Number(m[2]) };
    }
    return null;
  }

  function elemAbsRect(el) {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
  }

  function measureTile(container) {
    // セルは span の背景色で35x35相当と想定
    const span = container.querySelector('span[style*="background-color"]') || container.querySelector('span');
    if (span) {
      const cr = span.getBoundingClientRect();
      const w = Math.max(1, Math.round(cr.width)) || CONFIG.TILE_SIZE_FALLBACK;
      const h = Math.max(1, Math.round(cr.height)) || CONFIG.TILE_SIZE_FALLBACK;
      return { w, h };
    }
    return { w: CONFIG.TILE_SIZE_FALLBACK, h: CONFIG.TILE_SIZE_FALLBACK };
  }

  function estimateGrid(container) {
    const rect = elemAbsRect(container);
    const { w: tileW, h: tileH } = measureTile(container);
    const cols = Math.max(1, Math.round(rect.width / tileW));
    const rows = Math.max(1, Math.round(rect.height / tileH));
    let selfCol = Math.floor(cols / 2);
    let selfRow = Math.floor(rows / 2);
    if (!CONFIG.ASSUME_CENTERED_ON_SELF && CONFIG.SELF_ICON_SELECTOR) {
      const selfIcon = $(CONFIG.SELF_ICON_SELECTOR, document);
      if (selfIcon) {
        const ir = elemAbsRect(selfIcon);
        const gx = Math.floor((ir.left + ir.width / 2 - rect.left) / tileW);
        const gy = Math.floor((ir.top + ir.height / 2 - rect.top) / tileH);
        if (gx >= 0 && gy >= 0) {
          selfCol = gx;
          selfRow = gy;
        }
      }
    }
    return { container, rect, tileW, tileH, cols, rows, selfCol, selfRow };
  }

  function pickGridContainer() {
    const mapArea = $(CONFIG.MAP_AREA_SELECTOR);
    if (!mapArea) return null;
    const cont = $(CONFIG.GRID_CONTAINER_SELECTOR, mapArea) || mapArea;
    return cont;
  }

  function rebuildGridInfo() {
    const cont = pickGridContainer();
    if (!cont) {
      gridInfo = null;
      return;
    }
    gridInfo = estimateGrid(cont);
  }

  function updateTipText(x, y) {
    tip.textContent = `x:${x}, y:${y}`;
  }

  function hideTipAndHilite() {
    tip.style.display = 'none';
    hilite.style.display = 'none';
  }

  function showTipAt(clientX, clientY) {
    tip.style.left = `${clientX + CONFIG.TIP_OFFSET_X}px`;
    tip.style.top = `${clientY + CONFIG.TIP_OFFSET_Y}px`;
    if (tip.style.display !== 'block') tip.style.display = 'block';
  }

  function showHiliteCell(cellLeft, cellTop, cellW, cellH) {
    hilite.style.left = `${cellLeft}px`;
    hilite.style.top = `${cellTop}px`;
    hilite.style.width = `${cellW}px`;
    hilite.style.height = `${cellH}px`;
    if (hilite.style.display !== 'block') hilite.style.display = 'block';
  }

  function handleMove(ev) {
    if (!gridInfo) return hideTipAndHilite();
    const cur = getCurrentPos();
    if (!cur) return hideTipAndHilite();

    const { rect, tileW, tileH, cols, rows, selfCol, selfRow } = gridInfo;
    const cx = ev.clientX;
    const cy = ev.clientY;

    const gx = Math.floor((cx - rect.left) / tileW);
    const gy = Math.floor((cy - rect.top) / tileH);
    if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return hideTipAndHilite();

    const dx = gx - selfCol;
    const dy = gy - selfRow;
    const absX = cur.x + dx;
    const absY = cur.y + dy;

    updateTipText(absX, absY);
    showTipAt(cx, cy);

    // ① ハイライト枠をセル境界にスナップ
    const cellLeft = rect.left + gx * tileW;
    const cellTop = rect.top + gy * tileH;
    showHiliteCell(cellLeft, cellTop, tileW, tileH);
  }

  function handleLeave() {
    hideTipAndHilite();
  }

  function bindMouse() {
    const mapArea = $(CONFIG.MAP_AREA_SELECTOR);
    if (!mapArea) return;
    mapArea.removeEventListener('mousemove', handleMove, true);
    mapArea.removeEventListener('mouseleave', handleLeave, true);
    mapArea.addEventListener('mousemove', handleMove, true);
    mapArea.addEventListener('mouseleave', handleLeave, true);
  }

  function setupObservers() {
    const subObserver = new MutationObserver(() => {
      rebuildGridInfo();
    });
    const attachSubObserver = () => {
      const mapArea = $(CONFIG.MAP_AREA_SELECTOR);
      if (!mapArea) return;
      try { subObserver.disconnect(); } catch {}
      subObserver.observe(mapArea, { childList: true, subtree: true });
    };
    const rootObserver = new MutationObserver(() => {
      const mapArea = $(CONFIG.MAP_AREA_SELECTOR);
      if (!mapArea) return;
      bindMouse();
      rebuildGridInfo();
      attachSubObserver();
    });
    rootObserver.observe(document.body, { childList: true, subtree: true });
    if ($(CONFIG.MAP_AREA_SELECTOR)) {
      bindMouse();
      rebuildGridInfo();
      attachSubObserver();
    }
  }

  window.addEventListener('resize', () => {
    rebuildGridInfo();
  });

  setupObservers();
})();
