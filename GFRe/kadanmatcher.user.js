// ==UserScript==
// @name         GFRe 相性花壇サーチャ
// @namespace    gfre.kadan.matcher
// @version      0.1.0
// @description  自キャラの花壇ステータスを取得し、キャラリスト全ページを走査して相性候補をCSV出力
// @match        https://soraniwa.428.st/gf/*
// @run-at       document-idle
// @grant        GM_registerMenuCommand
// ==/UserScript==

(() => {
  'use strict';

  const BASE = location.origin + '/gf/';
  const PAGES = Array.from({length: 16}, (_, i) => i); // 0..15

  function $(sel, root = document) { return root.querySelector(sel); }
  function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  async function fetchHTML(url) {
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
    const text = await r.text();
    const doc = new DOMParser().parseFromString(text, 'text/html');
    return { doc, html: text, url };
  }

  function getSelfENoFromDoc(doc) {
    const a = doc.querySelector('a[href*="mode=result&reseno="]');
    if (!a) return null;
    const m = a.getAttribute('href').match(/reseno=(\d+)/);
    return m ? Number(m[1]) : null;
  }

  function parseProfileStats(html) {
    const keys = ['STR','AGI','DEX','MAG','VIT','MNT'];
    const out = {};
    for (const k of keys) {
      const re = new RegExp(k + '\\s*<\\/span>\\s*<span\\s+class="status">\\s*(\\d+)', 'i');
      const m = html.match(re);
      out[k] = m ? Number(m[1]) : 0;
    }
    return out;
  }

  function kadanFromStats(st) {
    return {
      水やり: (st.STR || 0) + (st.MAG || 0),
      施肥:   (st.AGI || 0) + (st.VIT || 0),
      手入れ: (st.DEX || 0) + (st.MNT || 0),
    };
  }

  function parseListPage(doc) {
    const rows = [];
    const trs = doc.querySelectorAll('table.itemlist tr');
    for (const tr of trs) {
      const tds = tr.querySelectorAll('td');
      if (tds.length < 3) continue;
      const enoText = (tds[0].textContent || '').trim();
      const mEno = enoText.match(/Eno\.(\d+)/);
      if (!mEno) continue;
      const eno = Number(mEno[1]);
      const sub = tr.querySelector('small.subtext');
      if (!sub) continue;
      const txt = sub.textContent || '';
      const stats = {
        STR: num(/STR:(\d+)/),
        AGI: num(/AGI:(\d+)/),
        DEX: num(/DEX:(\d+)/),
        MAG: num(/MAG:(\d+)/),
        VIT: num(/VIT:(\d+)/),
        MNT: num(/MNT:(\d+)/),
      };
      rows.push({ eno, stats });
      function num(re) {
        const m = txt.match(re);
        return m ? Number(m[1]) : 0;
      }
    }
    return rows;
  }

  function toCSV(rows) {
    const header = ['ENo','水やり合算','施肥合算','手入れ合算'];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push([r.eno, r.sum水やり, r.sum施肥, r.sum手入れ].join(','));
    }
    return lines.join('\n');
  }

  function downloadCSV(text, filename = 'kadan_match.csv') {
    const blob = new Blob([text], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 800);
  }

  function addButton() {
    if (document.getElementById('kadanScanBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'kadanScanBtn';
    btn.textContent = '相性探索CSV出力';
    Object.assign(btn.style, {
      position: 'fixed',
      top: '42px',
      left: '8px',
      zIndex: 2147483647,
      fontSize: '12px',
      padding: '6px 8px',
      borderRadius: '6px',
      border: '1px solid #c9c9c9',
      background: '#fff',
      cursor: 'pointer',
      boxShadow: '0 1px 3px rgba(0,0,0,.2)'
    });
    btn.addEventListener('click', run);
    document.body.appendChild(btn);
  }

  function setBusy(b) {
    const btn = document.getElementById('kadanScanBtn');
    if (!btn) return;
    btn.disabled = b;
    btn.textContent = b ? '実行中...' : '相性探索CSV出力';
    btn.style.opacity = b ? '0.6' : '1';
  }

  async function run() {
    try {
      setBusy(true);
      let selfENo = getSelfENoFromDoc(document);
      if (!selfENo) {
        const { doc: list0 } = await fetchHTML(BASE + '?mode=list&cname=&tag=&seltype=0&type=&skillname=&sort=eno_asc&page=0');
        selfENo = getSelfENoFromDoc(list0);
      }
      if (!selfENo) throw new Error('自分のENoを取得できませんでした。ログイン状態を確認してください。');

      const prof = await fetchHTML(BASE + '?mode=profile&eno=' + selfENo);
      const myStats = parseProfileStats(prof.html);
      const myKadan = kadanFromStats(myStats);

      // 配列「花壇1」に格納（グローバル公開）
      window['花壇1'] = [myKadan.水やり, myKadan.施肥, myKadan.手入れ];
      console.log('花壇1 = ', window['花壇1']);

      const hits = [];
      for (const p of PAGES) {
        const url = BASE + '?mode=list&cname=&tag=&seltype=0&type=&skillname=&sort=eno_asc&page=' + p;
        const { doc } = await fetchHTML(url);
        const rows = parseListPage(doc);
        for (const r of rows) {
          if (r.eno === selfENo) continue;
          const kd = kadanFromStats(r.stats);
          const sum水やり = myKadan.水やり + kd.水やり;
          const sum施肥   = myKadan.施肥   + kd.施肥;
          const sum手入れ = myKadan.手入れ + kd.手入れ;
          if (sum水やり > 300 && sum施肥 > 300 && sum手入れ > 300) {
            hits.push({ eno: r.eno, sum水やり, sum施肥, sum手入れ });
          }
        }
      }

      hits.sort((a, b) => (b.sum水やり + b.sum施肥 + b.sum手入れ) - (a.sum水やり + a.sum施肥 + a.sum手入れ));
      const csv = toCSV(hits);
      downloadCSV(csv, 'kadan_match.csv');
      alert('相性探索を完了しました。候補数: ' + hits.length + ' 件。CSVを保存しました。');
    } catch (e) {
      console.error(e);
      alert('エラー: ' + e.message);
    } finally {
      setBusy(false);
    }
  }

  addButton();
  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('相性探索CSV出力', run);
  }
})();
