/* Core Dynamics — demo showcase. Reads CD_CONFIG.DEMOS (site-config.js). */
(function () {
  "use strict";
  var list = (window.CD_CONFIG && window.CD_CONFIG.DEMOS) || [];
  var grid = document.getElementById("demoGrid");
  var empty = document.getElementById("demoEmpty");
  if (!grid || !list.length) return;

  function safeUrl(u) { try { var x = new URL(u, location.href); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch (e) { return ""; } }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }

  list.forEach(function (d) {
    var url = safeUrl(d.url); if (!url || !d.title) return;
    var card = el("article", "demo-card glass reveal in");

    var shot = el("div", "demo-shot");
    shot.appendChild(el("span", "demo-badge", "Demo project"));
    if (d.image) {
      var img = new Image(); img.src = d.image; img.alt = d.title + " preview"; img.loading = "lazy"; img.decoding = "async";
      shot.appendChild(img);
    } else {
      var f = document.createElement("iframe");
      f.src = url; f.title = d.title + " live preview"; f.loading = "lazy"; f.tabIndex = -1;
      f.setAttribute("aria-hidden", "true"); f.setAttribute("sandbox", "allow-scripts allow-same-origin");
      f.referrerPolicy = "no-referrer";
      shot.appendChild(f);
      var scale = function () { f.style.transform = "scale(" + (shot.clientWidth / 1280) + ")"; };
      scale(); window.addEventListener("resize", scale);
      if ("ResizeObserver" in window) new ResizeObserver(scale).observe(shot);
    }
    card.appendChild(shot);

    var body = el("div", "demo-body");
    if (d.type) body.appendChild(el("div", "eyebrow", d.type));
    body.appendChild(el("h3", "", d.title));
    if (d.description) body.appendChild(el("p", "", d.description));
    if (d.tags && d.tags.length) {
      var tg = el("div", "demo-tags"); d.tags.forEach(function (t) { tg.appendChild(el("span", "", t)); }); body.appendChild(tg);
    }
    var a = el("a", "btn-primary", "Open live demo →"); a.href = url; a.target = "_blank"; a.rel = "noopener";
    a.setAttribute("aria-label", "Open live demo of " + d.title + " in a new tab");
    body.appendChild(a);
    card.appendChild(body);
    grid.appendChild(card);
  });

  if (grid.children.length) {
    if (empty) empty.hidden = true;
    var note = el("p", "demo-note", "These are sample websites built by Core Dynamics to show our approach. They are demos, not client work.");
    grid.parentNode.insertBefore(note, grid.nextSibling);
  }
})();
