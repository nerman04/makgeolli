import { db } from './db.js';
import { router } from './router.js';

const App = {
    async init() {
        try {
            await db.open();
            router.init();
            this.bindEvents();
            this.renderList();
            this.initInstallPrompt();
        } catch (error) {
            console.error("Failed to initialize app:", error);
            alert("앱을 실행하는 중 오류가 발생했습니다.");
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

    bindEvents() {
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
                this.renderList();
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
        const brewery = document.getElementById('brewery').value;
        const location = document.getElementById('location').value;
        const memo = document.getElementById('memo').value;
        const ratingInput = document.querySelector('input[name="rating"]:checked');
        const rating = ratingInput ? parseInt(ratingInput.value) : 0;
        const inputCamera = document.getElementById('input-camera');
        const inputGallery = document.getElementById('input-gallery');

        let imageBlob = null;
        if (inputCamera.files[0]) {
            imageBlob = inputCamera.files[0];
        } else if (inputGallery.files[0]) {
            imageBlob = inputGallery.files[0];
        }

        const logData = {
            name,
            brewery,
            location,
            rating,
            memo,
            date: new Date().toISOString(),
            image: imageBlob
        };

        try {
            await db.addLog(logData);
            this.resetForm();
            router.navigate('list');
        } catch (error) {
            console.error("Error saving log:", error);
            alert("저장에 실패했습니다.");
        }
    },

    async renderList() {
        const listContainer = document.getElementById('makgeolli-list');
        try {
            const logs = await db.getAllLogs();

            if (logs.length === 0) {
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
                if (log.image) {
                    imageUrl = URL.createObjectURL(log.image);
                }

                const dateStr = new Date(log.date).toLocaleDateString();

                card.innerHTML = `
                    <div class="card-img" style="background-image: url('${imageUrl}'); background-size: cover; background-position: center;"></div>
                    <div class="card-content">
                        <h3 class="card-title">${log.name}</h3>
                        <div class="card-meta">
                            <span class="stars">${'★'.repeat(log.rating)}${'☆'.repeat(5 - log.rating)}</span>
                            <span>${dateStr}</span>
                        </div>
                    </div>
                `;
                listContainer.appendChild(card);
            }
        } catch (error) {
            console.error("Error rendering list:", error);
        }
    },

    async showDetail(id) {
        try {
            const log = await db.getLog(id);
            if (!log) return;

            const detailName = document.getElementById('detail-name');
            const detailImage = document.getElementById('detail-image');
            const detailMeta = document.getElementById('detail-meta');
            const detailRating = document.getElementById('detail-rating');
            const detailMemo = document.getElementById('detail-memo');
            const detailDate = document.getElementById('detail-date');

            detailName.textContent = log.name;
            detailMeta.textContent = [log.brewery, log.location].filter(Boolean).join(' | ');
            detailRating.textContent = '★'.repeat(log.rating) + '☆'.repeat(5 - log.rating);
            detailMemo.textContent = log.memo;
            detailDate.textContent = new Date(log.date).toLocaleString();

            if (log.image) {
                detailImage.src = URL.createObjectURL(log.image);
                detailImage.hidden = false;
            } else {
                detailImage.hidden = true;
            }

            router.navigate('detail');
        } catch (e) {
            console.error(e);
        }
    }
};

// Start the app
App.init();
