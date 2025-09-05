// ==UserScript==
// @name         GFRe SkillMix
// @namespace    gfre.skillmix
// @version      0.8.2
// @description  スキルの合成結果をプレビュー
// @match        https://soraniwa.428.st/gf/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
(function () {
  'use strict';

  const COL_W = {
    mix: 55,        // 合成
    no: 25,         // No.
    type: 64,       // タイプ
    traitname: 200, // [性質] スキル名
    desc: 480,      // 説明
    count: 45,      // 発動数
    rank: 30        // Rank
  };
  const ROW_BG = {
    base:     '#f0ffd0', // ベース行
    material: '#ffffdd', // 素材行
    result:   '#ffffff'  // 完成品行
  };

  const qs  = (s, r = document) => r.querySelector(s);
  const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));

  // コントロール取得
  function getCtrl() {
    const baseSel = qs('select[name="kouhai_base"]');
    const mixSel  = qs('select[name="kouhai_mix"]');
    const nameInp = qs('input[name="newskillname"]');
    const method  = () => qs('input[name="kouhai_method"]:checked')?.value || '0';
    return { baseSel, mixSel, nameInp, method };
  }

  // option
  function parseOptionFull(label) {
    const L = label || '';
    const m = L.match(/^\s*(\d+)\.\s*(.*)$/);
    const no = m ? m[1] : '';
    const rest = m ? m[2] : L;
    const a = rest.split('/', 2);
    return { no, trait: (a[0] || '').trim(), name: (a[1] || a[0] || '').trim() };
  }

  const starCache = new Map();
  const optCache  = new Map();
  const descCache = new Map();
  const statCache = new Map();

  function starHTML(id) {
    if (!id || id === '0') return '';
    if (starCache.has(id)) return starCache.get(id);
    const cell = qs('#type' + id);
    let html = '';
    if (cell) {
      const sp = cell.querySelector('span.type');
      html = sp ? sp.outerHTML : '';
    }
    starCache.set(id, html);
    return html;
  }

  // optionから取得
  function optInfo(id) {
    if (!id || id === '0') return { no: '', trait: '', name: '' };
    if (optCache.has(id)) return optCache.get(id);
    const opt = qs(
      `select[name="kouhai_base"] option[value="${id}"], ` +
      `select[name="kouhai_mix"] option[value="${id}"]`
    );
    const rec = parseOptionFull(opt ? opt.textContent : '');
    optCache.set(id, rec);
    return rec;
  }

  // 説明
  function descHTML(id) {
    if (!id || id === '0') return '';
    if (descCache.has(id)) return descCache.get(id);
    const cell = qs('#desc' + id);
    let html = '';
    if (cell) {
      const sp = cell.querySelector('.skillhoverdesc');
      html = sp ? sp.innerHTML : cell.innerHTML;
    }
    descCache.set(id, html);
    return html;
  }

  // 発動数とRank
  function statHTML(id) {
    if (!id || id === '0') return { countHTML: '', rankHTML: '' };
    if (statCache.has(id)) return statCache.get(id);
    const nameTd = qs(`#skill tbody td.skilllistname[data-sno="${id}"]`);
    let countHTML = '', rankHTML = '';
    if (nameTd) {
      const tr  = nameTd.closest('tr');
      const tds = tr ? tr.querySelectorAll('td') : null;
      if (tds && tds.length >= 6) {
        countHTML = tds[4].innerHTML;
        rankHTML  = tds[5].innerHTML;
      }
    }
    const rec = { countHTML, rankHTML };
    statCache.set(id, rec);
    return rec;
  }

  // 完成品の見出し
  function buildHead(method, baseId, mixId, customName) {
    if (!baseId || baseId === '0') return '--設定なし--';
    let sHTML = starHTML(baseId);
    let { trait, name } = optInfo(baseId);

    if (method === '1') {
      const m = starHTML(mixId);
      if (m) sHTML = m;
    } else if (method === '2') {
      const m = optInfo(mixId);
      if (m.trait) trait = m.trait;
    }

    if (customName && customName.trim()) name = customName.trim();
    const tHTML = trait ? `<span style="color:#006B3E;">[${trait}]</span> ` : '';
    return `${sHTML}${tHTML}${name}`;
  }

  function kindCellHTML(kind) {
    return kind;
  }

  function buildRow(kind, id, method, baseId, mixId, customName, bgColor) {
    const isResult = kind === '完成品';
    const no = isResult ? optInfo(baseId).no : optInfo(id).no;
    const typeHTML = isResult
      ? (method === '1' ? starHTML(mixId) || starHTML(baseId) : starHTML(baseId))
      : starHTML(id);

    let traitNameHTML = '';
    if (isResult) {
      const combined = buildHead(method, baseId, mixId, customName);

      traitNameHTML = combined.replace(/^<span[^>]*class="type[^"]*"[^>]*>.*?<\/span>\s*/, '');
    } else {
      const tinfo = optInfo(id);
      const traitHTML = tinfo.trait ? `<span style="color:#006B3E;">[${tinfo.trait}]</span> ` : '';
      traitNameHTML = `${traitHTML}${tinfo.name || ''}`;
    }

    const desc   = isResult ? descHTML(baseId) : descHTML(id);
    const stats  = isResult ? statHTML(baseId) : statHTML(id);
    const tdBase = `background:${bgColor};`;

    return `
      <tr class="skill_skillbook">
        <td class="mixcol" style="${tdBase}width:${COL_W.mix}px;">${kindCellHTML(kind)}</td>
        <td style="${tdBase}text-align:center;width:${COL_W.no}px;">${no || ''}</td>
        <td style="${tdBase}width:${COL_W.type}px;">${typeHTML || ''}</td>
        <td style="${tdBase}width:${COL_W.traitname}px;">${traitNameHTML}</td>
        <td style="${tdBase}width:${COL_W.desc}px;" class="skillact">${desc || ''}</td>
        <td style="${tdBase}text-align:center;width:${COL_W.count}px;">${stats.countHTML || ''}</td>
        <td style="${tdBase}text-align:center;width:${COL_W.rank}px;">${stats.rankHTML || ''}</td>
      </tr>
    `;
  }

  // テーブル生成
  function mountUI(ctrl) {
    if (qs('#mix-preview-table')) {
      return { tbody: qs('#mix-preview-tbody'), table: qs('#mix-preview-table') };
    }

    const anchor =
      ctrl.baseSel?.closest('p') ||
      ctrl.mixSel?.closest('p')  ||
      ctrl.nameInp?.closest('p') ||
      ctrl.baseSel?.parentElement;

    if (!anchor) return null;

    (function removeOneTrailingBrAround(elem) {
      // 段落内部末尾
      let n = elem.lastChild;
      while (n && n.nodeType === 3 && !n.textContent.trim()) n = n.previousSibling;
      if (n && n.nodeType === 1 && n.tagName === 'BR') n.remove();
      // 段落直後
      let ns = elem.nextSibling;
      while (ns && ns.nodeType === 3 && !ns.textContent.trim()) ns = ns.nextSibling;
      if (ns && ns.nodeType === 1 && ns.tagName === 'BR') ns.parentNode.removeChild(ns);
    })(anchor);

    const skillTable = qs('#skill');
    const sameWidth  = skillTable ? Math.round(skillTable.getBoundingClientRect().width) : 0;

    const tableWrap = document.createElement('div');
    tableWrap.id = 'mix-preview-wrap';
    tableWrap.innerHTML = `
      <table class="itemlist" id="mix-preview-table" style="${sameWidth ? `width:${sameWidth}px;` : ''}">
        <thead>
          <tr>
            <th width="${COL_W.mix}">合成</th>
            <th width="${COL_W.no}">No.</th>
            <th width="${COL_W.type}">タイプ</th>
            <th width="${COL_W.traitname}">[性質] スキル名</th>
            <th width="${COL_W.desc}">説明</th>
            <th width="${COL_W.count}">発動数</th>
            <th width="${COL_W.rank}">Rank</th>
          </tr>
        </thead>
        <tbody id="mix-preview-tbody"></tbody>
      </table>
    `;

    anchor.parentNode.insertBefore(tableWrap, anchor.nextSibling);

    // 表の直後に<br>を1つ付与
    tableWrap.parentNode.insertBefore(document.createElement('br'), tableWrap.nextSibling);

    return { tbody: qs('#mix-preview-tbody'), table: qs('#mix-preview-table') };
  }

  // スタイル
  const style = document.createElement('style');
  style.textContent = `
    #mix-preview-table td.mixcol { padding-left: 0; padding-right: 0; text-align: center; }
    #mix-preview-table td.mixcol .marks { display: none; }

    #mix-preview-table tbody td:nth-child(1),
    #mix-preview-table tbody td:nth-child(2),
    #mix-preview-table tbody td:nth-child(3),
    #mix-preview-table tbody td:nth-child(6),
    #mix-preview-table tbody td:nth-child(7) {
      padding-left: 0;
      padding-right: 0;
      text-align: center;
    }
  `;
  document.head.appendChild(style);

  // 更新
  let raf = 0;
  function scheduleUpdate(ctrl, out) {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;

      const baseId = ctrl.baseSel?.value || '0';
      const mixId  = ctrl.mixSel?.value  || '0';
      const meth   = ctrl.method();
      const cname  = ctrl.nameInp?.value || '';

      // optionキャッシュ更新
      qsa('select[name="kouhai_base"] option, select[name="kouhai_mix"] option').forEach(o => {
        const v = o.value;
        if (v && v !== '0' && !optCache.has(v)) {
          optCache.set(v, parseOptionFull(o.textContent));
        }
      });

      const rowsHTML = [
        buildRow('ベース', baseId, meth, baseId, mixId, cname, ROW_BG.base),
        buildRow('素材',   mixId,  meth, baseId, mixId, cname, ROW_BG.material),
        buildRow('完成品', baseId, meth, baseId, mixId, cname, ROW_BG.result)
      ].join('');

      out.tbody.innerHTML = rowsHTML;
    });
  }

  // 初期化
  function init() {
    const ctrl = getCtrl();
    if (!ctrl.baseSel || !ctrl.mixSel) return;

    const out = mountUI(ctrl);
    if (!out) return;

    const onChange = () => scheduleUpdate(ctrl, out);
    ctrl.baseSel.addEventListener('change', onChange, { passive: true });
    ctrl.mixSel.addEventListener('change', onChange, { passive: true });
    qsa('input[name="kouhai_method"]').forEach(r => r.addEventListener('change', onChange, { passive: true }));
    if (ctrl.nameInp) ctrl.nameInp.addEventListener('input', onChange, { passive: true });

    scheduleUpdate(ctrl, out);

    // 横幅追従
    window.addEventListener('resize', () => {
      const skillTable = qs('#skill');
      const tgt = qs('#mix-preview-table');
      if (skillTable && tgt) {
        const w = Math.round(skillTable.getBoundingClientRect().width);
        if (w) tgt.style.width = w + 'px';
      }
    }, { passive: true });
  }

  if (qs('select[name="kouhai_base"]')) {
    init();
  } else {
    const t0 = performance.now();
    const timer = setInterval(() => {
      if (qs('select[name="kouhai_base"]')) { clearInterval(timer); init(); }
      if (performance.now() - t0 > 15000) clearInterval(timer);
    }, 200);
  }
})();
