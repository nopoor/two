export type SoundEffect = "coin" | "win" | "upgrade" | "spin";

let sharedContext: AudioContext | null = null;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!sharedContext) {
    sharedContext = new AudioContextClass();
  }
  return sharedContext;
}

function applyEnvelope(gainNode: GainNode, currentTime: number, peak: number, duration: number) {
  gainNode.gain.cancelScheduledValues(currentTime);
  gainNode.gain.setValueAtTime(peak, currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, currentTime + duration);
}

export async function playGeneratedSound(type: SoundEffect, isMuted: boolean) {
  if (isMuted) return;

  try {
    const context = getAudioContext();
    if (!context) return;
    if (context.state === "suspended") {
      await context.resume();
    }

    if (type === "coin") {
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(987.77, context.currentTime);
      oscillator.frequency.setValueAtTime(1318.51, context.currentTime + 0.08);
      applyEnvelope(gainNode, context.currentTime, 0.1, 0.35);
      oscillator.connect(gainNode);
      gainNode.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.4);
      return;
    }

    if (type === "win") {
      const freqs = [523.25, 659.25, 783.99, 1046.5];
      freqs.forEach((frequency, index) => {
        const startAt = context.currentTime + index * 0.1;
        const oscillator = context.createOscillator();
        const gainNode = context.createGain();
        oscillator.type = "triangle";
        oscillator.frequency.setValueAtTime(frequency, startAt);
        gainNode.gain.setValueAtTime(0.1, startAt);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startAt + 0.2);
        oscillator.connect(gainNode);
        gainNode.connect(context.destination);
        oscillator.start(startAt);
        oscillator.stop(startAt + 0.25);
      });
      return;
    }

    if (type === "upgrade") {
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();
      oscillator.type = "sawtooth";
      oscillator.frequency.setValueAtTime(150, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(1200, context.currentTime + 0.3);
      applyEnvelope(gainNode, context.currentTime, 0.08, 0.3);
      oscillator.connect(gainNode);
      gainNode.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.3);
      return;
    }

    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(60, context.currentTime);
    oscillator.frequency.linearRampToValueAtTime(200, context.currentTime + 0.1);
    applyEnvelope(gainNode, context.currentTime, 0.05, 0.15);
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.2);
  } catch (error) {
    console.warn("Audio Context not allowed or supported yet", error);
  }
}
