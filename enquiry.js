/* Core Dynamics — client enquiry form.
   Validates in the browser, then POSTs JSON to the Google Apps Script web app.
   No secrets live here; the endpoint URL comes from site-config.js. */
(function () {
  "use strict";
  var CFG = window.CD_CONFIG || {};
  var form = document.getElementById("enquiryForm");
  if (!form) return;

  var MIN_FILL_MS = 3000;                 // humans take longer than this to fill the form
  var openedAt = Date.now();
  var statusEl = document.getElementById("formStatus");
  var submitBtn = form.querySelector('button[type="submit"]');
  var btnLabel = submitBtn.textContent;
  var notice = document.getElementById("endpointNotice");
  var turnstileToken = "";
  var busy = false;

  /* ---------- business email (single source of truth) ---------- */
  document.querySelectorAll("[data-contact-email]").forEach(function (a) {
    if (CFG.CONTACT_EMAIL) { a.textContent = CFG.CONTACT_EMAIL; a.href = "mailto:" + CFG.CONTACT_EMAIL; }
    else { a.closest("[data-contact-wrap]") ? a.closest("[data-contact-wrap]").hidden = true : (a.hidden = true); }
  });

  /* ---------- honest state when backend isn't connected ---------- */
  if (!CFG.ENQUIRY_ENDPOINT) {
    notice.hidden = false;
    notice.textContent = "Online enquiries are not switched on yet, so this form cannot deliver your message by itself. " +
      (CFG.CONTACT_EMAIL ? "Pressing send will open your email app with your details ready to send to " + CFG.CONTACT_EMAIL + "." : "Please check back soon.");
  }

  /* ---------- plan buttons in the pricing section ---------- */
  window.selectPlan = function (planName) {
    var pk = document.getElementById("package"), sv = document.getElementById("service");
    if (pk) pk.value = planName;
    if (sv && !sv.value && /Website/.test(planName)) sv.value = "Business website";
  };

  /* ---------- callback-time field only when a callback is requested ---------- */
  var cbWrap = document.getElementById("callbackWrap");
  form.querySelectorAll('input[name="contactMethod"]').forEach(function (r) {
    r.addEventListener("change", function () { cbWrap.hidden = form.contactMethod.value !== "Scheduled callback"; });
  });

  /* ---------- Cloudflare Turnstile (optional) ---------- */
  if (CFG.TURNSTILE_SITE_KEY) {
    var s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true; s.defer = true;
    s.onload = function () {
      window.turnstile.render("#turnstileBox", {
        sitekey: CFG.TURNSTILE_SITE_KEY,
        callback: function (t) { turnstileToken = t; },
        "expired-callback": function () { turnstileToken = ""; },
        "error-callback": function () { turnstileToken = ""; }
      });
    };
    document.head.appendChild(s);
  }

  /* ---------- validation ---------- */
  var RULES = {
    name:    function (v) { return v.length >= 2 && v.length <= 80 ? "" : "Please enter your full name (2–80 characters)."; },
    phone:   function (v) { var d = v.replace(/\D/g, ""); return /^[0-9+()\-.\s]{7,20}$/.test(v) && d.length >= 7 && d.length <= 15 ? "" : "Enter a valid phone number (7–15 digits)."; },
    email:   function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 120 ? "" : "Enter a valid email address."; },
    company: function (v) { return v.length <= 100 ? "" : "Company name is too long (max 100)."; },
    service: function (v) { return v ? "" : "Please choose a service."; },
    message: function (v) { return v.length >= 20 && v.length <= 2000 ? "" : v.length < 20 ? "Please describe your project in at least 20 characters." : "Please keep the description under 2000 characters."; },
    callbackTime: function (v) { return v.length <= 80 ? "" : "Please keep this under 80 characters."; },
    consent: function () { return form.consent.checked ? "" : "Please tick the box so we can use your details to reply."; }
  };

  function setError(field, msg) {
    var el = form.querySelector('[data-field="' + field + '"]');
    if (!el) return;
    var err = el.querySelector(".field-error");
    var input = el.querySelector("input, select, textarea");
    err.textContent = msg;
    if (input) { input.setAttribute("aria-invalid", msg ? "true" : "false"); }
    el.classList.toggle("has-error", !!msg);
  }
  function value(name) { var f = form.elements[name]; return f ? String(f.value || "").trim() : ""; }
  function validateField(name) { var m = RULES[name](value(name)); setError(name, m); return !m; }

  Object.keys(RULES).forEach(function (n) {
    var f = form.elements[n]; if (!f) return;
    f.addEventListener("blur", function () { validateField(n); });
    f.addEventListener("input", function () { if (f.getAttribute("aria-invalid") === "true") validateField(n); });
    f.addEventListener("change", function () { if (f.getAttribute("aria-invalid") === "true") validateField(n); });
  });

  function setStatus(msg, kind, html) {
    statusEl.className = "form-status" + (kind ? " " + kind : "");
    if (html) statusEl.innerHTML = msg; else statusEl.textContent = msg;
  }
  function setBusy(b) {
    busy = b; submitBtn.disabled = b; form.setAttribute("aria-busy", b ? "true" : "false");
    submitBtn.textContent = b ? "Sending…" : btnLabel; submitBtn.classList.toggle("loading", b);
  }
  function mailtoHref(p) {
    var body = "Name: " + p.name + "\nPhone: " + p.phone + "\nEmail: " + p.email + "\nCompany: " + p.company +
      "\nService: " + p.service + "\nPackage: " + p.package + "\nBudget: " + p.budget +
      "\nPreferred contact: " + p.contactMethod + (p.callbackTime ? " (" + p.callbackTime + ")" : "") + "\n\n" + p.message;
    return "mailto:" + CFG.CONTACT_EMAIL + "?subject=" + encodeURIComponent("Website enquiry: " + p.service) + "&body=" + encodeURIComponent(body);
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  /* ---------- submit ---------- */
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy) return;
    setStatus("", "");

    var firstBad = null;
    Object.keys(RULES).forEach(function (n) { if (!validateField(n) && !firstBad) firstBad = n; });
    if (firstBad) {
      setStatus("Please fix the highlighted fields and try again.", "err");
      var el = form.querySelector('[data-field="' + firstBad + '"] input, [data-field="' + firstBad + '"] select, [data-field="' + firstBad + '"] textarea');
      if (el) el.focus();
      return;
    }

    var payload = {
      name: value("name"), phone: value("phone"), email: value("email"), company: value("company"),
      service: value("service"), package: value("package") || "Not specified", budget: value("budget") || "Not specified",
      message: value("message"), contactMethod: form.contactMethod.value, callbackTime: value("callbackTime"),
      consent: true,
      hp: value("hp_url"),                       // honeypot: must stay empty
      elapsed: Date.now() - openedAt,            // time-trap
      turnstile: turnstileToken,
      page: location.origin + location.pathname
    };

    /* Backend not connected: be honest, fall back to email. */
    if (!CFG.ENQUIRY_ENDPOINT) {
      if (CFG.CONTACT_EMAIL) {
        location.href = mailtoHref(payload);
        setStatus("Your email app should open with your enquiry. It has <strong>not</strong> been sent until you press Send there.", "info", true);
      } else {
        setStatus("Online enquiries are not available yet. Please try again later.", "err");
      }
      return;
    }
    if (CFG.TURNSTILE_SITE_KEY && !turnstileToken) {
      setStatus("Please complete the quick security check below the form, then send again.", "err");
      return;
    }

    setBusy(true);
    var ctrl = ("AbortController" in window) ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 20000);

    /* text/plain avoids a CORS preflight, which Apps Script cannot answer */
    fetch(CFG.ENQUIRY_ENDPOINT, {
      method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload), signal: ctrl ? ctrl.signal : undefined, redirect: "follow"
    }).then(function (res) {
      if (!res.ok) throw new Error("http " + res.status);
      return res.json();
    }).then(function (data) {
      if (!data || data.ok !== true) {
        var err = new Error((data && data.error) || "rejected"); err.code = data && data.code; throw err;
      }
      setStatus("Thank you, " + escapeHtml(payload.name.split(" ")[0]) + ". Your enquiry has been received. We’ll reply by " +
        (payload.contactMethod === "Scheduled callback" ? "arranging a callback" : "email") + ". Please don’t resubmit.", "ok", true);
      form.reset(); cbWrap.hidden = true; openedAt = Date.now();
      Object.keys(RULES).forEach(function (n) { setError(n, ""); });
      if (window.turnstile && CFG.TURNSTILE_SITE_KEY) { window.turnstile.reset(); turnstileToken = ""; }
      mirrorToFirebase(payload);
    }).catch(function (err) {
      var msg;
      if (err && err.code === "rate_limited") msg = "You’ve sent several enquiries in a short time. Please wait a few minutes and try again.";
      else if (err && err.code === "invalid") msg = "Some details were rejected: " + escapeHtml(err.message) + ". Please check them and try again.";
      else msg = "We couldn’t send your enquiry just now.";
      if (!(err && (err.code === "rate_limited" || err.code === "invalid")) && CFG.CONTACT_EMAIL) {
        msg += " Please <a href=\"" + mailtoHref(payload).replace(/"/g, "&quot;") + "\">email us directly</a> and nothing is lost.";
      }
      setStatus(msg, "err", true);
    }).finally(function () { clearTimeout(timer); setBusy(false); });
  });

  /* Optional legacy mirror to the admin app. Off by default (see site-config.js). */
  function mirrorToFirebase(p) {
    if (!CFG.FIREBASE_LEAD_MIRROR || !CFG.FIREBASE_DB_URL) return;
    var id = Date.now().toString();
    fetch(CFG.FIREBASE_DB_URL + "/leads/" + id + ".json", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: id, name: p.name, phone: p.phone || p.email, service: p.service, packagePlan: p.package,
        paymentStatus: "Unpaid", totalFee: "", paidAmount: "",
        notes: (p.company ? "Business: " + p.company + " | " : "") + "Email: " + p.email + " | " + p.message,
        status: "New", date: new Date().toLocaleDateString()
      })
    }).catch(function () {});
  }
})();
