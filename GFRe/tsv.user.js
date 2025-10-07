// ==UserScript==
// @name         GFre ステータス合計値
// @namespace    GFre.tsv
// @version      1.1.0
// @description  キャラリスト閲覧時にステータス合計値を表示しTsv列で並べ替え
// @match        https://soraniwa.428.st/gf/?mode=list*
// @run-at       document-end
// @grant        none
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  const TABLE_SEL = 'table.itemlist#skill';

  const textIncl = (el, kw) => el && el.textContent && el.textContent.replace(/\s+/g, '').includes(kw);

  function getHeaderRow(table) {
    const thead = table.querySelector('thead tr');
    if (thead && thead.querySelector('th')) return thead;
    const tbody = table.querySelector('tbody');
    if (!tbody) return null;
    return Array.from(tbody.querySelectorAll('tr')).find(tr => tr.querySelector('th')) || null;
  }

  function parseTsvFromRow(tr) {
    const host = tr.querySelector('small.subtext') || tr.querySelector('.subtext') || tr;
    const txt = host ? host.textContent : '';
    const keys = ['STR', 'AGI', 'DEX', 'MAG', 'VIT', 'MNT'];
    let sum = 0;
    for (const k of keys) {
      const m = txt.match(new RegExp(k + '\\s*[:：]\\s*(-?\\d+)', 'i'));
      sum += m ? parseInt(m[1], 10) : 0;
    }
    return sum;
  }

  function ensureHeader(table) {
    const head = getHeaderRow(table);
    if (!head) return null;
    let ths = Array.from(head.querySelectorAll('th'));
    let idxFav = ths.findIndex(th => textIncl(th, 'Fav'));
    let idxTsv = ths.findIndex(th => textIncl(th, 'Tsv'));
    if (idxFav === -1) return null;
    if (idxTsv === -1) {
      const th = document.createElement('th');
      th.textContent = 'Tsv';
      th.setAttribute('width', '5%');
      const mark = document.createElement('span');
      mark.className = 'gfre-tsv-mark';
      mark.textContent = ' ▽';
      mark.style.opacity = '0.7';
      th.appendChild(mark);
      head.insertBefore(th, head.children[idxFav]); // Favの直前
      ths = Array.from(head.querySelectorAll('th'));
      idxFav = ths.findIndex(t => textIncl(t, 'Fav'));
      idxTsv = ths.findIndex(t => textIncl(t, 'Tsv'));
    }
    return { idxTsv };
  }

  function ensureTsvCells(table) {
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('tr')).filter(tr => tr.querySelector('td'));
    rows.forEach((tr, i) => {
      const total = parseTsvFromRow(tr);
      tr.dataset.gfreTsv = String(total);
      if (!tr.dataset.gfreOrig) tr.dataset.gfreOrig = String(i);

      // Favセル検出
      let fav = tr.querySelector('td:last-child');
      if (!fav) return;
      if (fav.dataset && fav.dataset.gfreCol === 'tsv') {
        fav = fav.previousElementSibling;
        if (!fav) return;
      }

      // Tsvセル挿入または移動
      let tsv = tr.querySelector('td[data-gfre-col="tsv"]');
      if (!tsv) {
        tsv = document.createElement('td');
        tsv.dataset.gfreCol = 'tsv';
      }
      tsv.style.textAlign = 'right';
      tsv.textContent = total.toString();
      tr.insertBefore(tsv, fav); // Fav直前を常に正位置とする
    });
  }

  function attachSort(table, idxTsv) {
    const head = getHeaderRow(table);
    if (!head) return;
    const tsvTh = head.querySelectorAll('th')[idxTsv];
    if (!tsvTh) return;

    const tbody = table.querySelector('tbody');
    const mark = tsvTh.querySelector('.gfre-tsv-mark');
    let state = 'none';

    function setMark() {
      if (!mark) return;
      if (state === 'asc') { mark.textContent = ' ▲'; mark.style.opacity = '1'; }
      else if (state === 'desc') { mark.textContent = ' ▼'; mark.style.opacity = '1'; }
      else { mark.textContent = ' ▽'; mark.style.opacity = '0.7'; }
    }

    function sortNow() {
      const rows = Array.from(tbody.querySelectorAll('tr')).filter(tr => tr.querySelector('td'));
      const pack = rows.map(tr => ({
        tr,
        v: parseInt(tr.dataset.gfreTsv || '0', 10),
        o: parseInt(tr.dataset.gfreOrig || '0', 10)
      }));
      if (state === 'asc') pack.sort((a, b) => a.v - b.v || a.o - b.o);
      else if (state === 'desc') pack.sort((a, b) => b.v - a.v || a.o - b.o);
      else pack.sort((a, b) => a.o - b.o);
      pack.forEach(x => tbody.appendChild(x.tr));
    }

    tsvTh.style.cursor = 'pointer';
    tsvTh.title = 'クリックで昇順⇄降順。ダブルクリックで元順序';
    tsvTh.addEventListener('click', () => {
      if (state === 'none') state = 'desc';
      else state = (state === 'desc') ? 'asc' : 'desc';
      setMark();
      sortNow();
    });
    tsvTh.addEventListener('dblclick', e => { e.preventDefault(); state = 'none'; setMark(); sortNow(); });
    setMark();
  }

  function main() {
    const table = document.querySelector(TABLE_SEL);
    if (!table) return;
    const pos = ensureHeader(table);
    if (!pos) return;
    ensureTsvCells(table);
    attachSort(table, pos.idxTsv);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
  } else {
    main();
  }
})();
