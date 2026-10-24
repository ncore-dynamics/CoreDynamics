/**
 * Core Dynamics — enquiry backend (Google Apps Script web app)
 *
 * Receives JSON from the website form, validates it again on the server,
 * and appends one row to the "Enquiries" sheet of the spreadsheet this
 * script is bound to. No secrets are stored in this file: optional settings
 * live in Project Settings > Script Properties.
 *
 * Script Properties (all optional):
 *   NOTIFY_EMAIL      address to email when a new enquiry arrives (see SETUP.md)
 *   TURNSTILE_SECRET  Cloudflare Turnstile secret key (only if you enabled Turnstile)
 *   ALLOWED_ORIGIN    e.g. https://n-core.in  (logged only; see SETUP.md limitations)
 */

var SHEET_NAME = 'Enquiries';
var HEADERS = [
  'Submitted (IST)', 'Lead status', 'Name', 'Email', 'Phone', 'Company',
  'Service', 'Package of interest', 'Budget', 'Project description',
  'Preferred contact', 'Best time to call', 'Notes (internal)', 'Page'
];
var STATUSES = ['New', 'Contacted', 'In Discussion', 'Won', 'Lost'];
var COL = { STATUS: 2 };          // 1-based column of "Lead status"

var LIMITS = { name: [2, 80], phone: [7, 20], email: [5, 120], company: [0, 100],
               service: [1, 60], pkg: [0, 60], budget: [0, 40], message: [20, 2000], callbackTime: [0, 80] };
var SERVICES = ['Business website', 'Café / restaurant website', 'Landing page', 'Portfolio website',
                'Website redesign', 'Domain & hosting setup', 'Maintenance plan', 'Something else'];
var METHODS = ['Email', 'Scheduled callback'];
var MIN_FILL_MS = 3000;           // faster than this = bot
var PER_EMAIL_SECONDS = 120;      // same email can't submit twice within this window
var GLOBAL_PER_HOUR = 120;        // hard cap to protect your daily Google quota

/* ---------------- web app entry points ---------------- */

function doGet() {
  return json_({ ok: true, service: 'Core Dynamics enquiry endpoint', time: new Date().toISOString() });
}

function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > 20000) return fail_('invalid', 'Request too large or empty');
    var body;
    try { body = JSON.parse(raw); } catch (err) { return fail_('invalid', 'Malformed request'); }

    /* Spam traps: pretend success so bots learn nothing, but store nothing. */
    if (body.hp) return json_({ ok: true });
    if (typeof body.elapsed === 'number' && body.elapsed < MIN_FILL_MS) return json_({ ok: true });

    var clean = validate_(body);
    if (clean.error) return fail_('invalid', clean.error);

    if (!verifyTurnstile_(body.turnstile)) return fail_('invalid', 'Security check failed');

    var cache = CacheService.getScriptCache();
    var emailKey = 'em_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, clean.email.toLowerCase()));
    if (cache.get(emailKey)) return fail_('rate_limited', 'Too many submissions');
    var hourKey = 'h_' + Utilities.formatDate(new Date(), 'UTC', 'yyyyMMddHH');
    var count = Number(cache.get(hourKey) || 0);
    if (count >= GLOBAL_PER_HOUR) return fail_('rate_limited', 'Too many submissions');

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var sheet = getSheet_();
      sheet.appendRow(rowFor_(clean));
    } finally { lock.releaseLock(); }

    cache.put(emailKey, '1', PER_EMAIL_SECONDS);
    cache.put(hourKey, String(count + 1), 3600);
    notify_(clean);
    return json_({ ok: true });
  } catch (err) {
    console.error(err);
    return fail_('server', 'Something went wrong');
  }
}

/* ---------------- validation (pure, unit-testable) ---------------- */

function validate_(b) {
  function s(v) { return (v == null ? '' : String(v)).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim(); }
  var d = {
    name: s(b.name), phone: s(b.phone), email: s(b.email), company: s(b.company), service: s(b.service),
    pkg: s(b['package']), budget: s(b.budget), message: s(b.message), contactMethod: s(b.contactMethod),
    callbackTime: s(b.callbackTime), page: s(b.page).slice(0, 200)
  };
  function inRange(k, v) { var l = LIMITS[k]; return v.length >= l[0] && v.length <= l[1]; }
  if (b.consent !== true) return { error: 'Consent is required' };
  if (!inRange('name', d.name)) return { error: 'Name must be 2–80 characters' };
  if (!/^[0-9+()\-.\s]{7,20}$/.test(d.phone) || d.phone.replace(/\D/g, '').length < 7 || d.phone.replace(/\D/g, '').length > 15) return { error: 'Phone number looks invalid' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email) || !inRange('email', d.email)) return { error: 'Email looks invalid' };
  if (!inRange('company', d.company)) return { error: 'Company name is too long' };
  if (SERVICES.indexOf(d.service) === -1) return { error: 'Unknown service' };
  if (!inRange('pkg', d.pkg) || !inRange('budget', d.budget)) return { error: 'Package or budget is too long' };
  if (!inRange('message', d.message)) return { error: 'Description must be 20–2000 characters' };
  if (METHODS.indexOf(d.contactMethod) === -1) return { error: 'Unknown contact method' };
  if (!inRange('callbackTime', d.callbackTime)) return { error: 'Callback time is too long' };
  return d;
}

/* Stops spreadsheet formula injection: a cell beginning = + - @ is stored as plain text. */
function safeCell_(v) {
  v = String(v == null ? '' : v);
  return /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
}

function rowFor_(d) {
  return [
    Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HH:mm:ss'),
    'New',
    safeCell_(d.name), safeCell_(d.email), safeCell_(d.phone), safeCell_(d.company),
    safeCell_(d.service), safeCell_(d.pkg), safeCell_(d.budget), safeCell_(d.message),
    safeCell_(d.contactMethod), safeCell_(d.callbackTime), '', safeCell_(d.page)
  ];
}

/* ---------------- sheet helpers ---------------- */

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) { sh = ss.insertSheet(SHEET_NAME); setupSheet_(sh); }
  return sh;
}

/** Run this ONCE from the editor (Run > setup). Safe to run again. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  setupSheet_(sh);
  SpreadsheetApp.flush();
}

function setupSheet_(sh) {
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
    .setFontWeight('bold').setBackground('#0a4a2c').setFontColor('#ffffff').setWrap(true);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(3);

  /* Lead status dropdown for every row below the header */
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(false).build();
  sh.getRange(2, COL.STATUS, sh.getMaxRows() - 1, 1).setDataValidation(rule);

  /* Colour the status cell */
  var rng = sh.getRange(2, COL.STATUS, sh.getMaxRows() - 1, 1);
  var colours = { 'New': '#fff4cc', 'Contacted': '#dbeafe', 'In Discussion': '#e9d8fd', 'Won': '#c9f0d6', 'Lost': '#f4d2cc' };
  var rules = Object.keys(colours).map(function (k) {
    return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(k).setBackground(colours[k]).setRanges([rng]).build();
  });
  sh.setConditionalFormatRules(rules);

  sh.setColumnWidths(1, 1, 150); sh.setColumnWidths(2, 1, 120); sh.setColumnWidths(3, 2, 180);
  sh.setColumnWidth(10, 380); sh.setColumnWidth(13, 240);
  sh.getRange(2, 10, sh.getMaxRows() - 1, 1).setWrap(true);

  /* Filter to sort/filter by status */
  if (!sh.getFilter()) sh.getRange(1, 1, sh.getMaxRows(), HEADERS.length).createFilter();
}

/* ---------------- optional: notifications & Turnstile ---------------- */

function notify_(d) {
  var to = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL');
  if (!to) return;                       // no address configured: no email is sent
  try {
    MailApp.sendEmail({
      to: to, replyTo: d.email,
      subject: 'New Core Dynamics enquiry: ' + d.service,
      body: 'Name: ' + d.name + '\nEmail: ' + d.email + '\nPhone: ' + d.phone + '\nCompany: ' + d.company +
            '\nService: ' + d.service + '\nBudget: ' + d.budget + '\nPreferred contact: ' + d.contactMethod +
            '\n\n' + d.message + '\n\nManage it in your Enquiries sheet.'
    });
  } catch (err) { console.error('Notify failed: ' + err); }   // never lose the lead because email failed
}

function verifyTurnstile_(token) {
  var secret = PropertiesService.getScriptProperties().getProperty('TURNSTILE_SECRET');
  if (!secret) return true;              // Turnstile not enabled
  if (!token) return false;
  try {
    var res = UrlFetchApp.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'post', payload: { secret: secret, response: token }, muteHttpExceptions: true
    });
    return JSON.parse(res.getContentText()).success === true;
  } catch (err) { console.error(err); return false; }
}

/* ---------------- tiny helpers ---------------- */

function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function fail_(code, message) { return json_({ ok: false, code: code, error: message }); }
