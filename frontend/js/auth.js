/**
 * SoundFlow Clerk Authentication Module
 * Ultra-fast OAuth (Google, GitHub) + Email authentication via Clerk.
 */

const CLERK_PUBLISHABLE_KEY = "pk_test_ZXhhY3QtcXVldHphbC03ODE2LmNsZXJrLmFjY291bnRzLmRldiQ";
const CLERK_SCRIPT_URL = "https://exact-quetzal-7816.clerk.accounts.dev/npm/@clerk/clerk-js@latest/dist/clerk.browser.js";

class SoundFlowAuth {
    constructor() {
        this.clerk = null;
        this.user = null;
        this.readyPromise = this.init();
    }

    async init() {
        this.renderGuestState();

        try {
            await this.ensureClerkLoaded();
            if (!window.Clerk) {
                console.warn("[SoundFlow Auth] Clerk not available.");
                return;
            }

            this.clerk = window.Clerk;

            // Load Clerk with SoundFlow theme
            await this.clerk.load({
                appearance: {
                    variables: {
                        colorPrimary: '#ff2d75',
                        colorBackground: '#121520',
                        colorText: '#f8fafc',
                        colorTextSecondary: '#94a3b8',
                        colorInputBackground: '#1a1f2c',
                        colorInputText: '#ffffff',
                        borderRadius: '12px',
                        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                    },
                    elements: {
                        card: {
                            backgroundColor: '#121520',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            boxShadow: '0 24px 48px rgba(0, 0, 0, 0.85)'
                        },
                        formButtonPrimary: {
                            background: 'linear-gradient(135deg, #ff6b35 0%, #ff2d75 100%)',
                            border: 'none',
                            color: '#ffffff',
                            fontWeight: '600'
                        },
                        socialButtonsBlockButton: {
                            backgroundColor: '#1a1f2c',
                            borderColor: 'rgba(255, 255, 255, 0.1)',
                            color: '#ffffff'
                        },
                        socialButtonsBlockButtonText: {
                            color: '#ffffff'
                        },
                        footerActionLink: {
                            color: '#ff2d75'
                        }
                    }
                }
            });

            // Listen for login/logout changes
            this.clerk.addListener((emission) => {
                this.updateUserState(emission.user);
            });

            // Sync current user state
            this.updateUserState(this.clerk.user);

        } catch (err) {
            console.error("[SoundFlow Auth] Initialization error:", err);
            this.renderGuestState();
        }
    }

    ensureClerkLoaded() {
        return new Promise((resolve, reject) => {
            if (window.Clerk && window.Clerk.load) {
                return resolve();
            }

            let script = document.querySelector(`script[src*="clerk.browser.js"]`);
            if (!script) {
                script = document.createElement('script');
                script.async = true;
                script.crossOrigin = 'anonymous';
                script.setAttribute('data-clerk-publishable-key', CLERK_PUBLISHABLE_KEY);
                script.src = CLERK_SCRIPT_URL;
                document.head.appendChild(script);
            }

            const checkInterval = setInterval(() => {
                if (window.Clerk && window.Clerk.load) {
                    clearInterval(checkInterval);
                    clearTimeout(timeoutId);
                    resolve();
                }
            }, 50);

            const timeoutId = setTimeout(() => {
                clearInterval(checkInterval);
                if (window.Clerk && window.Clerk.load) {
                    resolve();
                } else {
                    reject(new Error("Timeout waiting for Clerk SDK script to load"));
                }
            }, 10000);
        });
    }

    renderGuestState() {
        const authContainer = document.getElementById('auth-container');
        if (!authContainer) return;

        authContainer.innerHTML = `
            <button class="btn-auth-signin" id="btn-sign-in" title="Вхід через Google / GitHub">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                    <polyline points="10 17 15 12 10 7"></polyline>
                    <line x1="15" y1="12" x2="3" y2="12"></line>
                </svg>
                <span>Увійти</span>
            </button>
        `;

        document.getElementById('btn-sign-in')?.addEventListener('click', () => {
            this.openSignIn();
        });
    }

    async updateUserState(user) {
        this.user = user;
        const authContainer = document.getElementById('auth-container');
        if (!authContainer) return;

        if (user) {
            const avatarUrl = user.imageUrl || '';
            const displayName = user.fullName || user.firstName || user.primaryEmailAddress?.emailAddress || 'Користувач';
            const email = user.primaryEmailAddress?.emailAddress || '';

            authContainer.innerHTML = `
                <div class="user-profile-badge" id="user-profile-menu-btn" title="${this.escapeHtml(displayName)}">
                    <img src="${avatarUrl}" class="user-avatar" alt="Avatar">
                    <span class="user-name">${this.escapeHtml(displayName)}</span>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" class="chevron-icon">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </div>
                <div class="user-dropdown-menu" id="user-dropdown" style="display: none;">
                    <div class="dropdown-header">
                        <img src="${avatarUrl}" class="dropdown-avatar" alt="Avatar">
                        <div class="dropdown-meta">
                            <span class="dropdown-title">${this.escapeHtml(displayName)}</span>
                            <span class="dropdown-sub">${this.escapeHtml(email)}</span>
                        </div>
                    </div>
                    <div class="dropdown-divider"></div>
                    <button id="btn-view-profile" class="dropdown-item">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                        <span>Мій профіль SoundCloud</span>
                    </button>
                    <button id="btn-manage-account" class="dropdown-item">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="3"></circle>
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                        </svg>
                        <span>Налаштування акаунта</span>
                    </button>
                    <button id="btn-sign-out" class="dropdown-item danger">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                            <polyline points="16 17 21 12 16 7"></polyline>
                            <line x1="21" y1="12" x2="9" y2="12"></line>
                        </svg>
                        <span>Вийти</span>
                    </button>
                </div>
            `;

            const menuBtn = document.getElementById('user-profile-menu-btn');
            const dropdown = document.getElementById('user-dropdown');
            if (menuBtn && dropdown) {
                menuBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    dropdown.style.display = dropdown.style.display === 'none' ? 'flex' : 'none';
                });
                document.addEventListener('click', () => {
                    dropdown.style.display = 'none';
                });
            }

            document.getElementById('btn-view-profile')?.addEventListener('click', () => {
                dropdown.style.display = 'none';
                if (window.soundFlowApp) window.soundFlowApp.switchView('profile');
            });

            document.getElementById('btn-manage-account')?.addEventListener('click', () => {
                dropdown.style.display = 'none';
                this.openUserProfile();
            });

            document.getElementById('btn-sign-out')?.addEventListener('click', async () => {
                dropdown.style.display = 'none';
                await this.clerk.signOut();
                if (window.soundFlowApp) window.soundFlowApp.showToast('Ви вийшли з акаунта');
            });

            // Bind user library in backend
            if (window.pywebview && window.pywebview.api) {
                await window.pywebview.api.set_user(user.id);
                if (window.soundFlowApp) {
                    await window.soundFlowApp.loadLibrary();
                    window.soundFlowApp.showToast(`Вітаємо, ${displayName}! 👋`);
                }
            }

        } else {
            // Signed out / Guest
            this.renderGuestState();

            // Switch to guest library
            if (window.pywebview && window.pywebview.api) {
                await window.pywebview.api.set_user(null);
                if (window.soundFlowApp) {
                    await window.soundFlowApp.loadLibrary();
                }
            }
        }
    }

    async openSignIn() {
        if (!this.clerk) {
            if (window.soundFlowApp) window.soundFlowApp.showToast('Підключення до сервісу авторизації...');
            await this.readyPromise;
        }

        if (!this.clerk) {
            if (window.soundFlowApp) window.soundFlowApp.showToast('Помилка підключення до сервісу авторизації');
            return;
        }

        // Open Clerk's native modal window directly
        this.clerk.openSignIn();
    }

    async openUserProfile() {
        if (!this.clerk) {
            await this.readyPromise;
        }

        if (!this.clerk) return;

        // Open Clerk's native profile modal directly
        this.clerk.openUserProfile();
    }

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

// Global initialization
window.addEventListener('DOMContentLoaded', () => {
    window.soundFlowAuth = new SoundFlowAuth();
});
