// ===============================
// GATE: greet, collect name + email, remember this browser
// ===============================

const STORAGE_KEY = "clickneeth_visitor";

// Apps Script Web App (apps-script/Code.gs, bound to the "Clickneeth visitors"
// Sheet). It emails a one-time code and, only once the code is verified,
// logs the visitor — so unverified/fake emails never reach the Sheet.
const GATE_ENDPOINT =
    "https://script.google.com/macros/s/AKfycbweUKj-6cnw5r5qOL82MEKJXnHYkvqQAZHZl6Rx-b0m7WV3tRKj73Of1o8xDNkqHgK-5Q/exec";

// Cloudflare Turnstile (free CAPTCHA). Paste the public SITE key here after
// creating a widget at dash.cloudflare.com -> Turnstile; the matching SECRET
// key goes in the Apps Script's Script Properties as TURNSTILE_SECRET.
// While this is empty the CAPTCHA is skipped (and the server skips it too).
const TURNSTILE_SITE_KEY = "0x4AAAAAAFNZaOQtqGzup2-J";

// Bump when privacy.html changes in a way that needs fresh consent.
const CONSENT_VERSION = "2026-10-04-v2";

const form = document.getElementById("gateForm");
const mascot = document.getElementById("mascot");
const caption = document.getElementById("caption");
const errorEl = document.getElementById("formError");
const sparkleField = document.getElementById("sparkleField");
const submitBtn = form.querySelector(".gate-btn");

// Already known on this browser — skip straight to the gallery.
if (localStorage.getItem(STORAGE_KEY)) {
    window.location.replace("gallery.html");
}

function isValidEmailFormat(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// Real-ish existence check: confirms the email's DOMAIN can actually receive
// mail (has MX records, or at least resolves), via public DNS-over-HTTPS.
// This can't confirm the specific mailbox exists — no browser can do that,
// it needs an SMTP handshake a server would have to perform — but it does
// catch typos and made-up domains, which is most of what slips through
// regex-only validation.
async function domainAcceptsMail(email) {
    const domain = email.split("@")[1];
    if (!domain) return false;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    // Google's dns.google/resolve JSON API doesn't send CORS headers, so a
    // browser fetch() to it fails silently — Cloudflare's DoH endpoint does
    // support CORS and returns the same shape.
    const DOH_ENDPOINT = "https://cloudflare-dns.com/dns-query";
    const dohHeaders = { accept: "application/dns-json" };

    try {
        const mxRes = await fetch(
            `${DOH_ENDPOINT}?name=${encodeURIComponent(domain)}&type=MX`,
            { signal: controller.signal, headers: dohHeaders }
        );
        const mxData = await mxRes.json();

        if (mxData.Status === 3) return false; // NXDOMAIN — domain doesn't exist
        if (mxData.Answer && mxData.Answer.some((r) => r.type === 15)) return true; // has mail servers

        // no MX published — fall back to checking the domain resolves at all
        const aRes = await fetch(
            `${DOH_ENDPOINT}?name=${encodeURIComponent(domain)}&type=A`,
            { signal: controller.signal, headers: dohHeaders }
        );
        const aData = await aRes.json();
        return aData.Status === 0 && !!aData.Answer;
    } catch (err) {
        // DNS lookup itself failed (offline, API hiccup, timeout) — fail
        // open rather than blocking a real visitor over a network blip.
        console.warn("Email domain check unavailable, allowing submission:", err);
        return true;
    } finally {
        clearTimeout(timeout);
    }
}

// ---- CAPTCHA: every "send code" request needs a fresh, single-use token ----
let captchaWidgetId = null;
let captchaToken = null;
let captchaWaiters = [];

function initCaptcha() {
    if (!TURNSTILE_SITE_KEY) return;
    const mount = () => {
        captchaWidgetId = window.turnstile.render("#captchaBox", {
            sitekey: TURNSTILE_SITE_KEY,
            theme: "dark",
            callback: (token) => {
                captchaToken = token;
                captchaWaiters.splice(0).forEach((resolve) => resolve(token));
            },
            "expired-callback": () => { captchaToken = null; },
            "error-callback": () => { captchaToken = null; },
        });
    };
    // api.js loads async/defer; wait for it.
    const wait = setInterval(() => {
        if (window.turnstile) { clearInterval(wait); mount(); }
    }, 100);
}

// Resolves with a token, or null if the CAPTCHA is off / didn't finish in time.
async function takeCaptchaToken() {
    if (!TURNSTILE_SITE_KEY) return null;
    const token = captchaToken || await Promise.race([
        new Promise((resolve) => captchaWaiters.push(resolve)),
        new Promise((resolve) => setTimeout(() => resolve(null), 15000)),
    ]);
    captchaToken = null;
    if (window.turnstile && captchaWidgetId !== null) window.turnstile.reset(captchaWidgetId);
    return token;
}

initCaptcha();

async function callGate(payload) {
    try {
        const res = await fetch(GATE_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload),
        });
        return await res.json();
    } catch (err) {
        console.warn("[gate] request failed:", err);
        return { ok: false, error: "network" };
    }
}

function burstSparkles() {
    for (let i = 0; i < 8; i++) {
        const sparkle = document.createElement("div");
        sparkle.className = "sparkle";
        sparkle.style.setProperty("--angle", `${(360 / 8) * i}deg`);
        sparkle.style.animationDelay = `${i * 0.03}s`;
        sparkleField.appendChild(sparkle);
        sparkle.addEventListener("animationend", () => sparkle.remove());
    }
}

function showError(message) {
    errorEl.textContent = message;
    form.classList.remove("shake");
    void form.offsetWidth; // restart the shake animation even if it just played
    form.classList.add("shake");
}

const nameInput = document.getElementById("visitorName");
const emailInput = document.getElementById("visitorEmail");
const consentRow = document.getElementById("consentRow");
const consentNotice = document.getElementById("consentNotice");
const consentBox = document.getElementById("consentBox");
const codeField = document.getElementById("codeField");
const codeInput = document.getElementById("visitorCode");
const codeLinks = document.getElementById("codeLinks");
const resendBtn = document.getElementById("resendBtn");
const changeEmailBtn = document.getElementById("changeEmailBtn");

const IDLE_CAPTION = "Blip wants to know who you are.";
const SEND_ERRORS = {
    too_soon: "A code was just sent — wait a minute before asking for another.",
    quota_exhausted: "Blip has sent too many codes today. Please try again tomorrow.",
    consent_required: "Please agree to the Privacy Notice to continue.",
    captcha_failed: "The human check didn't pass — please try again.",
    network: "Couldn't reach Blip. Check your connection and try again.",
};
const VERIFY_ERRORS = {
    expired: "That code has expired — tap Resend code for a new one.",
    too_many_attempts: "Too many wrong tries — tap Resend code for a new one.",
    network: "Couldn't reach Blip. Check your connection and try again.",
};

let step = "details"; // "details" -> "code"
let resendTimer = null;

function startResendCooldown() {
    let left = 60;
    resendBtn.disabled = true;
    clearInterval(resendTimer);
    resendTimer = setInterval(() => {
        left--;
        if (left <= 0) {
            clearInterval(resendTimer);
            resendBtn.disabled = false;
            resendBtn.textContent = "Resend code";
        } else {
            resendBtn.textContent = `Resend in ${left}s`;
        }
    }, 1000);
    resendBtn.textContent = `Resend in ${left}s`;
}

function enterCodeStep(email) {
    step = "code";
    nameInput.readOnly = true;
    emailInput.readOnly = true;
    consentRow.hidden = true;
    consentNotice.hidden = true;
    codeField.hidden = false;
    codeLinks.hidden = false;
    submitBtn.textContent = "Verify";
    caption.textContent = `Blip emailed a code to ${email}. Type it in (it's case-sensitive).`;
    errorEl.textContent = "";
    codeInput.value = "";
    codeInput.focus();
    startResendCooldown();
}

function backToDetails() {
    step = "details";
    clearInterval(resendTimer);
    nameInput.readOnly = false;
    emailInput.readOnly = false;
    consentRow.hidden = false;
    consentNotice.hidden = false;
    codeField.hidden = true;
    codeLinks.hidden = true;
    submitBtn.textContent = "Introduce yourself";
    caption.textContent = IDLE_CAPTION;
    errorEl.textContent = "";
    emailInput.focus();
}

// Asks the server to email a (new) code. Returns true if it was sent.
async function requestCode(name, email) {
    submitBtn.disabled = true;
    mascot.classList.add("checking");
    caption.textContent = "Blip is checking that email...";

    const mailAccepted = await domainAcceptsMail(email);
    if (!mailAccepted) {
        mascot.classList.remove("checking");
        submitBtn.disabled = false;
        caption.textContent = IDLE_CAPTION;
        showError("That email's domain doesn't look like it can receive mail — double-check it.");
        return false;
    }

    const captcha = await takeCaptchaToken();
    if (TURNSTILE_SITE_KEY && !captcha) {
        mascot.classList.remove("checking");
        submitBtn.disabled = false;
        caption.textContent = step === "code" ? caption.textContent : IDLE_CAPTION;
        showError("Please complete the human check, then try again.");
        return false;
    }

    const result = await callGate({ action: "send", name, email, captcha, consent: true, consentVersion: CONSENT_VERSION });
    mascot.classList.remove("checking");
    submitBtn.disabled = false;

    if (!result.ok) {
        caption.textContent = step === "code" ? caption.textContent : IDLE_CAPTION;
        showError(SEND_ERRORS[result.error] || "Blip couldn't send a code to that email — double-check it.");
        return false;
    }
    return true;
}

resendBtn.addEventListener("click", async () => {
    const ok = await requestCode(nameInput.value.trim(), emailInput.value.trim());
    if (ok) {
        caption.textContent = "A fresh code is on its way.";
        errorEl.textContent = "";
        codeInput.value = "";
        codeInput.focus();
        startResendCooldown();
    }
});

changeEmailBtn.addEventListener("click", backToDetails);

form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();

    if (step === "details") {
        if (!name || !email || !isValidEmailFormat(email)) {
            showError("Blip needs both your name and a real-looking email to remember you.");
            return;
        }
        if (!consentBox.checked) {
            showError("Please tick the box to agree to the Privacy Notice first.");
            return;
        }
        if (await requestCode(name, email)) enterCodeStep(email);
        return;
    }

    // step === "code"
    const code = codeInput.value.trim();
    if (!code) {
        showError("Type the code Blip emailed you.");
        return;
    }

    submitBtn.disabled = true;
    mascot.classList.add("checking");
    const result = await callGate({ action: "verify", email, code });
    mascot.classList.remove("checking");

    if (!result.ok) {
        submitBtn.disabled = false;
        if (result.error === "wrong_code") {
            showError(`That code isn't right — ${result.triesLeft} ${result.triesLeft === 1 ? "try" : "tries"} left.`);
        } else {
            showError(VERIFY_ERRORS[result.error] || "Couldn't verify that code — try again.");
        }
        return;
    }

    clearInterval(resendTimer);
    errorEl.textContent = "";
    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ name, email, firstSeen: new Date().toISOString(), consentVersion: CONSENT_VERSION })
    );

    form.classList.add("done");
    mascot.classList.add("happy");
    burstSparkles();
    caption.textContent = `Now that Blip knows you, ${name.split(" ")[0]}, he'll guide you in.`;

    setTimeout(() => {
        window.location.href = "gallery.html";
    }, 1900);
});
