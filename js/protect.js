// Light deterrent against casual inspection / saving of the photographs.
// This cannot stop a determined person (a browser always has to download the
// images to show them) — it only blocks the common shortcuts and gestures.

(function () {
    const isField = (el) => el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");

    // Right-click menu (Inspect, Save image as…) — but keep it in form fields so
    // visitors can still paste their name/email.
    document.addEventListener("contextmenu", (e) => {
        if (!isField(e.target)) e.preventDefault();
    });

    // Dragging a photo out to the desktop.
    document.addEventListener("dragstart", (e) => {
        if (e.target && e.target.tagName === "IMG") e.preventDefault();
    });

    // DevTools / view-source / save-page shortcuts. e.code is used (not e.key)
    // because on a Mac Option+letter produces a different character.
    document.addEventListener("keydown", (e) => {
        const mod = e.ctrlKey || e.metaKey;
        const c = e.code;
        const blocked =
            c === "F12" ||
            (mod && e.shiftKey && (c === "KeyI" || c === "KeyJ" || c === "KeyC" || c === "KeyK")) ||
            (mod && e.altKey && (c === "KeyI" || c === "KeyJ" || c === "KeyC" || c === "KeyU")) ||
            (mod && !e.shiftKey && !e.altKey && (c === "KeyU" || c === "KeyS"));
        if (blocked) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);
})();
