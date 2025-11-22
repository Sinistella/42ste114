// ==UserScript==
// @name         GFRe 花壇→花図鑑
// @namespace    gfre.kadan.zukanpicker
// @version      0.9.2
// @description  プルダウン→花図鑑ポップアップに
// @match        https://soraniwa.428.st/gf/*
// @run-at       document-end
// @grant        none
// ==/UserScript==
(function () {
    'use strict';

    if (!location.search.includes('mode=action')) return;

    const ZUKAN_URL = location.origin + '/gf/?mode=zukan2';

    let currentSelect = null;
    let nameToValueMap = null;
    const selectPreviewMap = new Map();

    window.addEventListener('load', init, false);

    function init() {
        const selects = Array.from(document.querySelectorAll('select[name^="newseed"]'));
        if (!selects.length) return;

        nameToValueMap = buildNameToValueMap(selects[0]);

        selects.forEach(setupSelectUI);
    }

    function buildNameToValueMap(select) {
        const map = new Map();
        Array.from(select.options).forEach(opt => {
            if (opt.value === '-1') return;
            const name = opt.text.trim().replace(/の種.*$/, '').trim();
            if (!name) return;
            map.set(name, opt.value);
        });
        return map;
    }

    // 各 newseed セレクトを差し替え
    function setupSelectUI(select) {
        const wrapper = document.createElement('div');
        wrapper.style.display = 'inline-flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.gap = '6px';
        wrapper.style.margin = '2px 0';

        const preview = document.createElement('span');
        preview.style.minWidth = '5em';
        preview.style.display = 'inline-block';
        preview.style.fontSize = '90%';

        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = '花図鑑から選ぶ';
        button.style.fontSize = '85%';
        button.style.padding = '2px 6px';
        button.style.cursor = 'pointer';

        wrapper.appendChild(preview);
        wrapper.appendChild(button);

        select.parentNode.insertBefore(wrapper, select.nextSibling);

        // select はフォーム用に残すが画面外へ
        select.style.position = 'absolute';
        select.style.left = '-9999px';

        selectPreviewMap.set(select, preview);
        refreshPreview(select);

        button.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            currentSelect = select;
            openZukanModal();
        });
    }

    function refreshPreview(select) {
        const preview = selectPreviewMap.get(select);
        if (!preview) return;

        const val = select.value;
        if (!val || val === '-1') {
            preview.textContent = '---';
            return;
        }
        const opt = select.querySelector('option[value="' + val + '"]');
        if (!opt) {
            preview.textContent = '(不明)';
            return;
        }
        preview.textContent = opt.text.trim().replace(/の種.*$/, '').trim() || '(不明)';
    }

    // -------------------------
    // 図鑑ポップアップ
    // -------------------------
    let modalOverlay = null;
    let modalIframe = null;

    function openZukanModal() {
        if (!modalOverlay) createZukanModal();
        modalOverlay.style.display = 'flex';
    }

    function closeZukanModal() {
        if (modalOverlay) modalOverlay.style.display = 'none';
        currentSelect = null;
    }

    function createZukanModal() {
        // オーバーレイ
        modalOverlay = document.createElement('div');
        modalOverlay.style.position = 'fixed';
        modalOverlay.style.left = '0';
        modalOverlay.style.top = '0';
        modalOverlay.style.width = '100%';
        modalOverlay.style.height = '100%';
        modalOverlay.style.backgroundColor = 'rgba(0,0,0,0.55)';
        modalOverlay.style.zIndex = '99999';
        modalOverlay.style.display = 'flex';
        modalOverlay.style.alignItems = 'center';
        modalOverlay.style.justifyContent = 'center';

        const dialog = document.createElement('div');
        dialog.style.backgroundColor = '#221820';
        dialog.style.borderRadius = '6px';
        dialog.style.border = '1px solid #aa9988';
        dialog.style.width = 'min(900px, 95vw)';
        dialog.style.height = 'min(560px, 85vh)';
        dialog.style.display = 'flex';
        dialog.style.flexDirection = 'column';
        dialog.style.boxShadow = '0 0 12px rgba(0,0,0,0.7)';
        dialog.style.overflow = 'hidden';
        modalOverlay.appendChild(dialog);

        // ヘッダ
        const header = document.createElement('div');
        header.style.flex = '0 0 auto';
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';
        header.style.padding = '4px 8px';
        header.style.background = 'linear-gradient(to right, #443322, #221610)';
        header.style.color = '#f0e0c0';
        header.style.fontSize = '90%';

        const title = document.createElement('span');
        title.textContent = '花図鑑';
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = '×';
        closeBtn.style.fontSize = '90%';
        closeBtn.style.padding = '2px 6px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.addEventListener('click', e => {
            e.preventDefault();
            closeZukanModal();
        });
        header.appendChild(closeBtn);

        dialog.appendChild(header);

        // 本体
        const body = document.createElement('div');
        body.style.flex = '1 1 auto';
        body.style.position = 'relative';
        body.style.backgroundColor = '#1b1410';
        dialog.appendChild(body);

        modalIframe = document.createElement('iframe');
        modalIframe.src = ZUKAN_URL;
        modalIframe.style.border = '0';
        modalIframe.style.width = '100%';
        modalIframe.style.height = '100%';
        modalIframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms allow-popups');
        body.appendChild(modalIframe);

        modalOverlay.addEventListener('click', e => {
            if (e.target === modalOverlay) closeZukanModal();
        });

        document.body.appendChild(modalOverlay);

        modalIframe.addEventListener('load', function () {
            try {
                const doc = modalIframe.contentDocument || modalIframe.contentWindow.document;
                if (!doc) return;

                const frameAreaB = doc.querySelector('.frameareab');
                if (!frameAreaB) return;

                const gridContainer =
                    frameAreaB.querySelector('div[style*="margin-left: 25px"]') || frameAreaB;

                const wrapper = doc.createElement('div');
                wrapper.style.margin = '0';
                wrapper.style.padding = '8px';
                wrapper.style.textAlign = 'center';
                wrapper.style.background = '#f6ebd4';

                wrapper.appendChild(gridContainer);
                doc.body.innerHTML = '';
                doc.body.appendChild(wrapper);

                // 7列グリッドに強制
                gridContainer.classList.add('gfre-zukan-grid');

                const style = doc.createElement('style');
                style.textContent = `
                  .gfre-zukan-grid {
                    display: grid;
                    grid-template-columns: repeat(7, auto);
                    justify-content: center;
                    align-content: flex-start;
                    row-gap: 4px;
                  }
                  .gfre-zukan-grid .charaframe2 {
                    width: 80px !important;
                    margin: 8px !important;
                    display: inline-block;
                  }
                  .gfre-zukan-grid br[clear="all"] {
                    display: none !important;
                  }
                `;
                doc.head.appendChild(style);

                // カードにクリックハンドラ
                const cards = Array.from(gridContainer.querySelectorAll('.charaframe2'));
                cards.forEach(card => {
                    card.style.cursor = 'pointer';
                    card.addEventListener('click', ev => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        handleZukanCardClick(card);
                    });
                });
            } catch (e) {
                console.error('GFRe zukan iframe init error:', e);
            }
        });
    }

    // 図鑑カードクリック時
    function handleZukanCardClick(card) {
        if (!currentSelect) return;

        const nameEl = card.querySelector('b');
        if (!nameEl) return;

        const rawName = nameEl.textContent.trim();
        if (!rawName || rawName === '？' || rawName === '？？？？') return; // 未解放は無視

        const val = nameToValueMap.get(rawName);
        if (!val) {
            console.warn('図鑑名に対応する newseed オプションが見つからない:', rawName);
            return;
        }

        currentSelect.value = val;
        refreshPreview(currentSelect);
        closeZukanModal();
    }

})();
