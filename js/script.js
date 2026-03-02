// ===============================
// IMAGE LIST
// ===============================

const imageFiles = [];

// 1 → 51 are .jpg
for (let i = 1; i <= 51; i++) {
    imageFiles.push(`${i}.jpg`);
}

// 52 → 54 are .jpeg
for (let i = 52; i <= 54; i++) {
    imageFiles.push(`${i}.jpeg`);
}

const gallery = document.getElementById("galleryGrid");

// ===============================
// LOAD IMAGES
// ===============================

imageFiles.forEach(file => {
    const item = document.createElement("div");
    item.classList.add("gallery-item");

    const img = document.createElement("img");
    img.src = `assets/${file}`;
    img.loading = "lazy";

    item.appendChild(img);
    gallery.appendChild(item);
});

// ===============================
// SCROLL FADE
// ===============================

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

// ===============================
// MODAL SYSTEM
// ===============================

const modal = document.getElementById("modal");
const modalImg = document.getElementById("modalImg");
const closeBtn = document.querySelector(".close");
const nextBtn = document.getElementById("next");
const prevBtn = document.getElementById("prev");

let images = document.querySelectorAll(".gallery-item img");
let currentIndex = 0;

// Open modal
images.forEach((img, index) => {
    img.addEventListener("click", () => {
        modal.style.display = "flex";
        modalImg.src = img.src;
        currentIndex = index;
    });
});

// Close
closeBtn.onclick = () => {
    modal.style.display = "none";
};

// Next
nextBtn.onclick = () => {
    currentIndex = (currentIndex + 1) % images.length;
    modalImg.src = images[currentIndex].src;
};

// Previous
prevBtn.onclick = () => {
    currentIndex = (currentIndex - 1 + images.length) % images.length;
    modalImg.src = images[currentIndex].src;
};

// Close when clicking outside image
modal.addEventListener("click", (e) => {
    if (e.target === modal) {
        modal.style.display = "none";
    }
});

// ===============================
// KEYBOARD NAVIGATION
// ===============================

document.addEventListener("keydown", (e) => {
    if (modal.style.display === "flex") {

        if (e.key === "ArrowRight") {
            currentIndex = (currentIndex + 1) % images.length;
            modalImg.src = images[currentIndex].src;
        }

        if (e.key === "ArrowLeft") {
            currentIndex = (currentIndex - 1 + images.length) % images.length;
            modalImg.src = images[currentIndex].src;
        }

        if (e.key === "Escape") {
            modal.style.display = "none";
        }
    }
});

// ===============================
// DISABLE RIGHT CLICK
// ===============================

document.addEventListener("contextmenu", e => e.preventDefault());