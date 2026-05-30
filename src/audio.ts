/* ==========================================================================
   🍕 PIZZA BATTLESHIP - WEB AUDIO SYNTHESIZER (EFECTOS DE SONIDO CULINARIOS)
   ========================================================================== */

export class PizzeriaAudio {
  private static ctx: AudioContext | null = null;

  // Initialize or retrieve browser's AudioContext lazily on user interaction
  private static getContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    // Resume if suspended by browser autoplay policy
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  // A short, juicy, elastic click sound
  public static playClick(): void {
    try {
      const ctx = this.getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(70, ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.08);
    } catch (err) {
      console.warn("Audio Click error:", err);
    }
  }

  // Juicy crispy crunch sound representing a successful pizza bite!
  public static playCrunch(): void {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      const bufferSize = ctx.sampleRate * 0.18; // 180 ms crunch
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);

      // Generate random high-frequency crackle noise for crunch feel
      for (let i = 0; i < bufferSize; i++) {
        const factor = 1 - (i / bufferSize);
        data[i] = (Math.random() * 2 - 1) * 0.3 * Math.pow(factor, 3);
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      // Add low-pass/bandpass filter for body
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(800, now);
      filter.frequency.exponentialRampToValueAtTime(300, now + 0.18);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.start(now);
      noise.stop(now + 0.18);

      // Also mix a brief low triangle pop for jaw crunching
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.connect(oscGain);
      oscGain.connect(ctx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.linearRampToValueAtTime(50, now + 0.08);
      oscGain.gain.setValueAtTime(0.3, now);
      oscGain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } catch (err) {
      console.warn("Audio Crunch error:", err);
    }
  }

  // Sizzling hot spicy burn sound for Jalapeno and Habanero traps!
  public static playSizzle(): void {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      const duration = 0.45; // 450 ms sizzle
      const bufferSize = ctx.sampleRate * duration;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        // High frequency white noise sizzle
        data[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(3000, now);
      filter.frequency.linearRampToValueAtTime(1500, now + duration);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.002, now + duration);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      noise.start(now);
      noise.stop(now + duration);
    } catch (err) {
      console.warn("Audio Sizzle error:", err);
    }
  }

  // Double bubble gulp sound for Water and Milk cures!
  public static playGulp(): void {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;

      // Two gulp bubbles in quick succession
      [0.0, 0.12].forEach((delay) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, now + delay);
        osc.frequency.exponentialRampToValueAtTime(450, now + delay + 0.09); // rapid sweep up

        gain.gain.setValueAtTime(0.2, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.005, now + delay + 0.09);

        osc.start(now + delay);
        osc.stop(now + delay + 0.09);
      });
    } catch (err) {
      console.warn("Audio Gulp error:", err);
    }
  }

  // Retro golden coin double chime (E6 -> G6)
  public static playCoin(): void {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      const notes = [1318.51, 1567.98]; // E6, G6

      notes.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, now + index * 0.07);

        gain.gain.setValueAtTime(0.12, now + index * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.002, now + index * 0.07 + 0.18);

        osc.start(now + index * 0.07);
        osc.stop(now + index * 0.07 + 0.18);
      });
    } catch (err) {
      console.warn("Audio Coin error:", err);
    }
  }

  // Triumphant victory fanfare (C5 -> E5 -> G5 -> C6 melody)
  public static playFanfare(): void {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      const melody = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      const rhythm = [0.0, 0.10, 0.20, 0.35];

      melody.forEach((freq, index) => {
        const delay = rhythm[index];
        const duration = index === 3 ? 0.6 : 0.25;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = index === 3 ? 'square' : 'triangle';
        osc.frequency.setValueAtTime(freq, now + delay);

        gain.gain.setValueAtTime(0.18, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.002, now + delay + duration);

        osc.start(now + delay);
        osc.stop(now + delay + duration);
      });
    } catch (err) {
      console.warn("Audio Fanfare error:", err);
    }
  }

  // Defeat / Warning siren sound
  public static playDisaster(): void {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.linearRampToValueAtTime(110, now + 0.5);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

      osc.start(now);
      osc.stop(now + 0.5);
    } catch (err) {
      console.warn("Audio Disaster error:", err);
    }
  }

  // Backward compatibility mock
  public static playBuild(): void {
    this.playClick();
  }
  public static playOven(): void {
    this.playSizzle();
  }
}
