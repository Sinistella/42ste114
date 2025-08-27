// ==UserScript==
// @name         GFRe Chara Search
// @namespace    gfre.chara.search
// @version      1.2.0
// @description  スキルを最大5個までAND条件検索
// @match        https://soraniwa.428.st/gf/?mode=list
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const STORAGE_PENDING = 'gfre-and-skillsearch-pending';
  const qs = (s, d=document) => d.querySelector(s);
  const qsa = (s, d=document) => Array.from(d.querySelectorAll(s));
  const wait = ms => new Promise(r => setTimeout(r, ms));

  const params = new URLSearchParams(location.search);
  if (params.get('mode') !== 'list') return;

  const skillInput = document.querySelector('input[name="skillname"]');
  const form = skillInput ? skillInput.closest('form') : null;
  let table = qs('table#skill');
  if (!form || !table) return;

  // UI
  const ui = document.createElement('div');
  ui.style.margin = '8px 0';
  ui.innerHTML = `
    <div style="padding:8px;border:1px dashed #c9c3b6;border-radius:6px;background:#fffff8">
      <div style="margin-bottom:6px;font-weight:bold">スキルAND検索</div>
      <div style="margin-top:4px;color:#a33;font-size:90%">※このAND検索は公式の検索結果と併用できません。</br>　検索を実行すると公式検索の一覧と件数表示は拡張結果に置き換えられます。</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
        <label>スキル1 <input type="text" id="and-skill-1" size="16" placeholder="必須"></label>
        <label>スキル2 <input type="text" id="and-skill-2" size="16" placeholder="任意"></label>
        <label>スキル3 <input type="text" id="and-skill-3" size="16" placeholder="任意"></label>
        <label>スキル4 <input type="text" id="and-skill-4" size="16" placeholder="任意"></label>
        <label>スキル5 <input type="text" id="and-skill-5" size="16" placeholder="任意"></label>
        <input type="button" id="and-run" value="AND検索実行" title="実行後は自動でリロードされます">
        <input type="button" id="and-reset" value="検索結果リセット">
        <small id="and-note" style="margin-left:8px;color:#555"></small>
      </div>
    </div>
  `;
  form.parentNode.insertBefore(ui, form.nextSibling);

  const sortSel = qsa('select[name="sort"]', form)[0];
  const currentSort = () => sortSel ? sortSel.value : 'eno_asc';

  // 公式の「合計：n件」が書かれている段落を、テーブル直前で特定して上書きする
  function findOfficialTotalP() {
    // キャラリストの公式構造では、テーブル直前の<p>に「合計： n件」とページャが入る
    // 近傍探索でテーブルの直前から最大8ノードさかのぼる
    let n = table.previousSibling;
    let step = 0;
    while (n && step < 8) {
      if (n.nodeType === 1 && n.tagName === 'P' && /合計\s*：?\s*\d+\s*件/.test(n.textContent)) return n;
      n = n.previousSibling;
      step++;
    }
    // 見つからない場合のフォールバック。最初に合致したもの
    return qsa('p').find(p => /合計\s*：?\s*\d+\s*件/.test(p.textContent)) || null;
  }

  function overwriteOfficialTotal(n) {
    const p = findOfficialTotalP();
    if (!p) return;
    // ②だけに表示したいので、他の重複表示は削除
    // テーブルの直後や他位置にある合計段落を念のため除去
    qsa('p').forEach(x => {
      if (x !== p && /合計\s*：?\s*\d+\s*件/.test(x.textContent)) x.remove();
    });
    p.innerHTML = `<br>合計： ${n}件<br>`;
  }

  async function fetchAllForSkill(skill, sort) {
    const base = new URL(location.href);
    base.searchParams.set('mode', 'list');
    base.searchParams.set('cname', '');
    base.searchParams.set('tag', '');
    base.searchParams.set('seltype', '0');
    base.searchParams.set('type', '');
    base.searchParams.set('skillname', skill);
    base.searchParams.set('sort', sort || 'eno_asc');

    const enoToRow = new Map();
    let page = 0;
    let safety = 500;

    while (safety-- > 0) {
      base.searchParams.set('page', String(page));
      const res = await fetch(base.toString(), { credentials: 'include' });
      const html = await res.text();
      const dom = new DOMParser().parseFromString(html, 'text/html');
      const rows = qsa('table#skill tr', dom).slice(1);
      if (rows.length === 0) break;

      let added = 0;
      for (const tr of rows) {
        const tds = qsa('td', tr);
        if (tds.length === 0) continue;
        const enoTxt = tds[0].textContent || '';
        const m = enoTxt.match(/Eno\.(\d+)/);
        if (!m) continue;
        const eno = Number(m[1]);
        if (!enoToRow.has(eno)) { enoToRow.set(eno, tr.outerHTML); added++; }
      }
      if (added === 0) break;

      const hasNext = qsa('a[href*="page="]', dom).some(a => {
        const t = (a.textContent || '').replace(/\s/g, '');
        return t.includes('次') || t.includes('>>');
      });
      if (!hasNext) break;

      page += 1;
      await wait(120 + Math.random() * 180);
    }
    return enoToRow;
  }

  function renderRowsFromEnos(enoSet, rowSourceMap) {
    const newTable = table.cloneNode(true);
    qsa('tr', newTable).slice(1).forEach(tr => tr.remove());

    const enos = Array.from(enoSet).sort((a, b) => a - b);
    if (enos.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.textContent = '該当なし';
      td.style.textAlign = 'center';
      tr.appendChild(td);
      newTable.tBodies[0].appendChild(tr);
    } else {
      const frag = document.createDocumentFragment();
      for (const eno of enos) {
        const html = rowSourceMap.get(eno);
        if (!html) continue;
        const tmp = document.createElement('tbody');
        tmp.innerHTML = html;
        frag.appendChild(tmp.firstElementChild);
      }
      newTable.tBodies[0].appendChild(frag);
    }
    table.replaceWith(newTable);
    table = newTable;

    // 件数は公式の合計欄のみを上書き
    overwriteOfficialTotal(enos.length);
  }

  async function quickCount(skill, sort) {
    const u = new URL(location.href);
    u.searchParams.set('mode','list'); u.searchParams.set('page','0');
    u.searchParams.set('cname',''); u.searchParams.set('tag',''); u.searchParams.set('seltype','0'); u.searchParams.set('type','');
    u.searchParams.set('skillname', skill); u.searchParams.set('sort', sort || 'eno_asc');
    const html = await fetch(u.toString(), {credentials:'include'}).then(r=>r.text());
    const dom = new DOMParser().parseFromString(html,'text/html');
    const text = Array.from(dom.querySelectorAll('p')).map(p => p.textContent).join('\n');
    const m = text.match(/合計\s*：?\s*(\d+)\s*件/);
    return m ? parseInt(m[1],10) : Number.POSITIVE_INFINITY;
  }

  async function runAndSearchWith(skills, sort) {
    const note = qs('#and-note');
    note.textContent = '検索中';
    try {
      // 進捗表示はするが件数は出さない
      const pairs = [];
      for (const s of skills) pairs.push([s, await quickCount(s, sort)]);
      pairs.sort((a,b) => a[1]-b[1]);
      skills = pairs.map(p => p[0]);

      let mapAgg = await fetchAllForSkill(skills[0], sort);
      let interSet = new Set(mapAgg.keys());
      for (let i = 1; i < skills.length; i++) {
        const mapN = await fetchAllForSkill(skills[i], sort);
        const setN = new Set(mapN.keys());
        interSet = new Set([...interSet].filter(x => setN.has(x)));
        mapAgg = mapAgg.size >= mapN.size ? mapAgg : mapN;
        if (interSet.size === 0) break;
      }
      renderRowsFromEnos(interSet, mapAgg);
      note.textContent = ''; // 件数はここでは出さない
      // 公式以外の余分な合計表示を念のため掃除
      qsa('p').forEach(x => {
        const pOfficial = findOfficialTotalP();
        if (!pOfficial) return;
        if (x !== pOfficial && /合計\s*：?\s*\d+\s*件/.test(x.textContent)) x.remove();
      });
    } catch (e) {
      console.error(e);
      note.textContent = 'エラーが発生しました';
    }
  }

  // ボタン
  qs('#and-run').addEventListener('click', (ev) => {
    ev.currentTarget.disabled = true;
    const inputs = [
      qs('#and-skill-1').value.trim(),
      qs('#and-skill-2').value.trim(),
      qs('#and-skill-3').value.trim(),
      qs('#and-skill-4').value.trim(),
      qs('#and-skill-5').value.trim(),
    ].filter(v => v.length > 0);

    if (inputs.length === 0) {
      qs('#and-note').textContent = '少なくとも1つのスキル名を入力してください';
      ev.currentTarget.disabled = false;
      return;
    }

    const payload = { skills: Array.from(new Set(inputs)), sort: currentSort() };
    // リロード後、UIへ復元するためpendingは消さずに保持。run完了時に消す。
    sessionStorage.setItem(STORAGE_PENDING, JSON.stringify(payload));
    location.reload();
  });

  qs('#and-reset').addEventListener('click', () => {
    sessionStorage.removeItem(STORAGE_PENDING);
    location.replace = 'https://soraniwa.428.st/gf/?mode=list';
  });

  // リロード後の自動復元と実行
  const pendingRaw = sessionStorage.getItem(STORAGE_PENDING);
  if (pendingRaw) {
    try {
      const { skills, sort } = JSON.parse(pendingRaw);

      // 入力欄の復元。リロードしても何のスキルで検索したか見えるようにする
      const boxes = [
        qs('#and-skill-1'),
        qs('#and-skill-2'),
        qs('#and-skill-3'),
        qs('#and-skill-4'),
        qs('#and-skill-5'),
      ].filter(Boolean);
      boxes.forEach((el, i) => { el.value = skills[i] || ''; });

      // 実行
      runAndSearchWith(skills, sort).then(() => {
        // 実行が終わったらpendingを削除
        sessionStorage.removeItem(STORAGE_PENDING);
      }).catch(() => {
        sessionStorage.removeItem(STORAGE_PENDING);
      });
    } catch {
      sessionStorage.removeItem(STORAGE_PENDING);
    }
  }
})();
