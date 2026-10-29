// Match the original alert grace period, without replaying alarms on initial load.
const MAX_SOUND_DELAY = 75000;
export function dueSoundGroup(sequence, previousSequence, previousNow, now) {
  if (!sequence || previousNow == null || now < previousNow) return [];
  const sources = [sequence];
  // At midnight the resolver may already select tomorrow's upcoming occurrence.
  if (sequence.start > now && previousSequence?.end <= now)
    sources.push(previousSequence);
  const due = sources
    .flatMap((s) => s.cues ?? s.phases)
    .filter(
      (p) =>
        p.sound &&
        previousNow < p.end &&
        p.end <= now &&
        now - p.end <= MAX_SOUND_DELAY,
    );
  const latest = Math.max(...due.map((p) => p.end));
  // Skip stale boundaries, but preserve every cue at the latest boundary in list order.
  return due.filter((p) => p.end === latest);
}
export function endedSound(sequence, previousSequence, previousNow, now) {
  return dueSoundGroup(sequence, previousSequence, previousNow, now)[0] ?? null;
}
export class PhaseSoundPlayer {
  constructor(report) {
    this.report = report;
    /** @type {number|null} */ this.previousNow = null;
    /** @type {any} */ this.sequence = null;
    /** @type {HTMLAudioElement|null} */ this.audio = null;
    /** @type {any[]} */ this.queue = [];
    this.seen = new Set();
  }
  reset(clearSeen = false) {
    this.previousNow = null;
    this.sequence = null;
    this.stop();
    if (clearSeen) this.seen.clear();
  }
  stop() {
    this.queue = [];
    const audio = this.audio;
    this.audio = null;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
  }
  update(sequence, now, canPlay) {
    const group = dueSoundGroup(sequence, this.sequence, this.previousNow, now);
    this.previousNow = now;
    this.sequence = sequence;
    const fresh = group.filter((event) => {
      const token = JSON.stringify([event.id, event.end]);
      if (this.seen.has(token)) return false;
      this.seen.add(token);
      if (this.seen.size > 256)
        this.seen.delete(this.seen.values().next().value);
      return true;
    });
    if (!fresh.length) return;
    this.stop();
    if (!canPlay()) return;
    this.queue = fresh;
    this.playNext();
  }
  failed(audio) {
    if (this.audio !== audio) return;
    this.stop();
    this.report(
      "Sound could not play. Check the sound file and allow audio/autoplay in this browser.",
    );
  }
  playNext() {
    const event = this.queue.shift();
    if (!event) return;
    try {
      const audio = new Audio(event.sound);
      this.audio = audio;
      audio.onended = () => {
        if (this.audio === audio) {
          this.audio = null;
          this.playNext();
        }
      };
      audio.onerror = () => this.failed(audio);
      Promise.resolve(audio.play()).then(
        () => {
          if (this.audio === audio) this.report("");
        },
        () => this.failed(audio),
      );
    } catch {
      this.stop();
      this.report(
        "Sound could not play. Check the sound file and allow audio/autoplay in this browser.",
      );
    }
  }
}
