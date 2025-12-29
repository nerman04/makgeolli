const DB_NAME = 'MakgeolliDB';
const DB_VERSION = 1;
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
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                    store.createIndex('date', 'date', { unique: false });
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
