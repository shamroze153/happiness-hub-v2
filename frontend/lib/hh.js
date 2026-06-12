/**
 * Happiness Hub v2 — Core Library
 * Reads use GET. File uploads use a "simple" POST (text/plain) to avoid
 * both CORS preflight AND GET url-length limits for large images.
 */
const HH = (() => {
  const API = "https://script.google.com/macros/s/AKfycbwR31kKnILOJ6oAgNb5ePqYfNIfbMHp4W4nFrIHYn5KWxEgHMacORc-khRGLwJFeF3j/exec";

  async function call(action, params = {}) {
    try {
      let url = `${API}?action=${encodeURIComponent(action)}`;
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") {
          url += `&${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`;
        }
      });
      const res = await fetch(url);
      return await res.json();
    } catch (e) {
      console.error(e);
      return { success: false, error: "Connection failed. Check your internet." };
    }
  }

  // POST with text/plain body — "simple request", no CORS preflight,
  // and no URL length limit (used for file uploads with large base64 data)
  async function callPost(action, params = {}) {
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, ...params }),
      });
      return await res.json();
    } catch (e) {
      console.error(e);
      return { success: false, error: "Connection failed. Check your internet." };
    }
  }

  const get  = (action, p) => call(action, p);
  const post = (action, p) => call(action, p);

  // Session
  const getSession  = r => { try { return JSON.parse(localStorage.getItem("hh_"+r)||"null"); } catch { return null; } };
  const setSession  = (r,d) => localStorage.setItem("hh_"+r, JSON.stringify(d));
  const clearSession= r => localStorage.removeItem("hh_"+r);
  const getAuthBody = r => { const s=getSession(r); return s?{token:s.token,actor_id:s.actor_id,actor_type:r}:{}; };
  function requireAuth(role, redirect) {
    const s = getSession(role);
    if (!s) { location.href = redirect; return null; }
    return s;
  }

  // Referral
  function captureRef() {
    const r = new URLSearchParams(location.search).get("ref");
    if (r) sessionStorage.setItem("hh_ref", r);
  }
  const getRef = () => sessionStorage.getItem("hh_ref") || "direct";

  // Formatting
  const fmt$ = n => "$" + (parseFloat(n)||0).toFixed(2);
  function timeAgo(d) {
    if (!d) return "";
    const s = Math.floor((Date.now()-new Date(d))/1000);
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s/60)+"m ago";
    if (s < 86400) return Math.floor(s/3600)+"h ago";
    return Math.floor(s/86400)+"d ago";
  }
  function statusBadge(st) {
    const m = {"Pending":"⏳ Pending","Ordered":"📦 Ordered","Delivered":"✅ Delivered","Cashback Sent":"💸 Cashback Sent","Rejected":"❌ Rejected","Need More Info":"ℹ️ More Info","PayPal Issue":"⚠️ PayPal Issue"};
    const c = {"Pending":"badge-warn","Ordered":"badge-info","Delivered":"badge-ok","Cashback Sent":"badge-green","Rejected":"badge-red","Need More Info":"badge-warn","PayPal Issue":"badge-warn"};
    return `<span class="badge ${c[st]||'badge-warn'}">${m[st]||st||"Unknown"}</span>`;
  }
  const esc = s => String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

  // Toast
  function toast(msg, type="info") {
    let c = document.getElementById("hh-toasts");
    if (!c) { c=document.createElement("div"); c.id="hh-toasts"; c.style="position:fixed;top:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:10px;"; document.body.appendChild(c); }
    const t = document.createElement("div");
    const bg = type==="success"?"#00e5a0":type==="error"?"#ff4757":"#7c6aff";
    t.style=`padding:12px 20px;border-radius:12px;color:#fff;font-size:14px;font-weight:600;box-shadow:0 4px 24px rgba(0,0,0,.3);background:${bg};animation:slideInRight .3s ease;max-width:300px;`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(()=>{ t.style.opacity="0"; t.style.transition=".3s"; setTimeout(()=>t.remove(),300); }, 3500);
  }

  // File upload — via POST (handles large screenshots)
  function fileToB64(file) {
    return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result.split(",")[1]); r.onerror=rej; r.readAsDataURL(file); });
  }
  async function uploadFile(file) {
    if (!file) return "";
    if (file.size > 5*1024*1024) throw new Error("File too large (max 5MB)");
    const base64data = await fileToB64(file);
    const r = await callPost("uploadFile", { filename: file.name, base64data, mimetype: file.type });
    if (!r.success) throw new Error(r.error||"Upload failed");
    return r.url;
  }

  return { call, get, post, callPost, getSession, setSession, clearSession, getAuthBody, requireAuth,
           captureRef, getRef, fmt$, timeAgo, statusBadge, esc, toast, fileToB64, uploadFile };
})();
