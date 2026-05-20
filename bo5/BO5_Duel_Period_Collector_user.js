// ==UserScript==
// @name         BO5 Duel Period Collector
// @namespace    https://wdrb.work/bo5/
// @version      1.1
// @description  期間指定でDUEL戦闘ログ収集・CSV出力 / 勝敗集計 (Mode1: Eno+期間 / Mode2: 期間のみ / Mode3: 勝敗集計)
// @author       -
// @match        https://wdrb.work/bo5/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    /* ================================================================
       定数
    ================================================================ */
    const BASE_URL       = 'https://wdrb.work/bo5/';
    const FETCH_DELAY_MS = 300;
    const CONCURRENCY    = 7;
    const BATCH_DELAY_MS = 500;
    const MAX_PAGES      = 500;
    const RETRY_BACKOFF  = [500, 1000, 2000];
    const MAX_RETRY      = 3;

    // LocalStorageキー（Mode1とMode2は独立管理）
    const LS = {
        m1Data : 'bo5_pc_m1_data',
        m1Proc : 'bo5_pc_m1_proc',
        m2Data : 'bo5_pc_m2_data',
        m2Proc : 'bo5_pc_m2_proc',
    };

    /* ================================================================
       ユーティリティ
    ================================================================ */
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    let abortFlag = false;

    async function fetchDoc(url) {
        const res = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return new DOMParser().parseFromString(await res.text(), 'text/html');
    }

    async function fetchDocRetry(url, statusEl, label) {
        let lastErr;
        for (let i = 0; i < MAX_RETRY; i++) {
            if (abortFlag) throw new Error('aborted');
            try {
                return await fetchDoc(url);
            } catch (e) {
                lastErr = e;
                if (i < MAX_RETRY - 1) {
                    setStatus(statusEl, `${label} リトライ ${i + 1}/${MAX_RETRY}…`);
                    await sleep(RETRY_BACKOFF[i]);
                }
            }
        }
        throw lastErr;
    }

    /* ================================================================
       URL構築
    ================================================================ */
    // Mode1用: eno + side指定
    function buildLogUrl(eno, side, page) {
        const ae = side === 'ally'  ? (eno || '') : '';
        const ee = side === 'enemy' ? (eno || '') : '';
        const base = `${BASE_URL}battlelog.php`
            + `?ally_eno=${ae}&ally_wp=all`
            + `&enemy_eno=${ee}&enemy_wp=all`
            + `&battle_type=duel&win=all`;
        return page > 0 ? `${base}&page=${page}` : base;
    }

    // Mode2用: eno指定なし（全DUEL）
    function buildAllUrl(page) {
        const base = `${BASE_URL}battlelog.php`
            + `?ally_eno=&ally_wp=all&enemy_eno=&enemy_wp=all`
            + `&battle_type=duel&win=all`;
        return page > 0 ? `${base}&page=${page}` : base;
    }

    function extractBtId(url) {
        const m = url && url.match(/bt=(bt_[0-9a-f]+)/);
        return m ? m[1] : null;
    }

    function toAbsUrl(href) {
        if (!href) return null;
        return href.startsWith('http') ? href : BASE_URL + href;
    }

    /* ================================================================
       バトルログ一覧ページのパース
       ・各liから logid / type / time / 両者Eno / 勝敗 / battle_view URL を取得
    ================================================================ */
    function parseBattleList(doc) {
        const rows = [];
        for (const logidEl of doc.querySelectorAll('li > .logid')) {
            const li = logidEl.parentElement;
            if (!li) continue;

            const logidP  = logidEl.querySelector('p');
            const typeP   = li.querySelector(':scope > .type p');
            const matchP  = li.querySelector(':scope > .match p');
            const resultP = li.querySelector(':scope > .list_result p');
            const timeP   = li.querySelector(':scope > .time p');
            if (!logidP || !matchP || !resultP || !timeP) continue;

            const logid = logidP.textContent.trim();
            const type  = typeP ? typeP.textContent.trim() : '';
            const time  = timeP.textContent.trim();

            const enoLinks = matchP.querySelectorAll('a[href*="profile.php?eno="]');
            if (enoLinks.length !== 2) continue;
            const lm = enoLinks[0].getAttribute('href').match(/eno=(\d+)/);
            const rm = enoLinks[1].getAttribute('href').match(/eno=(\d+)/);
            if (!lm || !rm) continue;

            const spans = resultP.querySelectorAll('span');
            if (spans.length !== 2) continue;

            // battle_view.php リンク取得
            const btAnchor = li.querySelector('a[href*="battle_view.php"]');
            const btUrl    = btAnchor ? toAbsUrl(btAnchor.getAttribute('href')) : null;

            rows.push({
                logid, type, time,
                leftEno:  lm[1],
                rightEno: rm[1],
                leftWin:  spans[0].classList.contains('win'),
                rightWin: spans[1].classList.contains('win'),
                btUrl
            });
        }
        return rows;
    }

    function hasNextPage(doc) {
        return !!doc.querySelector('div.pager_right a[href]');
    }

    /* ================================================================
       バトル詳細ページのパース（指定sideの武器名・技順を取得）
    ================================================================ */
    function parseBattleDoc(doc, side) {
        const wSel = side === 'ally'
            ? '#r_enter_ally .w_icnm, .round.ally_enter .w_icnm'
            : '#r_enter_enemy .w_icnm, .round.enemy_enter .w_icnm';

        let weaponName = '', weaponId = '';
        const wIcon = doc.querySelector(wSel);
        if (wIcon) {
            weaponName = wIcon.getAttribute('data-tippy-content') || wIcon.textContent.trim();
            const img = wIcon.querySelector('img[src]');
            if (img) {
                const m = img.getAttribute('src').match(/w_(.+?)\.svg/);
                if (m) weaponId = m[1];
            }
        }

        const skillSel = side === 'ally'
            ? 'div.skill_list div.ally[data-r1]'
            : 'div.skill_list div.enemy[data-r1]';
        const skillDiv = doc.querySelector(skillSel);
        const moves = [];
        if (skillDiv) {
            // [FIX A-3] cloneNodeでimgを除去してからtextContentを取る。
            // 旧実装はTEXT_NODE直接参照のため、テキストが子spanに移動した場合に空文字化していた。
            skillDiv.querySelectorAll('span.s_nm').forEach(span => {
                const clone = span.cloneNode(true);
                clone.querySelectorAll('img').forEach(img => img.remove());
                const name = clone.textContent.trim();
                if (name) moves.push(name);
            });
        }

        // [FIX A-2] moves取得失敗時にコンソールへ出力。サイレントドロップを防ぐ。
        if (moves.length !== 5) {
            console.warn('[BO5PC] parseBattleDoc: moves取得失敗', { side, movesFound: moves.length, moves, url: doc.URL });
            return null;
        }
        return { weaponName, weaponId, moves };
    }

    /* ================================================================
       Phase 1: バトルURL収集（日時フィルタ付き）

       scanTargets: [{ getUrl(page), sideKey, label }]
         sideKey = 'ally' / 'enemy' / null(Mode2)
       戻り値: Map<key, { btUrl, btId, side }>
    ================================================================ */
    async function scanListPages(scanTargets, startStr, endStr, statusEl) {
        const collected = new Map();

        for (const { getUrl, sideKey, label } of scanTargets) {
            if (abortFlag) return null;

            for (let page = 0; page < MAX_PAGES; page++) {
                if (abortFlag) return null;

                setStatus(statusEl,
                    `[URL収集] ${label} ${page + 1}p…  収集済み: ${collected.size}件`);

                let doc;
                try {
                    doc = await fetchDocRetry(getUrl(page), statusEl, `${label} p${page + 1}`);
                } catch (e) {
                    if (e.message === 'aborted') return null;
                    console.warn('[BO5PC] page fetch failed:', e);
                    break;
                }

                const rows = parseBattleList(doc);
                if (rows.length === 0) break;

                let hitOld = false;
                for (const m of rows) {
                    // 一覧は新しい順 → startStr より古い = 以降ページ不要
                    if (m.time < startStr) { hitOld = true; continue; }
                    // endStr より新しいものはスキップ（stopはしない）
                    if (m.time > endStr)   { continue; }
                    // [FIX C-1] type が空文字（取得失敗）の場合もDUEL以外として弾く
                    if (!m.type || m.type !== 'DUEL') continue;
                    if (!m.btUrl) continue;

                    const btId = extractBtId(m.btUrl);
                    if (!btId) continue;

                    // キー：Mode1は btId+side で一意化、Mode2は btId のみ
                    const key = sideKey != null ? `${btId}_${sideKey}` : btId;
                    if (!collected.has(key)) {
                        collected.set(key, { btUrl: m.btUrl, btId, side: sideKey });
                    }
                }

                if (hitOld || !hasNextPage(doc)) break;
                await sleep(FETCH_DELAY_MS);
            }
        }

        return collected;
    }

    /* ================================================================
       Phase 2: バトル詳細ページ取得 → results / processed に追記
    ================================================================ */
    async function fetchDetails(urlMap, processed, results, dataKey, procKey, statusEl, mode) {
        const todo = [...urlMap.values()].filter(item => {
            const key = mode === 2 ? item.btId : `${item.btId}_${item.side}`;
            return !processed.has(key);
        });

        if (todo.length === 0) return;

        for (let bi = 0; bi < todo.length; bi += CONCURRENCY) {
            if (abortFlag) break;
            const batch = todo.slice(bi, bi + CONCURRENCY);
            setStatus(statusEl,
                `[詳細取得] ${bi + 1}〜${Math.min(bi + CONCURRENCY, todo.length)} / ${todo.length}件`);

            await Promise.all(batch.map(async item => {
                const procKey2 = mode === 2 ? item.btId : `${item.btId}_${item.side}`;
                try {
                    // [FIX A-1] fetchDoc（リトライなし）→ fetchDocRetry に変更。
                    // 旧実装では詳細ページの一時的な取得失敗がサイレントに握り潰されていた。
                    const doc = await fetchDocRetry(item.btUrl, statusEl, `詳細 ${item.btId}`);

                    if (mode === 2) {
                        // 両サイドをそれぞれ1レコードとして追加
                        for (const s of ['ally', 'enemy']) {
                            const d = parseBattleDoc(doc, s);
                            if (d) results.push({
                                weaponName: d.weaponName,
                                weaponId:   d.weaponId,
                                moves:      d.moves
                            });
                        }
                    } else {
                        // Mode1: 指定sideのみ
                        const d = parseBattleDoc(doc, item.side);
                        if (d) results.push({
                            weaponName: d.weaponName,
                            weaponId:   d.weaponId,
                            moves:      d.moves
                        });
                    }

                    processed.add(procKey2);
                } catch (e) {
                    console.warn('[BO5PC] detail parse failed:', item.btUrl, e);
                }
            }));

            saveLS(dataKey, procKey, results, processed);
            if (bi + CONCURRENCY < todo.length) await sleep(BATCH_DELAY_MS);
        }
    }

    /* ================================================================
       Mode 1 / Mode 2 収集メイン
    ================================================================ */
    async function runCollect(mode, eno, startStr, endStr, statusEl) {
        const dataKey = mode === 1 ? LS.m1Data : LS.m2Data;
        const procKey = mode === 1 ? LS.m1Proc  : LS.m2Proc;
        const { results, processed } = loadLS(dataKey, procKey);

        // Phase 1: URL収集
        let scanTargets;
        if (mode === 1) {
            scanTargets = [
                { getUrl: p => buildLogUrl(eno, 'ally',  p), sideKey: 'ally',  label: `Eno${eno} 攻撃側` },
                { getUrl: p => buildLogUrl(eno, 'enemy', p), sideKey: 'enemy', label: `Eno${eno} 防衛側` },
            ];
        } else {
            scanTargets = [
                { getUrl: p => buildAllUrl(p), sideKey: null, label: '全DUEL' },
            ];
        }

        const urlMap = await scanListPages(scanTargets, startStr, endStr, statusEl);
        if (!urlMap) return null; // 中断

        setStatus(statusEl, `URL収集完了: ${urlMap.size}件。詳細ページ取得中…`);

        // Phase 2: 詳細取得
        await fetchDetails(urlMap, processed, results, dataKey, procKey, statusEl, mode);

        return results.length;
    }

    /* ================================================================
       Mode 3: 勝敗集計
    ================================================================ */
    function judgeEno(m, eno) {
        let myWin, opWin;
        if      (m.leftEno  === eno) { myWin = m.leftWin;  opWin = m.rightWin; }
        else if (m.rightEno === eno) { myWin = m.rightWin; opWin = m.leftWin;  }
        else return null;

        if (!myWin && !opWin) return 'draw';
        if ( myWin && !opWin) return 'win';
        if (!myWin &&  opWin) return 'loss';
        return null; // 両者win = 異常
    }

    async function runMode3(eno, startStr, endStr, statusEl) {
        const stats = { win: 0, loss: 0, draw: 0, total: 0, anomaly: 0 };
        const seen  = new Set();

        const sides = [
            { side: 'ally',  label: '挑戦者側' },
            { side: 'enemy', label: '被挑戦者側' },
        ];

        for (const { side, label } of sides) {
            if (abortFlag) return null;

            for (let page = 0; page < MAX_PAGES; page++) {
                if (abortFlag) return null;
                setStatus(statusEl,
                    `${label}: ${page + 1}ページ目…\n累計 ${stats.total}件`);

                let doc;
                try {
                    doc = await fetchDocRetry(
                        buildLogUrl(eno, side, page), statusEl, `${label} p${page + 1}`);
                } catch (e) {
                    if (e.message === 'aborted') return null;
                    console.warn('[BO5PC] mode3 page failed:', e);
                    break;
                }

                const rows = parseBattleList(doc);
                if (rows.length === 0) break;

                let hitOld = false;
                for (const m of rows) {
                    if (m.time < startStr) { hitOld = true; continue; }
                    if (m.time > endStr)   { continue; }
                    // [FIX C-1] type が空文字の場合もDUEL以外として弾く
                    if (!m.type || m.type !== 'DUEL') continue;
                    if (seen.has(m.logid)) continue;
                    seen.add(m.logid);

                    const r = judgeEno(m, eno);
                    if      (r === 'win')  { stats.win++;  stats.total++; }
                    else if (r === 'loss') { stats.loss++; stats.total++; }
                    else if (r === 'draw') { stats.draw++; stats.total++; }
                    else                   { stats.anomaly++; }
                }

                if (hitOld || !hasNextPage(doc)) break;
                await sleep(FETCH_DELAY_MS);
            }
        }

        return stats;
    }

    /* ================================================================
       LocalStorage
    ================================================================ */
    function saveLS(dataKey, procKey, results, processed) {
        localStorage.setItem(dataKey, JSON.stringify(results));
        localStorage.setItem(procKey, JSON.stringify([...processed]));
    }

    function loadLS(dataKey, procKey) {
        return {
            results:   JSON.parse(localStorage.getItem(dataKey) || '[]'),
            processed: new Set(JSON.parse(localStorage.getItem(procKey) || '[]')),
        };
    }

    /* ================================================================
       CSV出力
    ================================================================ */
    function exportCSV(dataKey, filename) {
        const data = JSON.parse(localStorage.getItem(dataKey) || '[]');
        if (!data.length) {
            alert('データがありません。先にデータ取得を実行してください。');
            return;
        }
        const header = '武器名,武器ID,1R,2R,3R,4R,5R';
        const rows   = data.map(r =>
            [r.weaponName, r.weaponId, ...r.moves]
                .map(v => `"${String(v).replace(/"/g, '""')}"`)
                .join(',')
        );
        const csv  = '\uFEFF' + [header, ...rows].join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // [FIX C-2] click()直後の同期的revokeObjectURLはダウンロード開始前にURLを無効化する場合がある。
        // 1秒後に解放することでダウンロードキューへの積み込みを保証する。
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /* ================================================================
       入力バリデーション
    ================================================================ */
    function validateEno(s) {
        const t = s.trim();
        if (!/^\d{1,4}$/.test(t)) return null;
        const n = parseInt(t, 10);
        return (n >= 1 && n <= 9999) ? String(n) : null;
    }

    function validateDT(s) {
        const t = s.trim();
        if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(t)) return null;
        return isNaN(new Date(t.replace(' ', 'T')).getTime()) ? null : t;
    }

    /* ================================================================
       UI
    ================================================================ */
    function setStatus(el, text) {
        el.textContent   = text;
        el.style.display = text ? 'block' : 'none';
    }

    function buildUI() {
        const mk = (tag, css, text) => {
            const el = document.createElement(tag);
            if (css)  el.style.cssText = css;
            if (text) el.textContent   = text;
            return el;
        };

        /* ---- wrapper ---- */
        const wrap = mk('div', [
            'position:fixed', 'bottom:16px', 'right:16px', 'z-index:2147483647',
            'display:flex', 'flex-direction:column', 'align-items:flex-end', 'gap:6px',
            'font-family:sans-serif',
        ].join(';'));

        /* ---- panel ---- */
        const panel = mk('div', [
            'background:rgba(0,0,0,0.90)', 'color:#fff',
            'padding:10px 12px', 'border-radius:8px',
            'box-shadow:0 2px 10px rgba(0,0,0,0.6)',
            'font-size:12px', 'display:flex', 'flex-direction:column',
            'gap:6px', 'min-width:235px',
        ].join(';'));

        /* ---- title ---- */
        const title = mk('div',
            'font-weight:bold;text-align:center;border-bottom:1px solid #444;padding-bottom:4px;margin-bottom:2px;',
            'BO5 Duel Period Collector');

        /* ---- mode tabs ---- */
        const tabRow  = mk('div', 'display:flex;gap:4px;');
        const tabDefs = ['Mode1', 'Mode2', 'Mode3'];
        const tabBtns = tabDefs.map(label => {
            const b = mk('button', [
                'flex:1', 'padding:4px 0', 'border-radius:4px',
                'cursor:pointer', 'font-size:11px', 'font-weight:bold',
                'border:1px solid #555', 'background:#333', 'color:#aaa',
            ].join(';'), label);
            tabRow.appendChild(b);
            return b;
        });

        let currentMode = 1;

        function refreshTabs() {
            tabBtns.forEach((b, i) => {
                const active = i + 1 === currentMode;
                b.style.background = active ? '#d32f2f' : '#333';
                b.style.color      = active ? '#fff'    : '#aaa';
                b.style.border     = `1px solid ${active ? '#d32f2f' : '#555'}`;
            });
        }

        /* ---- Eno 入力 ---- */
        const enoWrap = mk('div', '');
        enoWrap.appendChild(mk('div', 'font-size:10px;color:#aaa;margin-bottom:2px;', 'Eno（Mode1 / Mode3）'));
        const enoInput = mk('input', [
            'padding:5px 8px', 'border-radius:4px', 'border:1px solid #666',
            'background:#222', 'color:#fff', 'font-size:12px',
            'text-align:center', 'width:100%', 'box-sizing:border-box',
        ].join(';'));
        enoInput.type = 'text'; enoInput.maxLength = 4; enoInput.placeholder = 'Eno (1〜9999)';
        enoInput.addEventListener('input', () => { enoInput.value = enoInput.value.replace(/\D/g, ''); });
        enoWrap.appendChild(enoInput);

        /* ---- 日時入力 共通 ---- */
        function makeDTInput(label, defaultVal) {
            const wrap2 = mk('div', '');
            wrap2.appendChild(mk('div', 'font-size:10px;color:#aaa;margin-bottom:2px;', label));
            const inp = mk('input', [
                'padding:5px 8px', 'border-radius:4px', 'border:1px solid #666',
                'background:#222', 'color:#fff', 'font-size:12px',
                'text-align:center', 'width:100%', 'box-sizing:border-box',
            ].join(';'));
            inp.type = 'text'; inp.placeholder = 'YYYY-MM-DD hh:mm:ss';
            inp.value = defaultVal;
            wrap2.appendChild(inp);
            return { wrap: wrap2, inp };
        }

        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

        const { wrap: startWrap, inp: startInput } = makeDTInput('開始日時', `${today} 00:00:00`);
        const { wrap: endWrap,   inp: endInput   } = makeDTInput('終了日時', `${today} 23:59:59`);

        /* ---- ボタン行 ---- */
        const btnStyle = 'padding:5px 12px;border:none;border-radius:4px;font-weight:bold;cursor:pointer;font-size:12px;';

        const btnRow1  = mk('div', 'display:flex;gap:4px;margin-top:2px;');
        const btnRun   = mk('button', btnStyle + 'background:#d32f2f;color:#fff;flex:1;', '取得開始');
        const btnAbort = mk('button', btnStyle + 'background:#555;color:#fff;display:none;', '中断');
        btnRow1.appendChild(btnRun);
        btnRow1.appendChild(btnAbort);

        const btnRow2  = mk('div', 'display:flex;gap:4px;');
        const btnCSV   = mk('button', btnStyle + 'background:#1565c0;color:#fff;flex:1;', 'CSV出力');
        const btnClear = mk('button', btnStyle + 'background:#2a2a2a;color:#888;', 'データ削除');
        btnRow2.appendChild(btnCSV);
        btnRow2.appendChild(btnClear);

        /* ---- status / result ---- */
        const statusEl = mk('div', [
            'background:rgba(0,0,0,0.80)', 'color:#fff',
            'padding:6px 10px', 'border-radius:6px', 'font-size:11px',
            'max-width:240px', 'white-space:pre-wrap', 'word-break:break-all',
            'display:none', 'line-height:1.4',
        ].join(';'));

        const resultEl = mk('div', [
            'background:rgba(10,42,10,0.95)', 'color:#fff',
            'padding:8px 14px', 'border-radius:6px', 'font-size:13px',
            'line-height:1.7', 'display:none', 'min-width:190px',
            'box-shadow:0 2px 6px rgba(0,0,0,0.5)',
        ].join(';'));

        /* ---- モード切替: UI表示更新 ---- */
        function refreshUI() {
            refreshTabs();
            // Enoは Mode1 / Mode3 のみ表示
            enoWrap.style.display  = (currentMode === 1 || currentMode === 3) ? '' : 'none';
            // CSV/削除ボタンは Mode1 / Mode2 のみ
            btnRow2.style.display  = (currentMode === 3) ? 'none' : '';
            // 結果・ステータスは切替時に隠す
            resultEl.style.display = 'none';
            statusEl.style.display = 'none';
            // ボタンラベル
            btnRun.textContent = currentMode === 3 ? '集計開始' : '取得開始';
        }

        tabBtns.forEach((b, i) => {
            b.addEventListener('click', () => { currentMode = i + 1; refreshUI(); });
        });

        /* ---- 取得/集計開始 ---- */
        btnRun.addEventListener('click', async () => {
            const startStr = validateDT(startInput.value);
            if (!startStr) { alert('開始日時が不正です。\nYYYY-MM-DD hh:mm:ss'); return; }

            const endStr = validateDT(endInput.value);
            if (!endStr)   { alert('終了日時が不正です。\nYYYY-MM-DD hh:mm:ss'); return; }

            if (startStr > endStr) { alert('開始日時 > 終了日時になっています。'); return; }

            let eno = null;
            if (currentMode === 1 || currentMode === 3) {
                eno = validateEno(enoInput.value);
                if (!eno) { alert('Enoを1〜9999で入力してください。'); return; }
            }

            abortFlag = false;
            btnRun.disabled    = true;
            btnRun.textContent = '処理中…';
            btnAbort.style.display = 'inline-block';
            resultEl.style.display = 'none';
            setStatus(statusEl, '開始…');

            // [FIX C-3] 処理開始時のモードをローカル変数に固定する。
            // 処理中にタブを切り替えても finally でのボタンラベルがずれなくなる。
            const executedMode = currentMode;

            try {
                if (executedMode === 1) {
                    /* -- Mode1: Eno指定 + 期間 → CSV -- */
                    const count = await runCollect(1, eno, startStr, endStr, statusEl);
                    if (count !== null) {
                        setStatus(statusEl, `完了。累計 ${count}件取得済み。CSV出力可。`);
                    }

                } else if (executedMode === 2) {
                    /* -- Mode2: 期間のみ（全DUEL）→ CSV -- */
                    const count = await runCollect(2, null, startStr, endStr, statusEl);
                    if (count !== null) {
                        setStatus(statusEl, `完了。累計 ${count}件取得済み。CSV出力可。`);
                    }

                } else {
                    /* -- Mode3: Eno指定 + 期間 → 勝敗集計 -- */
                    const stats = await runMode3(eno, startStr, endStr, statusEl);
                    if (stats) {
                        setStatus(statusEl, '');
                        const rate  = stats.total > 0
                            ? (stats.win / stats.total * 100).toFixed(1) : '0.0';
                        const ndrate = stats.total > 0
                            ? ((stats.win + stats.draw) / stats.total * 100).toFixed(1) : '0.0';
                        resultEl.innerHTML =
                            `<div style="font-weight:bold;border-bottom:1px solid #555;padding-bottom:3px;margin-bottom:5px;">集計結果 Eno${eno}</div>`
                            + `<div>総試合数：<b>${stats.total}</b></div>`
                            + `<div>勝利：<b>${stats.win}</b></div>`
                            + `<div>敗北：<b>${stats.loss}</b></div>`
                            + `<div>引分：<b>${stats.draw}</b></div>`
                            + `<div style="margin-top:4px;">勝率：<b>${rate}%</b></div>`
                            + `<div>非敗北率：<b>${ndrate}%</b></div>`
                            + (stats.anomaly > 0
                                ? `<div style="color:#ffa;font-size:10px;margin-top:3px;">⚠ 異常値: ${stats.anomaly}件</div>`
                                : '');
                        resultEl.style.display = 'block';
                    }
                }
            } catch (e) {
                console.error('[BO5PC]', e);
                if (e.message !== 'aborted') {
                    setStatus(statusEl, `エラー: ${e.message}`);
                }
            } finally {
                btnRun.disabled    = false;
                // [FIX C-3] currentMode ではなく executedMode でラベルを戻す
                btnRun.textContent = executedMode === 3 ? '集計開始' : '取得開始';
                btnAbort.style.display = 'none';
            }
        });

        /* ---- 中断 ---- */
        btnAbort.addEventListener('click', () => {
            abortFlag = true;
            setStatus(statusEl, '中断要求…');
        });

        /* ---- CSV出力 ---- */
        btnCSV.addEventListener('click', () => {
            const key  = currentMode === 1 ? LS.m1Data : LS.m2Data;
            const name = currentMode === 1 ? 'bo5_duel_m1.csv' : 'bo5_duel_m2.csv';
            exportCSV(key, name);
        });

        /* ---- データ削除 ---- */
        btnClear.addEventListener('click', () => {
            const dataKey = currentMode === 1 ? LS.m1Data : LS.m2Data;
            const procKey = currentMode === 1 ? LS.m1Proc  : LS.m2Proc;
            const count   = JSON.parse(localStorage.getItem(dataKey) || '[]').length;
            if (!confirm(`Mode${currentMode} のデータを削除します。\n現在 ${count}件。よろしいですか？`)) return;
            localStorage.removeItem(dataKey);
            localStorage.removeItem(procKey);
            alert('削除しました。');
        });

        /* ---- DOM組み立て ---- */
        panel.appendChild(title);
        panel.appendChild(tabRow);
        panel.appendChild(enoWrap);
        panel.appendChild(startWrap);
        panel.appendChild(endWrap);
        panel.appendChild(btnRow1);
        panel.appendChild(btnRow2);

        wrap.appendChild(panel);
        wrap.appendChild(statusEl);
        wrap.appendChild(resultEl);
        document.body.appendChild(wrap);

        refreshUI();
    }

    buildUI();

})();
