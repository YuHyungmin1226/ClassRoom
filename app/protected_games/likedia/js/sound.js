/**
 * diaLike - Sound Synthesis Engine
 * Lightweight Web Audio API synthesizer — no asset files needed.
 */

// ==========================================
// 1. SOUND SYNTHESIS ENGINE (Web Audio API)
// ==========================================
class SoundEngine {
    constructor() {
        this.ctx = null;
        this.masterVolume = null;
    }

    init() {
        if (this.ctx) return;
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContextClass();
            this.masterVolume = this.ctx.createGain();
            this.masterVolume.gain.setValueAtTime(0.2, this.ctx.currentTime);
            this.masterVolume.connect(this.ctx.destination);
        } catch (e) {
            console.warn("Web Audio API is not supported in this browser.", e);
        }
    }

    playSlash() {
        this.init();
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(this.masterVolume);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.16);
    }

    playHit() {
        this.init();
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(30, this.ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);
        osc.connect(gain);
        gain.connect(this.masterVolume);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.13);
    }

    playFireball() {
        this.init();
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(80, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(320, this.ctx.currentTime + 0.1);
        osc.frequency.exponentialRampToValueAtTime(120, this.ctx.currentTime + 0.25);
        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.1, this.ctx.currentTime + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(this.masterVolume);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.35);
    }

    playPotion() {
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const notes = [200, 300, 450, 600];
        notes.forEach((freq, index) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + index * 0.06);
            gain.gain.setValueAtTime(0, now + index * 0.06);
            gain.gain.linearRampToValueAtTime(0.2, now + index * 0.06 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.06 + 0.08);
            osc.connect(gain);
            gain.connect(this.masterVolume);
            osc.start(now + index * 0.06);
            osc.stop(now + index * 0.06 + 0.1);
        });
    }

    playMonsterDeath() {
        this.init();
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(50, this.ctx.currentTime + 0.4);
        gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);
        osc.connect(gain);
        gain.connect(this.masterVolume);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.45);
    }

    playLevelUp() {
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const notes = [261.63, 329.63, 392.00, 523.25];
        notes.forEach((freq, index) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + index * 0.12);
            gain.gain.setValueAtTime(0, now + index * 0.12);
            gain.gain.linearRampToValueAtTime(0.25, now + index * 0.12 + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.01, now + index * 0.12 + 0.35);
            osc.connect(gain);
            gain.connect(this.masterVolume);
            osc.start(now + index * 0.12);
            osc.stop(now + index * 0.12 + 0.4);
        });

        setTimeout(() => {
            const finalOsc = this.ctx.createOscillator();
            const finalGain = this.ctx.createGain();
            finalOsc.type = 'sine';
            finalOsc.frequency.setValueAtTime(523.25, this.ctx.currentTime);
            finalGain.gain.setValueAtTime(0.2, this.ctx.currentTime);
            finalGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.8);
            finalOsc.connect(finalGain);
            finalGain.connect(this.masterVolume);
            finalOsc.start();
            finalOsc.stop(this.ctx.currentTime + 0.85);
        }, 360);
    }

    playBossSpawn() {
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(70, now);
        osc.frequency.linearRampToValueAtTime(25, now + 1.2);
        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);
        osc.connect(gain);
        gain.connect(this.masterVolume);
        osc.start();
        osc.stop(now + 1.5);

        const osc2 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(110, now + 0.1);
        osc2.frequency.linearRampToValueAtTime(55, now + 1.0);
        gain2.gain.setValueAtTime(0.12, now + 0.1);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
        osc2.connect(gain2);
        gain2.connect(this.masterVolume);
        osc2.start(now + 0.1);
        osc2.stop(now + 1.3);
    }
}

const sfx = new SoundEngine();
