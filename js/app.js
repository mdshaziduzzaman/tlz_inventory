/* StockFlow — UI/UX prototype logic (localStorage backed) */
(function () {
  "use strict";

  var KEY = "stockflow.v1";
  var db = load();

  /* ── storage ─────────────────────────────────────────── */
  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY));
      if (raw && raw.variables) {
        if (!raw.returns) raw.returns = [];   // upgrade older saved data
        if (!raw.seqRet)  raw.seqRet = 1;
        return raw;
      }
    } catch (e) { /* fall through to seed */ }
    return seed();
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(db)); }

  function seed() {
    return {
      variables: [
        { id: 1, article: "SH-1001", name: "Leather Oxford Shoe",  color: "Black",  size: "41" },
        { id: 2, article: "SH-1002", name: "Formal Derby Shoe",    color: "Brown",  size: "42" },
        { id: 3, article: "SH-1003", name: "Casual Loafer",        color: "Tan",    size: "40" },
        { id: 4, article: "SH-1004", name: "Suede Chukka Boot",    color: "Camel",  size: "43" }
      ],
      customers: [
        { id: 1, code: "CUS-0001", name: "Rahim Shoe House", phone: "01711223344",
          email: "rahim@example.com", address: "Bata Signal, Elephant Road, Dhaka", note: "" }
      ],
      products: [],   // one entry per generated barcode
      sales: [],
      returns: [],    // customer returns + damage write-offs
      batch: {},      // { "260815": lastBatchNo }
      seqCust: 2, seqVar: 5, seqSale: 1, seqRet: 1
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
  function money(n) { return "৳ " + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
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

  /* ── navigation ──────────────────────────────────────── */
  var TITLES = {
    variable: "Product Variable", product: "Add Product", customer: "Customer Details",
    sales: "Sales / Stock Out", "return": "Return / Damage", barcode: "Barcode Manage",
    repSummary: "Report / Stock Summary", repDate: "Report / By Date Stock"
  };
  $("#reportToggle").addEventListener("click", function () {
    $("#reportGroup").classList.toggle("open");
  });
  $$(".nav-item").forEach(function (btn) {
    var p = btn.dataset.page;
    if (!p) return;                     // parent toggle handled above
    btn.addEventListener("click", function () {
      $$(".nav-item").forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      $$(".page").forEach(function (s) { s.classList.remove("active"); });
      $("#page-" + p).classList.add("active");
      $("#crumb").textContent = TITLES[p];
      if (btn.classList.contains("nav-child")) $("#reportGroup").classList.add("open");
      if (p === "sales")  setTimeout(function () { $("#scanInput").focus(); }, 60);
      if (p === "return") setTimeout(function () { $("#retScan").focus(); }, 60);
      if (p === "barcode")    renderSheet();
      if (p === "repSummary") renderStockSummary();
      if (p === "repDate")    renderByDate();
    });
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
      id: db.seqVar++, article: article, name: $("#vName").value.trim(),
      color: $("#vColor").value.trim(), size: $("#vSize").value
    });
    save(); closeModal($("#varModal")); renderVars(); fillArticleSelects();
    toast("Variable added.", "ok");
  });

  $("#varSearch").addEventListener("input", renderVars);

  function renderVars() {
    var q = $("#varSearch").value.trim().toLowerCase();
    var rows = db.variables.filter(function (v) {
      return !q || (v.article + " " + v.name + " " + v.color).toLowerCase().indexOf(q) > -1;
    });

    $("#varBody").innerHTML = rows.length ? rows.map(function (v) {
      return '<tr>' +
        '<td class="mono" style="color:var(--accent)">' + esc(v.article) + '</td>' +
        '<td>' + esc(v.name) + '</td>' +
        '<td><span class="swatch"><i style="background:' + esc(colorDot(v.color)) + '"></i>' + esc(v.color) + '</span></td>' +
        '<td><span class="badge">' + esc(v.size) + '</span></td>' +
        '<td><button class="btn btn-danger btn-sm" data-del-var="' + v.id + '">Delete</button></td>' +
      '</tr>';
    }).join("") :
      '<tr><td colspan="5"><div class="empty">No variables yet. Use <b>Add Variable</b> to create one.</div></td></tr>';

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
    var opts = db.variables.map(function (v) {
      return '<option value="' + v.id + '" data-dot="' + esc(colorDot(v.color)) + '">' +
             esc(v.article) + ' · ' + esc(v.name) + ' · ' + esc(v.color) + ' / ' + esc(v.size) +
             '</option>';
    }).join("");
    $("#pArticle").innerHTML = '<option value="">— select from Product Variable —</option>' + opts;

    var arts = Array.from(new Set(db.variables.map(function (v) { return v.article; })));
    var artOpts = '<option value="">All articles</option>' +
      arts.map(function (a) { return '<option>' + esc(a) + '</option>'; }).join("");
    ["#bArticle", "#ssArticle", "#bdArticle"].forEach(function (s) { $(s).innerHTML = artOpts; });
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
      return uniq(db.variables.map(function (v) { return v.size; }).concat(BASE_SIZES));
    });

    ["#pArticle", "#sCustomer", "#bArticle", "#bStatus", "#rType",
     "#ssArticle", "#bdArticle", "#bdType"].forEach(function (sel) {
      Combo.fromSelect($(sel));
    });
  }

  $("#pArticle").addEventListener("change", function () {
    var v = db.variables.find(function (x) { return x.id === +this.value; }, this);
    $("#pName").value  = v ? v.name  : "";
    $("#pColor").value = v ? v.color : "";
    $("#pSize").value  = v ? v.size  : "";
  });

  $("#clearProd").addEventListener("click", function () {
    ["pName", "pColor", "pSize", "pPrice", "pRemarks"].forEach(function (id) { $("#" + id).value = ""; });
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
        code: nextBarcode(key), article: v.article, name: v.name, color: v.color,
        size: v.size, price: price, remarks: remarks, status: "in", at: new Date().toISOString()
      };
      db.products.push(p); made.push(p);
    }
    save();
    renderLabel(made[made.length - 1], made.length);
    renderRecent(); updateChip(); renderSheet();
    toast(qty + " barcode" + (qty > 1 ? "s" : "") + " generated.", "ok");
  });

  function renderLabel(p, count) {
    $("#labelPane").innerHTML =
      '<div class="label-preview">' +
        Barcode.svg(p.code, { height: 60, unit: 2, color: "#131417" }) +
        '<div class="label-code">' + esc(p.code) + '</div>' +
      '</div>' +
      '<div class="kv"><span>Product</span><b>' + esc(p.name) + '</b></div>' +
      '<div class="kv"><span>Article No</span><b class="mono">' + esc(p.article) + '</b></div>' +
      '<div class="kv"><span>Color / Size</span><b>' + esc(p.color) + ' · ' + esc(p.size) + '</b></div>' +
      '<div class="kv"><span>Price / Pair</span><b>' + money(p.price) + '</b></div>' +
      (p.remarks ? '<div class="kv"><span>Remarks</span><b>' + esc(p.remarks) + '</b></div>' : "") +
      '<div class="kv"><span>Generated</span><b>' + fmtDT(p.at) + '</b></div>' +
      (count > 1 ? '<div class="hint" style="margin-top:10px">' + count +
        ' labels created in this batch — see them all under <b>Barcode Manage</b>.</div>' : "") +
      '<button class="btn btn-ghost btn-block" style="margin-top:16px" id="quickPrint">Print Label</button>';

    $("#quickPrint").addEventListener("click", function () { window.print(); });
    $("#previewCode").textContent = p.code;
  }

  function renderRecent() {
    var rows = db.products.slice(-12).reverse();
    $("#recentBody").innerHTML = rows.length ? rows.map(function (p) {
      return '<tr>' +
        '<td class="mono" style="color:var(--accent)">' + esc(p.code) + '</td>' +
        '<td class="mono">' + esc(p.article) + '</td>' +
        '<td>' + esc(p.name) + '</td>' +
        '<td><span class="swatch"><i style="background:' + esc(colorDot(p.color)) + '"></i>' + esc(p.color) + '</span></td>' +
        '<td><span class="badge">' + esc(p.size) + '</span></td>' +
        '<td>' + statusBadge(p) + '</td>' +
        '<td style="color:var(--txt-dim)">' + fmtDT(p.at) + '</td>' +
      '</tr>';
    }).join("") : '<tr><td colspan="7"><div class="empty">Nothing generated yet.</div></td></tr>';
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
        '<td class="mono" style="color:var(--accent)">' + esc(c.code) + '</td>' +
        '<td><b>' + esc(c.name) + '</b>' + (c.note ? '<div class="hint">' + esc(c.note) + '</div>' : "") + '</td>' +
        '<td class="mono">' + esc(c.phone) + '</td>' +
        '<td style="color:var(--txt-dim)">' + esc(c.email || "—") + '</td>' +
        '<td style="color:var(--txt-dim)">' + esc(c.address || "—") + '</td>' +
        '<td class="num">' + orders + '</td>' +
        '<td><button class="btn btn-danger btn-sm" data-del-cust="' + c.id + '">Delete</button></td>' +
      '</tr>';
    }).join("") : '<tr><td colspan="7"><div class="empty">No customers found.</div></td></tr>';

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
    var id = e.target.dataset && e.target.dataset.delCust;
    if (!id) return;
    db.customers = db.customers.filter(function (c) { return c.id !== +id; });
    save(); renderCust(); fillCustomerSelect(); toast("Customer removed.");
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

  function addToCart(code) {
    code = String(code).trim();
    if (!code) return;
    var p = db.products.find(function (x) { return x.code === code; });
    if (!p)                     { toast("Barcode not found: " + code, "err"); return; }
    if (p.status === "out")     { toast("Already stocked out: " + code, "err"); return; }
    if (p.status === "damaged") { toast("This pair is written off as damaged — cannot be sold.", "err"); return; }
    if (cart.indexOf(code) > -1) { toast("Already in cart.", "err"); return; }
    cart.push(code); renderCart(); toast(p.name + " added.", "ok");
  }

  $("#scanBtn").addEventListener("click", function () {
    addToCart($("#scanInput").value); $("#scanInput").value = ""; $("#scanInput").focus();
  });
  $("#scanInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); $("#scanBtn").click(); }
  });
  $("#sCustomer").addEventListener("change", renderCart);
  $("#sDiscount").addEventListener("input", renderCart);
  $("#cartClear").addEventListener("click", function () { cart = []; renderCart(); });

  $("#cartBody").addEventListener("click", function (e) {
    var code = e.target.dataset && e.target.dataset.rm;
    if (!code) return;
    cart = cart.filter(function (c) { return c !== code; });
    renderCart();
  });

  function renderCart() {
    var items = cart.map(function (c) {
      return db.products.find(function (p) { return p.code === c; });
    }).filter(Boolean);

    $("#cartBody").innerHTML = items.length ? items.map(function (p) {
      return '<tr>' +
        '<td class="mono" style="color:var(--accent)">' + esc(p.code) + '</td>' +
        '<td>' + esc(p.name) + '<div class="hint">' + esc(p.color) + ' · ' + esc(p.size) + '</div></td>' +
        '<td class="num">' + p.price.toFixed(2) + '</td>' +
        '<td><button class="btn btn-quiet btn-sm" data-rm="' + esc(p.code) + '">✕</button></td>' +
      '</tr>';
    }).join("") : '<tr><td colspan="4"><div class="empty">Scan a shoe box barcode to begin.</div></td></tr>';

    var sub = items.reduce(function (a, p) { return a + p.price; }, 0);
    var disc = Math.min(sub, parseFloat($("#sDiscount").value) || 0);
    var cust = db.customers.find(function (c) { return c.id === +$("#sCustomer").value; });

    $("#cartCount").textContent = items.length + " pairs";
    $("#sumCust").textContent  = cust ? cust.name : "—";
    $("#sumItems").textContent = items.length;
    $("#sumSub").textContent   = money(sub);
    $("#sumTotal").textContent = money(sub - disc);
    $("#checkoutBtn").disabled = !(items.length && cust);
  }

  $("#checkoutBtn").addEventListener("click", function () {
    var cust = db.customers.find(function (c) { return c.id === +$("#sCustomer").value; });
    if (!cust || !cart.length) return;

    var sub = cart.reduce(function (a, code) {
      var p = db.products.find(function (x) { return x.code === code; });
      p.status = "out"; p.soldTo = cust.id; p.soldAt = new Date().toISOString();
      return a + p.price;
    }, 0);
    var disc = Math.min(sub, parseFloat($("#sDiscount").value) || 0);

    db.sales.push({
      inv: "INV-" + ymd(new Date()) + "-" + pad(db.seqSale++, 3),
      custId: cust.id, custName: cust.name, items: cart.slice(),
      total: sub - disc, at: new Date().toISOString()
    });
    save();
    cart = []; $("#sDiscount").value = 0;
    renderCart(); renderSales(); renderRecent(); renderCust(); renderSheet();
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
    retCart.push(code); renderRetCart();
    toast(p.name + " (" + p.size + ") added.", "ok");
  }

  $("#retScanBtn").addEventListener("click", function () {
    retAdd($("#retScan").value); $("#retScan").value = ""; $("#retScan").focus();
  });
  $("#retScan").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); $("#retScanBtn").click(); }
  });
  $("#retClear").addEventListener("click", function () { retCart = []; renderRetCart(); });
  $("#rType").addEventListener("change", function () {
    // switching to "Customer Return" drops any pair that was never sold
    if (retType() === "return") {
      var before = retCart.length;
      retCart = retCart.filter(function (c) {
        var p = db.products.find(function (x) { return x.code === c; });
        return p && p.status === "out";
      });
      if (retCart.length < before) toast("Unsold pairs removed from the list.", "err");
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
        '<td>' + esc(p.name) + '<div class="hint">' + esc(p.color) + ' · ' + esc(p.size) + '</div></td>' +
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
    $("#labelSheet").innerHTML = rows.length ? rows.map(function (p) {
      return '<div class="lbl-card">' +
        '<div>' +
          '<div class="t">' + esc(p.name) + '</div>' +
          '<div class="s">' + esc(p.article) + ' · ' + esc(p.color) + ' · ' + esc(p.size) + '</div>' +
        '</div>' +
        Barcode.svg(p.code, { height: 50, unit: 2, color: "#000000" }) +
        '<div class="c">' + esc(p.code) + '</div>' +
        '<div class="s" style="display:flex;justify-content:space-between">' +
          '<span>' + esc(p.at.slice(0, 10)) + '</span><span><b>' + money(p.price) + '</b></span>' +
        '</div>' +
      '</div>';
    }).join("") : '<div class="empty" style="grid-column:1/-1">No barcodes in this date range.</div>';
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
    location.reload();
  });

  /* ══ 6+7. REPORTS ══════════════════════════════════════ */
  function pByCode(code) {
    return db.products.find(function (x) { return x.code === code; });
  }

  /* One row per pair that moved: sold / damage / return */
  function movements() {
    var out = [];
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
  var PTYPE = { sold: "Sold", damage: "Damage", "return": "Return" };

  function renderByDate() {
    var from = $("#bdFrom").value, to = $("#bdTo").value;
    var ty = $("#bdType").value, art = $("#bdArticle").value;

    var list = movements().filter(function (m) {
      if (!inRange(m.at, from, to)) return false;
      if (ty && m.type !== ty) return false;
      if (art && m.p.article !== art) return false;
      return true;
    }).reverse();

    var tot = { sold: 0, damage: 0, "return": 0 };

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
  fillArticleSelects(); fillCustomerSelect();
  renderVars(); renderRecent(); renderCust(); renderCart(); renderSales();
  renderRetCart(); renderReturns(); renderSheet();
  renderStockSummary(); renderByDate();
  updateChip();
})();
