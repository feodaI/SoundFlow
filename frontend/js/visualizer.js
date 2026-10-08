/**
 * SoundCloud-style Waveform Visualizer
 * Styled with the new neon sunset gradient (#ff6b35 -> #ff2d75).
 * Highly optimized, pauses completely when paused or hidden to use 0% CPU.
 */
class WaveformVisualizer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.isPlaying = false;
        this.animationId = null;
        this.barCount = 72;
        this.bars = [];
        this.phase = 0;

        // Pre-generate smooth wave shape
        for (let i = 0; i < this.barCount; i++) {
            const centerFactor = 1 - Math.abs(i - this.barCount / 2) / (this.barCount / 2);
            const base = 0.2 + 0.65 * centerFactor * (0.35 + 0.65 * Math.sin(i * 0.42));
            this.bars.push({
                base: Math.max(0.15, Math.min(0.95, base)),
                current: 0.15,
                speed: 0.05 + Math.random() * 0.07
            });
        }

        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.renderIdle();
    }

    resize() {
        if (!this.canvas) return;
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = (rect.width || 420) * dpr;
        this.canvas.height = (rect.height || 16) * dpr;
        this.ctx.scale(dpr, dpr);
        this.renderIdle();
    }

    start() {
        this.isPlaying = true;
        if (!this.animationId) {
            this.animate();
        }
    }

    stop() {
        this.isPlaying = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.renderIdle();
    }

    animate() {
        if (!this.isPlaying) return;

        this.phase += 0.08;
        const rect = this.canvas.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;
        this.ctx.clearRect(0, 0, w, h);

        const barWidth = Math.max(2, (w / this.barCount) - 2);
        const gap = 2;

        for (let i = 0; i < this.barCount; i++) {
            const bar = this.bars[i];
            const wave = Math.sin(this.phase + i * 0.22) * 0.35 + Math.cos(this.phase * 0.7 - i * 0.15) * 0.25;
            const target = Math.max(0.12, Math.min(1.0, bar.base + wave * 0.5));
            bar.current += (target - bar.current) * bar.speed;

            const barHeight = Math.max(3, bar.current * h);
            const x = i * (barWidth + gap);
            const y = (h - barHeight) / 2;

            // Neon gradient matching the app icon
            const grad = this.ctx.createLinearGradient(0, y + barHeight, 0, y);
            grad.addColorStop(0, '#ff6b35');
            grad.addColorStop(1, '#ff2d75');

            this.ctx.fillStyle = grad;
            this.ctx.fillRect(x, y, barWidth, barHeight);
        }

        this.animationId = requestAnimationFrame(() => this.animate());
    }

    renderIdle() {
        if (!this.ctx) return;
        const rect = this.canvas.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;
        this.ctx.clearRect(0, 0, w, h);

        const barWidth = Math.max(2, (w / this.barCount) - 2);
        const gap = 2;

        for (let i = 0; i < this.barCount; i++) {
            const bar = this.bars[i];
            const barHeight = Math.max(2, bar.base * 0.25 * h);
            const x = i * (barWidth + gap);
            const y = (h - barHeight) / 2;

            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
            this.ctx.fillRect(x, y, barWidth, barHeight);
        }
    }
}
