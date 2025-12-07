// ==UserScript==
// @name         GFRe 花壇を花図鑑から選ぶ
// @namespace    gfre.kadan.zukanpicker
// @version      0.9.4
// @match        https://soraniwa.428.st/gf/*
// @run-at       document-end
// @grant        none
// ==/UserScript==
(function () {
    'use strict';

    if (location.search && !location.search.includes('mode=action')) {
        return;
    }

    const ZUKAN_URL = location.origin + '/gf/?mode=zukan2';

    let currentSelect = null;
    let nameToValueMap = null;
    const selectPreviewMap = new Map();

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

    function setupSelectUI(select) {
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.margin = '2px 0';
        wrapper.style.width = '100%';

        const preview = document.createElement('span');
        preview.style.minWidth = '5em';
        preview.style.display = 'inline-block';

        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = '選ぶ';
        button.style.fontSize = '85%';
        button.style.padding = '2px 6px';
        button.style.cursor = 'pointer';

        button.style.marginLeft = 'auto';

        wrapper.appendChild(preview);
        wrapper.appendChild(button);

        select.parentNode.insertBefore(wrapper, select.nextSibling);

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
        preview.textContent = opt ? opt.text.trim().replace(/の種.*$/, '').trim() : '(不明)';
    }

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
        title.textContent = '花図鑑（タップ/クリックで育てる花を選ぶ）';
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = '×';
        closeBtn.style.fontSize = '90%';
        closeBtn.style.padding = '2px 6px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.addEventListener('click', () => closeZukanModal());
        header.appendChild(closeBtn);
        dialog.appendChild(header);

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

                const gridContainer = frameAreaB.querySelector('div[style*="margin-left: 25px"]') || frameAreaB;

                const wrapper = doc.createElement('div');
                wrapper.style.margin = '0';
                wrapper.style.padding = '8px';
                wrapper.style.textAlign = 'center';
                wrapper.style.background = '#f6ebd4';

                const clearCard = doc.createElement('div');
                clearCard.className = 'charaframe2';
                clearCard.style.cssText = 'width:80px; cursor:pointer; display:inline-block; margin:8px; border: 2px dashed #999; opacity: 0.7;';
                clearCard.innerHTML = '<br><b>選択解除</b><br><small>---</small>';

                clearCard.onclick = function(ev) {
                    ev.preventDefault();
                    ev.stopPropagation();
                    if(currentSelect) {
                        currentSelect.value = '-1';
                        refreshPreview(currentSelect);
                        if (typeof jQuery !== 'undefined') { jQuery(currentSelect).trigger('change'); }
                        else { currentSelect.dispatchEvent(new Event('change', { bubbles: true })); }
                        closeZukanModal();
                    }
                };

                wrapper.appendChild(gridContainer);
                gridContainer.appendChild(clearCard);

                doc.body.innerHTML = '';
                doc.body.appendChild(wrapper);

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

                const cards = Array.from(gridContainer.querySelectorAll('.charaframe2'));
                cards.forEach(card => {
                    if (card === clearCard) return;

                    card.style.cursor = 'pointer';
                    card.addEventListener('click', ev => {
                        ev.preventDefault();
                        ev.stopPropagation();

                        if (!currentSelect) return;
                        const nameEl = card.querySelector('b');
                        if (!nameEl) return;

                        const rawName = nameEl.textContent.trim();
                        // 未解放は無視
                        if (!rawName || rawName === '？' || rawName === '？？？？') return;

                        const val = nameToValueMap.get(rawName);
                        if (!val) return;

                        currentSelect.value = val;
                        refreshPreview(currentSelect);

                        // イベント発火
                        if (typeof jQuery !== 'undefined') {
                            jQuery(currentSelect).trigger('change');
                        } else {
                            currentSelect.dispatchEvent(new Event('change', { bubbles: true }));
                        }

                        closeZukanModal();
                    });
                });
            } catch (e) {
                console.error('GFRe zukan iframe init error:', e);
            }
        });
    }
    // ドキュメント読み込み状態に応じて即時 or DOMContentLoaded で初期化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
