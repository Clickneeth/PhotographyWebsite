// ===============================
// GATE: greet, collect name + email, remember this browser
// ===============================

const STORAGE_KEY = "clickneeth_visitor";

// Apps Script Web App (bound to the "Clickneeth visitors" Sheet) that logs
// every visitor so Shankar can see who's walked in. Replaced a direct
// Google Forms POST on 2026-09-19 — Forms' formResponse endpoint requires a
// per-visit anti-spam token that only exists on a real, freshly-loaded
// Forms page, so a cross-origin fetch from this site could never satisfy
// it and was silently rejected 100% of the time. This endpoint is our own
// script, so it responds with real, readable JSON instead.
const VISITOR_LOG_ENDPOINT =
    "https://script.google.com/macros/s/AKfycbweUKj-6cnw5r5qOL82MEKJXnHYkvqQAZHZl6Rx-b0m7WV3tRKj73Of1o8xDNkqHgK-5Q/exec";

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
    if (!VISITOR_LOG_ENDPOINT) return;

    console.log("[visitor-log] submitting:", { name, email });

    // No mode:"no-cors" needed here — this is our own Apps Script endpoint
    // and it responds with real CORS headers, so unlike the old Google
    // Forms integration we can actually read whether it succeeded.
    fetch(VISITOR_LOG_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ name, email }),
    })
        .then((res) => res.json())
        .then((result) => {
            if (result.ok) {
                console.log("[visitor-log] saved successfully");
            } else {
                console.warn("[visitor-log] server rejected the entry:", result.error);
            }
        })
        .catch((err) => console.warn("[visitor-log] failed to send:", err));
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
