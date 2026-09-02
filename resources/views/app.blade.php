<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>StockFlow · Inventory & Barcode Manager</title>
<meta name="csrf-token" content="{{ csrf_token() }}">
<link rel="stylesheet" href="{{ asset("css/styles.css") }}?v={{ filemtime(public_path("css/styles.css")) }}">
{{--
  The markup ships with Product Variable marked active. When the browser was
  last on some other page, that is the wrong screen — and on a big document
  the parser paints before the script at the end of the body can correct it.

  So: if a switch is coming, hide the pages from here, before a single one is
  painted. A blank panel for a frame is honest; the wrong page is not. The
  script at the end of the body sets the real classes and lifts this again.
--}}
<script>
(function () {
  try {
    var page = (location.hash || "").replace(/^#/, "") ||
               localStorage.getItem("stockflow.page") || "";
    /* Only bother when it is not the page the markup already shows, and only
       for a name that looks like one of ours. */
    if (!page || page === "variable" || !/^[A-Za-z]+$/.test(page)) return;
    document.write('<style id="bootHide">.page{display:none!important}</style>');
  } catch (e) { /* leave the markup as it is */ }
})();
</script>
</head>
{{--
  Which of the two screens to paint is decided here, not after the /api/me
  round trip. Starting locked meant a signed-in reload always flashed the
  login form for the length of that request. The JS still asks the server and
  still locks up if the session is gone — this only sets the first paint.
--}}
@php($signedIn = auth()->check())
<body @class(['locked' => ! $signedIn])>
<!-- ══ Login ════════════════════════════════════════════ -->
<div @class(['login-screen', 'show' => ! $signedIn]) id="loginScreen">
  <form class="login-card" id="loginForm">
    <div class="login-brand">
      <div class="mark">SF</div>
      <div>
        <h1>StockFlow</h1>
        <small>Inventory Suite</small>
      </div>
    </div>
    <h2>Sign in</h2>
    <p class="login-sub">Use the user ID and password given to you.</p>

    <div class="field">
      <label for="loginUser">User ID</label>
      <input class="input" id="loginUser" placeholder="e.g. mdshazid" autocomplete="username" required>
    </div>
    <div class="field">
      <label for="loginPass">Password</label>
      <input class="input" id="loginPass" type="password" placeholder="••••••" autocomplete="current-password" required>
    </div>
    <div class="login-err" id="loginErr"></div>
    <button class="btn btn-primary btn-block" type="submit" style="margin-top:6px">Sign In</button>
  </form>
</div>

<div class="app">

  <!-- Dims the page behind the drawer, and closes it when tapped. -->
  <div class="nav-scrim" id="navScrim"></div>

  <!-- ══ Sidebar ══════════════════════════════════════════ -->
  <aside class="sidebar" id="sidebar">
    <div class="brand">
      <div class="mark">SF</div>
      <div>
        <h1>StockFlow</h1>
        <small>Inventory Suite</small>
      </div>
    </div>

    <nav class="nav">
      <div class="nav-label">Modules</div>

      <button class="nav-item active" data-page="variable">
        <svg viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
        Product Variable
      </button>
      <button class="nav-item" data-page="product">
        <svg viewBox="0 0 24 24"><path d="M21 16V8l-9-5-9 5v8l9 5 9-5z"/><path d="M3.3 7.3L12 12l8.7-4.7M12 22V12"/></svg>
        Add Product
      </button>
      <button class="nav-item" data-page="barcode">
        <svg viewBox="0 0 24 24"><path d="M3 5v14M7 5v14M11 5v10M15 5v14M18 5v14M21 5v10"/></svg>
        Barcode Manage
      </button>
      <button class="nav-item" data-page="customer">
        <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>
        Customer Details
      </button>
      <button class="nav-item" data-page="sales">
        <svg viewBox="0 0 24 24"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2 4h14"/><circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/></svg>
        Sales / Stock Out
      </button>
      <button class="nav-item" data-page="return">
        <svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
        Return / Damage
      </button>
      <div class="nav-group" id="reportGroup">
        <button class="nav-item nav-parent" id="reportToggle">
          <svg viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>
          Report
          <svg class="caret" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="nav-sub">
          <button class="nav-item nav-child" data-page="repSummary">Stock Summary</button>
          <button class="nav-item nav-child" data-page="repDate">By Date Stock</button>
        </div>
      </div>
      <div class="nav-group" id="permGroup">
        <button class="nav-item nav-parent" id="permToggle">
          <svg viewBox="0 0 24 24"><path d="M12 2l8 4v6c0 5-3.4 9.3-8 10-4.6-.7-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/></svg>
          User Permission
          <svg class="caret" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="nav-sub">
          <button class="nav-item nav-child" data-page="userAccess">User Access</button>
          <button class="nav-item nav-child" data-page="roleAccess">Role Access</button>
        </div>
      </div>
    </nav>

    <div class="sidebar-foot">
      <!-- On a phone the topbar has no room for the signed-in name, so the
           drawer carries it instead. -->
      <div class="side-who" id="whoAmISide"></div>
      <a href="#" id="resetData" style="color:var(--txt-mute)">Reset all data</a>
    </div>
  </aside>

  <!-- ══ Main ═════════════════════════════════════════════ -->
  <main class="main">
    <header class="topbar">
      <button class="hamburger" id="navToggle" aria-label="Menu" aria-expanded="false">
        <svg viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
      </button>
      <div class="crumb">StockFlow &nbsp;/&nbsp; <b id="crumb">Product Variable</b></div>
      <div class="meta">
        <span id="todayLbl"></span>
        <span class="chip" id="nextCodeChip">—</span>
        <span class="who" id="whoAmI"></span>
        <button class="btn btn-quiet btn-sm" id="logoutBtn" title="Sign out">Logout</button>
      </div>
    </header>

    <div class="content">

      <!-- ── 1. PRODUCT VARIABLE ─────────────────────────── -->
      <section class="page active" id="page-variable">
        <div class="page-head">
          <div>
            <h2>Product Variable</h2>
            <!-- <p>Master list of article variations. Everything added here becomes selectable on the Add Product screen.</p> -->
          </div>
          <div class="head-actions">
            <input class="input" id="varSearch" placeholder="Search article no…" style="width:230px">
            <button class="btn btn-ghost" id="openSizeModal">
              <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg> Add Size
            </button>
            <button class="btn btn-ghost" id="openColorModal">
              <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg> Add Color
            </button>
            <button class="btn btn-primary" id="openVarModal">
              <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg> Add Article
            </button>
          </div>
        </div>

        <div class="stats">
          <div class="stat"><div class="k">Articles</div><div class="v" id="statVars">0</div></div>
          <div class="stat"><div class="k">Colors</div><div class="v" id="statColors">0</div></div>
          <div class="stat"><div class="k">Sizes</div><div class="v" id="statSizes">0</div></div>
        </div>

        <div class="card">
          <div class="card-head"><h3>Article List</h3><span class="badge" id="varCount">0 items</span></div>
          <div class="table-wrap">
            <table>
              <thead><tr>
                <th style="width:74px">Image</th>
                <th>Article No</th>
                <th style="width:120px" class="num">In Stock</th>
                <th style="width:230px"></th>
              </tr></thead>
              <tbody id="varBody"></tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- ── 2. ADD PRODUCT ──────────────────────────────── -->
      <section class="page" id="page-product">
        <div class="grid-2">
          <!-- form -->
          <div class="card">
            <div class="card-head">
              <h3>Product Details</h3>
              {{-- Shortcuts to the same modals the Product Variable page
                   opens. Typing a new article or colour here already creates
                   it, but only these can attach a photo — and they save a
                   trip to the other screen. Hidden for a role without access
                   to that module. --}}
              <div class="head-actions" id="productListShortcuts">
                {{-- Edits whichever article the field below is holding, so it
                     stays disabled until that name matches one on the list.
                     Super Admin only, like the same button on Product
                     Variable — the server enforces it either way. --}}
                <button class="btn btn-ghost btn-sm" id="editArticleBtn" disabled>
                  <svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
                  Edit Article
                </button>
                <button class="btn btn-ghost btn-sm" id="openColorModal2">
                  <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg> Add Color
                </button>
              </div>
              <span class="chip" id="previewCode">—</span>
            </div>
            <div class="card-body">
              {{-- Article and colour are typed, not chosen from a fixed list:
                   whatever has been entered before comes back as suggestions,
                   and anything new is created just by typing it. Size is the
                   one fixed list, 38 to 46. --}}
              <div class="field">
                <label for="pArticle">Article No</label>
                <input class="input" id="pArticle" placeholder="Type or pick an article" required>
                <div class="hint">Type a new one, or click to pick one you have used before.</div>
              </div>
              <div class="row">
                <div class="field">
                  <label for="pColor">Color</label>
                  <input class="input" id="pColor" placeholder="Type or pick a colour" required>
                </div>
                <div class="field">
                  <label for="pSize">Size</label>
                  <select class="input" id="pSize"><option value="">— select a size —</option></select>
                </div>
              </div>
              <div class="row">
                <div class="field">
                  <label for="pQty">Quantity (pairs)</label>
                  <input class="input" id="pQty" type="number" min="1" value="1">
                  <div class="hint">Each pair gets its own unique barcode.</div>
                </div>
                <div class="field">
                  <label for="pPrice">Price per Pair (BDT)</label>
                  <input class="input" id="pPrice" type="number" min="0" placeholder="0.00">
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:14px;margin-top:4px">
                <button class="btn btn-primary" id="genBtn">
                  <svg viewBox="0 0 24 24"><path d="M3 5v14M7 5v14M11 5v10M15 5v14M18 5v14M21 5v10"/></svg>
                  Save &amp; Generate Barcode
                </button>
                <button class="btn btn-quiet" id="clearProd">Clear</button>
              </div>
            </div>
          </div>

          <!-- label -->
          <div class="card">
            <div class="card-head"><h3>Generated Label</h3></div>
            <div class="card-body" id="labelPane">
              <div class="empty">
                <svg viewBox="0 0 24 24"><path d="M3 5v14M7 5v14M11 5v10M15 5v14M18 5v14M21 5v10"/></svg>
                No barcode yet — fill the form and generate.
              </div>
            </div>
          </div>
        </div>

        <div class="card" style="margin-top:20px">
          <div class="card-head"><h3>Recently Generated</h3><span class="badge" id="recentCount">0</span></div>
          <div class="table-wrap">
            <table>
              <thead><tr>
                <th style="width:170px">Barcode No</th><th style="width:140px">Article No</th>
                <th style="width:120px">Color</th><th style="width:80px">Size</th>
                <th style="width:110px">Status</th><th style="width:160px">Generated</th>
              </tr></thead>
              <tbody id="recentBody"></tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- ── 3. CUSTOMER DETAILS ─────────────────────────── -->
      <section class="page" id="page-customer">
        <div class="page-head">
          <div>
            <h2>Customer Details</h2>
            <p>All registered customers with contact info and purchase history.</p>
          </div>
          <div class="head-actions">
            <input class="input" id="custSearch" placeholder="Search name / phone…" style="width:230px">
            <button class="btn btn-primary" id="openCustModal">
              <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg> Add Customer
            </button>
          </div>
        </div>

        <div class="stats">
          <div class="stat"><div class="k">Customers</div><div class="v" id="statCust">0</div></div>
          <div class="stat"><div class="k">Total Sales</div><div class="v accent" id="statSales">0</div></div>
          <div class="stat"><div class="k">Revenue (BDT)</div><div class="v" id="statRev">0</div></div>
        </div>

        <div class="card">
          <div class="card-head"><h3>Customer List</h3><span class="badge" id="custCount">0 items</span></div>
          <div class="table-wrap">
            <table>
              <thead><tr>
                <th>Name</th><th style="width:140px">Phone</th>
                <th style="width:190px">Email</th><th>Address</th>
                <th style="width:90px" class="num">Orders</th><th style="width:190px"></th>
              </tr></thead>
              <tbody id="custBody"></tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- ── 4. SALES / STOCK OUT ────────────────────────── -->
      <section class="page" id="page-sales">
        <div class="page-head">
          <div>
            <h2>Sales / Stock Out</h2>
            <p>Select a customer, then scan barcodes one by one. Each scanned item is moved out of stock instantly.</p>
          </div>
          <div class="head-actions">
            {{-- For when the label is unreadable or the box is not to hand:
                 look the pair up instead of scanning it. --}}
            <button class="btn btn-ghost" id="openStockModal">
              <svg viewBox="0 0 24 24"><path d="M3 5v14M7 5v14M11 5v10M15 5v14M18 5v14M21 5v10"/></svg>
              Show Barcode
            </button>
          </div>
        </div>

        <div class="grid-2">
          <div class="card">
            <div class="card-head"><h3>Scan Pairs</h3><span class="badge" id="cartCount">0 pairs</span></div>
            <div class="card-body">
              <div class="field">
                <label for="sCustomer">Customer</label>
                <select class="input" id="sCustomer"><option value="">— select customer —</option></select>
              </div>
              <div class="field">
                <label>Barcode Scanner</label>
                <div class="scan-box">
                  <input class="input" id="scanInput" placeholder="Scan or type barcode + Enter" autocomplete="off">
                  <button class="btn btn-ghost" id="scanBtn">Add</button>
                </div>
                <div class="hint">A hardware scanner types the code and sends Enter — works out of the box.</div>
              </div>

              <div class="table-wrap" style="border:1px solid var(--line);border-radius:10px;margin-top:6px">
                <table>
                  <thead><tr>
                    <th style="width:160px">Barcode</th><th>Article / Variant</th>
                    <th style="width:170px" class="num">Price</th><th style="width:50px"></th>
                  </tr></thead>
                  <tbody id="cartBody"></tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-head"><h3>Invoice Summary</h3></div>
            <div class="card-body">
              <div class="kv"><span>Customer</span><b id="sumCust">—</b></div>
              <div class="kv"><span>Pairs</span><b id="sumItems">0</b></div>
              <div class="kv"><span>Subtotal</span><b id="sumSub">BDT 0.00</b></div>
              <div class="kv"><span>Discount</span>
                <b><input class="input" id="sDiscount" type="number" min="0" value="0"
                          style="width:110px;padding:5px 9px;text-align:right"></b></div>
              <div class="kv" style="font-size:16px;padding-top:14px">
                <span style="color:var(--txt)">Grand Total</span>
                <b style="color:var(--accent)" id="sumTotal">BDT 0.00</b>
              </div>
              <button class="btn btn-primary btn-block" id="checkoutBtn" style="margin-top:18px" disabled>
                Confirm Stock Out
              </button>
              <button class="btn btn-quiet btn-block" id="cartClear" style="margin-top:6px">Clear Cart</button>
            </div>
          </div>
        </div>

        <div class="card" style="margin-top:20px">
          <div class="card-head"><h3>Stock Out History</h3><span class="badge" id="saleCount">0</span></div>
          <div class="table-wrap">
            <table>
              <thead><tr>
                <th style="width:140px">Invoice</th><th>Customer</th>
                <th style="width:90px" class="num">Pairs</th><th style="width:130px" class="num">Total</th>
                <th style="width:170px">Date</th>
              </tr></thead>
              <tbody id="saleBody"></tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- ── 5. RETURN / DAMAGE ──────────────────────────── -->
      <section class="page" id="page-return">
        <div class="grid-2">
          <div class="card">
            <div class="card-head">
              <h3>Scan Returned Pairs</h3><span class="badge" id="retCartCount">0 pairs</span>
            </div>
            <div class="card-body">
              <div class="field">
                <label>Barcode Scanner</label>
                <div class="scan-box">
                  <input class="input" id="retScan" placeholder="Scan or type the barcode number + Enter" autocomplete="off">
                  <button class="btn btn-ghost" id="retScanBtn">Add</button>
                </div>
                <div class="hint">Works with a scanner, or type the unique number printed under the barcode.</div>
              </div>

              <div class="table-wrap" style="border:1px solid var(--line);border-radius:10px;margin-top:6px">
                <table>
                  <thead><tr>
                    <th style="width:150px">Barcode</th><th>Article / Variant</th>
                    <th style="width:150px">Sold To</th>
                    <th style="width:95px" class="num">Price</th><th style="width:50px"></th>
                  </tr></thead>
                  <tbody id="retCartBody"></tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-head"><h3>Return Details</h3></div>
            <div class="card-body">
              <div class="field">
                <label for="rType">Return Type</label>
                <select class="input" id="rType">
                  <option value="return">Customer Return — put back in stock</option>
                  <option value="damage">Damaged — remove from stock</option>
                </select>
                <div class="hint" id="rTypeHint">Only pairs that were sold can be returned.</div>
              </div>
              <div class="field">
                <label for="rReason">Reason</label>
                <textarea class="input" id="rReason" style="min-height:78px"
                          placeholder="Why is it coming back? e.g. size 41 too tight, sole came off, box got wet in storage"></textarea>
              </div>

              <div class="kv"><span>Customer</span><b id="rSumCust">—</b></div>
              <div class="kv"><span>Pairs</span><b id="rSumItems">0</b></div>
              <div class="kv" style="font-size:16px;padding-top:14px">
                <span style="color:var(--txt)" id="rSumLabel">Refund Amount</span>
                <b style="color:var(--accent)" id="rSumTotal">BDT 0.00</b>
              </div>

              <button class="btn btn-primary btn-block" id="retConfirm" style="margin-top:18px" disabled>
                Confirm Return
              </button>
              <button class="btn btn-quiet btn-block" id="retClear" style="margin-top:6px">Clear List</button>
            </div>
          </div>
        </div>

        <div class="stats" style="margin-top:20px">
          <div class="stat"><div class="k">Returned Pairs</div><div class="v" id="statRet">0</div></div>
          <div class="stat"><div class="k">Damaged Pairs</div><div class="v" id="statDmg">0</div></div>
          <div class="stat"><div class="k">Refunded (BDT)</div><div class="v accent" id="statRefund">0</div></div>
        </div>

        <div class="card">
          <div class="card-head"><h3>Return / Damage History</h3><span class="badge" id="retCount">0</span></div>
          <div class="table-wrap">
            <table>
              <thead><tr>
                <th style="width:150px">Ref No</th><th style="width:120px">Type</th>
                <th>Customer</th><th>Reason</th>
                <th style="width:80px" class="num">Pairs</th><th style="width:120px" class="num">Amount</th>
                <th style="width:170px">Date</th>
              </tr></thead>
              <tbody id="retBody"></tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- ── 6. REPORT · STOCK SUMMARY ───────────────────── -->
      <section class="page" id="page-repSummary">
        <div class="page-head">
          <div>
            <h2>Stock Summary</h2>
            <p>Article-wise movement for the selected period, with a sub-total for every column.</p>
          </div>
          <div class="head-actions">
            <button class="btn btn-ghost" id="ssPrint">
              <svg viewBox="0 0 24 24"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
              Print
            </button>
          </div>
        </div>

        <div class="card no-print" style="margin-bottom:18px">
          <div class="card-body" style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap">
            <div style="flex:1;min-width:170px"><label class="lbl" for="ssFrom">From Date</label>
              <input class="input" type="date" id="ssFrom"></div>
            <div style="flex:1;min-width:170px"><label class="lbl" for="ssTo">To Date</label>
              <input class="input" type="date" id="ssTo"></div>
            <div style="flex:1;min-width:190px"><label class="lbl" for="ssArticle">Article No</label>
              <select class="input" id="ssArticle"><option value="">All articles</option></select></div>
            <button class="btn btn-primary" id="ssApply">Apply Filter</button>
            <button class="btn btn-quiet" id="ssReset">Reset</button>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <h3>Stock Summary</h3>
            <span class="badge" id="ssRange">—</span>
          </div>
          <div class="table-wrap">
            <table class="rep">
              <thead><tr>
                <th style="width:130px">Article Number</th>
                <th style="width:120px">Color</th>
                <th style="width:80px">Size</th>
                <th class="num">Manufactured<br>Stock</th>
                <th class="num">Sold<br>Qty</th>
                <th class="num">Damage<br>Qty</th>
                <th class="num">Return<br>Stock</th>
                <th class="num">Fresh<br>Qty</th>
                <th class="num">Total<br>Stock</th>
              </tr></thead>
              <tbody id="ssBody"></tbody>
              <tfoot id="ssFoot"></tfoot>
            </table>
          </div>
          <div class="card-body" style="border-top:1px solid var(--line-soft);padding:14px 20px">
            <div class="hint" style="margin:0">
              <b>Fresh Qty</b> = Manufactured − Sold − Damage + Return &nbsp;·&nbsp;
              <b>Total Stock</b> = Manufactured − Sold + Return
            </div>
          </div>
        </div>
      </section>

      <!-- ── 7. REPORT · BY DATE STOCK ───────────────────── -->
      <section class="page" id="page-repDate">
        <div class="page-head">
          <div>
            <h2>By Date Stock</h2>
            <p>Every individual pair that moved in the period — one row per barcode.</p>
          </div>
          <div class="head-actions">
            <button class="btn btn-ghost" id="bdPrint">
              <svg viewBox="0 0 24 24"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
              Print
            </button>
          </div>
        </div>

        <div class="card no-print" style="margin-bottom:18px">
          <div class="card-body" style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap">
            <div style="flex:1;min-width:170px"><label class="lbl" for="bdFrom">From Date</label>
              <input class="input" type="date" id="bdFrom"></div>
            <div style="flex:1;min-width:170px"><label class="lbl" for="bdTo">To Date</label>
              <input class="input" type="date" id="bdTo"></div>
            <div style="flex:1;min-width:170px"><label class="lbl" for="bdType">Product Type</label>
              <select class="input" id="bdType">
                <option value="">All types</option>
                <option value="stockin">Stock In</option>
                <option value="sold">Sold</option>
                <option value="damage">Damage</option>
                <option value="return">Return</option>
              </select></div>
            <div style="flex:1;min-width:190px"><label class="lbl" for="bdArticle">Article No</label>
              <select class="input" id="bdArticle"><option value="">All articles</option></select></div>
            <button class="btn btn-primary" id="bdApply">Apply Filter</button>
            <button class="btn btn-quiet" id="bdReset">Reset</button>
          </div>
        </div>
        <div class="card">
          <div class="card-head">
            <h3>Movement Detail</h3>
            <div class="ptype-key">
              <span class="ptype stockin"><i></i>= Stock In</span>
              <span class="ptype sold"><i></i>= Sold</span>
              <span class="ptype damage"><i></i>= Damage</span>
              <span class="ptype return"><i></i>= Return</span>
            </div>
            <span class="badge" id="bdRange">—</span>
          </div>
          <div class="table-wrap">
            <table class="rep">
              <thead><tr>
                <th style="width:130px">Date</th>
                <th style="width:130px">Article Number</th>
                <th style="width:120px">Color</th>
                <th style="width:70px">Size</th>
                <th style="width:150px">Barcode</th>
                <th style="width:150px">Product Type</th>
              </tr></thead>
              <tbody id="bdBody"></tbody>
              <tfoot id="bdFoot"></tfoot>
            </table>
          </div>
        </div>
      </section>

      <!-- ── 8. BARCODE MANAGE ───────────────────────────── -->
      <section class="page" id="page-barcode">
        <div class="page-head">
          <div>
            <h2>Barcode Manage</h2>
            <p>Filter by date range to pull every barcode generated in that window. Labels print at 2&Prime; × 1.5&Prime;.</p>
          </div>
          <div class="head-actions">
            <button class="btn btn-ghost" id="pdfBtn">
              <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
              Download PDF
            </button>
            <button class="btn btn-primary" id="printBtn">
              <svg viewBox="0 0 24 24"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
              Print Labels
            </button>
          </div>
        </div>

        <div class="card no-print" style="margin-bottom:18px">
          <div class="card-body" style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap">
            <div style="flex:1;min-width:170px"><label class="lbl" for="bFrom">From Date</label>
              <input class="input" type="date" id="bFrom"></div>
            <div style="flex:1;min-width:170px"><label class="lbl" for="bTo">To Date</label>
              <input class="input" type="date" id="bTo"></div>
            <div style="flex:1;min-width:170px"><label class="lbl" for="bStatus">Status</label>
              <select class="input" id="bStatus">
                <option value="">All</option><option value="in">In Stock</option>
                <option value="out">Stock Out</option><option value="damaged">Damaged</option>
              </select></div>
            <div style="flex:1;min-width:170px"><label class="lbl" for="bArticle">Article No</label>
              <select class="input" id="bArticle"><option value="">All articles</option></select></div>
            <button class="btn btn-primary" id="bApply">Apply Filter</button>
            <button class="btn btn-quiet" id="bReset">Reset</button>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <h3>Label Sheet</h3>
            <span class="badge" id="bCount">0 labels</span>
          </div>
          <div class="card-body">
            <div class="label-grid" id="labelSheet"></div>
          </div>
        </div>
      </section>

      <!-- ── 9. USER ACCESS ──────────────────────────────── -->
      <section class="page" id="page-userAccess">
        <div class="page-head">
          <div>
            <h2>User Access</h2>
            <p>Everyone who can sign in, and the role that decides what they see.</p>
          </div>
          <div class="head-actions">
            <input class="input" id="usrSearch" placeholder="Search user id / name…" style="width:220px">
            <button class="btn btn-ghost" id="openRoleModal">
              <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg> Add New Role
            </button>
            <button class="btn btn-primary" id="openUserModal">
              <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg> Add New User
            </button>
          </div>
        </div>

        <div class="stats">
          <div class="stat"><div class="k">Total Users</div><div class="v" id="statUsers">0</div></div>
          <div class="stat"><div class="k">Active</div><div class="v accent" id="statActive">0</div></div>
          <div class="stat"><div class="k">Roles</div><div class="v" id="statRoles">0</div></div>
        </div>

        <div class="card">
          <div class="card-head"><h3>User List</h3><span class="badge" id="usrCount">0 users</span></div>
          <div class="table-wrap">
            <table>
              <thead><tr>
                <th style="width:130px">User ID</th>
                <th>User Name</th>
                <th style="width:180px">Role</th>
                <th style="width:250px">Action</th>
              </tr></thead>
              <tbody id="usrBody"></tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- ── 10. ROLE ACCESS ─────────────────────────────── -->
      <section class="page" id="page-roleAccess">
        <div class="page-head">
          <div>
            <h2>Role Access</h2>
            <p>Every role and the modules it can open. Open a role to change its access.</p>
          </div>
          <div class="head-actions">
            <button class="btn btn-primary" id="openRoleModal2">
              <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg> Add New Role
            </button>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3>Role List</h3><span class="badge" id="roleCount">0 roles</span></div>
          <div class="table-wrap">
            <table>
              <thead><tr>
                <th>Role Name</th>
                <th style="width:190px">Created Date</th>
                <th style="width:160px">Created By</th>
                <th style="width:260px">Action</th>
              </tr></thead>
              <tbody id="roleBody"></tbody>
            </table>
          </div>
        </div>
      </section>

    </div>
  </main>
</div>

<!-- ══ Modal: Add Article ════════════════════════════════ -->
<div class="modal-back" id="varModal">
  <div class="modal">
    <div class="modal-head">
      <h3>Article Numbers</h3>
      <button class="x" data-close>&times;</button>
    </div>
    <form id="varForm">
      <div class="modal-body">
        {{-- No "on the list now" pool here: the Article List table behind
             this modal already shows them, with the same remove rule. --}}
        <div class="field">
          <label for="vArticle">Add article numbers *</label>
          <input class="input" id="vArticle" placeholder="e.g. SH-1042" required>
          <div class="hint">
            These become selectable on <b>Add Product</b>. Press <b>Enter</b> or
            comma after each one.
          </div>
        </div>
        <div class="field">
          <label for="vImage">Article image</label>
          {{-- Optional. The visible control is the drop zone below; the real
               input is hidden because a native file button cannot be styled. --}}
          <input type="file" id="vImage" accept="image/jpeg,image/png,image/webp" hidden>
          <div class="image-drop" id="vImageDrop" tabindex="0" role="button"
               aria-label="Choose an article image">
            <img id="vImagePreview" alt="" hidden>
            <div class="image-drop-empty" id="vImageEmpty">
              <svg viewBox="0 0 24 24"><path d="M21 15V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10"/><path d="M3 16l5-5 4 4"/><circle cx="15" cy="8" r="1.4"/><path d="M18 15v6M15 18h6"/></svg>
              <span>Click to choose a photo</span>
            </div>
            <button type="button" class="image-drop-x" id="vImageClear" hidden
                    aria-label="Remove the chosen image">&times;</button>
          </div>
          <div class="hint">
            JPG, PNG or WebP, up to 4&nbsp;MB. Applies to the article numbers
            you add here.
          </div>
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn btn-ghost" data-close>Cancel</button>
        <button type="submit" class="btn btn-primary">Save Articles</button>
      </div>
    </form>
  </div>
</div>

<!-- ══ Modal: Master size list ═══════════════════════════ -->
<div class="modal-back" id="sizeModal">
  <div class="modal modal-sm">
    <div class="modal-head">
      <h3>Sizes</h3>
      <button class="x" data-close>&times;</button>
    </div>
    <form id="sizeForm">
      <div class="modal-body">
        <div class="field">
          <label>On the list now</label>
          {{-- Filled by renderSizeChips(); each chip carries a remove button
               for Super Admin, matching the delete rule on variants. --}}
          <div class="size-pool" id="sizePool"></div>
          <div class="hint" id="sizePoolHint"></div>
        </div>
        <div class="field">
          <label for="newSizes">Add sizes *</label>
          <input class="input" id="newSizes" placeholder="Type a size and press Enter…" required>
          <div class="hint">
            These become selectable on <b>Add Product</b>. Press <b>Enter</b> or
            comma after each one.
          </div>
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn btn-ghost" data-close>Cancel</button>
        <button type="submit" class="btn btn-primary">Save Sizes</button>
      </div>
    </form>
  </div>
</div>


<!-- ══ Modal: edit one article ═══════════════════════════ -->
<div class="modal-back" id="varEditModal">
  <div class="modal">
    <div class="modal-head">
      <h3>Edit Article</h3>
      <button class="x" data-close>&times;</button>
    </div>
    <form id="varEditForm">
      <div class="modal-body">
        <div class="field">
          <label for="evArticle">Article No *</label>
          <input class="input" id="evArticle" placeholder="e.g. SH-1042" required>
          {{-- Barcodes store the article as text, so a rename has to sweep
               them too. The count is filled in by openArticleEdit(). --}}
          <div class="hint" id="evArticleHint"></div>
        </div>
        <div class="field">
          <label for="evImage">Article image</label>
          <input type="file" id="evImage" accept="image/jpeg,image/png,image/webp" hidden>
          <div class="image-drop" id="evImageDrop" tabindex="0" role="button"
               aria-label="Choose an article image">
            <img id="evImagePreview" alt="" hidden>
            <div class="image-drop-empty" id="evImageEmpty">
              <svg viewBox="0 0 24 24"><path d="M21 15V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10"/><path d="M3 16l5-5 4 4"/><circle cx="15" cy="8" r="1.4"/><path d="M18 15v6M15 18h6"/></svg>
              <span>Click to choose a photo</span>
            </div>
            <button type="button" class="image-drop-x" id="evImageClear" hidden
                    aria-label="Remove the image">&times;</button>
          </div>
          <div class="hint">JPG, PNG or WebP, up to 4&nbsp;MB. The &times; removes it.</div>
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn btn-ghost" data-close>Cancel</button>
        <button type="submit" class="btn btn-primary">Save Changes</button>
      </div>
    </form>
  </div>
</div>
<!-- ══ Modal: master colour list ═════════════════════════ -->
<div class="modal-back" id="colorModal">
  <div class="modal modal-sm">
    <div class="modal-head">
      <h3>Colors</h3>
      <button class="x" data-close>&times;</button>
    </div>
    <form id="colorForm">
      <div class="modal-body">
        <div class="field">
          <label>On the list now</label>
          {{-- Filled by renderColorChips(); each chip carries a remove button
               for Super Admin, matching the delete rule on the other lists. --}}
          <div class="size-pool" id="colorPool"></div>
          <div class="hint" id="colorPoolHint"></div>
        </div>
        <div class="field">
          <label for="newColors">Add colours *</label>
          <input class="input" id="newColors" placeholder="Type a colour and press Enter…" required>
          <div class="hint">
            These become selectable on <b>Add Product</b>. Press <b>Enter</b> or
            comma after each one.
          </div>
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn btn-ghost" data-close>Cancel</button>
        <button type="submit" class="btn btn-primary">Save Colors</button>
      </div>
    </form>
  </div>
</div>

<!-- ══ Modal: Add Customer ═══════════════════════════════ -->
<div class="modal-back" id="custModal">
  <div class="modal">
    <div class="modal-head">
      <h3>Add Customer</h3>
      <button class="x" data-close>&times;</button>
    </div>
    <form id="custForm">
      <div class="modal-body">
        <div class="row">
          <div class="field"><label for="cName">Customer Name *</label>
            <input class="input" id="cName" placeholder="e.g. Rahim Shoe House" required></div>
          <div class="field"><label for="cPhone">Phone *</label>
            <input class="input" id="cPhone" placeholder="01XXXXXXXXX" required></div>
        </div>
        <div class="field"><label for="cEmail">Email</label>
          <input class="input" id="cEmail" type="email" placeholder="name@example.com"></div>
        <div class="field"><label for="cAddr">Address</label>
          <textarea class="input" id="cAddr" placeholder="Shop / house, road, area, city" style="min-height:72px"></textarea></div>
        <div class="field"><label for="cNote">Note</label>
          <input class="input" id="cNote" placeholder="e.g. wholesale buyer, regular customer"></div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn btn-ghost" data-close>Cancel</button>
        <button type="submit" class="btn btn-primary">Save Customer</button>
      </div>
    </form>
  </div>
</div>

<!-- ══ Modal: Customer Purchase History ══════════════════ -->
<div class="modal-back" id="histModal">
  <div class="modal modal-wide">
    <div class="modal-head">
      <h3 id="histTitle">Purchase History</h3>
      <button class="x" data-close>&times;</button>
    </div>
    <div class="modal-body" id="histBody"></div>
    <div class="modal-foot">
      <button type="button" class="btn btn-ghost" id="histExport">
        <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
        Excel Export
      </button>
      <button type="button" class="btn btn-primary" data-close>Close</button>
    </div>
  </div>
</div>

<!-- ══ Modal: Add New User ═══════════════════════════════ -->
<div class="modal-back" id="userModal">
  <div class="modal">
    <div class="modal-head">
      <h3>Add New User</h3>
      <button class="x" data-close>&times;</button>
    </div>
    <form id="userForm">
      <div class="modal-body">
        <div class="row">
          <div class="field"><label for="uName">Full Name *</label>
            <input class="input" id="uName" placeholder="e.g. Md Shazid" required></div>
          <div class="field"><label for="uUser">User ID *</label>
            <input class="input" id="uUser" placeholder="e.g. mdshazid" autocomplete="off" required>
            <div class="hint">This is what they type on the login screen.</div></div>
        </div>
        <div class="row">
          <div class="field"><label for="uPass">Password *</label>
            <input class="input" id="uPass" type="text" placeholder="Minimum 6 characters" autocomplete="new-password" required></div>
          <div class="field"><label for="uRole">Role *</label>
            <select class="input" id="uRole" required></select>
            <div class="hint">The role decides which modules they can open.</div></div>
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn btn-ghost" data-close>Cancel</button>
        <button type="submit" class="btn btn-primary">Save User</button>
      </div>
    </form>
  </div>
</div>

<!-- ══ Modal: Add New Role ═══════════════════════════════ -->
<div class="modal-back" id="roleModal">
  <div class="modal">
    <div class="modal-head">
      <h3>Add New Role</h3>
      <button class="x" data-close>&times;</button>
    </div>
    <form id="roleForm">
      <div class="modal-body">
        <div class="field"><label for="rName">Role Name *</label>
          <input class="input" id="rName" placeholder="e.g. Store Manager" required></div>
        <div class="field">
          <label>Module Access</label>
          <div class="perm-grid" id="roleFormPerms"></div>
          <div class="hint">You can change this any time from Role Access → View Access.</div>
        </div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn btn-ghost" data-close>Cancel</button>
        <button type="submit" class="btn btn-primary">Save Role</button>
      </div>
    </form>
  </div>
</div>

<!-- ══ Modal: Role Access (view / edit permissions) ══════ -->
<div class="modal-back" id="accessModal">
  <div class="modal">
    <div class="modal-head">
      <h3 id="accessTitle">Role Access</h3>
      <button class="x" data-close>&times;</button>
    </div>
    <div class="modal-body">
      <div class="access-bar">
        <span class="hint" id="accessHint">Turn a module on to let this role open it.</span>
        <div class="head-actions">
          <button type="button" class="btn btn-quiet btn-sm" id="accessNone">Clear all</button>
          <button type="button" class="btn btn-quiet btn-sm" id="accessAll">Select all</button>
        </div>
      </div>
      <div class="perm-grid" id="accessPerms"></div>
    </div>
    <div class="modal-foot">
      <button type="button" class="btn btn-ghost" data-close>Cancel</button>
      <button type="button" class="btn btn-primary" id="accessSave">Save Access</button>
    </div>
  </div>
</div>

<!-- ══ Modal: Reset Password ═════════════════════════════ -->
<div class="modal-back" id="passModal">
  <div class="modal modal-sm">
    <div class="modal-head">
      <h3 id="passTitle">Reset Password</h3>
      <button class="x" data-close>&times;</button>
    </div>
    <form id="passForm">
      <div class="modal-body">
        <div class="field"><label for="pNew">New Password *</label>
          <input class="input" id="pNew" type="text" placeholder="Minimum 6 characters" autocomplete="new-password" required>
          <div class="hint">Share it with the user — it is stored as typed.</div></div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn btn-ghost" data-close>Cancel</button>
        <button type="submit" class="btn btn-primary">Update Password</button>
      </div>
    </form>
  </div>
</div>

{{-- Shared by every row of the Article List: clicking a row's image button
     opens this one input, so the table does not carry one per article. --}}
<input type="file" id="rowImage" accept="image/jpeg,image/png,image/webp" hidden>


<!-- ══ Modal: barcodes available to sell ═════════════════ -->
<div class="modal-back" id="stockModal">
  <div class="modal modal-wide">
    <div class="modal-head">
      <h3>Available Barcodes</h3>
      <button class="x" data-close>&times;</button>
    </div>
    <div class="modal-body">
      <div class="access-bar">
        <input class="input" id="stockSearch" placeholder="Search barcode / article / color / size…"
               style="max-width:340px">
        <span class="badge" id="stockCount">0</span>
      </div>
      {{-- Filled by renderStockPicker(); a row adds that pair to the cart. --}}
      <div class="table-wrap">
        <table class="hist-table">
          <thead><tr>
            <th style="width:64px">Image</th>
            <th style="width:150px">Barcode</th>
            <th style="width:130px">Article No</th>
            <th style="width:120px">Color</th>
            <th style="width:70px">Size</th>
            <th style="width:110px" class="num">Price</th>
            <th style="width:110px"></th>
          </tr></thead>
          <tbody id="stockBody"></tbody>
        </table>
      </div>
    </div>
    <div class="modal-foot">
      <button type="button" class="btn btn-primary" data-close>Done</button>
    </div>
  </div>
</div>
<div class="toast" id="toast"></div>

{{--
  Put the remembered page on screen the instant the markup is parsed.

  This has to be inline. app.js does the same thing properly, but it is an
  external file: the browser paints the parsed HTML while that download is
  still in flight, so the page marked active in the markup — Product Variable
  — is what you see until it lands. On a slow connection that was most of a
  second of the wrong screen before it jumped.

  Deliberately dumb: no permission check (nobody is loaded yet) and no error
  path. app.js re-applies this authoritatively a moment later and moves the
  user if their role cannot open the page.
--}}
<script>
(function () {
  try {
    var el, page = (location.hash || "").replace(/^#/, "");
    if (!document.getElementById("page-" + page)) {
      page = localStorage.getItem("stockflow.page") || "";
    }
    el = document.getElementById("page-" + page);
    if (!el || el.classList.contains("active")) return;

    var open = document.querySelector(".page.active");
    if (open) open.classList.remove("active");
    el.classList.add("active");

    var was = document.querySelector(".sidebar .nav-item.active");
    if (was) was.classList.remove("active");
    var tab = document.querySelector('.sidebar .nav-item[data-page="' + page + '"]');
    if (tab) {
      tab.classList.add("active");
      var group = tab.closest(".nav-group");
      if (group) group.classList.add("open");
    }
  } catch (e) { /* app.js will sort it out */ }
  finally {
    /* Whatever happened above, the pages must become visible again — the
       head put this in place expecting us to take it away. */
    var hide = document.getElementById("bootHide");
    if (hide) hide.remove();
  }
})();
</script>

<script src="{{ asset("js/barcode.js") }}?v={{ filemtime(public_path("js/barcode.js")) }}"></script>
<script src="{{ asset("js/combo.js") }}?v={{ filemtime(public_path("js/combo.js")) }}"></script>
<script src="{{ asset("js/app.js") }}?v={{ filemtime(public_path("js/app.js")) }}"></script>
</body>
</html>
