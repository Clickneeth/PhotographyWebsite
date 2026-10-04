// ===============================
// LOAD IMAGES (from gallery.json)
// ===============================

const gallery = document.getElementById("galleryGrid");
let galleryData = [];

fetch("gallery.json")
    .then(res => res.json())
    .then(data => {
        galleryData = data;
        renderGallery();
        setupModal();
    })
    .catch(err => console.error("Failed to load gallery.json:", err));

// ===============================
// FOOTER YEAR
// ===============================

const footerYear = document.getElementById("footerYear");
if (footerYear) footerYear.textContent = new Date().getFullYear();

function renderGallery() {

    galleryData.forEach(entry => {

        const item = document.createElement("div");
        item.classList.add("gallery-item");

        const img = document.createElement("img");
        // Web-sized WebP copy (smaller download); width/height reserve the
        // photo's space up front so the page doesn't jump while it loads.
        img.src = `assets/web/${entry.file.replace(/\.[^.]+$/, "")}.webp`;
        if (entry.w && entry.h) {
            img.width = entry.w;
            img.height = entry.h;
        }
        img.loading = "lazy";
        // alt text only (accessibility/SEO) — no title attribute, so no hover
        // tooltip leaks the caption in the normal grid view.
        img.alt = entry.caption || "";
        // Keyboard + screen-reader access: the photo acts as a button that opens the viewer.
        img.tabIndex = 0;
        img.setAttribute("role", "button");
        img.setAttribute("aria-label",
            `Open photo ${galleryData.indexOf(entry) + 1} of ${galleryData.length}` +
            (entry.location ? `: ${entry.location}` : ""));

        item.appendChild(img);
        gallery.appendChild(item);

    });

    const observer = new IntersectionObserver(entries => {

        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add("show");
            }
        });

    }, { threshold: 0.1 });

    document.querySelectorAll(".gallery-item").forEach(item => {
        observer.observe(item);
    });

}

// ===============================
// MODAL SYSTEM
// ===============================

function setupModal() {

    const modal = document.getElementById("modal");
    const modalImg = document.getElementById("modalImg");
    const modalLocation = document.getElementById("modalLocation");
    const modalCaptionText = document.getElementById("modalCaptionText");
    const closeBtn = document.querySelector(".close");
    const nextBtn = document.getElementById("next");
    const prevBtn = document.getElementById("prev");

    let images = document.querySelectorAll(".gallery-item img");
    let currentIndex = 0;

    function updateArrows() {
        prevBtn.classList.toggle("hidden", currentIndex === 0);
        nextBtn.classList.toggle("hidden", currentIndex === images.length - 1);

        // A focused arrow that just disappeared would drop focus to <body>.
        const active = document.activeElement;
        if (active === nextBtn && nextBtn.classList.contains("hidden")) prevBtn.focus();
        if (active === prevBtn && prevBtn.classList.contains("hidden")) nextBtn.focus();
    }

    const modalInner = document.querySelector(".modal-inner");
    let slideToken = 0;

    function fill(index) {
        currentIndex = index;
        modalImg.src = images[currentIndex].src;

        const entry = galleryData[currentIndex];
        if (modalLocation) modalLocation.textContent = entry?.location || "";
        if (modalCaptionText) modalCaptionText.textContent = entry?.caption || "";
        modalImg.alt = entry?.caption || entry?.location || "Photograph by Clickneeth";

        updateArrows();
    }

    // dir: 1 = next (slides in from the right), -1 = previous (from the left),
    // 0 = no animation (first open).
    async function show(index, dir = 0) {
        // No wrap-around: past the first/last photo, simply do nothing —
        // this is also why swiping past either end just stays put instead
        // of jumping to the other side of the gallery.
        if (index < 0 || index >= images.length) return;

        const token = ++slideToken;
        const canAnimate = dir !== 0 && modalInner.animate &&
            !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        if (!canAnimate) {
            fill(index);
            return;
        }

        const dist = Math.min(window.innerWidth * 0.25, 220);
        const opts = { duration: 400, easing: "ease-in-out", fill: "forwards" };

        // current photo slides away...
        await modalInner.animate(
            [{ transform: "translateX(0)", opacity: 1 },
             { transform: `translateX(${-dir * dist}px)`, opacity: 0 }],
            opts
        ).finished.catch(() => {});
        if (token !== slideToken) return;

        // ...swap while invisible, wait for the new image to be ready...
        fill(index);
        try { await modalImg.decode(); } catch (e) {}
        if (token !== slideToken) return;

        // ...and the next one slides in from the opposite side.
        modalInner.animate(
            [{ transform: `translateX(${dir * dist}px)`, opacity: 0 },
             { transform: "translateX(0)", opacity: 1 }],
            { ...opts, easing: "ease-out" }
        );
    }

    let opener = null;

    function openModal(index, from) {
        opener = from;
        slideToken++;
        modalInner.getAnimations().forEach(a => a.cancel());
        modal.style.display = "flex";
        show(index);
        closeBtn.focus();
    }

    function closeModal() {
        if (modal.style.display !== "flex") return;
        modal.style.display = "none";
        // Hand focus back to the photo that opened the viewer.
        if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
        opener = null;
    }

    images.forEach((img, index) => {
        img.addEventListener("click", () => openModal(index, img));
        img.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openModal(index, img);
            }
        });
    });

    // Close / arrows are <span role="button">, so give them button keyboard behaviour.
    [closeBtn, nextBtn, prevBtn].forEach((btn) => {
        btn.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                btn.click();
            }
        });
    });

    closeBtn.onclick = closeModal;

    nextBtn.onclick = () => show(currentIndex + 1, 1);
    prevBtn.onclick = () => show(currentIndex - 1, -1);

    modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal();
    });

    document.addEventListener("keydown", (e) => {

        if (modal.style.display === "flex") {

            if (e.key === "ArrowRight") show(currentIndex + 1, 1);
            if (e.key === "ArrowLeft") show(currentIndex - 1, -1);
            if (e.key === "Escape") closeModal();

            // Keep Tab inside the viewer while it is open.
            if (e.key === "Tab") {
                const focusable = [closeBtn, prevBtn, nextBtn].filter(
                    (b) => !b.classList.contains("hidden")
                );
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (!modal.contains(document.activeElement)) {
                    e.preventDefault();
                    first.focus();
                } else if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }

        }

    });

    // ===============================
    // CLEAN SWIPE (MOBILE ONLY)
    // ===============================

    let startX = 0;

    modalImg.addEventListener("touchstart", (e) => {
        startX = e.touches[0].clientX;
    }, { passive: true });

    modalImg.addEventListener("touchend", (e) => {

        let endX = e.changedTouches[0].clientX;
        let diff = startX - endX;

        // small threshold to avoid accidental taps
        if (Math.abs(diff) < 50) return;

        if (diff > 0) {
            // Swipe LEFT → NEXT
            show(currentIndex + 1, 1);
        } else {
            // Swipe RIGHT → PREVIOUS
            show(currentIndex - 1, -1);
        }

    }, { passive: true });

}

// ===============================
// DISABLE RIGHT CLICK
// ===============================

document.addEventListener("contextmenu", e => e.preventDefault());