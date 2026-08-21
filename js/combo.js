/* Searchable combobox — replaces native select/datalist.
   • type to filter
   • shows 7 options, then scrolls
   • keyboard: ↑ ↓ Enter Esc
   Combo.fromSelect(selectEl)              -> keeps the <select> as the value holder
   Combo.fromInput(inputEl, itemsFn, opt)  -> free-text input with suggestions */
(function (global) {
  "use strict";

  var openPanel = null;

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function mark(text, q) {
    if (!q) return esc(text);
    var i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return esc(text);
    return esc(text.slice(0, i)) + "<b>" + esc(text.slice(i, i + q.length)) + "</b>" +
           esc(text.slice(i + q.length));
  }

  function build(host, cfg) {
    var wrap  = el("div", "combo");
    var input = el("input", "input combo-input");
    var arrow = el("button", "combo-arrow");
    var panel = el("div", "combo-panel");

    arrow.type = "button";
    arrow.tabIndex = -1;
    arrow.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>';
    input.placeholder = cfg.placeholder || "";
    input.autocomplete = "off";
    if (cfg.required) input.required = true;

    host.parentNode.insertBefore(wrap, host);
    wrap.appendChild(input);
    wrap.appendChild(arrow);
    wrap.appendChild(panel);
    wrap.appendChild(host);            // value holder stays inside, hidden
    host.classList.add("combo-hidden");
    // move HTML5 validation to the visible field so the browser can focus it
    if (host.required) { host.required = false; input.required = true; }

    var items = [], active = -1, isOpen = false;

    function close() {
      if (!isOpen) return;
      isOpen = false; wrap.classList.remove("open");
      panel.innerHTML = ""; active = -1;
      if (openPanel === close) openPanel = null;
      if (!cfg.free) input.value = cfg.labelOf(host.value) || "";
    }

    function open(filter) {
      if (openPanel && openPanel !== close) openPanel();
      var q = (filter || "").trim();
      items = cfg.items().filter(function (o) {
        return !q || o.label.toLowerCase().indexOf(q.toLowerCase()) > -1;
      });

      if (!items.length) {
        panel.innerHTML = '<div class="combo-none">' +
          (q ? 'No match for “' + esc(q) + '”' + (cfg.free ? ' — press Enter to use it' : '') : 'Nothing to show') +
          '</div>';
      } else {
        panel.innerHTML = items.map(function (o, i) {
          return '<div class="combo-opt' + (o.value === host.value ? " sel" : "") + '" data-i="' + i + '">' +
                   (o.dot ? '<i class="combo-dot" style="background:' + esc(o.dot) + '"></i>' : "") +
                   '<span>' + mark(o.label, q) + '</span>' +
                   (o.sub ? '<em>' + esc(o.sub) + '</em>' : "") +
                 '</div>';
        }).join("");
      }
      isOpen = true; wrap.classList.add("open");
      openPanel = close;
      active = -1;
    }

    function pick(i) {
      var o = items[i];
      if (!o) return;
      host.value = o.value;
      input.value = o.label;
      host.dispatchEvent(new Event("change", { bubbles: true }));
      close();
    }

    function highlight(next) {
      var opts = panel.querySelectorAll(".combo-opt");
      if (!opts.length) return;
      active = (next + opts.length) % opts.length;
      opts.forEach(function (o, i) { o.classList.toggle("on", i === active); });
      opts[active].scrollIntoView({ block: "nearest" });
    }

    input.addEventListener("focus", function () { open(cfg.free ? input.value : ""); });
    input.addEventListener("input", function () {
      if (cfg.free) host.value = input.value;
      open(input.value);
    });
    arrow.addEventListener("mousedown", function (e) {
      e.preventDefault();
      if (isOpen) { close(); } else { input.focus(); open(""); }
    });
    panel.addEventListener("mousedown", function (e) {
      var opt = e.target.closest(".combo-opt");
      if (!opt) return;
      e.preventDefault();
      pick(+opt.dataset.i);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); if (!isOpen) open(cfg.free ? input.value : ""); highlight(active + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); highlight(active - 1); }
      else if (e.key === "Enter") {
        if (isOpen && active > -1) { e.preventDefault(); pick(active); }
        else if (isOpen) { close(); if (!cfg.free) e.preventDefault(); }
      } else if (e.key === "Escape") { if (isOpen) { e.stopPropagation(); close(); } }
    });
    document.addEventListener("mousedown", function (e) {
      if (!wrap.contains(e.target)) close();
    });

    // keep the visible input in sync when code changes the hidden value
    var api = {
      sync: function () { input.value = cfg.labelOf(host.value) || (cfg.free ? host.value : ""); },
      clear: function () { host.value = ""; input.value = ""; }
    };
    host._combo = api;
    api.sync();
    return api;
  }

  var Combo = {
    /* Native <select> stays in the DOM as the value holder, so existing
       code that reads selectEl.value / listens for "change" keeps working. */
    fromSelect: function (sel, opts) {
      opts = opts || {};
      var placeholder = opts.placeholder ||
        (sel.options[0] && !sel.options[0].value ? sel.options[0].textContent.trim() : "Select…");
      return build(sel, {
        free: false,
        placeholder: placeholder,
        items: function () {
          return Array.prototype.slice.call(sel.options)
            .filter(function (o) { return o.value !== ""; })
            .map(function (o) { return { value: o.value, label: o.textContent.trim(), dot: o.dataset.dot }; });
        },
        labelOf: function (v) {
          var o = Array.prototype.slice.call(sel.options).find(function (x) { return x.value === v; });
          return o && o.value ? o.textContent.trim() : "";
        }
      });
    },

    /* Free-text input with suggestions (e.g. Color). */
    fromInput: function (inp, itemsFn, opts) {
      opts = opts || {};
      var ph = inp.placeholder;
      inp.classList.add("combo-hidden");
      return build(inp, {
        free: true,
        placeholder: ph,
        required: inp.required,
        items: function () {
          return itemsFn().map(function (o) {
            return typeof o === "string" ? { value: o, label: o, dot: opts.dot ? opts.dot(o) : null } : o;
          });
        },
        labelOf: function (v) { return v; }
      });
    }
  };

  global.Combo = Combo;
})(window);
