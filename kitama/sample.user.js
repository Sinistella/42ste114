// ==UserScript==
// @name         北摩救援通知 / モバイル軽量版
// @namespace    https://wdrb.work/otherside/
// @version      1.2
// @description  救援検知
// @match        https://wdrb.work/otherside/*
// @grant        GM_xmlhttpRequest
// @connect      discord.com
// ==/UserScript==
(function () {
    'use strict';
    const QUEST_URL     = 'https://wdrb.work/otherside/quest.php';
    const WEBHOOK_URL   = 'https://discord.com/api/webhooks/1388603183718469813/Nc85QOQeakDmnJIIafAKjpgK6B3_zialYWqNhfDXbtQ4ZEDKkZjc80xy8rvIdAEfAfgv';
    const RURU_ID       = '164947470139392000';
    const IS_QUEST_PAGE = location.pathname.endsWith('/quest.php');
    const LS_KEY        = 'relief_log';
    const TOGGLE_KEY    = 'relief_toggle';
    let timerId = null;
    function createToggleButton() {
        const btn = document.createElement('button');
        btn.id = 'relief_toggle_btn';
        btn.style.position = 'fixed';
        btn.style.top = '16px';
        btn.style.left = '50%';
        btn.style.transform = 'translateX(-50%)';
        btn.style.zIndex = '9999';
        btn.style.padding = '8px 24px';
        btn.style.background = '#0e1c3b';
        btn.style.color = '#fff';
        btn.style.fontSize = '1.1em';
        btn.style.border = '2px solid #2f518c';
        btn.style.borderRadius = '8px';
        btn.style.boxShadow = '0 2px 12px rgba(0,0,0,0.14)';
        btn.style.opacity = '0.92';
        btn.style.cursor = 'pointer';
        btn.style.userSelect = 'none';
        btn.style.transition = 'background 0.2s';
        const enabled = getToggle();
        btn.textContent = enabled ? '救援通知 ON' : '救援通知 OFF';
        btn.style.background = enabled ? '#105dc2' : '#555';
        btn.onclick = function () {
            const now = getToggle();
            setToggle(!now);
            btn.textContent = !now ? '救援通知 ON' : '救援通知 OFF';
            btn.style.background = !now ? '#105dc2' : '#555';
        };
        document.body.appendChild(btn);
    }
    function getToggle() {
        return localStorage.getItem(TOGGLE_KEY) !== '0';
    }
    function setToggle(flag) {
        localStorage.setItem(TOGGLE_KEY, flag ? '1' : '0');
    }
    createToggleButton();
    function postDiscord(relief) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method : 'POST',
                url    : WEBHOOK_URL,
                headers: { 'Content-Type': 'application/json' },
                data   : JSON.stringify({
                    username: 'カレントセキュリティズ',
                    content : `<@${RURU_ID}> 救援ID＞${relief.id}：${relief.area_name}にて、${relief.requester}から救援要請。現場へ飛ばすぞ。`
                }),
                onload : resolve,
                onerror: e => { console.error('Discord 送信失敗', e); reject(e); }
            });
        });
    }
    function notify() {}
    const getLog = () => JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    const addLog = o => {
        const a = getLog();
        if (!a.some(e => e.relief_time === o.relief_time)) {
            a.push(o);
            localStorage.setItem(LS_KEY, JSON.stringify(a));
        }
    };
    const fmt = ts => {
        const d = new Date(Number(ts) * 1000);
        const z = n => n.toString().padStart(2, '0');
        return `${d.getFullYear()}/${z(d.getMonth()+1)}/${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
    };
    async function checkRelief() {
        if (!getToggle()) return;
        try {
            const r  = await fetch(QUEST_URL, { credentials:'include' });
            const html = await r.text();
            const doc  = new DOMParser().parseFromString(html,'text/html');
            const box  = doc.querySelector('.section_areas.relief-list');
            if (!box) return;
            const items = [...box.querySelectorAll('.arealist.areas.relief-item')];
            const list  = items.map(el=>({
                time      : el.dataset.time,
                id        : el.dataset.reliefId,
                area_name : el.dataset.areaName,
                requester : el.dataset.requester
            })).filter(x=>x.time&&x.id&&x.area_name&&x.requester);
            if (!list.length) return;
            const latest = list.reduce((a,b)=>Number(a.time)>Number(b.time)?a:b);
            const nowSec = Math.floor(Date.now() / 1000);
            if (nowSec - Number(latest.time) > 300) return;
            if (getLog().some(e=>e.relief_time===latest.time)) return;
            notify();
            await postDiscord(latest);
            addLog({
                log_time   : fmt(Date.now()/1000|0),
                relief_time: latest.time,
                area_name  : latest.area_name,
                requester  : latest.requester,
                relief_id  : latest.id
            });
            if (!IS_QUEST_PAGE) {
                setTimeout(()=>{
                    const f=document.createElement('form');
                    f.method='POST';
                    f.action=QUEST_URL;
                    f.innerHTML=`<input name="relief_id" value="${latest.id}"><input name="relief_move" value="参加する">`;
                    document.body.appendChild(f);
                    f.submit();
                }, 500);
            }
        } catch(e) { console.error('救援チェック失敗', e); }
    }
    function startTimer(){
        if (timerId===null){
            timerId=setInterval(checkRelief,60000);
        }
    }
    function stopTimer(){
        if (timerId!==null){
            clearInterval(timerId);
            timerId=null;
        }
    }
    document.addEventListener('visibilitychange',()=>{
        if (document.visibilityState==='visible'){
            checkRelief();
            startTimer();
        }else{
            stopTimer();
        }
    });
    startTimer();
    window.getReliefLog = getLog;
})();
