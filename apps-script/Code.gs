// Clickneeth visitor gate — Google Apps Script (bound to the "Clickneeth visitors" Sheet).
//
// Flow:  { action: "send",   name, email }  -> emails an 8-char code (letters, digits, symbols)
//        { action: "verify", email, code }  -> checks it; on success logs the visitor to the Sheet
//
// The code is stored only as a hash in CacheService (10 min), allows 5 wrong tries,
// and each email can request a new one at most once per 60 seconds.

var CODE_TTL_SECONDS = 600;
var MAX_ATTEMPTS = 5;
var RESEND_COOLDOWN_SECONDS = 60;
var MAX_SENDS_PER_HOUR = 40;   // global cap so a bot can't burn the whole daily email quota in seconds
var QUOTA_ALERT_AT = 5;   // alert the owner when this few emails remain today (of ~100)

var UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";   // no I, O
var LOWER = "abcdefghijkmnpqrstuvwxyz";   // no l, o
var DIGITS = "23456789";                  // no 0, 1
var SYMBOLS = "@#$%&*!?";

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);
    var email = String(req.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return out({ ok: false, error: "invalid_email" });
    }
    if (req.action === "send") {
      // DPDP: no code is sent (and nothing is stored) without recorded consent.
      if (req.consent !== true || !/^[0-9A-Za-z.-]{1,32}$/.test(String(req.consentVersion || ""))) {
        return out({ ok: false, error: "consent_required" });
      }
      if (!verifyCaptcha(req.captcha)) return out({ ok: false, error: "captcha_failed" });
      return sendCode(cleanName(req.name), email, String(req.consentVersion));
    }
    if (req.action === "verify") return verifyCode(email, String(req.code || ""));
    return out({ ok: false, error: "bad_action" });
  } catch (err) {
    return out({ ok: false, error: "server_error" });
  }
}

// Cloudflare Turnstile check. Set the secret under Project Settings -> Script
// Properties as TURNSTILE_SECRET. If it isn't set, the check is skipped.
function verifyCaptcha(token) {
  var secret = PropertiesService.getScriptProperties().getProperty("TURNSTILE_SECRET");
  if (!secret) return true;
  if (!token) return false;
  try {
    var res = UrlFetchApp.fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "post",
      payload: { secret: secret, response: String(token) },
      muteHttpExceptions: true
    });
    return JSON.parse(res.getContentText()).success === true;
  } catch (err) {
    return false;
  }
}

function sendCode(name, email, consentVersion) {
  if (!name) return out({ ok: false, error: "name_required" });

  var cache = CacheService.getScriptCache();
  var key = keyFor(email);

  if (cache.get("cool_" + key)) return out({ ok: false, error: "too_soon" });

  var remaining = MailApp.getRemainingDailyQuota();
  if (remaining <= 1) return out({ ok: false, error: "quota_exhausted" });

  // Global hourly cap (the lock makes the counter safe under concurrent requests).
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var hourKey = "sends_" + Utilities.formatDate(new Date(), "UTC", "yyyyMMddHH");
    var sent = Number(cache.get(hourKey) || 0);
    if (sent >= MAX_SENDS_PER_HOUR) return out({ ok: false, error: "quota_exhausted" });
    cache.put(hourKey, String(sent + 1), 3700);
  } finally {
    lock.releaseLock();
  }

  var code = makeCode();
  var state = { hash: hash(code), tries: 0, name: name, consent: consentVersion };
  cache.put("code_" + key, JSON.stringify(state), CODE_TTL_SECONDS);
  cache.put("cool_" + key, "1", RESEND_COOLDOWN_SECONDS);

  MailApp.sendEmail({
    to: email,
    subject: "Your Clickneeth verification code",
    body: "Hi " + name + ",\n\nYour Clickneeth code is:\n\n    " + code +
          "\n\nIt is case-sensitive and expires in 10 minutes.\n" +
          "If you didn't ask for this, you can ignore this email.\n\n" +
          "(You asked for this code after agreeing to the Clickneeth Privacy Notice.)\n\n— Clickneeth",
    name: "Clickneeth"
  });

  // Heads-up to the owner before the daily limit is reached (once per day).
  if (remaining - 1 <= QUOTA_ALERT_AT) {
    var props = PropertiesService.getScriptProperties();
    var today = Utilities.formatDate(new Date(), "UTC", "yyyy-MM-dd");
    if (props.getProperty("quota_alert_day") !== today) {
      props.setProperty("quota_alert_day", today);
      MailApp.sendEmail(
        Session.getEffectiveUser().getEmail(),
        "Clickneeth: daily email limit almost reached",
        "Only " + (remaining - 1) + " verification emails left today. " +
        "New visitors will be asked to try again later once it hits zero (resets within 24h)."
      );
    }
  }

  return out({ ok: true });
}

function verifyCode(email, code) {
  var cache = CacheService.getScriptCache();
  var key = keyFor(email);

  // Serialise attempts so parallel requests can't each get a "free" guess.
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var raw = cache.get("code_" + key);
    if (!raw) return out({ ok: false, error: "expired" });

    var state = JSON.parse(raw);
    if (state.tries >= MAX_ATTEMPTS) {
      cache.remove("code_" + key);
      return out({ ok: false, error: "too_many_attempts" });
    }

    if (hash(code.trim()) !== state.hash) {
      state.tries++;
      cache.put("code_" + key, JSON.stringify(state), CODE_TTL_SECONDS);
      return out({ ok: false, error: "wrong_code", triesLeft: MAX_ATTEMPTS - state.tries });
    }

    cache.remove("code_" + key);
  } finally {
    lock.releaseLock();
  }

  SpreadsheetApp.getActiveSpreadsheet().getSheets()[0]
    .appendRow([new Date(), safeCell(state.name), safeCell(email), "consent " + state.consent]);
  return out({ ok: true });
}

// 8 chars, guaranteed at least one of each class, shuffled; randomness comes
// from fresh UUID bytes (Apps Script has no crypto RNG).
function makeCode() {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Utilities.getUuid() + Date.now());
  var i = 0;
  function pick(set) { return set.charAt((bytes[i++] & 0xff) % set.length); }
  var all = UPPER + LOWER + DIGITS + SYMBOLS;
  var chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS),
               pick(all), pick(all), pick(all), pick(all)];
  for (var j = chars.length - 1; j > 0; j--) {          // Fisher–Yates
    var k = (bytes[i++] & 0xff) % (j + 1);
    var t = chars[j]; chars[j] = chars[k]; chars[k] = t;
  }
  return chars.join("");
}

// The name ends up in an email body and a Sheet cell, both attacker-controlled:
// keep only letters, spaces, ' and - so it can't carry links, phishing text or formulas.
function cleanName(raw) {
  return String(raw || "").replace(/[^\p{L}\p{M} '\u2019-]/gu, "").trim().slice(0, 40);
}

// Stop Sheets from evaluating a cell that starts with = + - @ as a formula.
function safeCell(v) {
  v = String(v);
  return /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
}

function keyFor(email) { return hash(email).slice(0, 40); }

function hash(s) {
  return Utilities.base64Encode(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, "clickneeth:" + s));
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Run this ONCE from the editor (pick "authorizeOnce" in the toolbar, press Run)
// so Google asks you to grant the permissions the web app needs: send email,
// call Cloudflare, use locks, edit the Sheet. It sends nothing and changes nothing.
function authorizeOnce() {
  MailApp.getRemainingDailyQuota();
  LockService.getScriptLock();
  SpreadsheetApp.getActiveSpreadsheet().getName();
  UrlFetchApp.fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { muteHttpExceptions: true });
}

// ---------------------------------------------------------------------------
// Data retention & erasure (DPDP). NOT part of the web app — run these by hand
// from the Apps Script editor.
// ---------------------------------------------------------------------------

var RETENTION_YEARS = 2;

// Emails you a count + row numbers of visitors older than RETENTION_YEARS so you
// can review and delete them. Contains no names or emails. Never deletes anything.
function retentionReport() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - RETENTION_YEARS);
  var times = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();
  var rows = [];
  for (var i = 0; i < times.length; i++) {
    if (times[i][0] instanceof Date && times[i][0] < cutoff) rows.push(i + 2);
  }
  if (!rows.length) return;
  MailApp.sendEmail(
    Session.getEffectiveUser().getEmail(),
    "Clickneeth: " + rows.length + " visitor row(s) past " + RETENTION_YEARS + " years",
    "These rows in \"" + sheet.getName() + "\" are older than " + RETENTION_YEARS +
    " years and are due for deletion under your privacy notice:\n\nRows: " + rows.join(", ")
  );
}

// Run ONCE to get the retention reminder emailed on the 1st of every month.
function setupRetentionReminder() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "retentionReport") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("retentionReport").timeBased().onMonthDay(1).atHour(9).create();
}

// Erasure request: put the visitor's email below, then run eraseVisitor().
// Deletes every row with that email and tells you how many it removed.
function eraseVisitor() {
  var EMAIL_TO_ERASE = "";   // <- e.g. "someone@example.com"
  var email = EMAIL_TO_ERASE.trim().toLowerCase();
  if (!email) throw new Error("Set EMAIL_TO_ERASE first.");
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var values = sheet.getRange(2, 3, Math.max(sheet.getLastRow() - 1, 1), 1).getValues(); // column C = Email
  var removed = 0;
  for (var i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0]).trim().toLowerCase() === email) { sheet.deleteRow(i + 2); removed++; }
  }
  Logger.log("Erased " + removed + " row(s) for " + email);
}
