# Clickneeth — photography portfolio

Static site (plain HTML/CSS/JS) served by GitHub Pages:
https://clickneeth.click/

- `index.html` — entry gate: name + email, consent, Cloudflare Turnstile, emailed code
- `gallery.html` — the portfolio (photos come from `gallery.json`, web copies in `assets/web/`)
- `privacy.html` — DPDP privacy notice (bump `CONSENT_VERSION` in `js/login.js` if it changes)
- `apps-script/Code.gs` — reference copy of the Google Apps Script behind the gate
  (secrets live in Apps Script *Script Properties*, never in this repo)

Photographs © Shankar Praneeth / Clickneeth. All rights reserved.
