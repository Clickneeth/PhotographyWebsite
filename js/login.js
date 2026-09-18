// ===============================
// GATE: greet, collect name + email, remember this browser
// ===============================

const STORAGE_KEY = "clickneeth_visitor";

// Google Form ("PHOTOGRAPHY website walkin") that logs every visitor so
// Shankar can see who's walked in. Field IDs confirmed from the form's own
// page data on 2026-08-10.
const GOOGLE_FORM_ACTION =
    "https://docs.google.com/forms/d/e/1FAIpQLSc3B0MB8EI6qJzyGqowDDg1kXUMFXe_JDRrp1rsBbYe2wu4CQ/formResponse";
const GOOGLE_FORM_NAME_ENTRY = "entry.707596366";
const GOOGLE_FORM_EMAIL_ENTRY = "entry.1274475095";

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

function logVisitor(name, email) {
    if (!GOOGLE_FORM_ACTION || !GOOGLE_FORM_EMAIL_ENTRY) return;

    const body = new URLSearchParams();
    body.set(GOOGLE_FORM_NAME_ENTRY, name);
    body.set(GOOGLE_FORM_EMAIL_ENTRY, email);

    // no-cors: Google Forms doesn't return a readable response either way,
    // this just fires the submission without blocking on it.
    fetch(GOOGLE_FORM_ACTION, { method: "POST", mode: "no-cors", body }).catch(
        (err) => console.warn("Visitor log failed to send:", err)
    );
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

form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("visitorName").value.trim();
    const email = document.getElementById("visitorEmail").value.trim();

    if (!name || !email || !isValidEmailFormat(email)) {
        showError("Blip needs both your name and a real-looking email to remember you.");
        return;
    }

    submitBtn.disabled = true;
    mascot.classList.add("checking");
    caption.textContent = "Blip is checking that email...";

    const mailAccepted = await domainAcceptsMail(email);

    mascot.classList.remove("checking");

    if (!mailAccepted) {
        submitBtn.disabled = false;
        caption.textContent = "Blip wants to know who you are.";
        showError("That email's domain doesn't look like it can receive mail — double-check it.");
        return;
    }

    errorEl.textContent = "";
    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ name, email, firstSeen: new Date().toISOString() })
    );
    logVisitor(name, email);

    form.classList.add("done");
    mascot.classList.add("happy");
    burstSparkles();
    caption.textContent = `Now that Blip knows you, ${name.split(" ")[0]}, he'll guide you in.`;

    setTimeout(() => {
        window.location.href = "gallery.html";
    }, 1900);
});
