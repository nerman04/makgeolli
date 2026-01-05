const DB_NAME = 'MakgeolliDB';
const DB_VERSION = 2;
const STORE_NAME = 'logs';

export const db = {
    connection: null,

    open() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = (event) => {
                console.error("IndexedDB error:", event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.connection = event.target.result;
                resolve(this.connection);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                let store;

                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                    store.createIndex('date', 'date', { unique: false });
                } else {
                    store = event.target.transaction.objectStore(STORE_NAME);
                }

                // Add new indices for v2
                if (!store.indexNames.contains('region')) {
                    store.createIndex('region', 'region', { unique: false });
                }
                if (!store.indexNames.contains('ratingOverall')) {
                    store.createIndex('ratingOverall', 'ratingOverall', { unique: false });
                }

                // Data Migration for v2
                if (event.oldVersion < 2) {
                    const request = store.openCursor();
                    request.onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (cursor) {
                            const updateData = cursor.value;
                            let changed = false;

                            // Migrate Brewery -> Region
                            if (updateData.brewery && !updateData.region) {
                                updateData.region = updateData.brewery;
                                changed = true;
                            }
                            // Migrate Rating -> RatingOverall
                            if (updateData.rating !== undefined && updateData.ratingOverall === undefined) {
                                updateData.ratingOverall = updateData.rating;
                                changed = true;
                            }

                            if (changed) {
                                cursor.update(updateData);
                            }
                            cursor.continue();
                        }
                    };
                }
            };
        });
    },

    addLog(data) {
        return new Promise((resolve, reject) => {
            const transaction = this.connection.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.add(data);

            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });
    },

    deleteLog(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.connection.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(Number(id));

            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e.target.error);
        });
    },

    getAllLogs() {
        return new Promise((resolve, reject) => {
            const transaction = this.connection.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => {
                // Sort by date descending (newest first)
                const results = request.result;
                results.sort((a, b) => new Date(b.date) - new Date(a.date));
                resolve(results);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    },

    getLog(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.connection.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(Number(id)); // Ensure id is a number

            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e.target.error);
        });
    }
};
