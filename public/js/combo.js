/* Searchable combobox — replaces native select/datalist.
   • type to filter
   • shows 7 options, then scrolls
   • keyboard: ↑ ↓ Enter Esc
   Combo.fromSelect(selectEl)              -> keeps the <select> as the value holder
   Combo.fromInput(inputEl, itemsFn, opt)  -> free-text input with suggestions */
(function (global) {
  "use strict";

  var openPanel = null;
  var PANEL_MAX = 266;   // matches the CSS ceiling: 7 rows of 38px

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
    var wrap  = el("div", "combo" + (cfg.multi ? " combo-multi" : ""));
    var chips = cfg.multi ? el("div", "combo-chips") : null;
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
    if (chips) wrap.appendChild(chips);
    wrap.appendChild(input);
    wrap.appendChild(arrow);
    wrap.appendChild(panel);
    wrap.appendChild(host);            // value holder stays inside, hidden
    host.classList.add("combo-hidden");
    // move HTML5 validation to the visible field so the browser can focus it
    if (host.required) { host.required = false; input.required = true; }

    var items = [], active = -1, isOpen = false;
    var picked = [];                   // multi mode only

    /* ── multi-select helpers ─────────────────────────────── */
    function has(v) {
      return picked.some(function (p) { return p.toLowerCase() === String(v).toLowerCase(); });
    }
    function syncHost() {
      /* Anything reading .value still sees a plain string; code that wants the
         list calls api.values(). */
      host.value = picked.join(", ");
      host.dispatchEvent(new Event("change", { bubbles: true }));
    }
    function drawChips() {
      if (!chips) return;
      chips.innerHTML = picked.map(function (v, i) {
        return '<span class="combo-chip">' + esc(v) +
               '<button type="button" class="combo-chip-x" data-chip="' + i + '"' +
               ' aria-label="Remove ' + esc(v) + '">&times;</button></span>';
      }).join("");
      // the field only needs prompting text while it is still empty
      input.placeholder = picked.length ? "" : (cfg.placeholder || "");
      // a required multi field is satisfied by the chips, not by the text box
      if (cfg.required) input.required = !picked.length;
    }
    function add(v) {
      v = String(v == null ? "" : v).trim();
      if (!v || has(v)) return false;
      picked.push(v);
      drawChips(); syncHost();
      return true;
    }
    function removeAt(i) {
      picked.splice(i, 1);
      drawChips(); syncHost();
    }

    function close() {
      if (!isOpen) return;
      isOpen = false; wrap.classList.remove("open");
      panel.innerHTML = ""; active = -1;
      if (openPanel === close) openPanel = null;
      if (cfg.multi) {
        /* Keep what was typed. Clicking Save fires mousedown first, which
           lands here — throwing the text away meant a size typed and saved
           without pressing Enter vanished before the form could read it. */
        if (input.value.trim()) add(input.value);
        input.value = "";
      }
      else if (!cfg.free) input.value = cfg.labelOf(host.value) || "";
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
          var on = cfg.multi ? has(o.value) : o.value === host.value;
          return '<div class="combo-opt' + (on ? " sel" : "") + '" data-i="' + i + '">' +
                   (o.dot ? '<i class="combo-dot" style="background:' + esc(o.dot) + '"></i>' : "") +
                   '<span>' + mark(o.label, q) + '</span>' +
                   (o.sub ? '<em>' + esc(o.sub) + '</em>' : "") +
                 '</div>';
        }).join("");
      }
      isOpen = true; wrap.classList.add("open");
      openPanel = close;
      active = -1;
      place();
    }

    /* Open downwards by default, upwards when the list would otherwise spill
       past the bottom of its container. Inside a dialog the container is the
       dialog, not the window: a panel left hanging over the footer covers
       Save, and the click that dismisses it never reaches the button. */
    function place() {
      wrap.classList.remove("drop-up");
      /* Measure the panel at its natural height. Leaving last open's cap in
         place would feed that number back into the decision below and make
         the direction flip-flop between openings. */
      panel.style.maxHeight = "";

      // NB: not `host` — that name is the value-holder element in this scope.
      var dialog = wrap.closest(".modal");
      var bounds = dialog ? dialog.getBoundingClientRect() : null;
      var limit = bounds ? bounds.bottom : window.innerHeight;
      var ceiling = bounds ? bounds.top : 0;

      var box = wrap.getBoundingClientRect();
      var need = panel.offsetHeight + 8;
      var below = limit - box.bottom;
      var above = box.top - ceiling;

      // Only flip when it actually helps — otherwise keep the natural direction.
      var up = below < need && above > below;
      if (up) wrap.classList.add("drop-up");

      /* Scroll inside the room we have rather than spilling over the header
         (or the page). The CSS max-height stays the ceiling. */
      var room = Math.max(120, (up ? above : below) - 12);
      panel.style.maxHeight = Math.min(room, PANEL_MAX) + "px";
    }

    function pick(i) {
      var o = items[i];
      if (!o) return;
      if (cfg.multi) {
        /* Toggle, and keep the list open so several can be picked in a row. */
        if (has(o.value)) {
          removeAt(picked.findIndex(function (p) {
            return p.toLowerCase() === String(o.value).toLowerCase();
          }));
        } else {
          add(o.value);
        }
        input.value = "";
        open("");
        return;
      }
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

    /* Opening the list shows all of it, never a list filtered down to the one
       value already in the box — you open it to see the others. Filtering is
       what typing is for, handled below. */
    input.addEventListener("focus", function () { open(""); });
    /* Focus alone is not enough: after picking an option the field keeps
       focus, so clicking it again to change your mind fires no focus event
       and the list would stay shut. */
    input.addEventListener("mousedown", function () {
      if (!isOpen) open("");
    });
    input.addEventListener("input", function () {
      if (cfg.free) host.value = input.value;
      open(input.value);
    });
    arrow.addEventListener("mousedown", function (e) {
      e.preventDefault();
      if (isOpen) { close(); } else { input.focus(); open(""); }
    });
    // clicking the empty space of a multi field should focus the text box
    if (cfg.multi) {
      wrap.addEventListener("mousedown", function (e) {
        if (e.target === wrap || e.target === chips) { e.preventDefault(); input.focus(); }
      });
      chips.addEventListener("click", function (e) {
        var x = e.target.closest(".combo-chip-x");
        if (!x) return;
        e.preventDefault();
        removeAt(+x.dataset.chip);
        if (isOpen) open(input.value);
      });
    }
    panel.addEventListener("mousedown", function (e) {
      var opt = e.target.closest(".combo-opt");
      if (!opt) return;
      e.preventDefault();
      pick(+opt.dataset.i);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); if (!isOpen) open(""); highlight(active + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); highlight(active - 1); }
      else if (e.key === "Enter") {
        if (isOpen && active > -1) { e.preventDefault(); pick(active); }
        else if (cfg.multi) {
          /* Enter commits whatever was typed, so a size that is not in the
             suggestion list can still be added. */
          e.preventDefault();
          if (add(input.value)) { input.value = ""; open(""); }
        }
        else if (isOpen) { close(); if (!cfg.free) e.preventDefault(); }
      }
      else if (cfg.multi && (e.key === "," || e.key === "Tab") && input.value.trim()) {
        /* Comma is how people naturally type a list of sizes. */
        e.preventDefault();
        if (add(input.value)) { input.value = ""; open(""); }
      }
      else if (cfg.multi && e.key === "Backspace" && !input.value && picked.length) {
        e.preventDefault(); removeAt(picked.length - 1);
      }
      else if (e.key === "Escape") {
        if (!isOpen) return;
        e.stopPropagation();
        /* Escape means discard — clear first so close() has nothing to keep. */
        if (cfg.multi) input.value = "";
        close();
      }
    });
    /* Pasting "40, 41, 42" should become three chips, not one. */
    if (cfg.multi) {
      input.addEventListener("paste", function (e) {
        var text = (e.clipboardData || window.clipboardData).getData("text");
        if (!text || text.indexOf(",") < 0) return;
        e.preventDefault();
        text.split(/[,\n]/).forEach(add);
        input.value = ""; open("");
      });
    }
    /* Capture phase on purpose: picking an option re-renders the panel, which
       detaches the clicked node. By the time a bubbling listener ran, the
       target would no longer be inside the wrap and this would read as a
       click-outside and close the panel mid-selection. */
    document.addEventListener("mousedown", function (e) {
      if (!wrap.contains(e.target)) close();
    }, true);

    // keep the visible input in sync when code changes the hidden value
    var api = {
      sync: function () {
        if (cfg.multi) { drawChips(); return; }
        input.value = cfg.labelOf(host.value) || (cfg.free ? host.value : "");
      },
      clear: function () {
        picked = [];
        host.value = ""; input.value = "";
        drawChips();
      },
      values: function () { return picked.slice(); },
      add: add,
      /* Turn whatever is still sitting in the text box into a chip. Typing a
         value and pressing Save straight away is the obvious thing to do, so
         a caller reads the field through this rather than losing that entry
         because no Enter was pressed. */
      commit: function () {
        if (!cfg.multi || !input.value.trim()) return false;
        var added = add(input.value);
        input.value = "";
        close();
        return added;
      },
      /* The host input is visually hidden, so callers need a way to reach the
         real text box (validation messages, "fix this field" focus). */
      focus: function () { input.focus(); }
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
    },

    /* Same suggestion list, but the picks pile up as removable chips instead
       of replacing each other (e.g. Size, where one article ships in many).
       Read the result with api.values(); the input's .value stays a readable
       comma-joined string for anything that still reads it. */
    multiFromInput: function (inp, itemsFn, opts) {
      opts = opts || {};
      var ph = inp.placeholder;
      inp.classList.add("combo-hidden");
      return build(inp, {
        multi: true,
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
