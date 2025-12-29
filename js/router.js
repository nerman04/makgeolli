export const router = {
    init() {
        window.addEventListener('hashchange', () => this.handleRoute());
        this.handleRoute(); // Handle initial load
    },

    handleRoute() {
        const hash = window.location.hash || '#list';
        const viewId = hash.replace('#', '') + '-view';

        document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));

        const activeView = document.getElementById(viewId);
        if (activeView) {
            activeView.classList.add('active');

            // Dispatch event for view change
            window.dispatchEvent(new CustomEvent('viewChanged', { detail: { view: hash.replace('#', '') } }));
        } else {
            // Default to list if route not found
            window.location.hash = '#list';
        }
    },

    navigate(route) {
        window.location.hash = route;
    }
};
