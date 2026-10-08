/**
 * SoundFlow Audio Playback Engine
 * Uses native HTML5 Audio element with streaming buffer and preloading.
 */
class SoundFlowPlayer {
    constructor() {
        this.audio = new Audio();
        this.audio.preload = 'auto';

        this.queue = [];
        this.currentIndex = -1;
        this.currentTrack = null;

        this.shuffle = false;
        this.repeat = 'off'; // 'off' | 'all' | 'one'
        this.isMuted = false;
        this.lastVolume = 0.8;
        this.isLoading = false;

        this.prefetchedUrl = null;
        this.prefetchedTrackId = null;

        this.audioCtx = null;
        this.bassFilter = null;
        this.trebleFilter = null;
        this.bassBoostEnabled = true;
        this.bassGain = 6;
        this.hqAudioEnabled = true;

        this.visualizer = new WaveformVisualizer('visualizer-canvas');

        this.setupAudioListeners();
        this.setupMediaSession();
    }

    setupAudioContext() {
        if (this.audioCtx) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            this.audioCtx = new AudioContext();
            this.source = this.audioCtx.createMediaElementSource(this.audio);
            
            this.bassFilter = this.audioCtx.createBiquadFilter();
            this.bassFilter.type = 'lowshelf';
            this.bassFilter.frequency.value = 120;
            this.bassFilter.gain.value = this.bassBoostEnabled ? this.bassGain : 0;

            this.trebleFilter = this.audioCtx.createBiquadFilter();
            this.trebleFilter.type = 'peaking';
            this.trebleFilter.frequency.value = 3500;
            this.trebleFilter.gain.value = 2;

            this.source.connect(this.bassFilter);
            this.bassFilter.connect(this.trebleFilter);
            this.trebleFilter.connect(this.audioCtx.destination);
        } catch (e) {
            console.warn("WebAudio DSP init error:", e);
        }
    }

    setBassBoost(enabled, gain = 6) {
        this.bassBoostEnabled = enabled;
        this.bassGain = gain;
        if (!this.audioCtx) this.setupAudioContext();
        if (this.bassFilter) {
            this.bassFilter.gain.value = enabled ? gain : 0;
        }
    }

    setupAudioListeners() {
        this.audio.addEventListener('play', () => {
            this.visualizer.start();
            this.updatePlayPauseUI(true);
        });

        this.audio.addEventListener('pause', () => {
            this.visualizer.stop();
            this.updatePlayPauseUI(false);
        });

        this.audio.addEventListener('timeupdate', () => {
            this.onTimeUpdate();
        });

        this.audio.addEventListener('progress', () => {
            this.onProgressUpdate();
        });

        this.audio.addEventListener('ended', () => {
            this.onTrackEnded();
        });

        this.audio.addEventListener('error', (e) => {
            console.error('Audio playback error:', e);
            this.showLoading(false);
            if (window.soundFlowApp) {
                window.soundFlowApp.showToast('Помилка відтворення треку. Перехід до наступного...');
            }
            setTimeout(() => this.next(), 1000);
        });
    }

    setupMediaSession() {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.setActionHandler('play', () => this.play());
            navigator.mediaSession.setActionHandler('pause', () => this.pause());
            navigator.mediaSession.setActionHandler('previoustrack', () => this.prev());
            navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
            navigator.mediaSession.setActionHandler('seekto', (details) => {
                if (details.seekTime) this.seek(details.seekTime);
            });
        }
    }

    updateMediaSession(track) {
        if ('mediaSession' in navigator && track) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: track.title || 'SoundFlow Track',
                artist: track.artist || 'Unknown Artist',
                artwork: [
                    { src: track.thumbnail || '', sizes: '512x512', type: 'image/jpeg' }
                ]
            });
        }
    }

    setQueue(tracks, startIndex = 0) {
        this.queue = Array.isArray(tracks) ? [...tracks] : [];
        if (this.queue.length > 0) {
            this.playTrackAtIndex(startIndex);
        }
        if (window.soundFlowApp) {
            window.soundFlowApp.updateQueueDrawer();
        }
    }

    addToQueue(track) {
        if (!track) return;
        this.queue.push(track);
        if (this.currentIndex === -1) {
            this.playTrackAtIndex(0);
        }
        if (window.soundFlowApp) {
            window.soundFlowApp.updateQueueDrawer();
            window.soundFlowApp.showToast(`Додано до черги: ${track.title}`);
        }
    }

    async playTrackAtIndex(index) {
        if (index < 0 || index >= this.queue.length) return;

        this.currentIndex = index;
        const track = this.queue[index];
        this.currentTrack = track;

        this.updateNowPlayingUI(track);
        this.showLoading(true);

        try {
            let streamUrl = null;

            // Check if we already prefetched this track
            if (this.prefetchedTrackId === track.id && this.prefetchedUrl) {
                streamUrl = this.prefetchedUrl;
            } else if (window.pywebview && window.pywebview.api) {
                streamUrl = await window.pywebview.api.get_stream(track);
            }

            if (!streamUrl) {
                throw new Error('Не вдалося отримати аудіопотік');
            }

            this.audio.src = streamUrl;
            await this.audio.play();
            this.showLoading(false);
            this.updateMediaSession(track);

            // Record in history & notify app
            if (window.pywebview && window.pywebview.api) {
                window.pywebview.api.record_history(track);
            }
            if (window.soundFlowApp) {
                window.soundFlowApp.onTrackChange(track);
            }

        } catch (err) {
            console.error('Play error:', err);
            this.showLoading(false);
            if (window.soundFlowApp) {
                window.soundFlowApp.showToast('Не вдалося відтворити трек');
            }
        }
    }

    play() {
        if (!this.audioCtx) {
            this.setupAudioContext();
        } else if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }

        if (this.audio.src) {
            this.audio.play().catch(e => console.warn(e));
        } else if (this.queue.length > 0) {
            this.playTrackAtIndex(0);
        }
    }

    pause() {
        this.audio.pause();
    }

    togglePlayPause() {
        if (this.audio.paused) {
            this.play();
        } else {
            this.pause();
        }
    }

    next() {
        if (this.queue.length === 0) return;

        let nextIdx = this.currentIndex + 1;
        if (this.shuffle) {
            nextIdx = Math.floor(Math.random() * this.queue.length);
        }

        if (nextIdx >= this.queue.length) {
            if (this.repeat === 'all') {
                nextIdx = 0;
            } else {
                return; // Stop at end of queue
            }
        }

        this.playTrackAtIndex(nextIdx);
    }

    prev() {
        if (this.audio.currentTime > 3) {
            // Restart current track
            this.audio.currentTime = 0;
            return;
        }

        if (this.queue.length === 0) return;

        let prevIdx = this.currentIndex - 1;
        if (prevIdx < 0) {
            prevIdx = this.repeat === 'all' ? this.queue.length - 1 : 0;
        }
        this.playTrackAtIndex(prevIdx);
    }

    toggleShuffle() {
        this.shuffle = !this.shuffle;
        const btn = document.getElementById('btn-shuffle');
        if (btn) btn.classList.toggle('active', this.shuffle);
        if (window.soundFlowApp) {
            window.soundFlowApp.showToast(this.shuffle ? 'Випадковий порядок увімкнено' : 'Порядок за чергою');
        }
    }

    toggleRepeat() {
        const modes = ['off', 'all', 'one'];
        const nextIdx = (modes.indexOf(this.repeat) + 1) % modes.length;
        this.repeat = modes[nextIdx];

        const btn = document.getElementById('btn-repeat');
        const badge = document.getElementById('repeat-badge');

        if (btn && badge) {
            if (this.repeat === 'off') {
                btn.classList.remove('active');
                badge.style.display = 'none';
                btn.title = 'Повторення (Вимкнено)';
            } else if (this.repeat === 'all') {
                btn.classList.add('active');
                badge.style.display = 'none';
                btn.title = 'Повторювати все';
            } else {
                btn.classList.add('active');
                badge.style.display = 'flex';
                btn.title = 'Повторювати цей трек';
            }
        }
    }

    seek(timeSeconds) {
        if (this.audio.duration) {
            this.audio.currentTime = Math.max(0, Math.min(timeSeconds, this.audio.duration));
        }
    }

    setVolume(value) {
        const v = Math.max(0, Math.min(1, parseFloat(value)));
        this.audio.volume = v;
        if (v > 0) this.isMuted = false;
        this.updateVolumeUI();
    }

    toggleMute() {
        if (this.isMuted || this.audio.volume === 0) {
            this.audio.volume = this.lastVolume || 0.8;
            this.isMuted = false;
        } else {
            this.lastVolume = this.audio.volume;
            this.audio.volume = 0;
            this.isMuted = true;
        }
        this.updateVolumeUI();
    }

    onTrackEnded() {
        if (this.repeat === 'one') {
            this.audio.currentTime = 0;
            this.audio.play();
        } else {
            this.next();
        }
    }

    onTimeUpdate() {
        const current = this.audio.currentTime || 0;
        const duration = this.audio.duration || 0;

        const currentElem = document.getElementById('time-current');
        const totalElem = document.getElementById('time-total');
        const seekbar = document.getElementById('seekbar');
        const progress = document.getElementById('seekbar-progress');

        if (currentElem) currentElem.textContent = this.formatTime(current);
        if (totalElem && duration > 0) totalElem.textContent = this.formatTime(duration);

        if (duration > 0 && seekbar && progress) {
            const pct = (current / duration) * 100;
            seekbar.value = pct;
            progress.style.width = `${pct}%`;

            // Pre-fetch next track if 15s remaining
            if (duration - current < 15 && !this.prefetchedUrl) {
                this.prefetchNextTrack();
            }
        }
    }

    onProgressUpdate() {
        const buffer = document.getElementById('seekbar-buffer');
        if (!buffer || !this.audio.duration) return;

        if (this.audio.buffered.length > 0) {
            const bufferedEnd = this.audio.buffered.end(this.audio.buffered.length - 1);
            const duration = this.audio.duration;
            buffer.style.width = `${(bufferedEnd / duration) * 100}%`;
        }
    }

    async prefetchNextTrack() {
        const nextIdx = this.currentIndex + 1;
        if (nextIdx < this.queue.length && window.pywebview && window.pywebview.api) {
            const nextTrack = this.queue[nextIdx];
            try {
                this.prefetchedTrackId = nextTrack.id;
                this.prefetchedUrl = await window.pywebview.api.get_stream(nextTrack);
            } catch (e) {
                console.warn('Pre-fetch failed', e);
            }
        }
    }

    updateNowPlayingUI(track) {
        const thumb = document.getElementById('player-thumb');
        const thumbPh = document.getElementById('player-thumb-ph');
        const title = document.getElementById('player-title');
        const artist = document.getElementById('player-artist');
        const sourceBadge = document.getElementById('player-source-badge');
        const likeBtn = document.getElementById('player-like-btn');

        if (track.thumbnail) {
            thumb.src = track.thumbnail;
            thumb.style.display = 'block';
            thumbPh.style.display = 'none';
        } else {
            thumb.style.display = 'none';
            thumbPh.style.display = 'flex';
        }

        title.textContent = track.title || 'Unknown Title';
        title.title = track.title || '';
        artist.textContent = track.artist || 'Unknown Artist';

        if (sourceBadge) {
            sourceBadge.style.display = 'inline-block';
            sourceBadge.textContent = track.source === 'soundcloud' ? 'SC' : 'YT';
            sourceBadge.className = `source-tag ${track.source === 'soundcloud' ? 'sc' : 'yt'}`;
        }

        if (likeBtn) {
            likeBtn.style.display = 'flex';
        }
    }

    updatePlayPauseUI(isPlaying) {
        const playIcon = document.getElementById('play-icon');
        const pauseIcon = document.getElementById('pause-icon');
        if (playIcon && pauseIcon) {
            playIcon.style.display = isPlaying ? 'none' : 'block';
            pauseIcon.style.display = isPlaying ? 'block' : 'none';
        }
    }

    showLoading(isLoading) {
        this.isLoading = isLoading;
        const spinner = document.getElementById('player-spinner');
        const playIcon = document.getElementById('play-icon');
        const pauseIcon = document.getElementById('pause-icon');

        if (spinner) spinner.style.display = isLoading ? 'block' : 'none';
        if (isLoading) {
            if (playIcon) playIcon.style.display = 'none';
            if (pauseIcon) pauseIcon.style.display = 'none';
        } else {
            this.updatePlayPauseUI(!this.audio.paused);
        }
    }

    updateVolumeUI() {
        const slider = document.getElementById('volume-slider');
        const highIcon = document.getElementById('vol-high-icon');
        const muteIcon = document.getElementById('vol-mute-icon');

        if (slider) slider.value = this.audio.volume;

        const isZero = this.audio.volume === 0 || this.isMuted;
        if (highIcon) highIcon.style.display = isZero ? 'none' : 'block';
        if (muteIcon) muteIcon.style.display = isZero ? 'block' : 'none';
    }

    formatTime(seconds) {
        if (isNaN(seconds) || seconds < 0) return '0:00';
        const sec = Math.floor(seconds);
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }
}
