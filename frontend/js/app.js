/**
 * SoundFlow Application Controller
 * Handles view switching, search, playlists, likes, system stats, and keyboard shortcuts.
 */

class SoundFlowApp {
    constructor() {
        this.currentView = 'home';
        this.currentGenre = 'lofi';
        this.currentSource = 'all';
        this.currentPlaylistId = null;

        this.library = {
            liked_tracks: [],
            playlists: {},
            history: []
        };

        this.player = new SoundFlowPlayer();
        this.trackForPlaylistModal = null;

        this.init();
    }

    async init() {
        this.setupNavigation();
        this.setupSearch();
        this.setupGenreChips();
        this.setupPlayerControls();
        this.setupModals();
        this.setupKeyboardShortcuts();
        this.setupStatsUpdater();
        this.setupProfile();

        // Wait for pywebview API to be ready
        window.addEventListener('pywebviewready', async () => {
            await this.loadLibrary();
            await this.loadDiscover(this.currentGenre);
            this.updateStats();
        });

        // Fallback if pywebviewready fired earlier or running in dev
        if (window.pywebview && window.pywebview.api) {
            await this.loadLibrary();
            await this.loadDiscover(this.currentGenre);
            this.updateStats();
        }
    }

    // ==========================================
    // NAVIGATION & VIEWS
    // ==========================================
    setupNavigation() {
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                this.switchView(view);
            });
        });

        // Hero Mix button
        const btnHeroMix = document.getElementById('btn-hero-mix');
        if (btnHeroMix) {
            btnHeroMix.addEventListener('click', () => {
                const tracks = this.currentDiscoverTracks || [];
                if (tracks.length > 0) {
                    this.player.setQueue(tracks, 0);
                }
            });
        }

        // Hero Search button
        const btnHeroSearch = document.getElementById('btn-hero-search');
        if (btnHeroSearch) {
            btnHeroSearch.addEventListener('click', () => {
                this.switchView('search');
                document.getElementById('search-input')?.focus();
            });
        }

        // Clear history button
        const btnClearHist = document.getElementById('btn-clear-history');
        if (btnClearHist) {
            btnClearHist.addEventListener('click', async () => {
                if (window.pywebview && window.pywebview.api) {
                    await window.pywebview.api.clear_history();
                    await this.loadLibrary();
                    this.renderHistoryView();
                    this.showToast('Історію очищено');
                }
            });
        }
    }

    switchView(viewName, playlistId = null) {
        this.currentView = viewName;
        this.currentPlaylistId = playlistId;

        // Update nav buttons active state
        document.querySelectorAll('.nav-item').forEach(b => {
            b.classList.toggle('active', b.dataset.view === viewName);
        });
        document.querySelectorAll('.playlist-nav-item').forEach(b => {
            b.classList.toggle('active', b.dataset.plId === playlistId);
        });

        // Hide all view panels
        document.querySelectorAll('.view-panel').forEach(p => {
            p.classList.remove('active');
        });

        // Show target panel
        const target = document.getElementById(`${viewName}-view`);
        if (target) {
            target.classList.add('active');
        }

        // Render data for view
        if (viewName === 'liked') {
            this.renderLikedView();
        } else if (viewName === 'history') {
            this.renderHistoryView();
        } else if (viewName === 'playlist' && playlistId) {
            this.renderPlaylistView(playlistId);
        } else if (viewName === 'profile') {
            this.renderProfileView();
        }
    }

    // ==========================================
    // DISCOVERY & CATEGORIES
    // ==========================================
    setupGenreChips() {
        document.querySelectorAll('.genre-chip').forEach(chip => {
            chip.addEventListener('click', async () => {
                document.querySelectorAll('.genre-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                const genre = chip.dataset.genre;
                this.currentGenre = genre;
                await this.loadDiscover(genre);
            });
        });
    }

    async loadDiscover(genre) {
        const loadingIndicator = document.getElementById('category-loading');
        const grid = document.getElementById('home-tracks-grid');
        const title = document.getElementById('home-category-title');

        const activeChip = document.querySelector(`.genre-chip[data-genre="${genre}"]`);
        if (title && activeChip) {
            title.textContent = `Популярні треки (${activeChip.textContent.trim()})`;
        }

        if (loadingIndicator) loadingIndicator.style.display = 'inline';

        try {
            if (window.pywebview && window.pywebview.api) {
                const tracks = await window.pywebview.api.get_discover_tracks(genre);
                this.currentDiscoverTracks = tracks;
                this.renderTracksGrid(grid, tracks);
            }
        } catch (e) {
            console.error('Failed to load discover tracks:', e);
        } finally {
            if (loadingIndicator) loadingIndicator.style.display = 'none';
        }
    }

    // ==========================================
    // SEARCH
    // ==========================================
    setupSearch() {
        const input = document.getElementById('search-input');
        const clearBtn = document.getElementById('search-clear-btn');

        if (input) {
            input.addEventListener('input', () => {
                if (clearBtn) clearBtn.style.display = input.value ? 'block' : 'none';
            });

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.executeSearch(input.value);
                }
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                input.value = '';
                clearBtn.style.display = 'none';
                input.focus();
            });
        }

        // Source filter chips
        document.querySelectorAll('.source-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('.source-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                this.currentSource = chip.dataset.source;
                if (input.value.trim()) {
                    this.executeSearch(input.value);
                }
            });
        });
    }

    async executeSearch(query) {
        query = query.trim();
        if (!query) return;

        this.switchView('search');

        const queryDisplay = document.getElementById('search-query-display');
        const countDisplay = document.getElementById('search-count');
        const loading = document.getElementById('search-loading');
        const grid = document.getElementById('search-tracks-grid');
        const empty = document.getElementById('search-empty');

        if (queryDisplay) queryDisplay.textContent = `"${query}"`;
        if (countDisplay) countDisplay.textContent = '';
        if (loading) loading.style.display = 'flex';
        if (grid) grid.innerHTML = '';
        if (empty) empty.style.display = 'none';

        try {
            if (window.pywebview && window.pywebview.api) {
                const results = await window.pywebview.api.search(query, this.currentSource, 18);
                if (loading) loading.style.display = 'none';

                if (results && results.length > 0) {
                    if (countDisplay) countDisplay.textContent = `${results.length} треків знайдено`;
                    this.renderTracksGrid(grid, results);
                } else {
                    if (empty) empty.style.display = 'flex';
                }
            }
        } catch (e) {
            console.error('Search error:', e);
            if (loading) loading.style.display = 'none';
            if (empty) empty.style.display = 'flex';
        }
    }

    // ==========================================
    // RENDERING TRACKS
    // ==========================================
    renderTracksGrid(container, tracks) {
        if (!container) return;
        container.innerHTML = '';

        tracks.forEach((track, idx) => {
            const isLiked = this.isLiked(track.id);
            const card = document.createElement('div');
            card.className = 'track-card';

            const sourceTag = track.source === 'soundcloud'
                ? '<span class="card-source-tag sc">SC</span>'
                : '<span class="card-source-tag yt">YT</span>';

            card.innerHTML = `
                <div class="track-card-art">
                    <img src="${track.thumbnail || ''}" alt="Cover" loading="lazy">
                    ${sourceTag}
                    <button class="card-play-btn" title="Відтворити">
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                            <path d="M8 5v14l11-7z"/>
                        </svg>
                    </button>
                </div>
                <div class="track-card-title" title="${this.escapeHtml(track.title)}">${this.escapeHtml(track.title)}</div>
                <div class="track-card-artist" title="${this.escapeHtml(track.artist)}">${this.escapeHtml(track.artist)}</div>
                <div class="track-card-meta">
                    <span>${track.duration_formatted || '--:--'}</span>
                    <div class="card-actions">
                        <button class="card-action-btn ${isLiked ? 'liked' : ''}" data-action="like" title="${isLiked ? 'Видалити з улюблених' : 'В улюблені'}">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                            </svg>
                        </button>
                        <button class="card-action-btn" data-action="add-pl" title="Додати в плейлист">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                            </svg>
                        </button>
                    </div>
                </div>
            `;

            // Card click to play
            card.addEventListener('click', (e) => {
                if (e.target.closest('[data-action]')) return;
                this.player.setQueue(tracks, idx);
            });

            // Like action
            const likeBtn = card.querySelector('[data-action="like"]');
            if (likeBtn) {
                likeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleLike(track, likeBtn);
                });
            }

            // Add to playlist action
            const addPlBtn = card.querySelector('[data-action="add-pl"]');
            if (addPlBtn) {
                addPlBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openPlaylistPicker(track);
                });
            }

            container.appendChild(card);
        });
    }

    renderTracksList(container, tracks, canRemove = false, onRemove = null) {
        if (!container) return;
        container.innerHTML = '';

        if (!tracks || tracks.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>Список порожній</h3>
                    <p>Додайте треки за допомогою пошуку або з головної сторінки.</p>
                </div>
            `;
            return;
        }

        tracks.forEach((track, idx) => {
            const isLiked = this.isLiked(track.id);
            const isPlaying = this.player.currentTrack && this.player.currentTrack.id === track.id;

            const row = document.createElement('div');
            row.className = `track-row ${isPlaying ? 'playing' : ''}`;

            const sourceBadge = track.source === 'soundcloud'
                ? '<span class="track-row-source sc">SC</span>'
                : '<span class="track-row-source yt">YT</span>';

            const removeBtnHtml = canRemove
                ? `<button class="card-action-btn" data-action="remove" title="Видалити з цього списку">
                     <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                         <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                     </svg>
                   </button>`
                : '';

            row.innerHTML = `
                <span class="track-row-index">${idx + 1}</span>
                <img src="${track.thumbnail || ''}" class="track-row-thumb" alt="art">
                <div class="track-row-info">
                    <span class="track-row-title">${this.escapeHtml(track.title)}</span>
                    <span class="track-row-artist">${this.escapeHtml(track.artist)}</span>
                </div>
                <div>${sourceBadge}</div>
                <span>${track.duration_formatted || '--:--'}</span>
                <div class="track-row-actions">
                    <button class="card-action-btn ${isLiked ? 'liked' : ''}" data-action="like" title="${isLiked ? 'Видалити з улюблених' : 'В улюблені'}">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                        </svg>
                    </button>
                    ${removeBtnHtml}
                </div>
            `;

            row.addEventListener('click', (e) => {
                if (e.target.closest('[data-action]')) return;
                this.player.setQueue(tracks, idx);
            });

            const likeBtn = row.querySelector('[data-action="like"]');
            if (likeBtn) {
                likeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleLike(track, likeBtn);
                });
            }

            if (canRemove && onRemove) {
                const remBtn = row.querySelector('[data-action="remove"]');
                if (remBtn) {
                    remBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        onRemove(track.id);
                    });
                }
            }

            container.appendChild(row);
        });
    }

    // ==========================================
    // LIKED & PLAYLIST VIEWS
    // ==========================================
    renderLikedView() {
        const container = document.getElementById('liked-tracks-list');
        const meta = document.getElementById('liked-meta-info');
        const liked = this.library.liked_tracks || [];

        if (meta) meta.textContent = `${liked.length} треків`;

        this.renderTracksList(container, liked, false);

        const btnPlayAll = document.getElementById('btn-play-liked');
        if (btnPlayAll) {
            btnPlayAll.onclick = () => {
                if (liked.length > 0) this.player.setQueue(liked, 0);
            };
        }
    }

    renderHistoryView() {
        const container = document.getElementById('history-tracks-list');
        const history = this.library.history || [];
        this.renderTracksList(container, history, false);
    }

    renderPlaylistView(plId) {
        const pl = this.library.playlists[plId];
        if (!pl) return;

        const title = document.getElementById('current-pl-name');
        const info = document.getElementById('current-pl-info');
        const container = document.getElementById('current-pl-tracks');
        const btnPlay = document.getElementById('btn-play-current-pl');
        const btnDelete = document.getElementById('btn-delete-current-pl');

        if (title) title.textContent = pl.name;
        const tracks = pl.tracks || [];
        if (info) info.textContent = `${tracks.length} треків`;

        this.renderTracksList(container, tracks, true, async (trackId) => {
            if (window.pywebview && window.pywebview.api) {
                await window.pywebview.api.remove_from_playlist(plId, trackId);
                await this.loadLibrary();
                this.renderPlaylistView(plId);
                this.showToast('Трек видалено з плейлиста');
            }
        });

        if (btnPlay) {
            btnPlay.onclick = () => {
                if (tracks.length > 0) this.player.setQueue(tracks, 0);
            };
        }

        if (btnDelete) {
            btnDelete.onclick = async () => {
                if (confirm(`Ви дійсно бажаєте видалити плейлист "${pl.name}"?`)) {
                    if (window.pywebview && window.pywebview.api) {
                        await window.pywebview.api.delete_playlist(plId);
                        await this.loadLibrary();
                        this.switchView('home');
                        this.showToast('Плейлист видалено');
                    }
                }
            };
        }
    }

    // ==========================================
    // LIBRARY SYNC & LIKES
    // ==========================================
    async loadLibrary() {
        if (window.pywebview && window.pywebview.api) {
            this.library = await window.pywebview.api.get_library();
            this.updateSidebarPlaylists();
            this.updateLikedBadge();
        }
    }

    updateSidebarPlaylists() {
        const list = document.getElementById('playlists-list');
        if (!list) return;
        list.innerHTML = '';

        const playlists = Object.values(this.library.playlists || {});
        playlists.forEach(pl => {
            const btn = document.createElement('button');
            btn.className = `playlist-nav-item ${this.currentPlaylistId === pl.id ? 'active' : ''}`;
            btn.dataset.plId = pl.id;
            btn.innerHTML = `
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/>
                </svg>
                <span>${this.escapeHtml(pl.name)}</span>
            `;

            btn.addEventListener('click', () => {
                this.switchView('playlist', pl.id);
            });

            list.appendChild(btn);
        });
    }

    updateLikedBadge() {
        const badge = document.getElementById('liked-count');
        const count = (this.library.liked_tracks || []).length;
        if (badge) badge.textContent = count;
    }

    isLiked(trackId) {
        if (!trackId || !this.library.liked_tracks) return false;
        return this.library.liked_tracks.some(t => t.id === trackId);
    }

    async toggleLike(track, btnElem = null) {
        if (!window.pywebview || !window.pywebview.api || !track) return;

        const res = await window.pywebview.api.toggle_like(track);
        await this.loadLibrary();

        if (btnElem) {
            btnElem.classList.toggle('liked', res.is_liked);
            btnElem.title = res.is_liked ? 'Видалити з улюблених' : 'В улюблені';
        }

        // Sync player bar like button if this is current track
        if (this.player.currentTrack && this.player.currentTrack.id === track.id) {
            const playerLikeBtn = document.getElementById('player-like-btn');
            if (playerLikeBtn) playerLikeBtn.classList.toggle('liked', res.is_liked);
        }

        this.showToast(res.is_liked ? 'Додано до улюблених ❤️' : 'Видалено з улюблених');
    }

    // ==========================================
    // PLAYER CONTROLS & QUEUE
    // ==========================================
    setupPlayerControls() {
        // Play / Pause
        document.getElementById('btn-play-pause')?.addEventListener('click', () => {
            this.player.togglePlayPause();
        });

        // Next / Prev
        document.getElementById('btn-next')?.addEventListener('click', () => this.player.next());
        document.getElementById('btn-prev')?.addEventListener('click', () => this.player.prev());

        // Shuffle / Repeat
        document.getElementById('btn-shuffle')?.addEventListener('click', () => this.player.toggleShuffle());
        document.getElementById('btn-repeat')?.addEventListener('click', () => this.player.toggleRepeat());

        // Player Bar Like Button
        document.getElementById('player-like-btn')?.addEventListener('click', () => {
            if (this.player.currentTrack) {
                this.toggleLike(this.player.currentTrack, document.getElementById('player-like-btn'));
            }
        });

        // Seekbar
        const seekbar = document.getElementById('seekbar');
        if (seekbar) {
            seekbar.addEventListener('input', () => {
                if (this.player.audio.duration) {
                    const time = (seekbar.value / 100) * this.player.audio.duration;
                    this.player.seek(time);
                }
            });
        }

        // Volume
        const volSlider = document.getElementById('volume-slider');
        if (volSlider) {
            volSlider.addEventListener('input', () => {
                this.player.setVolume(volSlider.value);
            });
        }

        document.getElementById('btn-mute')?.addEventListener('click', () => {
            this.player.toggleMute();
        });

        // Queue drawer toggle
        const queuePanel = document.getElementById('queue-panel');
        document.getElementById('btn-toggle-queue')?.addEventListener('click', () => {
            queuePanel?.classList.toggle('open');
            this.updateQueueDrawer();
        });

        document.getElementById('btn-close-queue')?.addEventListener('click', () => {
            queuePanel?.classList.remove('open');
        });
    }

    onTrackChange(track) {
        // Update liked state on player bar
        const playerLikeBtn = document.getElementById('player-like-btn');
        if (playerLikeBtn) {
            playerLikeBtn.classList.toggle('liked', this.isLiked(track.id));
        }
        this.updateQueueDrawer();

        // If currently in history view, refresh
        if (this.currentView === 'history') {
            this.loadLibrary().then(() => this.renderHistoryView());
        }
    }

    updateQueueDrawer() {
        const nowPlayingContainer = document.getElementById('queue-now-playing');
        const nextTracksContainer = document.getElementById('queue-next-tracks');

        if (!nowPlayingContainer || !nextTracksContainer) return;

        const current = this.player.currentTrack;
        if (current) {
            nowPlayingContainer.innerHTML = `
                <div class="queue-track-item">
                    <img src="${current.thumbnail || ''}" class="queue-track-thumb" alt="art">
                    <div class="queue-track-info">
                        <div class="queue-track-title">${this.escapeHtml(current.title)}</div>
                        <div class="queue-track-artist">${this.escapeHtml(current.artist)}</div>
                    </div>
                </div>
            `;
        } else {
            nowPlayingContainer.innerHTML = '<p class="text-muted" style="font-size:0.8rem;">Нічого не грає</p>';
        }

        const nextTracks = this.player.queue.slice(this.player.currentIndex + 1);
        if (nextTracks.length > 0) {
            nextTracksContainer.innerHTML = nextTracks.map((t, idx) => `
                <div class="queue-track-item" data-q-idx="${this.player.currentIndex + 1 + idx}">
                    <img src="${t.thumbnail || ''}" class="queue-track-thumb" alt="art">
                    <div class="queue-track-info">
                        <div class="queue-track-title">${this.escapeHtml(t.title)}</div>
                        <div class="queue-track-artist">${this.escapeHtml(t.artist)}</div>
                    </div>
                </div>
            `).join('');

            nextTracksContainer.querySelectorAll('.queue-track-item').forEach(item => {
                item.addEventListener('click', () => {
                    const targetIdx = parseInt(item.dataset.qIdx);
                    this.player.playTrackAtIndex(targetIdx);
                });
            });
        } else {
            nextTracksContainer.innerHTML = '<p class="text-muted" style="font-size:0.8rem;">Кінець черги</p>';
        }
    }

    // ==========================================
    // MODALS: PLAYLISTS
    // ==========================================
    setupModals() {
        // Create Playlist Modal
        const createModal = document.getElementById('modal-create-playlist');
        const inputName = document.getElementById('input-new-pl-name');

        document.getElementById('btn-create-playlist-modal')?.addEventListener('click', () => {
            createModal.style.display = 'flex';
            inputName.value = '';
            inputName.focus();
        });

        document.getElementById('btn-cancel-create-pl')?.addEventListener('click', () => {
            createModal.style.display = 'none';
        });

        document.getElementById('btn-confirm-create-pl')?.addEventListener('click', async () => {
            const name = inputName.value.trim();
            if (!name) return;

            if (window.pywebview && window.pywebview.api) {
                const newPl = await window.pywebview.api.create_playlist(name);
                await this.loadLibrary();
                createModal.style.display = 'none';
                this.switchView('playlist', newPl.id);
                this.showToast(`Плейлист "${name}" створено!`);
            }
        });

        // Add to Playlist Picker
        const pickerModal = document.getElementById('modal-picker-playlist');
        document.getElementById('btn-close-picker-pl')?.addEventListener('click', () => {
            pickerModal.style.display = 'none';
        });
    }

    openPlaylistPicker(track) {
        this.trackForPlaylistModal = track;
        const pickerModal = document.getElementById('modal-picker-playlist');
        const list = document.getElementById('picker-playlist-list');

        if (!pickerModal || !list) return;

        list.innerHTML = '';
        const playlists = Object.values(this.library.playlists || {});

        if (playlists.length === 0) {
            list.innerHTML = '<p class="text-muted">Немає створених плейлистів. Створіть новий з панелі зліва.</p>';
        } else {
            playlists.forEach(pl => {
                const item = document.createElement('div');
                item.className = 'picker-item';
                item.innerHTML = `
                    <span>${this.escapeHtml(pl.name)}</span>
                    <span class="text-muted" style="font-size:0.75rem;">${(pl.tracks || []).length} треків</span>
                `;

                item.addEventListener('click', async () => {
                    if (window.pywebview && window.pywebview.api) {
                        await window.pywebview.api.add_to_playlist(pl.id, track);
                        await this.loadLibrary();
                        pickerModal.style.display = 'none';
                        this.showToast(`Додано до "${pl.name}"`);
                    }
                });

                list.appendChild(item);
            });
        }

        pickerModal.style.display = 'flex';
    }

    // ==========================================
    // KEYBOARD SHORTCUTS
    // ==========================================
    setupKeyboardShortcuts() {
        window.addEventListener('keydown', (e) => {
            // Ignore if active input
            if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
                if (e.key === 'Escape') {
                    document.activeElement.blur();
                }
                return;
            }

            if (e.code === 'Space') {
                e.preventDefault();
                this.player.togglePlayPause();
            } else if (e.code === 'ArrowRight') {
                e.preventDefault();
                this.player.seek(this.player.audio.currentTime + 5);
            } else if (e.code === 'ArrowLeft') {
                e.preventDefault();
                this.player.seek(this.player.audio.currentTime - 5);
            } else if (e.code === 'ArrowUp') {
                e.preventDefault();
                this.player.setVolume(this.player.audio.volume + 0.05);
            } else if (e.code === 'ArrowDown') {
                e.preventDefault();
                this.player.setVolume(this.player.audio.volume - 0.05);
            } else if (e.key === 'm' || e.key === 'M') {
                this.player.toggleMute();
            } else if (e.key === '/') {
                e.preventDefault();
                document.getElementById('search-input')?.focus();
            }
        });
    }

    // ==========================================
    // SYSTEM STATS (RAM & CPU BADGE)
    // ==========================================
    setupStatsUpdater() {
        setInterval(() => this.updateStats(), 4000);
    }

    async updateStats() {
        try {
            if (window.pywebview && window.pywebview.api) {
                const stats = await window.pywebview.api.get_system_stats();
                const textElem = document.getElementById('stats-text');
                if (textElem && stats) {
                    textElem.textContent = `⚡ RAM: ${stats.ram_mb} MB | CPU: ${stats.cpu_percent}%`;
                }
            }
        } catch (e) {
            // Silently ignore stats error
        }
    }

    // ==========================================
    // SOUNDCLOUD PROFILE & ADMIN SYSTEM
    // ==========================================
    setupProfile() {
        this.profile = {
            name: "FEODAL",
            role: "admin", // listener | artist | moderator | admin
            banner_preset: "beige",
            banner_url: "",
            avatar_url: "assets/icon.png",
            followers: 1420,
            following: 2,
            hq_audio: true,
            bass_boost: true,
            bass_level: 6
        };

        // Tab switching in profile view
        document.querySelectorAll('.sc-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.sc-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const tab = btn.dataset.tab;
                const tracksPanel = document.getElementById('sc-tab-content-tracks');
                const adminPanel = document.getElementById('sc-tab-content-admin');

                if (tab === 'admin') {
                    if (tracksPanel) tracksPanel.style.display = 'none';
                    if (adminPanel) adminPanel.style.display = 'block';
                } else {
                    if (adminPanel) adminPanel.style.display = 'none';
                    if (tracksPanel) tracksPanel.style.display = 'block';
                    this.renderProfileTabTracks(tab);
                }
            });
        });

        // Role Dropdown Toggle
        const roleBadge = document.getElementById('sc-current-role-badge');
        const roleDropdown = document.getElementById('sc-role-dropdown');

        if (roleBadge && roleDropdown) {
            roleBadge.addEventListener('click', (e) => {
                e.stopPropagation();
                roleDropdown.style.display = roleDropdown.style.display === 'none' ? 'flex' : 'none';
            });

            document.addEventListener('click', () => {
                roleDropdown.style.display = 'none';
            });
        }

        // Role option buttons in dropdown
        document.querySelectorAll('.role-option-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const role = btn.dataset.role;
                this.setRole(role);
                if (roleDropdown) roleDropdown.style.display = 'none';
            });
        });

        // Role option pills in admin panel
        document.querySelectorAll('.role-pill-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const role = btn.dataset.roleSelect;
                this.setRole(role);
            });
        });

        // HQ Audio Toggle (Admin privilege)
        const hqToggle = document.getElementById('admin-hq-toggle');
        if (hqToggle) {
            hqToggle.addEventListener('change', (e) => {
                const enabled = e.target.checked;
                this.profile.hq_audio = enabled;
                const badge = document.getElementById('admin-hq-badge');
                if (badge) {
                    badge.textContent = enabled ? 'АКТИВОВАНО (320 KBPS)' : 'ВИМКНЕНО (СТАНДАРТ)';
                    badge.classList.toggle('active', enabled);
                }
                this.showToast(enabled ? '⚡ HQ Audio 320 kbps активовано!' : 'HQ Audio вимкнено');
                this.saveProfile();
            });
        }

        // Bass Boost Toggle & Slider (Admin privilege)
        const bassToggle = document.getElementById('admin-bass-toggle');
        const bassSlider = document.getElementById('admin-bass-slider');
        const bassVal = document.getElementById('admin-bass-val');

        if (bassToggle) {
            bassToggle.addEventListener('change', (e) => {
                const enabled = e.target.checked;
                this.profile.bass_boost = enabled;
                const gain = bassSlider ? parseInt(bassSlider.value, 10) : 6;
                this.player.setBassBoost(enabled, gain);
                this.showToast(enabled ? '🎚️ Studio Bass Boost увімкнено!' : 'Bass Boost вимкнено');
                this.saveProfile();
            });
        }

        if (bassSlider) {
            bassSlider.addEventListener('input', (e) => {
                const val = parseInt(e.target.value, 10);
                this.profile.bass_level = val;
                if (bassVal) bassVal.textContent = `+${val} dB`;
                if (bassToggle && bassToggle.checked) {
                    this.player.setBassBoost(true, val);
                }
            });
            bassSlider.addEventListener('change', () => this.saveProfile());
        }

        // Banner theme presets (chips in admin and modal)
        document.querySelectorAll('.preset-chip, .banner-preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const preset = btn.dataset.preset;
                this.setBannerPreset(preset);
            });
        });

        // Banner buttons in header
        document.getElementById('btn-upload-banner')?.addEventListener('click', () => {
            document.getElementById('modal-banner-presets').style.display = 'flex';
        });
        document.getElementById('btn-banner-presets')?.addEventListener('click', () => {
            document.getElementById('modal-banner-presets').style.display = 'flex';
        });
        document.getElementById('btn-close-banner-presets')?.addEventListener('click', () => {
            document.getElementById('modal-banner-presets').style.display = 'none';
        });
        document.getElementById('btn-apply-custom-banner')?.addEventListener('click', () => {
            const input = document.getElementById('input-custom-banner');
            if (input && input.value.trim()) {
                this.setCustomBanner(input.value.trim());
                document.getElementById('modal-banner-presets').style.display = 'none';
            }
        });

        // Edit Profile modal
        document.getElementById('btn-profile-edit')?.addEventListener('click', () => {
            this.openEditProfileModal();
        });
        document.getElementById('btn-edit-avatar')?.addEventListener('click', () => {
            this.openEditProfileModal();
        });
        document.getElementById('btn-cancel-edit-profile')?.addEventListener('click', () => {
            document.getElementById('modal-edit-profile').style.display = 'none';
        });
        document.getElementById('btn-save-edit-profile')?.addEventListener('click', () => {
            const nameInput = document.getElementById('input-profile-name');
            const avatarInput = document.getElementById('input-profile-avatar');
            if (nameInput && nameInput.value.trim()) {
                this.profile.name = nameInput.value.trim();
            }
            if (avatarInput && avatarInput.value.trim()) {
                this.profile.avatar_url = avatarInput.value.trim();
            }
            this.saveProfile();
            this.updateProfileUI();
            document.getElementById('modal-edit-profile').style.display = 'none';
            this.showToast('Профіль оновлено!');
        });

        // Share Profile Button
        document.getElementById('btn-profile-share')?.addEventListener('click', () => {
            if (navigator.clipboard) {
                navigator.clipboard.writeText(`soundflow://user/${this.profile.name}`);
            }
            this.showToast(`Посилання на профіль ${this.profile.name} скопійовано! 🔗`);
        });

        // View All Likes Link
        document.getElementById('btn-view-all-likes')?.addEventListener('click', () => {
            this.switchView('liked');
        });

        // Clean cache button (Admin)
        document.getElementById('btn-admin-clean-cache')?.addEventListener('click', async () => {
            if (window.pywebview && window.pywebview.api) {
                await window.pywebview.api.clear_cache();
                this.showToast('🧹 Кеш додатку очищено! Пам\'ять оптимізовано ⚡');
            }
        });

        // Export / Import library (Admin)
        document.getElementById('btn-export-library')?.addEventListener('click', async () => {
            if (window.pywebview && window.pywebview.api) {
                const dataStr = await window.pywebview.api.export_library();
                const blob = new Blob([dataStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `SoundFlow_Backup_${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
                this.showToast('Бібліотеку експортовано у файл JSON');
            }
        });

        document.getElementById('btn-import-library')?.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = async (re) => {
                        try {
                            if (window.pywebview && window.pywebview.api) {
                                const ok = await window.pywebview.api.import_library(re.target.result);
                                if (ok) {
                                    await this.loadLibrary();
                                    this.showToast('Бібліотеку успішно імпортовано!');
                                } else {
                                    this.showToast('Помилка: невірний формат JSON');
                                }
                            }
                        } catch(err) {
                            this.showToast('Помилка імпорту');
                        }
                    };
                    reader.readAsText(file);
                }
            };
            input.click();
        });
    }

    async setRole(roleName) {
        const validRoles = ['listener', 'artist', 'moderator', 'admin'];
        if (!validRoles.includes(roleName)) roleName = 'admin';

        this.profile.role = roleName;
        this.updateProfileUI();
        this.saveProfile();

        const roleLabels = {
            listener: '🎧 Слухач',
            artist: '🎙️ Виконавець',
            moderator: '🛡️ Модератор',
            admin: '👑 Адміністратор (ADMIN)'
        };
        this.showToast(`Роль встановлено: ${roleLabels[roleName]}`);
    }

    setBannerPreset(preset) {
        this.profile.banner_preset = preset;
        this.profile.banner_url = "";
        const banner = document.getElementById('sc-profile-banner');
        if (banner) {
            banner.className = `sc-profile-header preset-${preset}`;
            banner.style.backgroundImage = '';
        }
        document.querySelectorAll('.preset-chip, .banner-preset-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.preset === preset);
        });
        this.saveProfile();
    }

    setCustomBanner(url) {
        this.profile.banner_preset = "custom";
        this.profile.banner_url = url;
        const banner = document.getElementById('sc-profile-banner');
        if (banner) {
            banner.className = 'sc-profile-header';
            banner.style.backgroundImage = `url('${url}')`;
            banner.style.backgroundSize = 'cover';
        }
        this.saveProfile();
        this.showToast('Обкладинку оновлено!');
    }

    openEditProfileModal() {
        const modal = document.getElementById('modal-edit-profile');
        if (!modal) return;
        const nameInput = document.getElementById('input-profile-name');
        const avatarInput = document.getElementById('input-profile-avatar');
        if (nameInput) nameInput.value = this.profile.name || 'FEODAL';
        if (avatarInput) avatarInput.value = this.profile.avatar_url || '';
        modal.style.display = 'flex';
    }

    async saveProfile() {
        if (window.pywebview && window.pywebview.api) {
            await window.pywebview.api.update_profile(this.profile);
        }
    }

    updateProfileUI() {
        const { name, role, avatar_url, followers, following } = this.profile;

        // Nickname
        const nameEl = document.getElementById('sc-profile-name');
        if (nameEl) nameEl.textContent = name || 'FEODAL';

        // Avatar
        const avatarEl = document.getElementById('sc-profile-avatar');
        if (avatarEl) {
            avatarEl.src = avatar_url || 'assets/icon.png';
        }

        // Role definitions
        const roleData = {
            admin: { icon: '👑', title: 'АДМІНІСТРАТОР', cls: 'role-admin' },
            moderator: { icon: '🛡️', title: 'МОДЕРАТОР', cls: 'role-moderator' },
            artist: { icon: '🎙️', title: 'ВИКОНАВЕЦЬ', cls: 'role-artist' },
            listener: { icon: '🎧', title: 'СЛУХАЧ', cls: 'role-listener' }
        };
        const currentRole = roleData[role] || roleData.admin;

        // Header role badge
        const badgeEl = document.getElementById('sc-current-role-badge');
        const iconEl = document.getElementById('sc-role-icon');
        const titleEl = document.getElementById('sc-role-title');

        if (badgeEl) {
            badgeEl.className = `sc-role-badge ${currentRole.cls}`;
        }
        if (iconEl) iconEl.textContent = currentRole.icon;
        if (titleEl) titleEl.textContent = currentRole.title;

        // Sidebar role badge pill
        const navPill = document.getElementById('nav-role-badge');
        if (navPill) {
            navPill.className = `role-badge-pill ${role}`;
            navPill.textContent = role.toUpperCase();
        }

        // Active state in dropdown & admin selector
        document.querySelectorAll('.role-option-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.role === role);
        });
        document.querySelectorAll('.role-pill-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.roleSelect === role);
        });

        // Banner preset
        if (this.profile.banner_url) {
            const banner = document.getElementById('sc-profile-banner');
            if (banner) {
                banner.className = 'sc-profile-header';
                banner.style.backgroundImage = `url('${this.profile.banner_url}')`;
            }
        } else if (this.profile.banner_preset) {
            const banner = document.getElementById('sc-profile-banner');
            if (banner) {
                banner.className = `sc-profile-header preset-${this.profile.banner_preset}`;
            }
        }

        // Stats
        const followersEl = document.getElementById('sc-stat-followers');
        const followingEl = document.getElementById('sc-stat-following');
        const tracksEl = document.getElementById('sc-stat-tracks');
        const likesCountHeader = document.getElementById('sc-likes-count-header');

        const likedCount = (this.library.liked_tracks || []).length;
        if (followersEl) followersEl.textContent = (followers || 1420).toLocaleString();
        if (followingEl) followingEl.textContent = following || 2;
        if (tracksEl) tracksEl.textContent = likedCount;
        if (likesCountHeader) likesCountHeader.textContent = `${likedCount} LIKES`;
    }

    async renderProfileView() {
        if (window.pywebview && window.pywebview.api) {
            const backendProfile = await window.pywebview.api.get_profile();
            if (backendProfile) {
                this.profile = { ...this.profile, ...backendProfile };
            }
        }

        // Sync Clerk user image & name if available
        if (window.soundFlowAuth && window.soundFlowAuth.user) {
            const u = window.soundFlowAuth.user;
            if (!this.profile.avatar_url && u.imageUrl) {
                this.profile.avatar_url = u.imageUrl;
            }
            if (this.profile.name === 'FEODAL' && (u.fullName || u.firstName)) {
                this.profile.name = (u.fullName || u.firstName).toUpperCase();
            }
        }

        this.updateProfileUI();

        // Render Hero / Recent Featured Track with SoundCloud Waveform
        const history = this.library.history || [];
        const liked = this.library.liked_tracks || [];
        const featuredTrack = history[0] || liked[0] || (this.currentDiscoverTracks ? this.currentDiscoverTracks[0] : null);

        const heroCard = document.getElementById('sc-featured-track-card');
        if (featuredTrack && heroCard) {
            heroCard.style.display = 'flex';
            const cover = document.getElementById('sc-hero-cover');
            const title = document.getElementById('sc-hero-title');
            const artist = document.getElementById('sc-hero-artist');
            const timeEl = document.getElementById('sc-hero-time');
            const playToggle = document.getElementById('sc-hero-play-toggle');

            if (cover) cover.src = featuredTrack.thumbnail || 'assets/icon.png';
            if (title) title.textContent = featuredTrack.title || 'Track Name';
            if (artist) artist.textContent = featuredTrack.artist || 'SoundFlow Artist';
            if (timeEl) timeEl.textContent = 'recently played';

            // Generate SoundCloud waveform bars
            const waveContainer = document.getElementById('sc-waveform-bars');
            if (waveContainer) {
                waveContainer.innerHTML = '';
                const barCount = 65;
                for (let i = 0; i < barCount; i++) {
                    const bar = document.createElement('div');
                    bar.className = `sc-wave-bar ${i < 20 ? 'played' : ''}`;
                    const heightPercent = 20 + Math.abs(Math.sin(i * 0.28) * 60) + (Math.random() * 20);
                    bar.style.height = `${heightPercent}%`;
                    waveContainer.appendChild(bar);
                }
            }

            if (playToggle) {
                playToggle.onclick = () => {
                    this.player.setQueue([featuredTrack], 0);
                };
            }
        } else if (heroCard) {
            heroCard.style.display = 'none';
        }

        // Render Tracks in Profile
        this.renderProfileTabTracks('all');

        // Render Mini Likes in Sidebar
        this.renderProfileMiniLikes();
    }

    renderProfileTabTracks(tab) {
        const container = document.getElementById('sc-profile-tracks-list');
        if (!container) return;

        let tracks = [];
        if (tab === 'all') {
            tracks = [...(this.library.history || []), ...(this.library.liked_tracks || [])];
            const seen = new Set();
            tracks = tracks.filter(t => {
                if (seen.has(t.id)) return false;
                seen.add(t.id);
                return true;
            });
        } else if (tab === 'popular' || tab === 'tracks') {
            tracks = this.library.liked_tracks || [];
        } else if (tab === 'history') {
            tracks = this.library.history || [];
        } else if (tab === 'playlists') {
            const allPlTracks = [];
            Object.values(this.library.playlists || {}).forEach(pl => {
                allPlTracks.push(...(pl.tracks || []));
            });
            tracks = allPlTracks;
        }

        if (tracks.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="padding: 30px 0;">
                    <p>Немає треків для відображення у цій вкладці.</p>
                </div>
            `;
            return;
        }

        this.renderTracksList(container, tracks.slice(0, 20), false);
    }

    renderProfileMiniLikes() {
        const container = document.getElementById('sc-mini-likes-list');
        if (!container) return;
        container.innerHTML = '';

        const liked = (this.library.liked_tracks || []).slice(0, 5);
        if (liked.length === 0) {
            container.innerHTML = `<span style="font-size:0.75rem; color:var(--text-muted);">Ще немає вподобаних треків</span>`;
            return;
        }

        liked.forEach(track => {
            const item = document.createElement('div');
            item.className = 'sc-mini-track-item';
            item.innerHTML = `
                <img src="${track.thumbnail || 'assets/icon.png'}" class="sc-mini-thumb" alt="Thumb">
                <div class="sc-mini-meta">
                    <span class="sc-mini-title">${this.escapeHtml(track.title)}</span>
                    <span class="sc-mini-artist">${this.escapeHtml(track.artist)}</span>
                </div>
            `;
            item.onclick = () => {
                this.player.setQueue([track], 0);
            };
            container.appendChild(item);
        });
    }

    // ==========================================
    // HELPERS & TOAST
    // ==========================================
    showToast(message) {
        const toast = document.getElementById('toast');
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 2600);
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
    window.soundFlowApp = new SoundFlowApp();
});
