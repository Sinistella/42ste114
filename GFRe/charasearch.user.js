// ==UserScript==
// @name         GFRe Skill Search
// @namespace    gfre.skill.search
// @version      1.2.0
// @description  スキル名を最大5個までAND条件検索
// @match        https://soraniwa.428.st/gf/?mode=list*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  const qs = (s, d=document) => d.querySelector(s);
  const qsa = (s, d=document) => Array.from(d.querySelectorAll(s));
  const params = new URLSearchParams(location.search);
  if (params.get('mode') !== 'list') return;
  const skillInput = qs('input[name="skillname"]');
  const form = skillInput ? skillInput.closest('form') : null;
  if (!form || !skillInput) return;

  const ui = document.createElement('div');
  ui.style.margin = '8px 0';
  ui.innerHTML = `
    <div style="padding:8px;border:1px dashed #c9c3b6;border-radius:6px;background:#fffff8">
      <div style="margin-bottom:6px;font-weight:bold">スキルAND検索（半角スペース区切り）</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
        <label>スキル1 <input type="text" id="and-skill-1" size="16" placeholder="必須"></label>
        <label>スキル2 <input type="text" id="and-skill-2" size="16" placeholder="任意"></label>
        <label>スキル3 <input type="text" id="and-skill-3" size="16" placeholder="任意"></label>
        <label>スキル4 <input type="text" id="and-skill-4" size="16" placeholder="任意"></label>
        <label>スキル5 <input type="text" id="and-skill-5" size="16" placeholder="任意"></label>
        <input type="button" id="and-run" value="AND検索を実行">
        <input type="button" id="and-reset" value="検索結果をリセット">
        <small id="and-note" style="margin-left:8px;color:#555"></small>
      </div>
    </div>
  `;
  form.parentNode.insertBefore(ui, form.nextSibling);

  const UI_STORE = 'gfre-and-skillsearch-refactor-ui';
  const saved = sessionStorage.getItem(UI_STORE);
  if (saved) {
    try {
      const arr = JSON.parse(saved);
      ['#and-skill-1','#and-skill-2','#and-skill-3','#and-skill-4','#and-skill-5']
        .forEach((sel,i) => { const el = qs(sel); if (el) el.value = arr[i] || ''; });
    } finally {
      sessionStorage.removeItem(UI_STORE);
    }
  }

  function buildSkillQuery() {
    const vals = [
      qs('#and-skill-1')?.value || '',
      qs('#and-skill-2')?.value || '',
      qs('#and-skill-3')?.value || '',
      qs('#and-skill-4')?.value || '',
      qs('#and-skill-5')?.value || '',
    ].map(v => v.replace(/\u3000/g, ' ').trim())
     .filter(v => v.length > 0);
    const uniq = Array.from(new Set(vals));
    return uniq.join(' ');
  }

  qs('#and-run').addEventListener('click', () => {
    const note = qs('#and-note');
    const s = buildSkillQuery();
    if (!s) {
      note.textContent = '少なくとも1つのスキル名を入力してください';
      return;
    }
    const vals = [
      qs('#and-skill-1')?.value || '',
      qs('#and-skill-2')?.value || '',
      qs('#and-skill-3')?.value || '',
      qs('#and-skill-4')?.value || '',
      qs('#and-skill-5')?.value || '',
    ];
    sessionStorage.setItem(UI_STORE, JSON.stringify(vals));
    skillInput.value = s;
    form.submit();
  });

  qs('#and-reset').addEventListener('click', () => {
    sessionStorage.removeItem(UI_STORE);
    const base = `${location.origin}/gf/?mode=list`;
    location.replace(base);
  });
})();
