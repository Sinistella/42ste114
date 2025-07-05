// ==UserScript==
// @name         北摩ENOスティンガー
// @namespace    https://wdrb.work/
// @version      1.2
// @description  ENOでキャラ名＋現在地リンク検索（数字のみ入力可対応）
// @match        https://wdrb.work/otherside/field.php*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const contentBox = document.querySelector('.content_box');
    if (!contentBox) return;

    // カラーパレット（好きに弄って）
    const colors = {
        bg: 'rgba(36,36,36,0.97)',
        border: '#3F4A5A',
        text: '#F1F3F4',
        accent: '#FFEDB3',
        buttonBg: '#425062',
        buttonBgHover: '#516274',
        inputBg: '#1C2430',
        ura: '#FF5E5E',
        hyou: '#2994FF'
    };

    // UI本体
    const ui = document.createElement('div');
    ui.style.background = colors.bg;
    ui.style.border = `2px solid ${colors.border}`;
    ui.style.margin = '12px 0';
    ui.style.padding = '10px';
    ui.style.textAlign = 'center';
    ui.style.borderRadius = '8px';
    ui.style.fontWeight = 'bold';
    ui.style.color = colors.text;
    ui.style.fontFamily = "'Noto Sans JP', sans-serif";

    const inputStyle = [
        'width:120px',
        'padding:4px',
        'ime-mode:disabled',
        `background:${colors.inputBg}`,
        `color:${colors.text}`,
        `border:1px solid ${colors.border}`,
        'border-radius:4px'
    ].join(';');

    ui.innerHTML = [
        `<span style="color:${colors.text};">ENO検索：</span>`,
        `<input type="text" id="enoInput" placeholder="ENOを入力" style="${inputStyle}">`,
        `<button id="enoSearchBtn" style="margin-left:8px;padding:4px 12px;background:${colors.buttonBg};color:${colors.text};border:1px solid ${colors.border};border-radius:4px;cursor:pointer;transition:background .15s;">検索</button>`,
        `<div id="enoResult" style="margin-top:10px;min-height:1.6em;font-weight:normal;color:${colors.text};"></div>`
    ].join('');

    contentBox.parentNode.insertBefore(ui, contentBox.nextSibling);

    const enoInput = document.getElementById('enoInput');
    // 入力時：全角→半角＋数字以外は消去
    enoInput.addEventListener('input', () => {
        let val = enoInput.value;
        val = val.replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
        val = val.replace(/[^0-9]/g, '');
        enoInput.value = val;
    });
    // 入力自体も数字のみ許可
    enoInput.addEventListener('keypress', e => {
        if (!/[0-9]/.test(e.key)) e.preventDefault();
    });
    enoInput.setAttribute('autocomplete', 'off');
    enoInput.setAttribute('autocorrect', 'off');
    enoInput.setAttribute('autocapitalize', 'off');
    enoInput.setAttribute('spellcheck', 'false');
    enoInput.style.imeMode = 'disabled';

    const searchBtn = document.getElementById('enoSearchBtn');
    searchBtn.addEventListener('click', searchFunc);
    enoInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') searchFunc();
    });

    // ボタンhover効果
    document.addEventListener('mouseover', e => {
        if (e.target.id === 'enoSearchBtn') e.target.style.background = colors.buttonBgHover;
    });
    document.addEventListener('mouseout', e => {
        if (e.target.id === 'enoSearchBtn') e.target.style.background = colors.buttonBg;
    });

    // 検索本体（毎回最新HTMLをfetchしてパース）
    function searchFunc() {
        const eno = enoInput.value.trim();
        const resultDiv = document.getElementById('enoResult');

        // 半角数字のみ許可
        if (!/^[0-9]+$/.test(eno)) {
            resultDiv.textContent = 'ENOを正しく入力してください。（半角数字のみ）';
            return;
        }

        resultDiv.textContent = '最新情報を取得中…';

        fetch(location.href, {cache: 'reload'})
            .then(res => res.text())
            .then(html => {
                // 仮想DOMでパース
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                let found = false;
                let charName = '';
                let areaid = '';
                let foundSection = '';
                let foundArea = '';
                let isUra = false;
                let charUrl = `https://wdrb.work/otherside/profile.php?eno=${eno}`;

                doc.querySelectorAll('.arealist').forEach(arealist => {
                    const areaStatus = arealist.querySelector('.area_status');
                    if (!areaStatus) return;
                    const _areaid = arealist.getAttribute('data-areaid') || '';
                    const _sect = arealist.getAttribute('data-sectname') || '';
                    const _area = arealist.getAttribute('data-areaname') || '';
                    const classList = arealist.className;

                    areaStatus.querySelectorAll('li.cap').forEach(li => {
                        const a = li.querySelector('a[href*="profile.php?eno="]');
                        if (!a) return;
                        const m = a.href.match(/eno=([a-zA-Z0-9]+)/);
                        if (m && m[1] === eno) {
                            found = true;
                            charName = li.getAttribute('data-tippy-content') || `ENO.${eno}`;
                            areaid = _areaid;
                            foundSection = _sect;
                            foundArea = _area;
                            charUrl = a.href;
                            isUra = classList.includes('otherside');
                        }
                    });
                });

                if (!found) {
                    let lostName = '';
                    doc.querySelectorAll('li.cap').forEach(li => {
                        const a = li.querySelector('a[href*="profile.php?eno="]');
                        if (!a) return;
                        const m = a.href.match(/eno=([a-zA-Z0-9]+)/);
                        if (m && m[1] === eno) {
                            lostName = li.getAttribute('data-tippy-content') || '';
                            charUrl = a.href;
                        }
                    });
                    charName = lostName || `ENO.${eno}`;
                }

                if (found) {
                    const areaUrl = `https://wdrb.work/otherside/field.php?a_id=${areaid}&area_move=1`;
                    const hyouUra = isUra
                        ? `<span style="font-weight:bold;color:${colors.ura};">(裏)</span>`
                        : `<span style="font-weight:bold;color:${colors.hyou};">(表)</span>`;
                    resultDiv.innerHTML =
                        `<a href="${charUrl}" style="font-weight:bold;text-decoration:underline;color:${colors.accent};" target="_blank">${charName}</a> は ${hyouUra}${foundSection} - <a href="${areaUrl}" style="font-weight:bold;text-decoration:underline;color:${colors.accent};" target="_blank">${foundArea}</a> にいます。`;
                } else {
                    resultDiv.innerHTML =
                        `<a href="${charUrl}" style="font-weight:bold;text-decoration:underline;color:${colors.accent};" target="_blank">${charName}</a> は 見つかりません。`;
                }
            })
            .catch(() => {
                resultDiv.textContent = 'データの取得に失敗しました。ページを再読込してください。';
            });
    }
})();
