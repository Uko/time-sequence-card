// Match the original alert grace period, without replaying alarms on initial load.
const MAX_SOUND_DELAY = 75000;
export function endedSound(sequence, previousSequence, previousNow, now) {
  if (!sequence || previousNow == null || now < previousNow) return null;
  const sources = [sequence];
  // At midnight the resolver may already select tomorrow's upcoming occurrence.
  if (sequence.start > now && previousSequence?.end <= now)
    sources.push(previousSequence);
  return (
    sources
      .flatMap((s) => s.phases)
      .filter(
        (p) =>
          p.sound &&
          previousNow < p.end &&
          p.end <= now &&
          now - p.end <= MAX_SOUND_DELAY,
      )
      .sort((a, b) => b.end - a.end)[0] ?? null
  );
}

export class PhaseSoundPlayer {
  constructor(report) {
    this.report = report;
    /** @type {number|null} */ this.previousNow = null;
    /** @type {any} */ this.sequence = null;
    /** @type {HTMLAudioElement|null} */ this.audio = null;
    this.seen = new Set();
  }
  reset(clearSeen = false) {
    this.previousNow = null;
    this.sequence = null;
    this.stop();
    if (clearSeen) this.seen.clear();
  }
  stop() {
    const audio = this.audio;
    this.audio = null;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
  }
  update(sequence, now, canPlay) {
    const event = endedSound(sequence, this.sequence, this.previousNow, now);
    this.previousNow = now;
    this.sequence = sequence;
    if (!event) return;
    const token = JSON.stringify([event.id, event.end]);
    if (this.seen.has(token)) return;
    this.seen.add(token);
    if (this.seen.size > 256) this.seen.delete(this.seen.values().next().value);
    if (!canPlay()) return;
    this.stop();
    try {
      const audio = new Audio(event.sound);
      this.audio = audio;
      audio.onended = () => {
        if (this.audio === audio) this.audio = null;
      };
      Promise.resolve(audio.play()).then(
        () => {
          if (this.audio === audio) this.report("");
        },
        () => {
          if (this.audio === audio) {
            this.stop();
            this.report(
              "Sound could not play. Check the sound file and allow audio/autoplay in this browser.",
            );
          }
        },
      );
    } catch {
      this.stop();
      this.report(
        "Sound could not play. Check the sound file and allow audio/autoplay in this browser.",
      );
    }
  }
}
