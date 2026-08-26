/* StockFlow — UI/UX prototype logic (localStorage backed) */
(function () {
  "use strict";

  var KEY  = "stockflow.v1";
  var SKEY = "stockflow.session";

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
  function allPerms() {
    var p = {};
    MODULES.forEach(function (m) { p[m.key] = true; });
    return p;
  }

  var db = load();

  /* ── storage ─────────────────────────────────────────── */
  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY));
      if (raw && raw.variables) {
        if (!raw.returns) raw.returns = [];   // upgrade older saved data
        if (!raw.seqRet)  raw.seqRet = 1;
        // Remove the retired product-name field from previously saved browser data.
        raw.variables.forEach(function (v) { delete v.name; });
        (raw.products || []).forEach(function (p) { delete p.name; });
        upgradeAuth(raw);
        localStorage.setItem(KEY, JSON.stringify(raw));
        return raw;
      }
    } catch (e) { /* fall through to seed */ }
    return seed();
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(db)); }

  /* Data saved before the permission system existed has no roles or users —
     give it the same seed the fresh install gets, so nobody is locked out. */
  function upgradeAuth(raw) {
    if (!raw.roles || !raw.roles.length) {
      raw.roles = seedRoles();
      raw.seqRole = raw.roles.length + 1;
    }
    if (!raw.users || !raw.users.length) {
      raw.users = seedUsers();
      raw.seqUser = raw.users.length + 1;
    }
    /* a module added in a later version must not silently stay locked */
    raw.roles.forEach(function (r) {
      if (r.name === "Super Admin") r.perms = allPerms();
    });
  }

  function seedRoles() {
    var now = new Date().toISOString();
    return [
      { id: 1, name: "Super Admin", createdAt: now, createdBy: "System", perms: allPerms() },
      { id: 2, name: "Store Manager", createdAt: now, createdBy: "System", perms: {
          variable: true, product: true, barcode: true, customer: true,
          sales: true, "return": true, repSummary: true, repDate: true,
          userAccess: false, roleAccess: false } },
      { id: 3, name: "Sales Operator", createdAt: now, createdBy: "System", perms: {
          variable: false, product: false, barcode: false, customer: true,
          sales: true, "return": true, repSummary: false, repDate: false,
          userAccess: false, roleAccess: false } }
    ];
  }
  function seedUsers() {
    return [
      { id: 1, code: "USR-0001", name: "Md Shazid", username: "mdshazid",
        password: "123456", roleId: 1, disabled: false, createdAt: new Date().toISOString() }
    ];
  }

  function seed() {
    return {
      variables: [
        { id: 1, article: "SH-1001", color: "Black", size: "41" },
        { id: 2, article: "SH-1002", color: "Brown", size: "42" },
        { id: 3, article: "SH-1003", color: "Tan",   size: "40" },
        { id: 4, article: "SH-1004", color: "Camel", size: "43" }
      ],
      customers: [
        { id: 1, code: "CUS-0001", name: "Rahim Shoe House", phone: "01711223344",
          email: "rahim@example.com", address: "Bata Signal, Elephant Road, Dhaka", note: "" }
      ],
      products: [],   // one entry per generated barcode
      sales: [],
      returns: [],    // customer returns + damage write-offs
      batch: {},      // { "260815": lastBatchNo }
      roles: seedRoles(),
      users: seedUsers(),
      seqCust: 2, seqVar: 5, seqSale: 1, seqRet: 1, seqRole: 4, seqUser: 2
    };
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
  function colorDot(c) {
    var named = {
      "navy blue": "#1f3a93", olive: "#6b7a3a", maroon: "#7b2233",
      grey: "#8a8a8a", gray: "#8a8a8a", tan: "#b0743f", camel: "#c19a6b",
      coffee: "#4b3621", cherry: "#6e2639", beige: "#e3d3b8",
      brown: "#6b4226", black: "#1a1a1a"
    };
    var k = String(c).toLowerCase();
    return named[k] || k;
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

  /* Barcode number: YYMMDD + batch (batch restarts per-day counter is
     continuous per date key, starting at 1 for the first entry of that day). */
  function nextBarcode(dateKey, peek) {
    var last = db.batch[dateKey] || 0;
    var n = last + 1;
    if (!peek) db.batch[dateKey] = n;
    return dateKey + pad(n, 4);
  }

  /* ══ AUTH & PERMISSIONS ════════════════════════════════ */
  var me = null;   // the signed-in user, or null

  function roleOf(u) {
    return u && db.roles.find(function (r) { return r.id === u.roleId; });
  }
  /* No session means the login screen is up, so nothing is reachable. */
  function can(key) {
    if (!me) return false;
    var r = roleOf(me);
    return !!(r && r.perms && r.perms[key]);
  }
  function firstAllowed() {
    var m = MODULES.find(function (x) { return can(x.key); });
    return m ? m.key : "variable";
  }

  function readSession() {
    try {
      var id = JSON.parse(localStorage.getItem(SKEY));
      var u = db.users.find(function (x) { return x.id === id; });
      return (u && !u.disabled) ? u : null;   // disabling someone ends their session
    } catch (e) { return null; }
  }
  function writeSession(u) {
    try {
      if (u) localStorage.setItem(SKEY, JSON.stringify(u.id));
      else   localStorage.removeItem(SKEY);
    } catch (e) {}
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
    var r = roleOf(me);
    $("#whoAmI").textContent = me ? me.name + " · " + (r ? r.name : "No role") : "";
  }

  function showLogin(msg) {
    me = null; writeSession(null);
    $("#loginErr").textContent = msg || "";
    $("#loginScreen").classList.add("show");
    document.body.classList.add("locked");
    $("#loginPass").value = "";
    setTimeout(function () { $("#loginUser").focus(); }, 60);
  }
  function enterApp(u) {
    me = u; writeSession(u);
    $("#loginScreen").classList.remove("show");
    document.body.classList.remove("locked");
    applyPermsToNav();
    var p = savedPage();
    applyPage(p); refreshPage(p);
    toast("Welcome back, " + u.name + ".", "ok");
  }

  $("#loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var id = $("#loginUser").value.trim().toLowerCase();
    var pw = $("#loginPass").value;
    var u = db.users.find(function (x) { return x.username.toLowerCase() === id; });
    if (!u || u.password !== pw) { $("#loginErr").textContent = "Wrong user ID or password."; return; }
    if (u.disabled) { $("#loginErr").textContent = "This account is disabled. Ask an admin to enable it."; return; }
    var r = roleOf(u);
    if (!r) { $("#loginErr").textContent = "This account has no role assigned."; return; }
    $("#loginErr").textContent = "";
    enterApp(u);
  });

  $("#logoutBtn").addEventListener("click", function () {
    if (!confirm("Sign out of StockFlow?")) return;
    showLogin("");
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

  $("#reportToggle").addEventListener("click", function () {
    $("#reportGroup").classList.toggle("open");
  });
  $("#permToggle").addEventListener("click", function () {
    $("#permGroup").classList.toggle("open");
  });
  var PAGE_KEY = "stockflow.page";

  function savedPage() {
    var p;
    try { p = localStorage.getItem(PAGE_KEY); } catch (e) {}
    return (p && TITLES[p] && $("#page-" + p) && can(p)) ? p : firstAllowed();
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
    if (p === "repSummary") renderStockSummary();
    if (p === "repDate")    renderByDate();
    if (p === "userAccess") renderUsers();
    if (p === "roleAccess") renderRoles();
  }

  function goPage(p) {
    if (!can(p)) { toast("You do not have access to that module.", "err"); return; }
    applyPage(p);
    try { localStorage.setItem(PAGE_KEY, p); } catch (e) {}
    refreshPage(p);
  }

  $$(".nav-item").forEach(function (btn) {
    var p = btn.dataset.page;
    if (!p) return;                     // parent toggle handled above
    btn.addEventListener("click", function () { goPage(p); });
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
  $("#openVarModal").addEventListener("click", function () {
    $("#varForm").reset(); resync();
    openModal("#varModal"); setTimeout(function () { $("#vArticle").focus(); }, 60);
  });

  $("#varForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var article = $("#vArticle").value.trim();
    var dupe = db.variables.some(function (v) {
      return v.article.toLowerCase() === article.toLowerCase() &&
             v.color.toLowerCase() === $("#vColor").value.trim().toLowerCase() &&
             v.size === $("#vSize").value;
    });
    if (dupe) { toast("This article / color / size combination already exists.", "err"); return; }

    db.variables.push({
      id: db.seqVar++, article: article,
      color: $("#vColor").value.trim(), size: $("#vSize").value
    });
    save(); closeModal($("#varModal")); renderVars(); fillArticleSelects();
    toast("Variable added.", "ok");
  });

  $("#varSearch").addEventListener("input", renderVars);

  function renderVars() {
    var q = $("#varSearch").value.trim().toLowerCase();
    var rows = db.variables.filter(function (v) {
      return !q || (v.article + " " + v.color + " " + v.size).toLowerCase().indexOf(q) > -1;
    });

    $("#varBody").innerHTML = rows.length ? rows.map(function (v) {
      return '<tr>' +
        '<td class="mono" style="color:var(--accent)">' + esc(v.article) + '</td>' +
        '<td><span class="swatch"><i style="background:' + esc(colorDot(v.color)) + '"></i>' + esc(v.color) + '</span></td>' +
        '<td><span class="badge">' + esc(v.size) + '</span></td>' +
        '<td><button class="btn btn-danger btn-sm" data-del-var="' + v.id + '">Delete</button></td>' +
      '</tr>';
    }).join("") :
      '<tr><td colspan="4"><div class="empty">No variables yet. Use <b>Add Variable</b> to create one.</div></td></tr>';

    $("#varCount").textContent = rows.length + " articles";
    $("#statVars").textContent = db.variables.length;
    $("#statColors").textContent = new Set(db.variables.map(function (v) { return v.color.toLowerCase(); })).size;
    $("#statSizes").textContent  = new Set(db.variables.map(function (v) { return v.size; })).size;
  }

  $("#varBody").addEventListener("click", function (e) {
    var id = e.target.dataset && e.target.dataset.delVar;
    if (!id) return;
    db.variables = db.variables.filter(function (v) { return v.id !== +id; });
    save(); renderVars(); fillArticleSelects(); toast("Variable removed.");
  });

  /* ══ 2. ADD PRODUCT ════════════════════════════════════ */
  function fillArticleSelects() {
    /* Add Product picks from the master variable list… */
    var opts = db.variables.map(function (v) {
      return '<option value="' + v.id + '" data-dot="' + esc(colorDot(v.color)) + '">' +
             esc(v.article) + ' · ' + esc(v.color) + ' / ' + esc(v.size) +
             '</option>';
    }).join("");
    var keepArt = $("#pArticle").value;
    $("#pArticle").innerHTML = '<option value="">— select from Product Variable —</option>' + opts;
    $("#pArticle").value = keepArt;   // survive a rebuild after generating

    /* …but the filters only offer articles that actually have stock entries,
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
  /* Shoe-trade defaults — leather shades and EU shoe sizes */
  var BASE_COLORS = ["Black", "Brown", "Tan", "Camel", "Coffee", "Cherry",
                     "Navy Blue", "Grey", "White", "Beige", "Olive", "Maroon"];
  var BASE_SIZES  = ["38", "39", "40", "41", "42", "43", "44", "45", "46"];

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

  function initCombos() {
    Combo.fromInput($("#vColor"), function () {
      return uniq(db.variables.map(function (v) { return v.color; }).concat(BASE_COLORS));
    }, { dot: colorDot });

    Combo.fromInput($("#vSize"), function () {
      return uniq(db.variables.map(function (v) { return v.size; }).concat(BASE_SIZES))
        .sort(function (a, b) {
          var na = parseFloat(a), nb = parseFloat(b);
          var aNum = !isNaN(na), bNum = !isNaN(nb);
          if (aNum && bNum) return nb - na;
          if (aNum) return -1;
          if (bNum) return 1;
          return String(b).localeCompare(String(a));
        });
    });

    ["#pArticle", "#sCustomer", "#bArticle", "#bStatus", "#rType",
     "#ssArticle", "#bdArticle", "#bdType"].forEach(function (sel) {
      Combo.fromSelect($(sel));
    });
  }

  $("#pArticle").addEventListener("change", function () {
    var v = db.variables.find(function (x) { return x.id === +this.value; }, this);
    $("#pColor").value = v ? v.color : "";
    $("#pSize").value  = v ? v.size  : "";
  });

  $("#clearProd").addEventListener("click", function () {
    ["pColor", "pSize", "pPrice", "pRemarks"].forEach(function (id) { $("#" + id).value = ""; });
    $("#pArticle").value = ""; $("#pQty").value = 1; resync();
    $("#labelPane").innerHTML = '<div class="empty">Cleared — generate a new barcode.</div>';
  });

  $("#genBtn").addEventListener("click", function () {
    var v = db.variables.find(function (x) { return x.id === +$("#pArticle").value; });
    if (!v) { toast("Select an article from Product Variable first.", "err"); return; }
    var qty = Math.max(1, parseInt($("#pQty").value, 10) || 1);
    var price = parseFloat($("#pPrice").value) || 0;
    var remarks = $("#pRemarks").value.trim();
    var key = ymd(new Date());
    var made = [];

    for (var i = 0; i < qty; i++) {
      var p = {
        code: nextBarcode(key), article: v.article, color: v.color,
        size: v.size, price: price, remarks: remarks, status: "in", at: new Date().toISOString()
      };
      db.products.push(p); made.push(p);
    }
    save();
    renderLabel(made);
    renderRecent(); updateChip(); renderSheet(); fillArticleSelects();
    toast(qty + " barcode" + (qty > 1 ? "s" : "") + " generated.", "ok");
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
      (first.remarks ? '<div class="kv"><span>Remarks</span><b>' + esc(first.remarks) + '</b></div>' : "") +
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
    var key = ymd(new Date());
    var next = nextBarcode(key, true);
    $("#nextCodeChip").textContent = "NEXT · " + next;
    $("#previewCode").textContent = next;
  }

  /* ══ 3. CUSTOMER DETAILS ═══════════════════════════════ */
  $("#openCustModal").addEventListener("click", function () {
    $("#custForm").reset(); openModal("#custModal"); setTimeout(function () { $("#cName").focus(); }, 60);
  });

  $("#custForm").addEventListener("submit", function (e) {
    e.preventDefault();
    db.customers.push({
      id: db.seqCust, code: "CUS-" + pad(db.seqCust++, 4),
      name: $("#cName").value.trim(), phone: $("#cPhone").value.trim(),
      email: $("#cEmail").value.trim(), address: $("#cAddr").value.trim(),
      note: $("#cNote").value.trim()
    });
    save(); closeModal($("#custModal")); renderCust(); fillCustomerSelect();
    toast("Customer added.", "ok");
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
    db.customers = db.customers.filter(function (c) { return c.id !== +d.delCust; });
    save(); renderCust(); fillCustomerSelect(); toast("Customer removed.");
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
      '<table class="hist-table"><thead><tr>' +
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
      '</tr></tfoot></table>'
      : '<div class="empty">This customer has not bought anything yet.</div>';

    var retBlock = rets.length ?
      '<h4 class="hist-sub">Returns &amp; Damage</h4>' +
      '<table><thead><tr>' +
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
      }).join("") + '</tbody></table>' : "";
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

    cartTotals();
  }

  /* Totals only — safe to call on every keystroke. */
  function cartTotals() {
    var sub = cart.reduce(function (a, code) { return a + priceOf(code); }, 0);
    var disc = Math.min(sub, parseFloat($("#sDiscount").value) || 0);
    var cust = db.customers.find(function (c) { return c.id === +$("#sCustomer").value; });

    $("#cartCount").textContent = cart.length + " pairs";
    $("#sumCust").textContent  = cust ? cust.name : "—";
    $("#sumItems").textContent = cart.length;
    $("#sumSub").textContent   = money(sub);
    $("#sumTotal").textContent = money(sub - disc);
    $("#checkoutBtn").disabled = !(cart.length && cust);
  }

  $("#checkoutBtn").addEventListener("click", function () {
    var cust = db.customers.find(function (c) { return c.id === +$("#sCustomer").value; });
    if (!cust || !cart.length) return;

    var sub = cart.reduce(function (a, code) {
      var p = db.products.find(function (x) { return x.code === code; });
      /* the edited row price is what was actually charged — keep it on the
         pair so refunds and reports use the real figure, not the label price */
      p.price = priceOf(code);
      p.status = "out"; p.soldTo = cust.id; p.soldAt = new Date().toISOString();
      return a + p.price;
    }, 0);
    var disc = Math.min(sub, parseFloat($("#sDiscount").value) || 0);

    db.sales.push({
      inv: "INV-" + ymd(new Date()) + "-" + pad(db.seqSale++, 3),
      custId: cust.id, custName: cust.name, items: cart.slice(),
      /* keep the price charged per pair, plus subtotal and discount, so the
         history can be rebuilt even after a pair is returned or resold */
      prices: cart.map(priceOf),
      sub: sub, discount: disc,
      total: sub - disc, at: new Date().toISOString()
    });
    save();
    $("#sDiscount").value = 0;
    clearCart();
    renderSales(); renderRecent(); renderCust(); renderSheet();
    toast("Stock out confirmed for " + cust.name + ".", "ok");
  });

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

    $("#retCartBody").innerHTML = items.length ? items.map(function (p) {
      var buyer = db.customers.find(function (c) { return c.id === p.soldTo; });
      return '<tr>' +
        '<td class="mono" style="color:var(--accent)">' + esc(p.code) + '</td>' +
        '<td><b>' + esc(p.article) + '</b><div class="hint">' + esc(p.color) + ' · ' + esc(p.size) + '</div></td>' +
        '<td>' + (buyer ? esc(buyer.name) : '<span class="badge">In stock</span>') + '</td>' +
        '<td class="num">' + p.price.toFixed(2) + '</td>' +
        '<td><button class="btn btn-quiet btn-sm" data-rrm="' + esc(p.code) + '">✕</button></td>' +
      '</tr>';
    }).join("") :
      '<tr><td colspan="5"><div class="empty">Scan the barcode on the returned box to begin.</div></td></tr>';

    var amount = items.reduce(function (a, p) { return a + p.price; }, 0);
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

    var first = db.products.find(function (x) { return x.code === retCart[0]; });
    var buyer = db.customers.find(function (c) { return c.id === (first && first.soldTo); });

    var amount = retCart.reduce(function (a, code) {
      var p = db.products.find(function (x) { return x.code === code; });
      if (isReturn) { p.status = "in"; p.returnedFrom = p.soldTo; delete p.soldTo; delete p.soldAt; }
      else { p.status = "damaged"; }
      p.lastAt = new Date().toISOString();
      return a + p.price;
    }, 0);

    db.returns.push({
      ref: (isReturn ? "RET-" : "DMG-") + ymd(new Date()) + "-" + pad(db.seqRet++, 3),
      type: isReturn ? "return" : "damage",
      custId: buyer ? buyer.id : null, custName: buyer ? buyer.name : "—",
      reason: $("#rReason").value.trim() || "Not specified",
      items: retCart.slice(), amount: amount, at: new Date().toISOString()
    });
    save();

    retCart = []; $("#rReason").value = "";
    renderRetCart(); renderReturns(); renderRecent(); renderCust(); renderSheet();
    toast(isReturn ? "Return completed — stock updated." : "Damage recorded — pairs written off.", "ok");
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
    if (!confirm("Clear all locally stored demo data?")) return;
    localStorage.removeItem(KEY);
    localStorage.removeItem(SKEY);
    location.reload();
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

  /* ── 6. Stock Summary ────────────────────────────────── */
  function renderStockSummary() {
    var from = $("#ssFrom").value, to = $("#ssTo").value, art = $("#ssArticle").value;
    var rows = {};   // key = article|color|size

    function bucket(p) {
      var k = p.article + "|" + p.color + "|" + p.size;
      if (!rows[k]) rows[k] = {
        article: p.article, color: p.color, size: p.size,
        made: 0, sold: 0, dmg: 0, ret: 0
      };
      return rows[k];
    }
    var pass = function (p) { return !art || p.article === art; };

    db.products.forEach(function (p) {
      if (pass(p) && inRange(p.at, from, to)) bucket(p).made++;
    });
    movements().forEach(function (m) {
      if (!pass(m.p) || !inRange(m.at, from, to)) return;
      var b = bucket(m.p);
      if (m.type === "sold")   b.sold++;
      if (m.type === "damage") b.dmg++;
      if (m.type === "return") b.ret++;
    });

    var list = Object.keys(rows).map(function (k) { return rows[k]; }).sort(function (a, b) {
      return (a.article + a.color + a.size).localeCompare(b.article + b.color + b.size);
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
        '<td><span class="swatch"><i style="background:' + esc(colorDot(r.color)) + '"></i>' + esc(r.color) + '</span></td>' +
        '<td><span class="badge">' + esc(r.size) + '</span></td>' +
        '<td' + z(r.made) + '>' + r.made + '</td>' +
        '<td' + z(r.sold) + '>' + r.sold + '</td>' +
        '<td' + z(r.dmg)  + '>' + r.dmg  + '</td>' +
        '<td' + z(r.ret)  + '>' + r.ret  + '</td>' +
        '<td' + z(fresh)  + ' style="color:var(--ok)">' + fresh + '</td>' +
        '<td' + z(total)  + ' style="color:var(--copper)">' + total + '</td>' +
      '</tr>';
    }).join("") : '<tr><td colspan="9"><div class="empty">No stock movement in this period.</div></td></tr>';

    $("#ssFoot").innerHTML = list.length ?
      '<tr>' +
        '<td class="lbl-cell" colspan="3">Sub-Total · ' + list.length + ' variant(s)</td>' +
        '<td class="num">' + tot.made  + '</td>' +
        '<td class="num">' + tot.sold  + '</td>' +
        '<td class="num">' + tot.dmg   + '</td>' +
        '<td class="num">' + tot.ret   + '</td>' +
        '<td class="num" style="color:var(--ok)">'     + tot.fresh + '</td>' +
        '<td class="num" style="color:var(--copper)">' + tot.total + '</td>' +
      '</tr>' : "";

    $("#ssRange").textContent = rangeLabel(from, to);
  }

  /* ── 7. By Date Stock ────────────────────────────────── */
  var PTYPE = { stockin: "Stock In", sold: "Sold", damage: "Damage", "return": "Return" };

  function renderByDate() {
    var from = $("#bdFrom").value, to = $("#bdTo").value;
    var ty = $("#bdType").value, art = $("#bdArticle").value;

    var list = movements().filter(function (m) {
      if (!inRange(m.at, from, to)) return false;
      if (ty && m.type !== ty) return false;
      if (art && m.p.article !== art) return false;
      return true;
    }).reverse();

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

  $("#ssApply").addEventListener("click", renderStockSummary);
  $("#bdApply").addEventListener("click", renderByDate);
  $("#ssPrint").addEventListener("click", function () { window.print(); });
  $("#bdPrint").addEventListener("click", function () { window.print(); });

  $("#ssReset").addEventListener("click", function () {
    $("#ssFrom").value = ""; $("#ssTo").value = ""; $("#ssArticle").value = "";
    resync(); renderStockSummary();
  });
  $("#bdReset").addEventListener("click", function () {
    $("#bdFrom").value = ""; $("#bdTo").value = "";
    $("#bdType").value = ""; $("#bdArticle").value = "";
    resync(); renderByDate();
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
      var r = roleOf(u);
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
    var u = db.users.find(function (x) { return x.id === +d.toggleUser; });
    if (!u) return;
    /* locking yourself out would need a second admin to undo */
    if (me && u.id === me.id) { toast("You cannot disable your own account.", "err"); return; }
    u.disabled = !u.disabled;
    save(); renderUsers();
    toast(u.name + (u.disabled ? " disabled." : " enabled."), u.disabled ? "err" : "ok");
  });

  $("#openUserModal").addEventListener("click", function () {
    $("#userForm").reset(); fillRoleSelect(); resync();
    openModal("#userModal"); setTimeout(function () { $("#uName").focus(); }, 60);
  });

  $("#userForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var username = $("#uUser").value.trim();
    var pass = $("#uPass").value;
    var roleId = +$("#uRole").value;

    if (!/^[A-Za-z0-9._-]{3,}$/.test(username)) {
      toast("User ID: 3+ characters, letters/numbers/._- only.", "err"); return;
    }
    if (db.users.some(function (u) { return u.username.toLowerCase() === username.toLowerCase(); })) {
      toast("That user ID is already taken.", "err"); return;
    }
    if (pass.length < 6) { toast("Password must be at least 6 characters.", "err"); return; }
    if (!roleId) { toast("Pick a role for this user.", "err"); return; }

    db.users.push({
      id: db.seqUser, code: "USR-" + pad(db.seqUser++, 4),
      name: $("#uName").value.trim(), username: username, password: pass,
      roleId: roleId, disabled: false, createdAt: new Date().toISOString()
    });
    save(); closeModal($("#userModal")); renderUsers();
    toast("User created.", "ok");
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
    var pw = $("#pNew").value;
    if (pw.length < 6) { toast("Password must be at least 6 characters.", "err"); return; }
    u.password = pw;
    save(); closeModal($("#passModal"));
    toast("Password updated for " + u.name + ".", "ok");
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
    db.roles = db.roles.filter(function (x) { return x.id !== r.id; });
    save(); renderRoles(); renderUsers(); fillRoleSelect();
    toast("Role deleted.");
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
    var name = $("#rName").value.trim();
    if (db.roles.some(function (r) { return r.name.toLowerCase() === name.toLowerCase(); })) {
      toast("A role with that name already exists.", "err"); return;
    }
    db.roles.push({
      id: db.seqRole++, name: name,
      createdAt: new Date().toISOString(),
      createdBy: me ? me.name : "System",
      perms: readPermGrid($("#roleFormPerms"))
    });
    save(); closeModal($("#roleModal"));
    renderRoles(); fillRoleSelect();
    toast("Role created.", "ok");
  });

  /* ── view / edit a role's access ─────────────────────── */
  var accessRoleId = null;
  function openAccessModal(id) {
    var r = db.roles.find(function (x) { return x.id === id; });
    if (!r) return;
    accessRoleId = id;
    $("#accessTitle").textContent = "Role Access · " + r.name;
    $("#accessPerms").innerHTML = permGrid(r.perms || {});
    $("#accessHint").textContent = (me && roleOf(me) && roleOf(me).id === id)
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
    if (me && roleOf(me) && roleOf(me).id === r.id && !(perms.userAccess && perms.roleAccess)) {
      toast("Keep User Access and Role Access on for your own role.", "err");
      return;
    }
    r.perms = perms;
    save(); closeModal($("#accessModal"));
    renderRoles(); applyPermsToNav();
    if (!can(savedPage())) { var p = firstAllowed(); applyPage(p); refreshPage(p); }
    toast("Access updated for " + r.name + ".", "ok");
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
  fillArticleSelects(); fillCustomerSelect(); fillRoleSelect();
  renderVars(); renderRecent(); renderCust(); renderCart(); renderSales();
  renderRetCart(); renderReturns(); renderSheet();
  renderStockSummary(); renderByDate();
  renderUsers(); renderRoles();
  updateChip();

  /* An open session picks up where it left off; otherwise the login screen
     stays up and nothing behind it is reachable. */
  me = readSession();
  if (me) {
    $("#loginScreen").classList.remove("show");
    document.body.classList.remove("locked");
    applyPermsToNav();
    var startPage = savedPage();
    applyPage(startPage); refreshPage(startPage);
  } else {
    showLogin("");
  }
})();
