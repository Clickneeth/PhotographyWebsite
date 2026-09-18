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

function renderGallery() {

    galleryData.forEach(entry => {

        const item = document.createElement("div");
        item.classList.add("gallery-item");

        const img = document.createElement("img");
        img.src = `assets/${entry.file}`;
        img.loading = "lazy";
        // alt text only (accessibility/SEO) — no title attribute, so no hover
        // tooltip leaks the caption in the normal grid view.
        img.alt = entry.caption || "";

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
    }

    function show(index) {
        // No wrap-around: past the first/last photo, simply do nothing —
        // this is also why swiping past either end just stays put instead
        // of jumping to the other side of the gallery.
        if (index < 0 || index >= images.length) return;

        currentIndex = index;
        modalImg.src = images[currentIndex].src;

        const entry = galleryData[currentIndex];
        if (modalLocation) modalLocation.textContent = entry?.location || "";
        if (modalCaptionText) modalCaptionText.textContent = entry?.caption || "";

        updateArrows();
    }

    images.forEach((img, index) => {
        img.addEventListener("click", () => {
            modal.style.display = "flex";
            show(index);
        });
    });

    closeBtn.onclick = () => {
        modal.style.display = "none";
    };

    nextBtn.onclick = () => show(currentIndex + 1);
    prevBtn.onclick = () => show(currentIndex - 1);

    modal.addEventListener("click", (e) => {
        if (e.target === modal) {
            modal.style.display = "none";
        }
    });

    document.addEventListener("keydown", (e) => {

        if (modal.style.display === "flex") {

            if (e.key === "ArrowRight") show(currentIndex + 1);
            if (e.key === "ArrowLeft") show(currentIndex - 1);
            if (e.key === "Escape") modal.style.display = "none";

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
            show(currentIndex + 1);
        } else {
            // Swipe RIGHT → PREVIOUS
            show(currentIndex - 1);
        }

    }, { passive: true });

}

// ===============================
// DISABLE RIGHT CLICK
// ===============================

document.addEventListener("contextmenu", e => e.preventDefault());