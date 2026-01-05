import { db } from './db.js';
import { router } from './router.js';

const App = {
    async init() {
        try {
            await db.open();
            router.init();
            this.initEventListeners();
            this.initSortControls();
            await this.loadLogs();
            this.initInstallPrompt();
            this.registerServiceWorker();
        } catch (error) {
            console.error("Failed to initialize app:", error);
            alert("앱을 실행하는 중 오류가 발생했습니다.");
        }
    },

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            // Use timestamp or version to bust cache
            const swUrl = './sw.js?ver=' + new Date().getTime();
            navigator.serviceWorker.register(swUrl)
                .then(reg => console.log('Service Worker registered', reg))
                .catch(err => console.error('Service Worker registration failed', err));
        }
    },

    deferredPrompt: null,

    initInstallPrompt() {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;

            const fabAdd = document.getElementById('fab-add');
            // Create install button if not exists
            if (!document.getElementById('install-btn')) {
                const installBtn = document.createElement('button');
                installBtn.id = 'install-btn';
                installBtn.className = 'fab secondary-fab';
                installBtn.innerHTML = '⬇️';
                installBtn.ariaLabel = '앱 설치';
                installBtn.style.bottom = '90px'; // Above the add FAB

                installBtn.addEventListener('click', async () => {
                    if (this.deferredPrompt) {
                        this.deferredPrompt.prompt();
                        const { outcome } = await this.deferredPrompt.userChoice;
                        if (outcome === 'accepted') {
                            this.deferredPrompt = null;
                            installBtn.remove();
                        }
                    }
                });

                document.body.appendChild(installBtn);
            }
        });

        window.addEventListener('appinstalled', () => {
            const installBtn = document.getElementById('install-btn');
            if (installBtn) installBtn.remove();
            this.deferredPrompt = null;
        });
    },

    initSortControls() {
        const sortButtons = document.querySelectorAll('.sort-chip');
        sortButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                // Update active state
                sortButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // Update sort state and reload
                this.currentSort = btn.dataset.sort;
                this.loadLogs();
            });
        });
    },

    initEventListeners() {
        // Navigation
        document.getElementById('fab-add').addEventListener('click', () => {
            router.navigate('add');
        });

        document.getElementById('cancel-btn').addEventListener('click', () => {
            router.navigate('list');
            this.resetForm();
        });

        document.getElementById('back-btn').addEventListener('click', () => {
            router.navigate('list');
        });

        document.getElementById('delete-btn').addEventListener('click', () => {
            this.handleDelete();
        });

        // Form Submission
        document.getElementById('add-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleSave();
        });

        // Image Handling
        const inputCamera = document.getElementById('input-camera');
        const inputGallery = document.getElementById('input-gallery');
        const imagePreview = document.getElementById('image-preview');
        const removeImageBtn = document.getElementById('remove-image');
        const imageButtons = document.getElementById('image-buttons');

        // Button Click Handlers
        document.getElementById('btn-camera').addEventListener('click', () => {
            inputCamera.click();
        });

        document.getElementById('btn-gallery').addEventListener('click', () => {
            inputGallery.click();
        });

        // Common File Handler
        const handleFileSelect = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    imagePreview.src = e.target.result;
                    imagePreview.hidden = false;
                    removeImageBtn.hidden = false;
                    imageButtons.style.display = 'none'; // Hide buttons
                };
                reader.readAsDataURL(file);
            }
        };

        inputCamera.addEventListener('change', handleFileSelect);
        inputGallery.addEventListener('change', handleFileSelect);

        removeImageBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            this.resetImageInput();
        });

        // Listen for view changes to refresh data if needed
        window.addEventListener('viewChanged', (e) => {
            if (e.detail.view === 'list') {
                this.loadLogs();
                document.getElementById('fab-add').style.display = 'flex';
            } else {
                document.getElementById('fab-add').style.display = 'none';
            }
        });

        // Handle Detail View clicking
        // Event delegation for list items
        document.getElementById('makgeolli-list').addEventListener('click', (e) => {
            const card = e.target.closest('.card');
            if (card) {
                const id = card.dataset.id;
                this.showDetail(id);
            }
        });
    },

    resetImageInput() {
        const inputCamera = document.getElementById('input-camera');
        const inputGallery = document.getElementById('input-gallery');
        const imagePreview = document.getElementById('image-preview');
        const removeImageBtn = document.getElementById('remove-image');
        const imageButtons = document.getElementById('image-buttons');

        inputCamera.value = '';
        inputGallery.value = '';
        imagePreview.src = '';
        imagePreview.hidden = true;
        removeImageBtn.hidden = true;
        imageButtons.style.display = 'flex';
    },

    resetForm() {
        document.getElementById('add-form').reset();
        this.resetImageInput();
    },

    async handleSave() {
        const name = document.getElementById('name').value;
        const region = document.getElementById('region').value;
        const alcohol = document.getElementById('alcohol').value;
        const memo = document.getElementById('memo').value;

        // Ratings
        const getRating = (name) => {
            const input = document.querySelector(`input[name="${name}"]:checked`);
            return input ? parseInt(input.value) : 0;
        };

        const ratingOverall = getRating('rating_overall');
        const ratingPrice = getRating('rating_price');
        const ratingTaste = getRating('rating_taste');

        // Backward compatibility for list view sorting/display
        const rating = ratingOverall;

        const inputCamera = document.getElementById('input-camera');
        const inputGallery = document.getElementById('input-gallery');

        let imageBlob = null;
        let thumbnailBlob = null;

        if (inputCamera.files[0]) {
            imageBlob = inputCamera.files[0];
        } else if (inputGallery.files[0]) {
            imageBlob = inputGallery.files[0];
        }

        if (imageBlob) {
            try {
                // Create thumbnail (max 300px)
                thumbnailBlob = await this.resizeImage(imageBlob, 300, 300);
            } catch (e) {
                console.error("Failed to create thumbnail:", e);
                // Fallback
            }
        }

        const logData = {
            name,
            region,
            alcohol,
            rating, // Kept for easy access/sorting
            ratingOverall,
            ratingPrice,
            ratingTaste,
            memo,
            date: new Date().toISOString(),
            image: imageBlob,
            thumbnail: thumbnailBlob
        };

        try {
            await db.addLog(logData);
            this.resetForm();
            router.navigate('list');
            this.loadLogs();
        } catch (error) {
            console.error("Error saving log:", error);
            alert("저장에 실패했습니다.");
        }
    },

    resizeImage(file, maxWidth, maxHeight) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = URL.createObjectURL(file);
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width *= maxHeight / height;
                        height = maxHeight;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    URL.revokeObjectURL(img.src);
                    resolve(blob);
                }, file.type, 0.7); // 0.7 quality
            };
            img.onerror = reject;
        });
    },

    async loadLogs() {
        try {
            const logs = await db.getAllLogs();

            // Client-side sorting
            logs.sort((a, b) => {
                const dateA = new Date(a.date).getTime();
                const dateB = new Date(b.date).getTime();

                switch (this.currentSort) {
                    case 'ratingOverall':
                        return (b.ratingOverall || 0) - (a.ratingOverall || 0) || dateB - dateA;
                    case 'ratingPrice':
                        return (b.ratingPrice || 0) - (a.ratingPrice || 0) || dateB - dateA;
                    case 'ratingTaste':
                        return (b.ratingTaste || 0) - (a.ratingTaste || 0) || dateB - dateA;
                    case 'date':
                    default:
                        // Sort by date desc
                        return dateB - dateA;
                }
            });

            this.renderLogList(logs);
        } catch (error) {
            console.error("Failed to load logs:", error);
        }
    },

    renderLogList(logs) {
        const listContainer = document.getElementById('makgeolli-list');
        const countBadge = document.getElementById('total-count');

        // Update total count
        if (countBadge) {
            countBadge.textContent = `${logs.length}건`;
            countBadge.style.display = logs.length > 0 ? 'inline-block' : 'none';
        }

        if (!logs || logs.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state">
                    <p>아직 기록된 막걸리가 없습니다.<br>오른쪽 아래 버튼을 눌러 추가해보세요!</p>
                </div>`;
            return;
        }

        listContainer.innerHTML = ''; // Clear current list

        for (const log of logs) {
            const card = document.createElement('div');
            card.className = 'card';
            card.dataset.id = log.id;

            let imageUrl = 'assets/placeholder.png'; // Fallback
            // Prefer thumbnail, fall back to image
            if (log.thumbnail) {
                if (typeof log.thumbnail === 'string') {
                    imageUrl = log.thumbnail;
                } else {
                    imageUrl = URL.createObjectURL(log.thumbnail);
                }
            } else if (log.image) {
                if (typeof log.image === 'string') {
                    imageUrl = log.image;
                } else {
                    imageUrl = URL.createObjectURL(log.image);
                }
            }

            const dateStr = new Date(log.date).toLocaleDateString();

            card.innerHTML = `
                <img src="${imageUrl}" class="card-img" alt="${log.name}" loading="lazy">
                <div class="card-content">
                    <h3 class="card-title">${log.name}</h3>
                    <div class="card-meta">
                        <span class="stars">${'★'.repeat(log.ratingOverall || log.rating || 0)}${'☆'.repeat(5 - (log.ratingOverall || log.rating || 0))}</span>
                        <span>${dateStr}</span>
                    </div>
                </div>
            `;
            listContainer.appendChild(card);
        }
    },

    async showDetail(id) {
        try {
            const log = await db.getLog(id);
            if (!log) return;

            const detailName = document.getElementById('detail-name');
            const detailImage = document.getElementById('detail-image');

            const detailRegion = document.getElementById('detail-region');
            const detailAlcohol = document.getElementById('detail-alcohol');
            const detailRatingOverall = document.getElementById('detail-rating-overall');
            const detailRatingPrice = document.getElementById('detail-rating-price');
            const detailRatingTaste = document.getElementById('detail-rating-taste');

            const detailMemo = document.getElementById('detail-memo');
            const detailDate = document.getElementById('detail-date');

            detailName.textContent = log.name;

            // New fields with fallback to old fields
            detailRegion.textContent = log.region || log.brewery || '-';
            detailAlcohol.textContent = log.alcohol ? `${log.alcohol}%` : '-';

            const makeStars = (score) => '★'.repeat(score || 0) + '☆'.repeat(5 - (score || 0));

            detailRatingOverall.textContent = makeStars(log.ratingOverall || log.rating);
            detailRatingPrice.textContent = makeStars(log.ratingPrice);
            detailRatingTaste.textContent = makeStars(log.ratingTaste);

            detailMemo.textContent = log.memo;
            detailDate.textContent = new Date(log.date).toLocaleString();

            if (log.image) {
                if (typeof log.image === 'string') {
                    detailImage.src = log.image;
                } else {
                    detailImage.src = URL.createObjectURL(log.image);
                }
                detailImage.hidden = false;
            } else {
                detailImage.hidden = true;
            }

            // Store current ID for deletion
            this.currentDetailId = id;

            router.navigate('detail');
        } catch (e) {
            console.error(e);
        }
    },

    currentDetailId: null,

    async handleDelete() {
        if (!confirm("정말로 이 기록을 삭제하시겠습니까?")) return;

        try {
            await db.deleteLog(this.currentDetailId);
            router.navigate('list');
        } catch (error) {
            console.error("Error deleting log:", error);
            alert("삭제에 실패했습니다.");
        }
    }
};

// Start the app
App.init();
