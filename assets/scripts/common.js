/* common.js — FINAL v8 (Instant Modal + AgeExit + Banner Logic + Time Sync)
   Features:
   - "Back" arrow -> Shows Modal.
   - Modal "Stay" -> Instant MicroHandoff (Clone + Tabunder).
   - Modal "Leave" -> AgeExit (Dual Exit).
   - Banner "Main" -> Main Exit.
   - Banner "Close" -> MicroHandoff.
   - Autoexit & Reverse enabled.
*/

(() => {
  "use strict";

  // ---------------------------
  // Helpers
  // ---------------------------
  const safe = (fn) => { try { return fn(); } catch { return undefined; } };
  const replaceTo = (url) => { try { window.location.replace(url); } catch { window.location.href = url; } };

 // Стандартное открытие (Сразу URL, без about:blank)
  const openTab = (url) => {
    try {
      // Сразу передаем URL в window.open
      const w = window.open(url, "_blank");
      
      // Сбрасываем opener для безопасности (чтобы новая вкладка не могла управлять старой)
      if (w) { try { w.opener = null; } catch {} }
      
      return w || null;
    } catch {
      return null;
    }
  };

  // ---------------------------
  // URL + params
  // ---------------------------
  const curUrl = new URL(window.location.href);
  const getSP = (k, def = "") => curUrl.searchParams.get(k) ?? def;
  const CLONE_PARAM = "__cl";
  const isClone = getSP(CLONE_PARAM) === "1";

  // ---------------------------
  // Config Normalizer
  // ---------------------------
  const normalizeConfig = (appCfg) => {
    if (!appCfg || typeof appCfg !== "object" || !appCfg.domain) return null;
    const cfg = { domain: appCfg.domain };
    const ensure = (name) => (cfg[name] ||= {});

    Object.entries(appCfg).forEach(([k, v]) => {
      let m = k.match(/^([a-zA-Z0-9]+)_(currentTab|newTab)_(zoneId|url)$/);
      if (m) {
        const [, name, tab, field] = m;
        const ex = ensure(name);
        (ex[tab] ||= {}).domain = field === "zoneId" ? cfg.domain : ex[tab].domain;
        ex[tab][field] = v;
        return;
      }
      m = k.match(/^([a-zA-Z0-9]+)_(count|timeToRedirect|pageUrl)$/);
      if (m) { ensure(m[1])[m[2]] = v; return; }
      m = k.match(/^([a-zA-Z0-9]+)_(zoneId|url)$/);
      if (m) {
        const [, name, field] = m;
        const ex = ensure(name);
        const tab = (name === "tabUnderClick") ? "newTab" : "currentTab";
        (ex[tab] ||= {}).domain = field === "zoneId" ? cfg.domain : ex[tab].domain;
        ex[tab][field] = v;
      }
    });
    return cfg;
  };

  // ---------------------------
  // URL Builders
  // ---------------------------
  const buildQS = (zid) => {
    const p = curUrl.searchParams;
    return new URLSearchParams({ 
        zoneid: zid || "", 
        ymid: p.get("var_1") || p.get("var") || "", 
        var: p.get("var_2") || p.get("z") || "" 
    });
  };

  const genUrl = (z, d) => `https://${d.replace(/https?:\/\//, "")}/afu.php?${buildQS(z).toString()}`;

  // ---------------------------
  // Back Logic
  // ---------------------------
  const initBack = (cfg) => {
    const b = cfg.back?.currentTab; if (!b) return;
    const url = new URL(cfg.back.pageUrl || (window.location.origin + "/back.html"));
    // Передаем правильные параметры для back.html
    url.search = `z=${b.zoneId}&domain=${b.domain}&${buildQS(b.zoneId).toString()}`;
    
    try {
        for (let i = 0; i < (cfg.back?.count || 5); i++) window.history.pushState(null, "", url.toString());
        window.history.pushState(null, "", window.location.href);
    } catch (e) { console.error(e); }
  };

  // ---------------------------
  // EXITS
  // ---------------------------
  const runExit = (cfg, name, back = true) => {
    const ex = cfg[name]; if (!ex) return;
    const ct = ex.currentTab, nt = ex.newTab;
    
    if (back && ct) initBack(cfg);
    
    if (nt) openTab(nt.url || genUrl(nt.zoneId, nt.domain));
    if (ct) setTimeout(() => replaceTo(ct.url || genUrl(ct.zoneId, ct.domain)), 40);
  };

  const runMicro = (cfg) => {
    // Если это уже клон или микро-клик был совершен - делаем обычный выход
    if (sessionStorage.getItem("__m") === "1" || isClone) return runExit(cfg, "mainExit");
    sessionStorage.setItem("__m", "1");
    
    // Формируем URL клона с таймкодом и постером
    const v = document.querySelector("video");
    const u = new URL(window.location.href);
    u.searchParams.set("__cl", "1"); 
    u.searchParams.set("t", v ? v.currentTime : 0);
    if (v && v.getAttribute("poster")) u.searchParams.set("__poster", v.getAttribute("poster"));
    
    // Открываем клон
    openTab(u.toString());
    
    // Редиректим текущую (Tabunder)
    const tu = cfg.tabUnderClick?.newTab || cfg.tabUnderClick?.currentTab;
    if (tu) runExit(cfg, "tabUnderClick", true); else runExit(cfg, "mainExit");
  };

  // ---------------------------
  // BOOT & EVENTS
  // ---------------------------
  const boot = () => {
    const cfg = normalizeConfig(window.APP_CONFIG); if (!cfg) return;

    // REVERSE (Browser Back Button)
    safe(() => {
        window.history.pushState(null, "", window.location.href);
        window.addEventListener("popstate", () => runExit(cfg, "reverse", false));
    });

    // AUTOEXIT (Timer)
    const sec = parseInt(cfg.autoexit?.timeToRedirect) || 90;
    setTimeout(() => { if (!document.hidden) runExit(cfg, "autoexit"); }, sec * 1000);

    // CLICK MAP
    document.addEventListener("click", (e) => {
      const t = e.target.closest("[data-target]")?.getAttribute("data-target") || "";
      const modal = document.getElementById("xh_exit_modal");
      const banner = document.getElementById("xh_banner");

      // Блокируем плеер и стандартные действия
      e.preventDefault(); e.stopImmediatePropagation();

      // --- ЛОГИКА БАННЕРА ---
      if (t === "banner_main") { // Клик по картинке баннера -> Main Exit
        runExit(cfg, "mainExit"); return; 
      }
      if (t === "banner_close") { // Клик по крестику -> Micro Handoff
        if (banner) banner.style.display = "none"; 
        runMicro(cfg); return; 
      }

      // --- ЛОГИКА МОДАЛКИ (СТРЕЛКА НАЗАД) ---
      if (t === "back_button") {
        if (modal) modal.style.display = "flex"; return;
      }
      if (t === "modal_stay") { // Кнопка "Остаться" -> Micro Handoff
        if (modal) modal.style.display = "none"; 
        runMicro(cfg); return;
      }
      if (t === "modal_leave") { // Кнопка "Уйти" -> Age Exit
        runExit(cfg, "ageExit"); return;
      }
      
      // --- ЛОГИКА КЛОНА И ПЛЕЕРА ---
      // Если это клон или видео еще не готово (до 3 сек) -> Любой клик = Main Exit
      if (isClone || !document.querySelector(".ready")) { 
        runExit(cfg, "mainExit"); return; 
      }
      
      // Микро-клики по плееру (Звук, Таймлайн и т.д.) -> Micro Handoff
      if (new Set(["timeline", "play_pause", "mute_unmute", "settings", "fullscreen", "main_play"]).has(t)) {
        runMicro(cfg); return;
      }
      
      // Все остальные клики -> Main Exit
      runExit(cfg, "mainExit");
    }, true);
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();

