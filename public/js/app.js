/* StockFlow — UI/UX prototype logic (localStorage backed) */
(function () {
  "use strict";

  var KEY  = "stockflow.v1";

  /* Every page the permission system can grant. Order drives the nav. */
  var MODULES = [
    { key: "variable",   label: "Product Variable" },
    { key: "product",    label: "Add Product" },
    { key: "barcode",    label: "Barcode Manage" },
    { key: "customer",   label: "Customer Details" },
    { key: "sales",      label: "Sales / Stock Out" },
    { key: "return",     label: "Return / Damage" },
    { key: "repSummary", label: "Stock Summary",  group: "Report" },
    { key: "repDate",    label: "By Date Stock",  group: "Report" },
    { key: "userAccess", label: "User Access",    group: "User Permission" },
    { key: "roleAccess", label: "Role Access",    group: "User Permission" }
  ];

  /* The in-memory mirror of what the server holds. Every render function
     reads from here exactly as it did when this was a localStorage blob —
     the difference is that nothing writes to it except an API response. */
  var db = {
    articles: [], colors: [], sizes: [],
    customers: [], products: [], sales: [], returns: [],
    roles: [], users: [], nextCode: "—"
  };

  /* ── API client ──────────────────────────────────────── */
  var CSRF = (document.querySelector('meta[name="csrf-token"]') || {}).content || "";

  function ApiError(message, status, errors) {
    this.message = message; this.status = status; this.errors = errors || {};
  }
  ApiError.prototype = Object.create(Error.prototype);

  function api(method, path, body, retried) {
    /* A file upload has to go as multipart, and the browser must set that
       header itself so it can add the boundary — so Content-Type is only ours
       to declare for the JSON case. */
    var isForm = body instanceof FormData;

    var headers = {
      "Accept": "application/json",
      "X-CSRF-TOKEN": CSRF,
      "X-Requested-With": "XMLHttpRequest"
    };
    if (!isForm) headers["Content-Type"] = "application/json";

    return fetch("/api/" + path, {
      method: method,
      credentials: "same-origin",
      headers: headers,
      body: body === undefined ? undefined : (isForm ? body : JSON.stringify(body))
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = {};
        try { data = text ? JSON.parse(text) : {}; } catch (e) { /* HTML error page */ }

        if (res.ok) {
          /* Signing in and out rotates the CSRF token; adopt whatever the
             server just told us so the next call is not rejected. */
          if (data.csrf) CSRF = data.csrf;
          return data;
        }

        /* 419 means the token went stale — a long-idle tab, or a session
           rotated in another tab. Re-read it from the page and try once more
           rather than making the user reload and lose what they typed. */
        if (res.status === 419 && !retried) {
          return refreshCsrf().then(function () {
            return api(method, path, body, true);
          });
        }

        /* Laravel puts field errors under `errors`; surface the first one,
           because that is the sentence that actually tells you what to fix. */
        var first = data.errors && Object.keys(data.errors).length
          ? data.errors[Object.keys(data.errors)[0]][0]
          : null;

        throw new ApiError(
          first || data.message || ("Request failed (" + res.status + ")"),
          res.status,
          data.errors
        );
      });
    });
  }

  function refreshCsrf() {
    return fetch("/", { credentials: "same-origin" })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var m = html.match(/name="csrf-token"\s+content="([^"]+)"/);
        if (m) CSRF = m[1];
      })
      .catch(function () { /* the retry will fail loudly enough on its own */ });
  }

  var GET  = function (p)    { return api("GET", p); };
  var POST = function (p, b) { return api("POST", p, b || {}); };
  var PUT  = function (p, b) { return api("PUT", p, b || {}); };
  var DEL  = function (p)    { return api("DELETE", p); };

  /* One place to turn a rejected call into a message. A dead session ends the
     app rather than leaving the user clicking against a wall. */
  function fail(err) {
    if (err && err.status === 401) { showLogin("Your session has ended. Please sign in again."); return; }
    toast((err && err.message) || "Something went wrong.", "err");
  }

  /* Pull the whole dataset and repaint. Used at sign-in and after a reset. */
  function loadAll() {
    return GET("bootstrap").then(function (d) {
      db.articles  = d.articles;
      db.colors    = d.colors;
      db.sizes     = d.sizes;
      db.customers = d.customers;
      db.products  = d.products;
      db.sales     = d.sales;
      db.returns   = d.returns;
      db.roles     = d.roles;
      db.users     = d.users;
      db.nextCode  = d.nextCode;
      me = d.me;
      return d;
    });
  }

  /* Repaint every screen from the current db. Cheap enough to just do it all
     after a mutation, and it keeps the stats and cross-page counts honest. */
  function renderAll() {
    fillArticleSelects(); fillCustomerSelect(); fillRoleSelect(); syncArticleField();
    renderVars(); renderRecent(); renderCust(); renderCart(); renderSales();
    renderRetCart(); renderReturns(); renderSheet();
    renderStockSummary(); renderByDate();
    renderUsers(); renderRoles();
    updateChip();
  }

  /* ── helpers ─────────────────────────────────────────── */
  var $  = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pad(n, w) { return String(n).padStart(w, "0"); }
  function ymd(d) { return pad(d.getFullYear() % 100, 2) + pad(d.getMonth() + 1, 2) + pad(d.getDate(), 2); }
  function isoDate(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1, 2) + "-" + pad(d.getDate(), 2); }
  function money(n) { return "BDT " + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtDT(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
           ", " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  /* Leather shades the browser has no colour name for */
  var NAMED_SHADES = {
    "navy blue": "#1f3a93", olive: "#6b7a3a", maroon: "#7b2233",
    grey: "#8a8a8a", gray: "#8a8a8a", tan: "#b0743f", camel: "#c19a6b",
    coffee: "#4b3621", cherry: "#6e2639", beige: "#e3d3b8",
    brown: "#6b4226", black: "#1a1a1a"
  };

  /* Colours are typed freely now, so most names will be ones this list has
     never heard of. Ask the browser whether it can paint the name, and fall
     back to a neutral chip rather than an invisible one. */
  var paintable = (function () {
    var probe = document.createElement("span"), cache = {};
    return function (name) {
      if (!(name in cache)) {
        probe.style.color = "";
        probe.style.color = name;
        cache[name] = probe.style.color !== "";
      }
      return cache[name];
    };
  })();

  function colorDot(c) {
    var k = String(c == null ? "" : c).trim().toLowerCase();
    if (NAMED_SHADES[k]) return NAMED_SHADES[k];
    return paintable(k) ? k : "#c9bcae";
  }

  function statusBadge(p) {
    if (p.status === "damaged") return '<span class="badge dmg">Damaged</span>';
    if (p.status === "out")     return '<span class="badge out">Stock Out</span>';
    if (p.returnedFrom)         return '<span class="badge ok">In Stock · Returned</span>';
    return '<span class="badge ok">In Stock</span>';
  }

  var toastTimer;
  function toast(msg, kind) {
    var t = $("#toast");
    t.textContent = msg;
    t.className = "toast show " + (kind || "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = "toast " + (kind || ""); }, 2600);
  }

  /* The barcode counter now lives in the database — two terminals generating
     at the same moment must not mint the same code, and only the server can
     guarantee that. `db.nextCode` is whatever the last response told us. */

  /* ══ AUTH & PERMISSIONS ════════════════════════════════ */
  /* The signed-in user, as the server describes them. The session itself is a
     cookie the browser never reads — nothing here can grant access on its own,
     it only decides what to draw. Every route is checked again server-side. */
  var me = null;

  function can(key) {
    return !!(me && me.perms && me.perms[key]);
  }
  /* Wiping the whole database is a Super Admin-only lever. */
  function isSuperAdmin() {
    return !!(me && me.roleName === "Super Admin");
  }
  function firstAllowed() {
    var m = MODULES.find(function (x) { return can(x.key); });
    return m ? m.key : "variable";
  }

  /* Hide every nav entry the role cannot open, and collapse a group whose
     children are all hidden — an empty parent is just noise. */
  function applyPermsToNav() {
    MODULES.forEach(function (m) {
      var btn = $('.sidebar .nav-item[data-page="' + m.key + '"]');
      if (btn) btn.style.display = can(m.key) ? "" : "none";
    });
    [["#reportGroup", ["repSummary", "repDate"]],
     ["#permGroup",   ["userAccess", "roleAccess"]]].forEach(function (g) {
      var any = g[1].some(can);
      $(g[0]).style.display = any ? "" : "none";
    });
    /* The Add Product shortcuts open the Product Variable modals, so they
       follow that module's access, not this page's — and Edit carries the
       extra Super Admin rule that renaming an article has everywhere. */
    /* Edit Article and Add Color are open to every role: they are part of
       filling in this form, not administration. The routes behind them accept
       either the variable or the product module. */

    /* Browsing the whole stock list from the till is a Super Admin thing;
       everyone else works from the barcode in front of them. */
    $("#openStockModal").style.display = isSuperAdmin() ? "" : "none";

    var who = me ? me.name + " · " + (me.roleName || "No role") : "";
    $("#whoAmI").textContent = who;
    $("#whoAmISide").textContent = who;
    $("#resetData").style.display = isSuperAdmin() ? "" : "none";
  }

  /* Take the page name out of the address bar. Browser history entries
     themselves cannot be removed by a page, so Back still walks the trail —
     but each entry it lands on gets scrubbed on arrival, and none of them
     names a screen any more. */
  function scrubUrl() {
    try { history.replaceState({ sfGuard: true }, "", location.pathname); } catch (e) {}
  }

  function showLogin(msg) {
    me = null;
    current = null;

    /* Signing out has to forget where the last person was: the hash, the
       remembered page, and the trail behind the current entry. Otherwise the
       next sign-in lands on their screen and the address bar names it. */
    try { localStorage.removeItem(PAGE_KEY); } catch (e) {}
    scrubUrl();

    $("#loginErr").textContent = msg || "";
    $("#loginScreen").classList.add("show");
    document.body.classList.add("locked");
    $("#loginPass").value = "";
    setTimeout(function () { $("#loginUser").focus(); }, 60);
  }

  /* Called once the server has confirmed a session and handed over the data. */
  function enterApp(greet) {
    $("#loginScreen").classList.remove("show");
    document.body.classList.remove("locked");
    applyPermsToNav();
    renderAll();

    /* A page the role can no longer open must not be restored into. */
    var p = savedPage();
    if (!can(p)) p = firstAllowed();
    applyPage(p); refreshPage(p);
    seedHistory(p);

    if (greet) toast("Welcome back, " + me.name + ".", "ok");
  }

  $("#loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var btn = $("#loginForm button[type=submit]");
    $("#loginErr").textContent = "";
    btn.disabled = true;

    POST("login", {
      username: $("#loginUser").value.trim(),
      password: $("#loginPass").value
    })
      .then(loadAll)
      .then(function () { enterApp(true); })
      .catch(function (err) {
        $("#loginErr").textContent = (err && err.message) || "Could not sign in.";
      })
      .then(function () { btn.disabled = false; });
  });

  $("#logoutBtn").addEventListener("click", function () {
    if (!confirm("Sign out of StockFlow?")) return;
    doLogout();
  });

  /* ── navigation ──────────────────────────────────────── */
  var TITLES = {
    variable: "Product Variable", product: "Add Product", customer: "Customer Details",
    sales: "Sales / Stock Out", "return": "Return / Damage", barcode: "Barcode Manage",
    repSummary: "Report / Stock Summary", repDate: "Report / By Date Stock",
    userAccess: "User Permission / User Access", roleAccess: "User Permission / Role Access"
  };
  /* which collapsible group a sub-page lives under */
  var GROUP_OF = { repSummary: "#reportGroup", repDate: "#reportGroup",
                   userAccess: "#permGroup",  roleAccess: "#permGroup" };
  /* ── mobile nav drawer ───────────────────────────────── */
  /* Below 980px the sidebar slides in over the page instead of sitting beside
     it. The class lives on .app so the CSS can move the drawer and fade the
     scrim together; on wider screens none of it applies. */
  function setNav(open) {
    $(".app").classList.toggle("nav-open", open);
    $("#navToggle").setAttribute("aria-expanded", open ? "true" : "false");
  }
  function closeNav() { setNav(false); }

  $("#navToggle").addEventListener("click", function () {
    setNav(!$(".app").classList.contains("nav-open"));
  });
  $("#navScrim").addEventListener("click", closeNav);

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeNav();
  });

  /* A drawer that stays open over the page you just opened is in the way. */
  window.addEventListener("resize", function () {
    if (window.innerWidth > 980) closeNav();
  });


  $("#reportToggle").addEventListener("click", function () {
    $("#reportGroup").classList.toggle("open");
  });
  $("#permToggle").addEventListener("click", function () {
    $("#permGroup").classList.toggle("open");
  });
  var PAGE_KEY = "stockflow.page";

  /* A real screen in this build. Says nothing about whether the signed-in
     role may open it — that needs `me`, which is not loaded at boot. */
  function existsPage(p) {
    return !!(p && TITLES[p] && $("#page-" + p));
  }

  function usable(p) {
    return existsPage(p) && can(p);
  }

  /* Where the browser was last, from the URL first and the remembered page
     second. No permission test, so this is answerable before /api/me — which
     is the whole point: the right screen can be painted immediately instead
     of after two round trips. */
  function rememberedPage() {
    var fromHash = (location.hash || "").replace(/^#/, "");
    if (existsPage(fromHash)) return fromHash;

    var p;
    try { p = localStorage.getItem(PAGE_KEY); } catch (e) {}
    return existsPage(p) ? p : null;
  }

  /* The URL hash wins over the remembered page: navigating pushes it, so on a
     reload it is the more specific answer, and it keeps the address bar and
     the screen telling the same story. */
  /* The same page, but only if this role may open it. */
  function savedPage() {
    var p = rememberedPage();
    return usable(p) ? p : firstAllowed();
  }

  /* Cheap class swap only — safe to run before the boot renders, so the
     browser never paints the hard-coded Product Variable page first. */
  function applyPage(p) {
    $$(".nav-item").forEach(function (b) { b.classList.remove("active"); });
    var btn = $('.sidebar .nav-item[data-page="' + p + '"]');
    if (btn) {
      btn.classList.add("active");
      if (GROUP_OF[p]) $(GROUP_OF[p]).classList.add("open");
    }
    $$(".page").forEach(function (s) { s.classList.remove("active"); });
    $("#page-" + p).classList.add("active");
    $("#crumb").textContent = TITLES[p];
  }

  /* Everything a page needs once it is actually on screen. */
  function refreshPage(p) {
    if (p === "sales")  setTimeout(function () { $("#scanInput").focus(); }, 60);
    if (p === "return") setTimeout(function () { $("#retScan").focus(); }, 60);
    if (p === "barcode")    renderSheet();
    /* Arriving on a report starts from the prompt, not from whatever range
       happened to be applied last time. */
    if (p === "repSummary") clearStockSummary();
    if (p === "repDate")    clearByDate();
    if (p === "userAccess") renderUsers();
    if (p === "roleAccess") renderRoles();
  }

  function goPage(p) {
    if (!can(p)) { toast("You do not have access to that module.", "err"); return; }
    applyPage(p);
    try { localStorage.setItem(PAGE_KEY, p); } catch (e) {}
    refreshPage(p);
    pushPage(p);   // so Back returns to the screen they came from
  }
  /* ── browser history ─────────────────────────────────── */
  /* Each module screen gets its own history entry, so Back and Forward walk
     the pages the user actually visited instead of leaving the app.
     Behind the first page sits a guard entry: stepping onto it means there is
     no earlier screen left, which is where we ask about signing out. */
  var current = null;

  function pushPage(p) {
    current = p;
    try { history.pushState({ sfPage: p }, "", "#" + p); } catch (e) {}
  }

  /* Lay down guard → first page. Called once the app is on screen.
     A reload keeps the entry we pushed before it, and the trail behind that
     entry is still walkable — so adopt it instead of stamping a fresh guard
     on top, which would make the very next Back look like the end of the
     line when it is not. */
  function seedHistory(p) {
    current = p;
    try {
      if (history.state && history.state.sfPage) return;   // resuming a trail
      history.replaceState({ sfGuard: true }, "", "#");
      history.pushState({ sfPage: p }, "", "#" + p);
    } catch (e) {}
  }

  function doLogout() {
    POST("logout")
      .catch(function () { /* the session is going away either way */ })
      /* showLogin() clears the remembered page and scrubs the URL — every
         route into the locked state needs that, not just this one. */
      .then(function () { showLogin(""); });
  }

  window.addEventListener("popstate", function (e) {
    /* Signed out: Back is walking entries the last session left behind. It
       cannot get into the app, but the hash would still put a page name in
       the address bar — so wipe it off each entry as it is reached. */
    if (document.body.classList.contains("locked")) { scrubUrl(); return; }

    var st = e.state;
    if (st && st.sfPage) {
      var p = can(st.sfPage) ? st.sfPage : firstAllowed();
      current = p;
      try { localStorage.setItem(PAGE_KEY, p); } catch (err) {}
      applyPage(p); refreshPage(p); closeNav();
      return;
    }

    /* Landed on the guard: nothing behind this but leaving the app. Test for
       the guard itself, never for "no page in the state" — a plain hash edit
       makes an entry with no state at all, and reading that as the end of the
       trail put a sign-out prompt in front of anyone who touched the URL. */
    if (st && st.sfGuard) {
      if (confirm("No earlier page — do you want to sign out of StockFlow?")) {
        doLogout();
      } else if (current) {
        /* Step back onto the page they were on, so Back is a no-op. */
        pushPage(current);
      }
      return;
    }

    /* A same-document navigation this app did not create — the hash typed or
       edited by hand. Follow it when it names a page the role can open, and
       otherwise leave the screen exactly as it is. */
    var to = rememberedPage();
    if (to && can(to) && to !== current) {
      current = to;
      try { localStorage.setItem(PAGE_KEY, to); } catch (err) {}
      applyPage(to); refreshPage(to); closeNav();
    }
  });

  $$(".nav-item").forEach(function (btn) {
    var p = btn.dataset.page;
    if (!p) return;                     // parent toggle handled above
    btn.addEventListener("click", function () { goPage(p); closeNav(); });
  });

  /* ── modals ──────────────────────────────────────────── */
  function openModal(id) { $(id).classList.add("open"); }
  function closeModal(el) { el.classList.remove("open"); }
  $$(".modal-back").forEach(function (m) {
    m.addEventListener("click", function (e) {
      if (e.target === m || e.target.hasAttribute("data-close")) closeModal(m);
    });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") $$(".modal-back.open").forEach(closeModal);
  });

  /* ══ 1. PRODUCT VARIABLE ═══════════════════════════════ */

  /* ── the three master lists ──────────────────────────── */
  /* Articles, colours and sizes are what Add Product offers. They are three
     independent lists, not a fixed set of combinations: any article can be
     stocked in any colour in any size, which is how the shop actually buys.
     All three behave identically, so the wiring is written once. */

  var LISTS = {
    articles: { noun: "article", plural: "articles" },
    colors:   { noun: "colour",  plural: "colours", dot: true },
    sizes:    { noun: "size",    plural: "sizes" }
  };

  function labelsOf(key) {
    return db[key].map(function (x) { return x.label; });
  }

  /* Chips for a modal's "on the list now" pool. Articles have no pool — the
     Article List table behind the modal already serves that purpose. */
  function renderPool(key) {
    var cfg = LISTS[key];
    var pool = $("#" + key.replace(/s$/, "") + "Pool");
    if (!pool) return;

    var canEdit = isSuperAdmin();

    pool.innerHTML = db[key].length
      ? db[key].map(function (x) {
          return '<span class="combo-chip">' + esc(x.label) +
            (canEdit ? '<button type="button" class="combo-chip-x" data-del-list="' + key +
                       '" data-id="' + x.id + '" aria-label="Remove ' + esc(x.label) +
                       '">&times;</button>' : "") +
          '</span>';
        }).join("")
      : '<span class="hint" style="margin:0">Nothing on the list yet.</span>';

    $("#" + key.replace(/s$/, "") + "PoolHint").textContent = canEdit
      ? "A " + cfg.noun + " already used by a barcode cannot be removed."
      : "Only a Super Admin can remove a " + cfg.noun + ".";
  }

  /* Everything that has to repaint when one of the lists changes. */
  function listsChanged() {
    renderPool("colors"); renderPool("sizes");
    renderVars(); fillArticleSelects(); syncArticleField(); resync();
  }

  function removeFromList(key, id) {
    var row = db[key].find(function (x) { return x.id === id; });
    if (!row) return;
    if (!confirm('Remove "' + row.label + '" from the ' + LISTS[key].noun + ' list?')) return;

    DEL(key + "/" + id).then(function (d) {
      db[key] = d[key];
      listsChanged();
      toast(row.label + " removed.");
    }).catch(fail);
  }

  /* One delegated handler covers every pool, and the article table reuses the
     same data attributes. */
  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-del-list]");
    if (!btn) return;
    e.preventDefault();
    removeFromList(btn.dataset.delList, +btn.dataset.id);
  });

  /* Wire an "add to this list" form: a chip input plus its submit. */
  function wireListForm(key, formId, comboRef, closeAfter) {
    $(formId).addEventListener("submit", function (e) {
      e.preventDefault();

      var combo = comboRef();
      combo.commit();          // a value typed but not yet chipped still counts
      var values = combo.values();

      if (!values.length) {
        toast("Add at least one " + LISTS[key].noun + ".", "err");
        combo.focus();
        return;
      }

      /* A staged image forces multipart; without one the plain JSON body is
         the simpler thing to send. */
      var body;
      if (key === "articles" && addImage.file()) {
        body = new FormData();
        values.forEach(function (v) { body.append("articles[]", v); });
        body.append("image", addImage.file());
      } else {
        body = {};
        body[key] = values;
      }

      POST(key, body).then(function (d) {
        db[key] = d[key];
        combo.clear();
        if (key === "articles") addImage.reset();
        listsChanged();
        if (closeAfter) closeModal($(closeAfter));

        var n = d.added.length;
        var msg = n + " " + (n === 1 ? LISTS[key].noun : LISTS[key].plural) + " added";
        if (d.skipped.length) msg += " · " + d.skipped.length + " already on the list";
        toast(msg + ".", "ok");
      }).catch(fail);
    });
  }

  /* The combos are built in initCombos(), after this runs, so the forms reach
     them lazily rather than capturing an undefined. */
  var articleCombo, newColorCombo, newSizeCombo;

  wireListForm("articles", "#varForm", function () { return articleCombo; }, "#varModal");
  wireListForm("colors", "#colorForm", function () { return newColorCombo; });
  wireListForm("sizes", "#sizeForm", function () { return newSizeCombo; });

  /* Both the Product Variable page and Add Product open these, so the
     opening lives in one place and the buttons just call it. */
  function openArticleAdd() {
    $("#varForm").reset();
    if (articleCombo) articleCombo.clear();
    addImage.reset();   // form.reset() clears the input but not the preview
    resync();
    openModal("#varModal");
    setTimeout(function () { articleCombo.focus(); }, 60);
  }

  /* No autofocus on the colour and size lists: focusing the add field opens
     its suggestion panel, which has to drop upwards in a short modal and then
     covers the very list the modal exists to show. */
  function openColorAdd() {
    $("#colorForm").reset();
    if (newColorCombo) newColorCombo.clear();
    renderPool("colors"); resync();
    openModal("#colorModal");
  }

  $("#openVarModal").addEventListener("click", openArticleAdd);

  /* Add Product edits the article its own field is holding. */
  $("#editArticleBtn").addEventListener("click", function () {
    var a = currentArticle();
    if (a) openArticleEdit(a.id);
  });
  $("#openColorModal").addEventListener("click", openColorAdd);
  $("#openColorModal2").addEventListener("click", openColorAdd);

  $("#openSizeModal").addEventListener("click", function () {
    $("#sizeForm").reset();
    if (newSizeCombo) newSizeCombo.clear();
    renderPool("sizes"); resync();
    openModal("#sizeModal");
  });

  $("#varSearch").addEventListener("input", renderVars);
  /* ── article images ──────────────────────────────────── */
  /* Optional photo per article. Two screens need the same picker — the add
     modal and the edit modal — so it is built once per prefix. */
  var MAX_IMAGE = 4 * 1024 * 1024;

  function badImage(file) {
    if (!file) return "No file chosen.";
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return "Choose a JPG, PNG or WebP image.";
    if (file.size > MAX_IMAGE) return "That image is over 4 MB. Choose a smaller one.";
    return null;
  }

  /**
   * Wire a drop zone. `p` is the id prefix: p+"Image" is the hidden file
   * input, p+"ImageDrop" the visible box, and so on.
   *
   * Returns { file, cleared, reset, showUrl } — `cleared` distinguishes
   * "left the existing photo alone" from "asked for it to be removed", which
   * the edit form has to tell the server apart.
   */
  function imagePicker(p) {
    var input = $("#" + p + "Image"),
        box   = $("#" + p + "ImageDrop"),
        img   = $("#" + p + "ImagePreview"),
        empty = $("#" + p + "ImageEmpty"),
        clear = $("#" + p + "ImageClear");

    var file = null, cleared = false;

    function paint(src) {
      if (img.src.slice(0, 5) === "blob:") URL.revokeObjectURL(img.src);
      if (src) {
        img.src = src;
        img.hidden = false; empty.hidden = true; clear.hidden = false;
      } else {
        img.removeAttribute("src");
        img.hidden = true; empty.hidden = false; clear.hidden = true;
      }
    }

    function choose(f) {
      if (!f) return;
      var err = badImage(f);
      if (err) { toast(err, "err"); return; }
      file = f; cleared = false;
      paint(URL.createObjectURL(f));
    }

    box.addEventListener("click", function (e) {
      if (e.target.closest("#" + p + "ImageClear")) return;   // the × has its own job
      input.click();
    });
    box.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); }
    });
    input.addEventListener("change", function () { choose(this.files[0]); });

    clear.addEventListener("click", function (e) {
      e.stopPropagation();
      file = null; cleared = true; input.value = "";
      paint(null);
    });

    /* Dropping a file on the box is the other way people expect to do this. */
    ["dragenter", "dragover"].forEach(function (ev) {
      box.addEventListener(ev, function (e) { e.preventDefault(); box.classList.add("dragover"); });
    });
    ["dragleave", "drop"].forEach(function (ev) {
      box.addEventListener(ev, function (e) { e.preventDefault(); box.classList.remove("dragover"); });
    });
    box.addEventListener("drop", function (e) {
      choose(e.dataTransfer.files && e.dataTransfer.files[0]);
    });

    return {
      file: function () { return file; },
      cleared: function () { return cleared; },
      /* Start from nothing, or from the photo the article already has. */
      reset: function (url) {
        file = null; cleared = false; input.value = "";
        paint(url || null);
      }
    };
  }

  var addImage  = imagePicker("v");     // the Add Articles modal
  var editImage = imagePicker("ev");    // the Edit Article modal
  /* ── edit one article ────────────────────────────────── */
  /* Renaming rewrites what already-printed barcodes claim, so this is Super
     Admin only — the server checks it again. */
  var editingArticle = null;

  function openArticleEdit(id) {
    var a = db.articles.find(function (x) { return x.id === id; });
    if (!a) return;

    editingArticle = a;
    $("#evArticle").value = a.label;
    editImage.reset(a.image);

    var n = db.products.filter(function (p) { return p.article === a.label; }).length;
    $("#evArticleHint").textContent = n
      ? "Renaming also updates the " + n + " barcode" + (n === 1 ? "" : "s") + " already made for it."
      : "No stock has been generated for this article yet.";

    openModal("#varEditModal");
    setTimeout(function () { $("#evArticle").focus(); }, 60);
  }

  $("#varBody").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-edit-article]");
    if (btn) openArticleEdit(+btn.dataset.editArticle);
  });

  $("#varEditForm").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!editingArticle) return;

    var label = $("#evArticle").value.trim();
    if (!label) { toast("The article number cannot be empty.", "err"); return; }

    /* Always multipart: the picker may be carrying a file, and one shape for
       both cases keeps the server reading it the same way every time. */
    var form = new FormData();
    form.append("label", label);
    if (editImage.file()) form.append("image", editImage.file());
    if (editImage.cleared()) form.append("remove_image", "1");

    POST("articles/" + editingArticle.id, form).then(function (d) {
      db.articles = d.articles;

      /* Products carry the article as text and the server just rewrote them,
         so the local copy has to follow or the reports show the old name. */
      if (d.renamed) {
        db.products.forEach(function (p) {
          if (p.article === d.renamed.from) p.article = d.renamed.to;
        });
        /* Add Product may be sitting on the old spelling — leaving it there
           would strand the field on a name the list no longer has. */
        if ($("#pArticle").value.trim().toLowerCase() === d.renamed.from.toLowerCase()) {
          $("#pArticle").value = d.renamed.to;
        }
      }

      closeModal($("#varEditModal"));
      editingArticle = null;
      listsChanged(); renderRecent(); renderSheet();

      toast("Article saved" + (d.moved ? " · " + d.moved + " barcode(s) renamed" : "") + ".", "ok");
    }).catch(fail);
  });

  /* The Article List: the master article numbers, with how much stock each
     one accounts for. Colours and sizes live in their own modals. */
  function renderVars() {
    var q = $("#varSearch").value.trim().toLowerCase();
    var rows = db.articles.filter(function (a) {
      return !q || a.label.toLowerCase().indexOf(q) > -1;
    });

    /* Barcodes record the article as text, so stock is counted by label. */
    var stock = {};
    db.products.forEach(function (p) {
      stock[p.article] = (stock[p.article] || 0) + 1;
    });

    var mayManage = isSuperAdmin();

    $("#varBody").innerHTML = rows.length ? rows.map(function (a) {
      var n = stock[a.label] || 0;
      /* A picture, not a control — Edit is where it gets changed, and one
         way in is less to explain than two. */
      var thumb = '<span class="thumb">' +
        (a.image
          ? '<img src="' + esc(a.image) + '" alt="' + esc(a.label) + '">'
          : '<svg viewBox="0 0 24 24"><path d="M21 15V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z"/><path d="M3 16l5-5 4 4"/><circle cx="15" cy="8" r="1.4"/></svg>') +
        '</span>';

      return '<tr>' +
        '<td>' + thumb + '</td>' +
        '<td class="mono" style="color:var(--accent)">' + esc(a.label) + '</td>' +
        '<td class="num' + (n ? '' : ' z') + '">' + n + '</td>' +
        '<td>' +
          '<div class="row-actions">' +
            (mayManage
              ? '<button class="btn btn-ghost btn-sm" data-edit-article="' + a.id + '">Edit</button>' +
                '<button class="btn btn-danger btn-sm" data-del-list="articles"' +
                ' data-id="' + a.id + '">Delete</button>'
              : "") +
          '</div>' +
        '</td>' +
      '</tr>';
    }).join("") :
      '<tr><td colspan="4"><div class="empty">' +
      (db.articles.length ? "No article matches that search."
                          : "No articles yet. Use <b>Add Article</b> to create one.") +
      '</div></td></tr>';

    $("#varCount").textContent = rows.length + " article" + (rows.length === 1 ? "" : "s");
    $("#statVars").textContent   = db.articles.length;
    $("#statColors").textContent = db.colors.length;
    $("#statSizes").textContent  = db.sizes.length;
  }
  /* ══ 2. ADD PRODUCT ════════════════════════════════════ */
  /* Article and colour are typed, with the master lists offered as
     suggestions; typing something new is how it joins the list, because the
     server records whatever is submitted. Size is picked from its list. */

  /* Replace a select's options, keeping the current pick when it survives. */
  function setOptions(sel, values, placeholder, dots) {
    var keep = sel.value;
    sel.innerHTML = '<option value="">' + placeholder + '</option>' +
      values.map(function (v) {
        return '<option value="' + esc(v) + '"' +
               (dots ? ' data-dot="' + esc(colorDot(v)) + '"' : "") +
               '>' + esc(v) + '</option>';
      }).join("");
    sel.value = values.indexOf(keep) > -1 ? keep : "";
  }

  function fillArticleSelects() {
    setOptions($("#pSize"), labelsOf("sizes"), "— select a size —");

    /* The report filters only offer articles that actually have stock entries,
       so you can never pick one that returns an empty report. */
    var arts = uniq(db.products.map(function (p) { return p.article; })).sort();
    var artOpts = '<option value="">All articles</option>' +
      arts.map(function (a) { return '<option>' + esc(a) + '</option>'; }).join("");

    ["#bArticle", "#ssArticle", "#bdArticle"].forEach(function (s) {
      var sel = $(s), keep = sel.value;
      sel.innerHTML = artOpts;
      sel.value = arts.indexOf(keep) > -1 ? keep : "";   // drop a filter that no longer exists
    });
    resync();
  }

  /* ── combobox wiring ─────────────────────────────────── */
  function uniq(list) {
    var seen = {}, out = [];
    list.forEach(function (x) {
      var k = String(x).trim(); if (!k) return;
      if (seen[k.toLowerCase()]) return;
      seen[k.toLowerCase()] = 1; out.push(k);
    });
    return out;
  }
  function resync() {
    $$(".combo-hidden").forEach(function (h) { if (h._combo) h._combo.sync(); });
  }

  function articleSuggestions() { return labelsOf("articles"); }
  function colorSuggestions()   { return labelsOf("colors"); }
  function sizeSuggestions()    { return labelsOf("sizes"); }

  function initCombos() {
    /* The three "add to the master list" fields. Each suggests what is
       already on its own list, so a near-duplicate is easy to spot. */
    articleCombo  = Combo.multiFromInput($("#vArticle"), articleSuggestions);
    newColorCombo = Combo.multiFromInput($("#newColors"), colorSuggestions, { dot: colorDot });
    newSizeCombo  = Combo.multiFromInput($("#newSizes"), sizeSuggestions);

    /* Add Product. Article and colour accept anything typed; size is picked. */
    Combo.fromInput($("#pArticle"), articleSuggestions);
    Combo.fromInput($("#pColor"), colorSuggestions, { dot: colorDot });

    ["#pSize", "#sCustomer", "#bArticle", "#bStatus",
     "#rType", "#ssArticle", "#bdArticle", "#bdType"].forEach(function (sel) {
      Combo.fromSelect($(sel));
    });
  }

  /* ── the article photo on Add Product ────────────────── */
  /* Sits at the head of the Article No field, so whoever is generating
     barcodes can see they picked the shoe they meant. The combo widget wraps
     the input at init time, so the slot goes in afterwards. */
  var NO_PHOTO_SVG =
    '<svg viewBox="0 0 24 24"><path d="M21 15V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z"/>' +
    '<path d="M3 16l5-5 4 4"/><circle cx="15" cy="8" r="1.4"/></svg>';

  function initArticleThumb() {
    var wrap = $("#pArticle").closest(".combo");
    if (!wrap) return;

    var slot = document.createElement("span");
    slot.className = "field-thumb";
    slot.id = "pArticleThumb";
    wrap.insertBefore(slot, wrap.firstChild);
    wrap.classList.add("has-thumb");

    /* "change" covers picking from the list, "input" covers typing — the
       combo only fires the first, and a typed name can match too. */
    wrap.addEventListener("input", syncArticleField);
    $("#pArticle").addEventListener("change", syncArticleField);

    syncArticleField();
  }

  /* Whichever article the field is naming, or null while it holds something
     that is not on the list yet. Both the photo and the Edit button hang off
     this, so the two can never disagree about what is selected. */
  function currentArticle() {
    var typed = $("#pArticle").value.trim().toLowerCase();
    if (!typed) return null;
    return db.articles.find(function (x) {
      return x.label.toLowerCase() === typed;
    }) || null;
  }

  function syncArticleField() {
    var a = currentArticle();

    var slot = $("#pArticleThumb");
    if (slot) {
      slot.innerHTML = a && a.image
        ? '<img src="' + esc(a.image) + '" alt="">'
        : NO_PHOTO_SVG;
      slot.classList.toggle("is-empty", !(a && a.image));
    }

    /* Nothing to edit until the name matches something saved — say which of
       the two it is rather than leaving a dead button. */
    var btn = $("#editArticleBtn");
    btn.disabled = !a;
    btn.title = a
      ? "Edit " + a.label
      : ($("#pArticle").value.trim()
          ? "Save this article first — it is not on the list yet"
          : "Pick an article to edit it");
  }

  $("#clearProd").addEventListener("click", function () {
    ["pArticle", "pColor", "pPrice"].forEach(function (id) { $("#" + id).value = ""; });
    $("#pSize").value = "";
    $("#pQty").value = 1;
    resync(); syncArticleField();
    $("#labelPane").innerHTML = '<div class="empty">Cleared — generate a new barcode.</div>';
  });

  $("#genBtn").addEventListener("click", function () {
    /* Whatever is typed is the variant. The server reuses the spelling
       already on file and records anything new, so no lookup is needed here. */
    var article = $("#pArticle").value.trim();
    var color   = $("#pColor").value.trim();
    var size    = $("#pSize").value;
    if (!article) { toast("Type or pick an article first.", "err"); return; }
    if (!color)   { toast("Type or pick a color.", "err"); return; }
    if (!size)    { toast("Select a size.", "err"); return; }

    var qty = Math.max(1, parseInt($("#pQty").value, 10) || 1);
    var btn = $("#genBtn");
    btn.disabled = true;

    /* The server mints the codes — asking for `qty` reserves that many in one
       locked step, so a second terminal generating at the same time picks up
       after this batch instead of colliding with it. */
    POST("products", {
      article: article,
      color:   color,
      size:    size,
      qty:     qty,
      price:   parseFloat($("#pPrice").value) || 0
    }).then(function (d) {
      d.products.forEach(function (p) { db.products.push(p); });
      db.nextCode = d.nextCode;
      /* Typing a value puts it on a master list, so all three come back. */
      if (d.articles) db.articles = d.articles;
      if (d.colors)   db.colors   = d.colors;
      if (d.sizes)    db.sizes    = d.sizes;

      /* Show the spelling the server settled on, not the raw typing. */
      var first = d.products[0];
      if (first) { $("#pArticle").value = first.article; $("#pColor").value = first.color; }

      renderLabel(d.products);
      renderRecent(); updateChip(); renderSheet(); renderVars();
      fillArticleSelects(); syncArticleField();
      toast(qty + " barcode" + (qty > 1 ? "s" : "") + " generated.", "ok");
    }).catch(fail).then(function () { btn.disabled = false; });
  });

  /* One physical 1.5in × 1in label: article / colour / size, then the
     barcode and its number. Used for both the preview and the print sheet
     so what you see is exactly what comes out of the printer. */
  function labelCard(p) {
    return '<div class="lbl-card">' +
      '<div class="lbl-info">' +
        '<span class="t">' + esc(p.article) + '</span>' +
        '<span class="s">' + esc(p.color) + '</span>' +
        '<span class="s">' + esc(p.size) + '</span>' +
      '</div>' +
      Barcode.svg(p.code, { height: 40, unit: 2, color: "#000000" }) +
      '<div class="c">' + esc(p.code) + '</div>' +
    '</div>';
  }

  /* `made` is the whole batch the user just generated — one entry, and one
     printable sticker, per pair. */
  function renderLabel(made) {
    var n = made.length, first = made[0], last = made[n - 1];

    $("#labelPane").innerHTML =
      '<div class="label-preview">' +
        '<div class="label-grid">' + made.map(labelCard).join("") + '</div>' +
        '<div class="label-size">' + n + ' label' + (n > 1 ? "s" : "") +
          ' · 1.5&Prime; × 1&Prime; actual print size</div>' +
      '</div>' +
      '<div class="kv"><span>Article No</span><b class="mono">' + esc(first.article) + '</b></div>' +
      '<div class="kv"><span>Color / Size</span><b>' + esc(first.color) + ' · ' + esc(first.size) + '</b></div>' +
      '<div class="kv"><span>Pairs</span><b>' + n + '</b></div>' +
      '<div class="kv"><span>Barcode Range</span><b class="mono">' +
        esc(first.code) + (n > 1 ? ' – ' + esc(last.code) : "") + '</b></div>' +
      '<div class="kv"><span>Price / Pair</span><b>' + money(first.price) + '</b></div>' +
      '<div class="kv"><span>Total Value</span><b>' + money(first.price * n) + '</b></div>' +
      '<div class="kv"><span>Generated</span><b>' + fmtDT(first.at) + '</b></div>' +
      '<button class="btn btn-ghost btn-block" style="margin-top:16px" id="quickPrint">' +
        'Print ' + n + ' Label' + (n > 1 ? "s" : "") + '</button>';

    $("#quickPrint").addEventListener("click", function () { window.print(); });
    $("#previewCode").textContent = last.code;
  }
  function renderRecent() {
    var rows = db.products.slice(-12).reverse();
    $("#recentBody").innerHTML = rows.length ? rows.map(function (p) {
      return '<tr>' +
        '<td class="mono" style="color:var(--accent)">' + esc(p.code) + '</td>' +
        '<td class="mono">' + esc(p.article) + '</td>' +
        '<td><span class="swatch"><i style="background:' + esc(colorDot(p.color)) + '"></i>' + esc(p.color) + '</span></td>' +
        '<td><span class="badge">' + esc(p.size) + '</span></td>' +
        '<td>' + statusBadge(p) + '</td>' +
        '<td style="color:var(--txt-dim)">' + fmtDT(p.at) + '</td>' +
      '</tr>';
    }).join("") : '<tr><td colspan="6"><div class="empty">Nothing generated yet.</div></td></tr>';
    $("#recentCount").textContent = db.products.length + " total";
  }

  function updateChip() {
    $("#nextCodeChip").textContent = "NEXT · " + db.nextCode;
    $("#previewCode").textContent = db.nextCode;
  }

  /* ══ 3. CUSTOMER DETAILS ═══════════════════════════════ */
  $("#openCustModal").addEventListener("click", function () {
    $("#custForm").reset(); openModal("#custModal"); setTimeout(function () { $("#cName").focus(); }, 60);
  });

  $("#custForm").addEventListener("submit", function (e) {
    e.preventDefault();
    POST("customers", {
      name:    $("#cName").value.trim(),
      phone:   $("#cPhone").value.trim(),
      email:   $("#cEmail").value.trim(),
      address: $("#cAddr").value.trim(),
      note:    $("#cNote").value.trim()
    }).then(function (d) {
      db.customers.push(d.customer);
      closeModal($("#custModal")); renderCust(); fillCustomerSelect();
      toast("Customer added.", "ok");
    }).catch(fail);
  });

  $("#custSearch").addEventListener("input", renderCust);

  function renderCust() {
    var q = $("#custSearch").value.trim().toLowerCase();
    var rows = db.customers.filter(function (c) {
      return !q || (c.name + " " + c.phone + " " + c.code).toLowerCase().indexOf(q) > -1;
    });
    $("#custBody").innerHTML = rows.length ? rows.map(function (c) {
      var orders = db.sales.filter(function (s) { return s.custId === c.id; }).length;
      return '<tr>' +
        '<td><b>' + esc(c.name) + '</b>' + (c.note ? '<div class="hint">' + esc(c.note) + '</div>' : "") + '</td>' +
        '<td class="mono">' + esc(c.phone) + '</td>' +
        '<td style="color:var(--txt-dim)">' + esc(c.email || "—") + '</td>' +
        '<td style="color:var(--txt-dim)">' + esc(c.address || "—") + '</td>' +
        '<td class="num">' + orders + '</td>' +
        '<td class="row-actions">' +
          '<button class="btn btn-ghost btn-sm" data-hist-cust="' + c.id + '">View History</button>' +
          '<button class="btn btn-danger btn-sm" data-del-cust="' + c.id + '">Delete</button>' +
        '</td>' +
      '</tr>';
    }).join("") : '<tr><td colspan="6"><div class="empty">No customers found.</div></td></tr>';

    $("#custCount").textContent = rows.length + " customers";
    $("#statCust").textContent = db.customers.length;
    $("#statSales").textContent = db.sales.length;
    // revenue is net of customer refunds
    var gross = db.sales.reduce(function (a, s) { return a + s.total; }, 0);
    var refund = db.returns.filter(function (r) { return r.type === "return"; })
                           .reduce(function (a, r) { return a + r.amount; }, 0);
    $("#statRev").textContent = (gross - refund).toFixed(0);
  }

  $("#custBody").addEventListener("click", function (e) {
    var d = e.target.dataset || {};
    if (d.histCust) { showHistory(+d.histCust); return; }
    if (!d.delCust) return;
    var cid = +d.delCust;
    DEL("customers/" + cid).then(function () {
      db.customers = db.customers.filter(function (c) { return c.id !== cid; });
      renderCust(); fillCustomerSelect(); toast("Customer removed.");
    }).catch(fail);
  });

  /* ── customer purchase history ───────────────────────── */
  /* An invoice keeps its own price list, so the history stays accurate even
     after a pair is returned and re-sold at a different price. */
  function invoiceLines(s) {
    return s.items.map(function (code, i) {
      var p = pByCode(code) || {};
      var paid = s.prices && s.prices[i] != null ? s.prices[i] : (p.price || 0);
      return { code: code, article: p.article || "—", color: p.color || "—",
               size: p.size || "—", paid: paid };
    });
  }

  /* Spread an invoice's discount across its pairs in proportion to price, so
     each line carries the share of it that the customer really was charged.
     The last line takes the rounding remainder, which keeps the parts adding
     up to the invoice total. Mirrors Sale::netByCode() on the server. */
  function netByCode(s) {
    var lines = invoiceLines(s);
    var sub = s.sub != null ? s.sub : lines.reduce(function (a, l) { return a + l.paid; }, 0);
    var disc = s.discount || 0;
    var used = 0, out = {};

    lines.forEach(function (l, i) {
      var share = (i === lines.length - 1)
        ? Math.round((disc - used) * 100) / 100
        : Math.round((sub > 0 ? l.paid / sub * disc : 0) * 100) / 100;
      used += share;
      out[l.code] = Math.round((l.paid - share) * 100) / 100;
    });

    return out;
  }

  /* What the customer actually paid for one pair — the figure a refund uses.
     A pair can be sold, returned and sold again, so the latest invoice it
     appears on is the one that counts. */
  function paidFor(code) {
    for (var i = db.sales.length - 1; i >= 0; i--) {
      if (db.sales[i].items.indexOf(code) > -1) {
        var net = netByCode(db.sales[i])[code];
        if (net != null) return net;
      }
    }
    var p = pByCode(code);
    return p ? p.price : 0;      // never sold: nothing was paid for it
  }

  function showHistory(custId) {
    var c = db.customers.find(function (x) { return x.id === custId; });
    if (!c) return;

    var sales = db.sales.filter(function (s) { return s.custId === custId; })
                        .sort(function (a, b) { return a.at < b.at ? 1 : -1; });
    var rets  = db.returns.filter(function (r) { return r.custId === custId; })
                          .sort(function (a, b) { return a.at < b.at ? 1 : -1; });
    /* which pairs came back, so each invoice line can be flagged */
    var returned = {};
    rets.forEach(function (r) {
      r.items.forEach(function (code) { returned[code] = r.type; });
    });

    var pairs   = sales.reduce(function (a, s) { return a + s.items.length; }, 0);
    var gross   = sales.reduce(function (a, s) { return a + (s.sub != null ? s.sub : s.total); }, 0);
    var discAll = sales.reduce(function (a, s) { return a + (s.discount || 0); }, 0);
    var paid    = sales.reduce(function (a, s) { return a + s.total; }, 0);
    var refund  = rets.filter(function (r) { return r.type === "return"; })
                      .reduce(function (a, r) { return a + r.amount; }, 0);

    var head =
      '<div class="stats hist-stats">' +
        '<div class="stat"><div class="k">Orders</div><div class="v">' + sales.length + '</div></div>' +
        '<div class="stat"><div class="k">Pairs Bought</div><div class="v">' + pairs + '</div></div>' +
        '<div class="stat"><div class="k">Gross</div><div class="v">' + money(gross) + '</div></div>' +
        '<div class="stat"><div class="k">Discount</div><div class="v">' + money(discAll) + '</div></div>' +
        '<div class="stat"><div class="k">Paid</div><div class="v accent">' + money(paid) + '</div></div>' +
        '<div class="stat"><div class="k">Refunded</div><div class="v">' + money(refund) + '</div></div>' +
        '<div class="stat"><div class="k">Net Revenue</div><div class="v accent">' + money(paid - refund) + '</div></div>' +
      '</div>';

    /* An invoice discount is a single figure — spread it across the pairs in
       proportion to their price so the per-row totals still add up to it,
       with the last row absorbing the rounding remainder. */
    function withDiscount(s) {
      var lines = invoiceLines(s);
      var sub = s.sub != null ? s.sub : s.total;
      var disc = s.discount || 0;
      var used = 0;
      return lines.map(function (l, i) {
        var d = (i === lines.length - 1) ? disc - used
              : Math.round((sub > 0 ? l.paid / sub * disc : 0) * 100) / 100;
        used += d;
        var back = returned[l.code];
        return { s: s, l: l, disc: d, net: l.paid - d,
                 status: back === "return" ? "Return" : back === "damage" ? "Damage" : "Sold" };
      });
    }

    var flat = [];
    sales.forEach(function (s) { flat = flat.concat(withDiscount(s)); });

    var tot = { price: 0, disc: 0, net: 0 };
    var body = flat.length ?
      '<div class="table-wrap"><table class="hist-table"><thead><tr>' +
        '<th style="width:150px">Date</th>' +
        '<th style="width:150px">Barcode</th>' +
        '<th style="width:110px">Article No</th>' +
        '<th style="width:110px">Color</th>' +
        '<th style="width:65px">Size</th>' +
        '<th style="width:110px" class="num">Price</th>' +
        '<th style="width:95px" class="num">Disc</th>' +
        '<th style="width:120px" class="num">Total Price</th>' +
        '<th style="width:100px">Status</th>' +
      '</tr></thead><tbody>' +
      flat.map(function (f) {
        tot.price += f.l.paid; tot.disc += f.disc; tot.net += f.net;
        return '<tr>' +
          '<td style="color:var(--txt-dim)">' + fmtDT(f.s.at) + '</td>' +
          '<td class="mono" style="color:var(--accent)">' + esc(f.l.code) + '</td>' +
          '<td class="mono"><b>' + esc(f.l.article) + '</b></td>' +
          '<td><span class="swatch"><i style="background:' + esc(colorDot(f.l.color)) + '"></i>' + esc(f.l.color) + '</span></td>' +
          '<td><span class="badge">' + esc(f.l.size) + '</span></td>' +
          '<td class="num">' + money(f.l.paid) + '</td>' +
          '<td class="num">' + money(f.disc) + '</td>' +
          '<td class="num"><b>' + money(f.net) + '</b></td>' +
          '<td><span class="badge ' +
            (f.status === "Return" ? "ok" : f.status === "Damage" ? "dmg" : "out") +
            '">' + f.status + '</span></td>' +
        '</tr>';
      }).join("") +
      '</tbody><tfoot><tr>' +
        '<td class="lbl-cell" colspan="5">Total · ' + flat.length + ' pair(s) in ' + sales.length + ' invoice(s)</td>' +
        '<td class="num">' + money(tot.price) + '</td>' +
        '<td class="num">' + money(tot.disc) + '</td>' +
        '<td class="num accent"><b>' + money(tot.net) + '</b></td>' +
        '<td></td>' +
      '</tr></tfoot></table></div>'
      : '<div class="empty">This customer has not bought anything yet.</div>';

    var retBlock = rets.length ?
      '<h4 class="hist-sub">Returns &amp; Damage</h4>' +
      '<div class="table-wrap"><table><thead><tr>' +
        '<th style="width:150px">Ref No</th><th style="width:110px">Type</th>' +
        '<th style="width:80px" class="num">Pairs</th><th style="width:120px" class="num">Amount</th>' +
        '<th>Reason</th><th style="width:170px">Date</th>' +
      '</tr></thead><tbody>' +
      rets.map(function (r) {
        return '<tr>' +
          '<td class="mono">' + esc(r.ref) + '</td>' +
          '<td>' + (r.type === "return" ? '<span class="badge ok">Return</span>'
                                        : '<span class="badge out">Damage</span>') + '</td>' +
          '<td class="num">' + r.items.length + '</td>' +
          '<td class="num">' + money(r.amount) + '</td>' +
          '<td>' + esc(r.reason) + '</td>' +
          '<td style="color:var(--txt-dim)">' + fmtDT(r.at) + '</td>' +
        '</tr>';
      }).join("") + '</tbody></table></div>' : "";
    $("#histTitle").textContent = "Purchase History · " + c.name;
    $("#histBody").innerHTML = head + '<h4 class="hist-sub">Invoices</h4>' + body + retBlock;
    /* keep what the modal is showing so Excel Export writes the same figures */
    histView = { c: c, flat: flat, rets: rets, tot: tot,
                 pairs: pairs, gross: gross, discAll: discAll, paid: paid, refund: refund };
    openModal("#histModal");
  }

  /* ── Excel export (CSV — opens straight in Excel) ────── */
  var histView = null;

  function csvCell(v) {
    var s = String(v == null ? "" : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function csvRows(rows) {
    return rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n");
  }
  function download(name, text) {
    /* the BOM is what makes Excel read it as UTF-8 instead of ANSI */
    var blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  /* Excel would read a bare 2608260001 as a number and drop nothing, but long
     codes flip to scientific notation — force it to stay text. */
  function csvCode(v) { return "=\"" + v + "\""; }

  $("#histExport").addEventListener("click", function () {
    var h = histView;
    if (!h) return;
    var rows = [
      ["Purchase History"],
      ["Customer", h.c.name],
      ["Customer ID", h.c.code],
      ["Phone", h.c.phone],
      ["Email", h.c.email || ""],
      ["Address", h.c.address || ""],
      ["Exported", fmtDT(new Date().toISOString())],
      [],
      ["Orders", h.flat.length ? new Set(h.flat.map(function (f) { return f.s.inv; })).size : 0],
      ["Pairs Bought", h.pairs],
      ["Gross (BDT)", h.gross.toFixed(2)],
      ["Discount (BDT)", h.discAll.toFixed(2)],
      ["Paid (BDT)", h.paid.toFixed(2)],
      ["Refunded (BDT)", h.refund.toFixed(2)],
      ["Net Revenue (BDT)", (h.paid - h.refund).toFixed(2)],
      [],
      ["INVOICES"],
      ["Date", "Invoice", "Barcode", "Article No", "Color", "Size",
       "Price (BDT)", "Disc (BDT)", "Total Price (BDT)", "Status"]
    ];

    h.flat.forEach(function (f) {
      rows.push([
        fmtDT(f.s.at), f.s.inv, csvCode(f.l.code), f.l.article, f.l.color, f.l.size,
        f.l.paid.toFixed(2), f.disc.toFixed(2), f.net.toFixed(2), f.status
      ]);
    });

    if (h.flat.length) {
      rows.push(["", "", "", "", "", "TOTAL",
                 h.tot.price.toFixed(2), h.tot.disc.toFixed(2), h.tot.net.toFixed(2), ""]);
    }

    if (h.rets.length) {
      rows.push([], ["RETURNS & DAMAGE"],
                ["Ref No", "Type", "Pairs", "Amount (BDT)", "Reason", "Date"]);
      h.rets.forEach(function (r) {
        rows.push([r.ref, r.type === "return" ? "Return" : "Damage", r.items.length,
                   r.amount.toFixed(2), r.reason, fmtDT(r.at)]);
      });
    }

    var safe = h.c.name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
    download("purchase-history-" + safe + "-" + isoDate(new Date()) + ".csv", csvRows(rows));
    toast("Exported — open the file in Excel.", "ok");
  });

  function fillCustomerSelect() {
    $("#sCustomer").innerHTML = '<option value="">— select customer —</option>' +
      db.customers.map(function (c) {
        return '<option value="' + c.id + '">' + esc(c.name) + ' · ' + esc(c.phone) + '</option>';
      }).join("");
    resync();
  }

  /* ══ 4. SALES / STOCK OUT ══════════════════════════════ */
  var cart = [];
  var cartPrice = {};   // code -> the price actually being charged on this invoice

  function addToCart(code) {
    code = String(code).trim();
    if (!code) return;
    var p = db.products.find(function (x) { return x.code === code; });
    if (!p)                     { toast("Barcode not found: " + code, "err"); return; }
    if (p.status === "out")     { toast("Already stocked out: " + code, "err"); return; }
    if (p.status === "damaged") { toast("This pair is written off as damaged — cannot be sold.", "err"); return; }
    if (cart.indexOf(code) > -1) { toast("Already in cart.", "err"); return; }
    cart.push(code);
    cartPrice[code] = p.price;   // seed with the label price, editable in the row
    renderCart(); toast(p.article + " added.", "ok");
  }


  /* ── available barcodes ──────────────────────────────── */
  /* Look a pair up instead of scanning it — for a torn label, or when the
     box is across the room. Only pairs that can actually be sold appear:
     anything already out or written off would be refused by addToCart. */
  function sellableProducts() {
    var q = $("#stockSearch").value.trim().toLowerCase();
    return db.products.filter(function (p) {
      if (p.status !== "in") return false;
      if (!q) return true;
      return (p.code + " " + p.article + " " + p.color + " " + p.size)
        .toLowerCase().indexOf(q) > -1;
    });
  }

  function renderStockPicker() {
    var rows = sellableProducts();

    /* The article photo is on the article, not the pair, so look it up. */
    var pic = {};
    db.articles.forEach(function (a) { pic[a.label.toLowerCase()] = a.image; });

    $("#stockBody").innerHTML = rows.length ? rows.map(function (p) {
      var inCart = cart.indexOf(p.code) > -1;
      var img = pic[String(p.article).toLowerCase()];
      return '<tr' + (inCart ? ' class="row-off"' : '') + '>' +
        '<td><span class="thumb thumb-sm">' +
          (img ? '<img src="' + esc(img) + '" alt="">' : NO_PHOTO_SVG) +
        '</span></td>' +
        '<td class="mono" style="color:var(--accent)">' + esc(p.code) + '</td>' +
        '<td class="mono">' + esc(p.article) + '</td>' +
        '<td><span class="swatch"><i style="background:' + esc(colorDot(p.color)) + '"></i>' + esc(p.color) + '</span></td>' +
        '<td><span class="badge">' + esc(p.size) + '</span></td>' +
        '<td class="num">' + money(p.price) + '</td>' +
        '<td>' + (inCart
          ? '<span class="badge ok">In cart</span>'
          : '<button class="btn btn-ghost btn-sm" data-pick-code="' + esc(p.code) + '">Add</button>') +
        '</td>' +
      '</tr>';
    }).join("") :
      '<tr><td colspan="7"><div class="empty">' +
      ($("#stockSearch").value.trim()
        ? "Nothing matches that search."
        : "No pairs in stock. Generate some barcodes on <b>Add Product</b> first.") +
      '</div></td></tr>';

    $("#stockCount").textContent = rows.length + " available";
  }

  $("#openStockModal").addEventListener("click", function () {
    $("#stockSearch").value = "";
    renderStockPicker();
    openModal("#stockModal");
    setTimeout(function () { $("#stockSearch").focus(); }, 60);
  });

  $("#stockSearch").addEventListener("input", renderStockPicker);

  /* Stay open after adding: picking several in a row is the normal case. */
  $("#stockBody").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-pick-code]");
    if (!btn) return;
    addToCart(btn.dataset.pickCode);
    renderStockPicker();
  });
  function priceOf(code) {
    var v = cartPrice[code];
    return isNaN(v) ? 0 : v;
  }
  function clearCart() { cart = []; cartPrice = {}; renderCart(); }

  $("#scanBtn").addEventListener("click", function () {
    addToCart($("#scanInput").value); $("#scanInput").value = ""; $("#scanInput").focus();
  });
  $("#scanInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); $("#scanBtn").click(); }
  });
  $("#sCustomer").addEventListener("change", cartTotals);
  $("#sDiscount").addEventListener("input", cartTotals);
  $("#cartClear").addEventListener("click", clearCart);

  $("#cartBody").addEventListener("click", function (e) {
    var code = e.target.dataset && e.target.dataset.rm;
    if (!code) return;
    cart = cart.filter(function (c) { return c !== code; });
    delete cartPrice[code];
    renderCart();
  });

  /* Editing a price must not redraw the table — that would kill the caret. */
  $("#cartBody").addEventListener("input", function (e) {
    var code = e.target.dataset && e.target.dataset.price;
    if (!code) return;
    cartPrice[code] = parseFloat(e.target.value);
    cartTotals();
  });

  function renderCart() {
    var items = cart.map(function (c) {
      return db.products.find(function (p) { return p.code === c; });
    }).filter(Boolean);

    $("#cartBody").innerHTML = items.length ? items.map(function (p) {
      return '<tr>' +
        '<td class="mono" style="color:var(--accent)">' + esc(p.code) + '</td>' +
        '<td><b>' + esc(p.article) + '</b><div class="hint">' + esc(p.color) + ' · ' + esc(p.size) + '</div></td>' +
        '<td class="num"><input class="input price-cell" type="number" min="0" step="0.01"' +
          ' value="' + priceOf(p.code).toFixed(2) + '" data-price="' + esc(p.code) + '"></td>' +
        '<td><button class="btn btn-quiet btn-sm" data-rm="' + esc(p.code) + '">✕</button></td>' +
      '</tr>';
    }).join("") : '<tr><td colspan="4"><div class="empty">Scan a shoe box barcode to begin.</div></td></tr>';

    /* An open picker has to follow the cart, or its "In cart" marks go
       stale the moment a row is added or removed. */
    if ($("#stockModal").classList.contains("open")) renderStockPicker();

    cartTotals();
  }

  /* Totals only — safe to call on every keystroke. */
  function cartTotals() {
    var sub = cart.reduce(function (a, code) { return a + priceOf(code); }, 0);
    var disc = Math.min(sub, parseFloat($("#sDiscount").value) || 0);
    var cust = db.customers.find(function (c) { return c.id === +$("#sCustomer").value; });

    /* Nothing goes out at zero. The box starts at 0.00, so an unpriced row is
       the easy mistake to make — block it here and say which pair it is,
       rather than letting the server bounce the whole invoice. */
    var unpriced = cart.filter(function (code) { return !(priceOf(code) > 0); });

    $("#cartCount").textContent = cart.length + " pairs";
    $("#sumCust").textContent  = cust ? cust.name : "—";
    $("#sumItems").textContent = cart.length;
    $("#sumSub").textContent   = money(sub);
    $("#sumTotal").textContent = money(sub - disc);
    $("#checkoutBtn").disabled = !(cart.length && cust) || unpriced.length > 0;

    $("#cartWarn").textContent = unpriced.length
      ? (unpriced.length === 1
          ? "Set a price for " + unpriced[0] + " before confirming."
          : "Set a price for " + unpriced.length + " pairs before confirming.")
      : "";

    /* Mark the rows themselves so the message points somewhere. */
    $$("#cartBody [data-price]").forEach(function (inp) {
      inp.classList.toggle("bad", !(priceOf(inp.dataset.price) > 0));
    });
  }

  $("#checkoutBtn").addEventListener("click", function () {
    var cust = db.customers.find(function (c) { return c.id === +$("#sCustomer").value; });
    if (!cust || !cart.length) return;

    var btn = $("#checkoutBtn");
    btn.disabled = true;

    /* Stock only moves when the server says so. Between scanning a pair and
       clicking here another terminal may have sold it, and the row lock on
       the server side is the only thing that can actually catch that. */
    POST("sales", {
      customer_id: cust.id,
      items: cart.map(function (code) { return { code: code, price: priceOf(code) }; }),
      discount: parseFloat($("#sDiscount").value) || 0
    }).then(function (d) {
      db.sales.push(d.sale);
      applyProducts(d.products);

      $("#sDiscount").value = 0;
      clearCart();
      renderSales(); renderRecent(); renderCust(); renderSheet();
      toast("Stock out confirmed for " + cust.name + ".", "ok");
    }).catch(function (err) {
      fail(err);
      /* A rejected pair means our copy of the stock is stale — pull the truth
         back rather than leaving the cart claiming something that is gone. */
      if (err && err.status === 409) loadAll().then(renderAll).catch(fail);
    }).then(function () { btn.disabled = false; });
  });

  /* Fold server copies of products back into the local mirror. */
  function applyProducts(list) {
    (list || []).forEach(function (fresh) {
      var i = db.products.findIndex(function (p) { return p.code === fresh.code; });
      if (i > -1) db.products[i] = fresh;
      else db.products.push(fresh);
    });
  }

  function renderSales() {
    var rows = db.sales.slice().reverse();
    $("#saleBody").innerHTML = rows.length ? rows.map(function (s) {
      return '<tr>' +
        '<td class="mono" style="color:var(--accent)">' + esc(s.inv) + '</td>' +
        '<td>' + esc(s.custName) + '</td>' +
        '<td class="num">' + s.items.length + '</td>' +
        '<td class="num">' + money(s.total) + '</td>' +
        '<td style="color:var(--txt-dim)">' + fmtDT(s.at) + '</td>' +
      '</tr>';
    }).join("") : '<tr><td colspan="5"><div class="empty">No stock-out records yet.</div></td></tr>';
    $("#saleCount").textContent = db.sales.length + " invoices";
  }

  /* ══ 5. RETURN / DAMAGE ════════════════════════════════ */
  var retCart = [];

  function retType() { return $("#rType").value; }

  function retAdd(code) {
    code = String(code).trim();
    if (!code) return;
    var p = db.products.find(function (x) { return x.code === code; });
    if (!p) { toast("Barcode not found: " + code, "err"); return; }
    if (retCart.indexOf(code) > -1) { toast("Already in the list.", "err"); return; }
    if (p.status === "damaged") { toast("This pair is already written off as damaged.", "err"); return; }
    if (retType() === "return" && p.status !== "out") {
      toast("Not sold yet — a pair in stock can only be marked damaged.", "err"); return;
    }
    /* A sold pair is the customer's — it has to come back as a return first,
       then it can be written off. */
    if (retType() === "damage" && p.status === "out") {
      toast("Already sold — take it back as a Customer Return first, then write it off.", "err");
      return;
    }
    retCart.push(code); renderRetCart();
    toast(p.article + " (" + p.size + ") added.", "ok");
  }

  $("#retScanBtn").addEventListener("click", function () {
    retAdd($("#retScan").value); $("#retScan").value = ""; $("#retScan").focus();
  });
  $("#retScan").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); $("#retScanBtn").click(); }
  });
  $("#retClear").addEventListener("click", function () { retCart = []; renderRetCart(); });
  $("#rType").addEventListener("change", function () {
    /* The two types accept opposite stock states, so switching drops whatever
       no longer qualifies: Return needs sold pairs, Damage needs in-stock ones. */
    var wantSold = retType() === "return";
    var before = retCart.length;
    retCart = retCart.filter(function (c) {
      var p = db.products.find(function (x) { return x.code === c; });
      return p && (wantSold ? p.status === "out" : p.status === "in");
    });
    if (retCart.length < before) {
      toast(wantSold ? "Unsold pairs removed from the list."
                     : "Sold pairs removed — write-off is for stock on hand.", "err");
    }
    renderRetCart();
  });
  $("#retCartBody").addEventListener("click", function (e) {
    var code = e.target.dataset && e.target.dataset.rrm;
    if (!code) return;
    retCart = retCart.filter(function (c) { return c !== code; });
    renderRetCart();
  });

  function renderRetCart() {
    var isReturn = retType() === "return";
    var items = retCart.map(function (c) {
      return db.products.find(function (p) { return p.code === c; });
    }).filter(Boolean);

    /* A refund gives back what the customer paid — the label price minus this
       pair's share of the invoice discount. A damage write-off is not a
       refund: it records the stock value lost, which is the full price. */
    var lineValue = function (p) { return isReturn ? paidFor(p.code) : p.price; };

    $("#retCartBody").innerHTML = items.length ? items.map(function (p) {
      var buyer = db.customers.find(function (c) { return c.id === p.soldTo; });
      var value = lineValue(p);
      /* Show the label price alongside when the discount made them differ, so
         the number is explainable at the counter. */
      var struck = isReturn && value !== p.price
        ? '<div class="hint"><s>' + p.price.toFixed(2) + '</s> after discount</div>'
        : "";
      return '<tr>' +
        '<td class="mono" style="color:var(--accent)">' + esc(p.code) + '</td>' +
        '<td><b>' + esc(p.article) + '</b><div class="hint">' + esc(p.color) + ' · ' + esc(p.size) + '</div></td>' +
        '<td>' + (buyer ? esc(buyer.name) : '<span class="badge">In stock</span>') + '</td>' +
        '<td class="num">' + value.toFixed(2) + struck + '</td>' +
        '<td><button class="btn btn-quiet btn-sm" data-rrm="' + esc(p.code) + '">✕</button></td>' +
      '</tr>';
    }).join("") :
      '<tr><td colspan="5"><div class="empty">Scan the barcode on the returned box to begin.</div></td></tr>';

    var amount = items.reduce(function (a, p) { return a + lineValue(p); }, 0);
    var buyers = uniq(items.map(function (p) {
      var c = db.customers.find(function (x) { return x.id === p.soldTo; });
      return c ? c.name : "";
    }));

    $("#retCartCount").textContent = items.length + " pairs";
    $("#rSumItems").textContent = items.length;
    $("#rSumCust").textContent = buyers.length === 0 ? "—" :
                                 buyers.length === 1 ? buyers[0] : buyers.length + " customers";
    $("#rSumLabel").textContent = isReturn ? "Refund Amount" : "Stock Value Lost";
    $("#rSumTotal").textContent = money(amount);
    $("#rTypeHint").textContent = isReturn
      ? "Pairs go back into stock and the barcode becomes sellable again."
      : "Pairs are written off — they leave stock and cannot be sold or scanned again.";
    $("#retConfirm").textContent = isReturn ? "Confirm Return" : "Confirm Damage Write-off";
    $("#retConfirm").disabled = !items.length;
  }

  $("#retConfirm").addEventListener("click", function () {
    if (!retCart.length) return;
    var isReturn = retType() === "return";
    if (!confirm((isReturn ? "Return " : "Write off ") + retCart.length +
                 " pair(s)? This updates stock immediately.")) return;

    var btn = $("#retConfirm");
    btn.disabled = true;

    POST("returns", {
      type: isReturn ? "return" : "damage",
      codes: retCart.slice(),
      reason: $("#rReason").value.trim()
    }).then(function (d) {
      db.returns.push(d["return"]);
      applyProducts(d.products);

      retCart = []; $("#rReason").value = "";
      renderRetCart(); renderReturns(); renderRecent(); renderCust(); renderSheet();
      toast(isReturn ? "Return completed — stock updated." : "Damage recorded — pairs written off.", "ok");
    }).catch(function (err) {
      fail(err);
      if (err && err.status === 409) loadAll().then(renderAll).catch(fail);
    }).then(function () { btn.disabled = false; });
  });

  function renderReturns() {
    var rows = db.returns.slice().reverse();
    $("#retBody").innerHTML = rows.length ? rows.map(function (r) {
      return '<tr>' +
        '<td class="mono" style="color:var(--accent)">' + esc(r.ref) + '</td>' +
        '<td>' + (r.type === "return"
          ? '<span class="badge ok">Return</span>'
          : '<span class="badge out">Damage</span>') + '</td>' +
        '<td>' + esc(r.custName) + '</td>' +
        '<td>' + esc(r.reason) + '</td>' +
        '<td class="num">' + r.items.length + '</td>' +
        '<td class="num">' + money(r.amount) + '</td>' +
        '<td style="color:var(--txt-dim)">' + fmtDT(r.at) + '</td>' +
      '</tr>';
    }).join("") : '<tr><td colspan="7"><div class="empty">No returns or damage recorded yet.</div></td></tr>';

    var ret = db.returns.filter(function (r) { return r.type === "return"; });
    var dmg = db.returns.filter(function (r) { return r.type === "damage"; });
    var count = function (list) { return list.reduce(function (a, r) { return a + r.items.length; }, 0); };

    $("#retCount").textContent = db.returns.length + " records";
    $("#statRet").textContent = count(ret);
    $("#statDmg").textContent = count(dmg);
    $("#statRefund").textContent = ret.reduce(function (a, r) { return a + r.amount; }, 0).toFixed(0);
  }

  /* ══ 6. BARCODE MANAGE ═════════════════════════════════ */
  function filtered() {
    var from = $("#bFrom").value, to = $("#bTo").value;
    var st = $("#bStatus").value, art = $("#bArticle").value;
    return db.products.filter(function (p) {
      var d = p.at.slice(0, 10);
      if (from && d < from) return false;
      if (to   && d > to)   return false;
      if (st   && p.status !== st) return false;
      if (art  && p.article !== art) return false;
      return true;
    });
  }

  function renderSheet() {
    var rows = filtered();
    $("#labelSheet").innerHTML = rows.length
      ? rows.map(labelCard).join("")
      : '<div class="empty" style="grid-column:1/-1">No barcodes in this date range.</div>';
    $("#bCount").textContent = rows.length + " labels";
  }

  $("#bApply").addEventListener("click", renderSheet);
  $("#bReset").addEventListener("click", function () {
    $("#bFrom").value = ""; $("#bTo").value = "";
    $("#bStatus").value = ""; $("#bArticle").value = "";
    resync(); renderSheet();
  });
  $("#printBtn").addEventListener("click", function () {
    if (!filtered().length) { toast("Nothing to print.", "err"); return; }
    window.print();
  });
  $("#pdfBtn").addEventListener("click", function () {
    if (!filtered().length) { toast("Nothing to export.", "err"); return; }
    toast("Choose “Save as PDF” in the print dialog.");
    setTimeout(function () { window.print(); }, 500);
  });

  /* ── reset ───────────────────────────────────────────── */
  $("#resetData").addEventListener("click", function (e) {
    e.preventDefault();
    if (!isSuperAdmin()) { toast("Only a Super Admin can reset the data.", "err"); return; }
    if (!confirm("This erases every product, sale and return in the database and " +
                 "restores the starting roles and users. Continue?")) return;

    POST("reset-demo-data")
      .then(function () { location.reload(); })
      .catch(fail);
  });

  /* ══ 6+7. REPORTS ══════════════════════════════════════ */
  function pByCode(code) {
    return db.products.find(function (x) { return x.code === code; });
  }

  /* One row per pair that moved: sold / damage / return */
  function movements() {
    var out = [];
    /* A generated barcode is itself a movement — the pair entering stock.
       renderStockSummary only reads sold/damage/return, so it is unaffected. */
    db.products.forEach(function (p) {
      out.push({ at: p.at, type: "stockin", p: p, ref: p.code, who: "—" });
    });
    db.sales.forEach(function (s) {
      s.items.forEach(function (code) {
        var p = pByCode(code);
        if (p) out.push({ at: s.at, type: "sold", p: p, ref: s.inv, who: s.custName });
      });
    });
    db.returns.forEach(function (r) {
      r.items.forEach(function (code) {
        var p = pByCode(code);
        if (p) out.push({ at: r.at, type: r.type, p: p, ref: r.ref, who: r.custName });
      });
    });
    return out.sort(function (a, b) { return a.at < b.at ? -1 : 1; });
  }

  function inRange(iso, from, to) {
    var d = String(iso).slice(0, 10);
    if (from && d < from) return false;
    if (to   && d > to)   return false;
    return true;
  }
  function rangeLabel(from, to) {
    if (!from && !to) return "All dates";
    var f = function (d) { return d ? d.split("-").reverse().join("/") : "…"; };
    return f(from) + "  →  " + f(to);
  }

  /* ── reports run on demand ───────────────────────────── */
  /* A report is only drawn once Apply Filter has been pressed, so what is on
     screen always answers a question the user actually asked. Arriving on the
     page, or pressing Reset, puts it back to the prompt. */
  var ssApplied = false, bdApplied = false;

  function reportPrompt(cols) {
    return '<tr><td colspan="' + cols + '"><div class="empty">' +
      '<svg viewBox="0 0 24 24"><path d="M3 4h18l-7 8v6l-4 2v-8z"/></svg>' +
      'Choose a date range, then press <b>Apply Filter</b>.' +
      '</div></td></tr>';
  }

  function clearStockSummary() {
    ssApplied = false;
    $("#ssBody").innerHTML = reportPrompt(8);
    $("#ssFoot").innerHTML = "";
    $("#ssRange").textContent = "Not run";
  }
  function clearByDate() {
    bdApplied = false;
    $("#bdBody").innerHTML = reportPrompt(6);
    $("#bdFoot").innerHTML = "";
    $("#bdRange").textContent = "Not run";
  }

  /* ── 6. Stock Summary ────────────────────────────────── */
  /* One row per article + colour. The per-size detail hangs off each row, so
     the pop-up never recomputes it and can never disagree with the line that
     was clicked. Kept between renders for exactly that reason. */
  var ssRows = {};

  function renderStockSummary() {
    /* Nothing to draw until the user asks for it. */
    if (!ssApplied) { clearStockSummary(); return; }
    var from = $("#ssFrom").value, to = $("#ssTo").value, art = $("#ssArticle").value;
    ssRows = {};

    /* Counts land on the article+colour row and its size at the same time. */
    function tally(p, field) {
      var k = p.article + "|" + p.color;
      var row = ssRows[k] || (ssRows[k] = {
        key: k, article: p.article, color: p.color,
        made: 0, sold: 0, dmg: 0, ret: 0, sizes: {}
      });
      var s = row.sizes[p.size] || (row.sizes[p.size] = { made: 0, sold: 0, dmg: 0, ret: 0 });
      row[field]++; s[field]++;
    }
    var pass = function (p) { return !art || p.article === art; };

    db.products.forEach(function (p) {
      if (pass(p) && inRange(p.at, from, to)) tally(p, "made");
    });
    movements().forEach(function (m) {
      if (!pass(m.p) || !inRange(m.at, from, to)) return;
      if (m.type === "sold")   tally(m.p, "sold");
      if (m.type === "damage") tally(m.p, "dmg");
      if (m.type === "return") tally(m.p, "ret");
    });

    var list = Object.keys(ssRows).map(function (k) { return ssRows[k]; })
      .sort(function (a, b) {
        return (a.article + a.color).localeCompare(b.article + b.color);
      });
    var tot = { made: 0, sold: 0, dmg: 0, ret: 0, fresh: 0, total: 0 };
    var z = function (n) { return n === 0 ? ' class="num z"' : ' class="num"'; };

    $("#ssBody").innerHTML = list.length ? list.map(function (r) {
      var fresh = r.made - r.sold - r.dmg + r.ret;   // Manufactured − Sold − Damage + Return
      var total = r.made - r.sold + r.ret;           // Manufactured − Sold + Return
      tot.made += r.made; tot.sold += r.sold; tot.dmg += r.dmg;
      tot.ret += r.ret;   tot.fresh += fresh; tot.total += total;

      return '<tr>' +
        '<td class="mono grp-strong">' + esc(r.article) + '</td>' +
        /* The colour opens the size-wise breakdown for this line. */
        '<td><button type="button" class="ss-color" data-ss-key="' + esc(r.key) +
          '" title="Size-wise details">' +
          '<span class="swatch"><i style="background:' + esc(colorDot(r.color)) + '"></i>' +
          esc(r.color) + '</span></button></td>' +
        '<td' + z(r.made) + '>' + r.made + '</td>' +
        '<td' + z(r.sold) + '>' + r.sold + '</td>' +
        '<td' + z(r.dmg)  + '>' + r.dmg  + '</td>' +
        '<td' + z(r.ret)  + '>' + r.ret  + '</td>' +
        '<td' + z(fresh)  + ' style="color:var(--ok)">' + fresh + '</td>' +
        '<td' + z(total)  + ' style="color:var(--copper)">' + total + '</td>' +
      '</tr>';
    }).join("") : '<tr><td colspan="8"><div class="empty">No stock movement in this period.</div></td></tr>';

    $("#ssFoot").innerHTML = list.length ?
      '<tr>' +
        '<td class="lbl-cell" colspan="2">Sub-Total · ' + list.length + ' article / colour</td>' +
        '<td class="num">' + tot.made  + '</td>' +
        '<td class="num">' + tot.sold  + '</td>' +
        '<td class="num">' + tot.dmg   + '</td>' +
        '<td class="num">' + tot.ret   + '</td>' +
        '<td class="num" style="color:var(--ok)">'     + tot.fresh + '</td>' +
        '<td class="num" style="color:var(--copper)">' + tot.total + '</td>' +
      '</tr>' : "";

    $("#ssRange").textContent = rangeLabel(from, to);
  }

  /* Sizes to list for one line: the whole master list, so a size with no
     movement reads as a real zero instead of just being absent — plus any
     size that does have movement but has since been taken off that list,
     otherwise the pop-up would total less than the row it came from. */
  function ssSizeList(row) {
    var seen = {}, out = [];
    db.sizes.forEach(function (s) {
      if (!seen[s.label]) { seen[s.label] = 1; out.push(s.label); }
    });
    Object.keys(row.sizes).forEach(function (s) {
      if (!seen[s]) { seen[s] = 1; out.push(s); }
    });
    return out.sort(function (a, b) {
      var na = parseFloat(a), nb = parseFloat(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return String(a).localeCompare(String(b));
    });
  }

  function showSizeBreakdown(key) {
    var row = ssRows[key];
    if (!row) return;

    var tot = { made: 0, sold: 0, dmg: 0, ret: 0, fresh: 0, total: 0 };
    var z = function (n) { return n === 0 ? ' class="num z"' : ' class="num"'; };
    var blank = { made: 0, sold: 0, dmg: 0, ret: 0 };

    $("#ssSizeTitle").textContent = row.article + " · " + row.color;

    $("#ssSizeBody").innerHTML = ssSizeList(row).map(function (size) {
      var s = row.sizes[size] || blank;
      var fresh = s.made - s.sold - s.dmg + s.ret;
      var total = s.made - s.sold + s.ret;
      tot.made += s.made; tot.sold += s.sold; tot.dmg += s.dmg;
      tot.ret += s.ret;   tot.fresh += fresh; tot.total += total;

      /* A size with nothing at all in the period is dimmed, so the sizes that
         did move are the ones the eye lands on. */
      return '<tr' + (s === blank ? ' class="row-off"' : '') + '>' +
        '<td><span class="badge">' + esc(size) + '</span></td>' +
        '<td' + z(s.made) + '>' + s.made + '</td>' +
        '<td' + z(s.sold) + '>' + s.sold + '</td>' +
        '<td' + z(s.dmg)  + '>' + s.dmg  + '</td>' +
        '<td' + z(s.ret)  + '>' + s.ret  + '</td>' +
        '<td' + z(fresh)  + ' style="color:var(--ok)">' + fresh + '</td>' +
        '<td' + z(total)  + ' style="color:var(--copper)">' + total + '</td>' +
      '</tr>';
    }).join("");

    $("#ssSizeFoot").innerHTML =
      '<tr>' +
        '<td class="lbl-cell">Total</td>' +
        '<td class="num">' + tot.made + '</td>' +
        '<td class="num">' + tot.sold + '</td>' +
        '<td class="num">' + tot.dmg  + '</td>' +
        '<td class="num">' + tot.ret  + '</td>' +
        '<td class="num" style="color:var(--ok)">'     + tot.fresh + '</td>' +
        '<td class="num" style="color:var(--copper)">' + tot.total + '</td>' +
      '</tr>';

    openModal("#ssSizeModal");
  }

  $("#ssBody").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-ss-key]");
    if (btn) showSizeBreakdown(btn.dataset.ssKey);
  });

  /* ── 7. By Date Stock ────────────────────────────────── */
  var PTYPE = { stockin: "Stock In", sold: "Sold", damage: "Damage", "return": "Return" };

  function renderByDate() {
    if (!bdApplied) { clearByDate(); return; }
    var from = $("#bdFrom").value, to = $("#bdTo").value;
    var ty = $("#bdType").value, art = $("#bdArticle").value;

    /* movements() yields one entry per event, oldest first. */
    var events = movements().filter(function (m) {
      if (!inRange(m.at, from, to)) return false;
      if (ty && m.type !== ty) return false;
      if (art && m.p.article !== art) return false;
      return true;
    });

    /* One row per barcode, not one per event — the report is a stock list,
       and a pair that was made, sold and then returned is still one pair.
       Three rows made a single barcode read as three, and the sub-total
       counted it three times over. What is kept is its last movement in the
       period: the state that pair ended the period in.

       Deleting before setting moves the barcode to the end of the map, so
       insertion order stays "oldest last movement first" and the reverse
       below puts the most recent activity on top. */
    var latest = new Map();
    events.forEach(function (m) {
      latest.delete(m.p.code);
      latest.set(m.p.code, m);
    });

    var list = Array.from(latest.values()).reverse();

    var tot = { stockin: 0, sold: 0, damage: 0, "return": 0 };

    $("#bdBody").innerHTML = list.length ? list.map(function (m) {
      tot[m.type]++;
      return '<tr>' +
        '<td>' + fmtDT(m.at) + '</td>' +
        '<td class="mono grp-strong">' + esc(m.p.article) + '</td>' +
        '<td><span class="swatch"><i style="background:' + esc(colorDot(m.p.color)) + '"></i>' + esc(m.p.color) + '</span></td>' +
        '<td><span class="badge">' + esc(m.p.size) + '</span></td>' +
        '<td class="mono">' + esc(m.p.code) + '</td>' +
        '<td><span class="ptype ' + m.type + '"><i></i>' + PTYPE[m.type] + '</span></td>' +
      '</tr>';
    }).join("") : '<tr><td colspan="6"><div class="empty">No movement in this period.</div></td></tr>';

    var arts = {}, cols = {}, sizes = {};
    list.forEach(function (m) { arts[m.p.article] = 1; cols[m.p.color] = 1; sizes[m.p.size] = 1; });
    var n = function (o) { return Object.keys(o).length; };

    $("#bdFoot").innerHTML = list.length ?
      '<tr>' +
        '<td class="lbl-cell">Sub-Total</td>' +
        '<td>' + n(arts)  + ' article(s)</td>' +
        '<td>' + n(cols)  + ' color(s)</td>' +
        '<td>' + n(sizes) + ' size(s)</td>' +
        '<td>' + list.length + ' pair(s)</td>' +
        '<td><div class="ptype-legend">' +
          '<span class="ptype stockin"><i></i>' + tot.stockin + '</span>' +
          '<span class="ptype sold"><i></i>' + tot.sold + '</span>' +
          '<span class="ptype damage"><i></i>' + tot.damage + '</span>' +
          '<span class="ptype return"><i></i>' + tot["return"] + '</span>' +
        '</div></td>' +
      '</tr>' : "";

    $("#bdRange").textContent = rangeLabel(from, to);
  }

  $("#ssApply").addEventListener("click", function () { ssApplied = true; renderStockSummary(); });
  $("#bdApply").addEventListener("click", function () { bdApplied = true; renderByDate(); });
  $("#ssPrint").addEventListener("click", function () { window.print(); });
  $("#bdPrint").addEventListener("click", function () { window.print(); });

  /* Reset clears the filters and the result — it does not silently re-run the
     report with an empty range. */
  $("#ssReset").addEventListener("click", function () {
    $("#ssFrom").value = ""; $("#ssTo").value = ""; $("#ssArticle").value = "";
    resync(); clearStockSummary();
  });
  $("#bdReset").addEventListener("click", function () {
    $("#bdFrom").value = ""; $("#bdTo").value = "";
    $("#bdType").value = ""; $("#bdArticle").value = "";
    resync(); clearByDate();
  });
  /* ══ 9. USER ACCESS ════════════════════════════════════ */
  function fillRoleSelect() {
    $("#uRole").innerHTML = '<option value="">— select role —</option>' +
      db.roles.map(function (r) {
        return '<option value="' + r.id + '">' + esc(r.name) + '</option>';
      }).join("");
    resync();
  }

  function renderUsers() {
    var q = $("#usrSearch").value.trim().toLowerCase();
    var rows = db.users.filter(function (u) {
      return !q || (u.code + " " + u.name + " " + u.username).toLowerCase().indexOf(q) > -1;
    });

    $("#usrBody").innerHTML = rows.length ? rows.map(function (u) {
      var r = db.roles.find(function (x) { return x.id === u.roleId; });
      var self = me && u.id === me.id;
      return '<tr' + (u.disabled ? ' class="row-off"' : "") + '>' +
        '<td class="mono" style="color:var(--accent)">' + esc(u.username) + '</td>' +
        '<td><b>' + esc(u.name) + '</b>' +
          '<div class="hint">' + esc(u.code) + (self ? " · you" : "") + '</div></td>' +
        '<td>' + (r ? '<span class="badge">' + esc(r.name) + '</span>'
                    : '<span class="badge dmg">No role</span>') +
          (u.disabled ? ' <span class="badge dmg">Disabled</span>' : "") + '</td>' +
        '<td class="row-actions">' +
          '<button class="btn btn-ghost btn-sm" data-pass="' + u.id + '">Reset Pass</button>' +
          '<button class="btn ' + (u.disabled ? "btn-quiet" : "btn-danger") + ' btn-sm"' +
            ' data-toggle-user="' + u.id + '"' + (self ? " disabled" : "") + '>' +
            (u.disabled ? "Enable" : "Disable") + '</button>' +
        '</td>' +
      '</tr>';
    }).join("") : '<tr><td colspan="4"><div class="empty">No users found.</div></td></tr>';

    $("#usrCount").textContent = rows.length + " users";
    $("#statUsers").textContent = db.users.length;
    $("#statActive").textContent = db.users.filter(function (u) { return !u.disabled; }).length;
    $("#statRoles").textContent = db.roles.length;
  }

  $("#usrSearch").addEventListener("input", renderUsers);

  $("#usrBody").addEventListener("click", function (e) {
    var d = e.target.dataset || {};
    if (d.pass) { openPassModal(+d.pass); return; }
    if (!d.toggleUser) return;

    var id = +d.toggleUser;
    POST("users/" + id + "/toggle").then(function (r) {
      var i = db.users.findIndex(function (x) { return x.id === id; });
      if (i > -1) db.users[i] = r.user;
      renderUsers();
      toast(r.user.name + (r.user.disabled ? " disabled." : " enabled."),
            r.user.disabled ? "err" : "ok");
    }).catch(fail);
  });

  $("#openUserModal").addEventListener("click", function () {
    $("#userForm").reset(); fillRoleSelect(); resync();
    openModal("#userModal"); setTimeout(function () { $("#uName").focus(); }, 60);
  });

  $("#userForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var username = $("#uUser").value.trim();

    /* Answered locally so the field can be corrected without a round trip;
       the same rules are enforced again by the request validator. */
    if (!/^[A-Za-z0-9._-]{3,}$/.test(username)) {
      toast("User ID: 3+ characters, letters/numbers/._- only.", "err"); return;
    }

    POST("users", {
      name:     $("#uName").value.trim(),
      username: username,
      password: $("#uPass").value,
      role_id:  +$("#uRole").value
    }).then(function (d) {
      db.users.push(d.user);
      closeModal($("#userModal")); renderUsers();
      toast("User created.", "ok");
    }).catch(fail);
  });

  /* ── reset password ──────────────────────────────────── */
  var passUserId = null;
  function openPassModal(id) {
    var u = db.users.find(function (x) { return x.id === id; });
    if (!u) return;
    passUserId = id;
    $("#passTitle").textContent = "Reset Password · " + u.name;
    $("#passForm").reset();
    openModal("#passModal"); setTimeout(function () { $("#pNew").focus(); }, 60);
  }
  $("#passForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var u = db.users.find(function (x) { return x.id === passUserId; });
    if (!u) return;

    POST("users/" + u.id + "/password", { password: $("#pNew").value })
      .then(function () {
        closeModal($("#passModal"));
        toast("Password updated for " + u.name + ".", "ok");
      }).catch(fail);
  });

  /* ══ 10. ROLE ACCESS ═══════════════════════════════════ */
  /* Checkbox list of every module, grouped the way the sidebar is. */
  function permGrid(perms) {
    var out = "", lastGroup = null;
    MODULES.forEach(function (m) {
      var g = m.group || "";
      if (g !== lastGroup) {
        if (g) out += '<div class="perm-group">' + esc(g) + '</div>';
        lastGroup = g;
      }
      out += '<label class="perm-row' + (m.group ? " sub" : "") + '">' +
        '<input type="checkbox" data-perm="' + m.key + '"' + (perms[m.key] ? " checked" : "") + '>' +
        '<span>' + esc(m.label) + '</span>' +
      '</label>';
    });
    return out;
  }
  function readPermGrid(host) {
    var perms = {};
    $$("input[data-perm]", host).forEach(function (cb) { perms[cb.dataset.perm] = cb.checked; });
    return perms;
  }

  function renderRoles() {
    $("#roleBody").innerHTML = db.roles.length ? db.roles.map(function (r) {
      var used = db.users.filter(function (u) { return u.roleId === r.id; }).length;
      var on = MODULES.filter(function (m) { return r.perms && r.perms[m.key]; }).length;
      return '<tr>' +
        '<td><b>' + esc(r.name) + '</b>' +
          '<div class="hint">' + on + ' of ' + MODULES.length + ' modules · ' +
            used + ' user(s)</div></td>' +
        '<td style="color:var(--txt-dim)">' + fmtDT(r.createdAt) + '</td>' +
        '<td>' + esc(r.createdBy || "—") + '</td>' +
        '<td class="row-actions">' +
          '<button class="btn btn-ghost btn-sm" data-view-role="' + r.id + '">View Access</button>' +
          '<button class="btn btn-danger btn-sm" data-del-role="' + r.id + '">Delete Access</button>' +
        '</td>' +
      '</tr>';
    }).join("") : '<tr><td colspan="4"><div class="empty">No roles yet.</div></td></tr>';

    $("#roleCount").textContent = db.roles.length + " roles";
  }

  $("#roleBody").addEventListener("click", function (e) {
    var d = e.target.dataset || {};
    if (d.viewRole) { openAccessModal(+d.viewRole); return; }
    if (!d.delRole) return;
    var r = db.roles.find(function (x) { return x.id === +d.delRole; });
    if (!r) return;
    /* a user whose role vanished could not sign in at all */
    var used = db.users.filter(function (u) { return u.roleId === r.id; });
    if (used.length) {
      toast(r.name + " is assigned to " + used.length + " user(s) — move them first.", "err");
      return;
    }
    if (!confirm("Delete the role " + r.name + "?")) return;
    DEL("roles/" + r.id).then(function () {
      db.roles = db.roles.filter(function (x) { return x.id !== r.id; });
      renderRoles(); renderUsers(); fillRoleSelect();
      toast("Role deleted.");
    }).catch(fail);
  });

  /* ── add role ────────────────────────────────────────── */
  function openRoleForm() {
    $("#roleForm").reset();
    $("#roleFormPerms").innerHTML = permGrid({});
    openModal("#roleModal"); setTimeout(function () { $("#rName").focus(); }, 60);
  }
  $("#openRoleModal").addEventListener("click", openRoleForm);
  $("#openRoleModal2").addEventListener("click", openRoleForm);

  $("#roleForm").addEventListener("submit", function (e) {
    e.preventDefault();
    POST("roles", {
      name:  $("#rName").value.trim(),
      perms: readPermGrid($("#roleFormPerms"))
    }).then(function (d) {
      db.roles.push(d.role);
      closeModal($("#roleModal"));
      renderRoles(); fillRoleSelect();
      toast("Role created.", "ok");
    }).catch(fail);
  });

  /* ── view / edit a role's access ─────────────────────── */
  var accessRoleId = null;
  function openAccessModal(id) {
    var r = db.roles.find(function (x) { return x.id === id; });
    if (!r) return;
    accessRoleId = id;
    $("#accessTitle").textContent = "Role Access · " + r.name;
    $("#accessPerms").innerHTML = permGrid(r.perms || {});
    $("#accessHint").textContent = (me && me.roleId === id)
      ? "This is your own role — keep User Access and Role Access switched on."
      : "Turn a module on to let this role open it.";
    openModal("#accessModal");
  }
  $("#accessAll").addEventListener("click", function () {
    $$("input[data-perm]", $("#accessPerms")).forEach(function (cb) { cb.checked = true; });
  });
  $("#accessNone").addEventListener("click", function () {
    $$("input[data-perm]", $("#accessPerms")).forEach(function (cb) { cb.checked = false; });
  });
  $("#accessSave").addEventListener("click", function () {
    var r = db.roles.find(function (x) { return x.id === accessRoleId; });
    if (!r) return;

    var perms = readPermGrid($("#accessPerms"));
    /* Removing your own way back into this screen would strand the install. */
    if (me && me.roleId === r.id && !(perms.userAccess && perms.roleAccess)) {
      toast("Keep User Access and Role Access on for your own role.", "err");
      return;
    }

    PUT("roles/" + r.id, { perms: perms }).then(function (d) {
      var i = db.roles.findIndex(function (x) { return x.id === r.id; });
      if (i > -1) db.roles[i] = d.role;

      /* Editing your own role changes what you may see right now. */
      if (me && me.roleId === r.id) me.perms = d.role.perms;

      closeModal($("#accessModal"));
      renderRoles(); applyPermsToNav();
      /* Check the screen actually open, not savedPage() — that already falls
         back to an allowed page, so the test could never fail and someone who
         revoked their own access stayed sitting on the forbidden screen. */
      if (current && !can(current)) goPage(firstAllowed());
      toast("Access updated for " + r.name + ".", "ok");
    }).catch(fail);
  });

  /* ── boot ────────────────────────────────────────────── */
  var today = new Date();
  $("#todayLbl").textContent = today.toLocaleDateString("en-GB",
    { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  $("#bTo").value = isoDate(today);
  $("#bFrom").value = isoDate(new Date(today.getTime() - 6 * 864e5));
  $("#ssTo").value = isoDate(today);
  $("#ssFrom").value = isoDate(new Date(today.getFullYear(), today.getMonth(), 1));
  $("#bdTo").value = isoDate(today);
  $("#bdFrom").value = isoDate(new Date(today.getFullYear(), today.getMonth(), 1));

  initCombos();
  initArticleThumb();

  /* Paint the screen the browser was last on before anything slow happens.
     The markup ships with Product Variable marked active, and the real switch
     only lands in enterApp() — two round trips later — so without this the
     user watches the wrong page for as long as the server takes to answer.
     Permissions are not known yet; enterApp() re-checks and moves them if the
     role cannot open it. */
  var boot = rememberedPage();
  if (boot) applyPage(boot);

  renderAll();

  /* Whether a session is open is the server's answer, not something the page
     can decide for itself — ask, then either restore the app or lock it. */
  GET("me")
    .then(function (d) {
      if (!d.user) { showLogin(""); return; }
      return loadAll().then(function () { enterApp(false); });
    })
    .catch(function (err) {
      showLogin(err && err.status
        ? (err.message || "")
        : "Cannot reach the server. Check that it is running.");
    });
})();
