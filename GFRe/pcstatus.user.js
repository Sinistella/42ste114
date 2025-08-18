// ==UserScript==
// @name         GFRe_PC_Status
// @namespace    GFRe-PC_Status
// @version      1.2.0
// @description  Enoを入力するとステータス詳細とスキル条件を並列表示
// @match        https://soraniwa.428.st/gf/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  const bar = document.createElement("div");
  bar.id = "gfps-bar";
  bar.style.cssText = [
    "position:fixed","top:6px","left:6px","z-index:2147483647",
    "background:#fff","border:1px solid #c9c9c9","border-radius:6px",
    "padding:4px 6px","display:flex","gap:6px","align-items:center",
    "font:12px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,Meiryo,system-ui,sans-serif",
    "box-shadow:0 1px 4px rgba(0,0,0,.12)"
  ].join(";");
  const label = document.createElement("span");
  label.textContent = "Eno";
  const input = document.createElement("input");
  input.type = "text";
  input.inputMode = "numeric";
  input.placeholder = "4桁まで";
  input.maxLength = 4;
  input.autocomplete = "off";
  input.style.cssText = "width:64px;text-align:center;padding:2px 6px;border:1px solid #bbb;border-radius:4px;";
  function toHankakuDigits(s){
    return s.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)).replace(/\D+/g,"");
  }
  input.addEventListener("input",()=>{
    const hk = toHankakuDigits(input.value).slice(0,4);
    if (input.value !== hk) input.value = hk;
  });
  input.addEventListener("keydown",e=>{ if(e.key==="Enter") openModal(); });
  const btn = document.createElement("button");
  btn.textContent = "見る";
  btn.style.cssText = "padding:2px 10px;border:1px solid #8abf8a;background:#e8f6e8;border-radius:4px;cursor:pointer;";
  btn.addEventListener("click",()=>{ isOpen()? closeModal() : openModal(); });
  bar.append(label,input,btn);
  document.body.appendChild(bar);

  const overlay = document.createElement("div");
  overlay.id = "gfps-overlay";
  overlay.style.cssText = [
    "position:fixed","inset:0","background:rgba(0,0,0,.38)","backdrop-filter:saturate(120%) blur(2px)",
    "display:none","align-items:center","justify-content:center","z-index:2147483646",
    "transition:opacity .15s ease"
  ].join(";");

  const modal = document.createElement("div");
  modal.id = "gfps-modal";
  modal.style.cssText = [
    "width:1100px","max-width:90vw","height:660px","max-height:85vh",
    "background:#fff","border-radius:12px","border:1px solid #e5e1d8",
    "box-shadow:0 10px 30px rgba(0,0,0,.25)",
    "display:flex","flex-direction:column","opacity:0","transform:translateY(6px)",
    "transition:opacity .15s ease, transform .15s ease"
  ].join(";");

  const header = document.createElement("div");
  header.style.cssText = [
    "display:flex","align-items:center","justify-content:space-between",
    "padding:10px 14px","border-bottom:1px solid #eee","background:#faf9f6",
    "border-top-left-radius:12px","border-top-right-radius:12px"
  ].join(";");
  const title = document.createElement("div");
  title.textContent = "PCステータスビューア";
  title.style.cssText = "font-weight:600;";
  const actions = document.createElement("div");
  const closeX = document.createElement("button");
  closeX.textContent = "閉じる";
  closeX.style.cssText = "padding:4px 10px;border:1px solid #d66;background:#ffecec;border-radius:6px;cursor:pointer;";
  closeX.addEventListener("click", closeModal);
  actions.appendChild(closeX);
  header.append(title, actions);

  const body = document.createElement("div");
  body.style.cssText = [
    "flex:1","display:grid","grid-template-columns:1fr 1.3fr","gap:14px",
    "padding:12px","background:#fffdf8","border-bottom-left-radius:12px","border-bottom-right-radius:12px"
  ].join(";");

  const leftWrap = document.createElement("div");
  leftWrap.className = "gfps-left";
  leftWrap.style.cssText = "overflow:auto;border:1px solid #e8e2d6;background:#fff;border-radius:10px;padding:10px;";

  const rightWrap = document.createElement("div");
  rightWrap.className = "gfps-right";
  rightWrap.style.cssText = "overflow:auto;border:1px solid #e8e2d6;background:#fff;border-radius:10px;padding:10px;";

  const style = document.createElement("style");
  style.textContent = `
  #gfps-modal #skillsetdata{min-height:580px}
  #gfps-modal .framearea.talkarea.cdatal{border-radius:10px;width:auto;height:auto;padding:0;border:none}
  #gfps-modal .marks{display:inline-block;min-width:1.6em;text-align:center;margin-right:.35em;border-radius:3px;background:#30343a;color:#fff;padding:0 .3em}
  #gfps-modal .type{display:inline-block;min-width:3.5em;text-align:center;border:1px solid #3a5;border-radius:3px;padding:0 .2em;margin-right:.35em}
  #gfps-modal .type7.type{border-color:#5cb85c}
  #gfps-modal .dashline{border:none;border-top:1px dashed #c9c3b6;margin:.5em 0}
  #gfps-modal small{color:#555}
  #gfps-modal b{font-weight:700}
  #gfps-modal .ri-sword-fill{display:none}
  #gfps-modal [style*="display:inline-block"][style*="width:130px"]{display:inline-block;width:130px}
  #gfps-modal [style*="padding-left:95px"]{display:inline-block;padding-left:95px}
  `;
  document.head.appendChild(style);

  body.append(leftWrap, rightWrap);
  modal.append(header, body);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  overlay.addEventListener("click",(e)=>{ if(e.target === overlay) closeModal(); });
  window.addEventListener("keydown",(e)=>{ if(isOpen() && e.key === "Escape") closeModal(); });

  window.GFPS_open = openModal;
  window.GFPS_close = closeModal;

  const ALLOWED_TAGS = new Set(["DIV","SPAN","SMALL","B","I","BR","HR","IMG","A"]);
  const ALLOWED_ATTR = new Set(["class","style","src","width","height","href","title"]);
  function sanitizeFragment(html){
    const root = document.createElement("div");
    root.innerHTML = html;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
    const rm = [];
    while (walker.nextNode()){
      const el = walker.currentNode;
      if (!ALLOWED_TAGS.has(el.tagName)){
        const p = el.parentNode; while(el.firstChild) p.insertBefore(el.firstChild, el); rm.push(el); continue;
      }
      [...el.attributes].forEach(a=>{ if(!ALLOWED_ATTR.has(a.name)) el.removeAttribute(a.name); });
    }
    rm.forEach(n=>n.remove());
    return root;
  }

  async function getCdatal(eno){
    try{
      const res = await fetch(`/gf/?mode=profile&eno=${eno}`, { credentials:"include" });
      if(!res.ok) return null;
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const cd = doc.querySelector(".cdatal");
      if(!cd) return null;
      return sanitizeFragment(cd.outerHTML).firstElementChild;
    }catch(e){ return null; }
  }

  async function getSkillsetInner(eno, skillset){
    try{
      const form = new FormData();
      form.append("mode","getUserSkillset");
      form.append("reno", String(eno));
      form.append("skillset", String(skillset || 1));
      const res = await fetch("/gf/api.php", {
        method:"POST", body:form, credentials:"include",
        headers:{ "X-Requested-With":"XMLHttpRequest" }
      });
      if(!res.ok) return null;
      const json = await res.json();
      const raw = String(json.message || "");
      if(!raw) return null;
      const frag = sanitizeFragment(raw);
      frag.querySelectorAll(".type7").forEach(e=>e.classList.add("type"));
      frag.querySelectorAll("[class*='type']").forEach(e=>{
        if(!e.classList.contains("type") && /type\d+/.test(e.className)) e.classList.add("type");
      });
      const wrap = document.createElement("div");
      wrap.className = "innerpopup";
      const inner = document.createElement("div");
      inner.className = "framearea talkarea cdatal";
      const skillbox = document.createElement("div");
      skillbox.id = "skillsetdata";
      while (frag.firstChild) skillbox.appendChild(frag.firstChild);
      inner.appendChild(skillbox);
      wrap.appendChild(inner);
      return wrap;
    }catch(e){ return null; }
  }

  function isOpen(){ return overlay.style.display === "flex"; }

  async function openModal(){
    const v = toHankakuDigits(input.value).slice(0,4);
    if(!v){ alert("null"); return; }
    const eno = Number(v);

    btn.textContent = "閉じる";
    btn.style.background = "#ffecec";
    btn.style.borderColor = "#d66";

    overlay.style.display = "flex";
    requestAnimationFrame(()=>{ overlay.style.opacity = "1"; modal.style.opacity = "1"; modal.style.transform = "translateY(0)"; });

    leftWrap.innerHTML = "読み込み中…";
    rightWrap.innerHTML = "読み込み中…";

    const [left, right] = await Promise.all([getCdatal(eno), getSkillsetInner(eno, 1)]);
    if(!left && !right){
      closeModal();
      alert("null");
      return;
    }
    leftWrap.innerHTML = "";
    rightWrap.innerHTML = "";
    if (left) leftWrap.appendChild(left);
    if (right) rightWrap.appendChild(right);
  }

  function closeModal(){
    modal.style.opacity = "0";
    modal.style.transform = "translateY(6px)";
    overlay.style.opacity = "0";
    setTimeout(()=>{ overlay.style.display = "none"; }, 150);
    btn.textContent = "見る";
    btn.style.background = "#e8f6e8";
    btn.style.borderColor = "#8abf8a";
  }
})();
