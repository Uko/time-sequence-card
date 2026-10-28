import { normalizeConfig, resolveSequence, sequenceState } from "./timing.js";
import { styles } from "./styles.js";
import "./editor.js";

/** Build text safely: config values never become HTML or CSS markup. */
export function element(tag, className = "", text = "") {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}
export function durationText(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(seconds / 3600),
    m = Math.floor((seconds % 3600) / 60),
    s = seconds % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

export class TimeSequenceCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    /** @type {any} */ this.config = null;
    /** @type {any} */ this._hass = null;
    /** @type {number|null} */ this.startedAt = null;
    this.timer = 0;
    this.storageWarning = "";
    this.onVisibility = () => this.tick();
    this.onStorage = (event) => {
      if (event.key === this.storageKey()) {
        this.readSession();
        this.tick();
      }
    };
  }
  static getStubConfig() {
    return {
      type: "custom:time-sequence-card",
      title: "Presentation",
      mode: "manual",
      phases: [
        { label: "Setup", duration: "00:01:00", icon: "mdi:laptop" },
        { label: "Talk", duration: "00:10:00", icon: "mdi:presentation" },
        {
          label: "Questions",
          duration: "00:03:00",
          icon: "mdi:comment-question",
        },
      ],
    };
  }
  static async getConfigElement() {
    return document.createElement("time-sequence-card-editor");
  }
  getCardSize() {
    return 4 + Math.ceil((this.config?.phases.length ?? 1) / 3);
  }
  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: "auto" };
  }
  setConfig(input) {
    const config = normalizeConfig(input);
    // Editing a running sequence must never silently retime its existing windows.
    const changed = JSON.stringify(this.config) !== JSON.stringify(config);
    const timingChanged =
      !this.config ||
      this.config.mode !== config.mode ||
      this.config.session_id !== config.session_id ||
      this.signature(this.config) !== this.signature(config);
    this.config = config;
    if (changed) {
      if (timingChanged) {
        this.startedAt = null;
        this.readSession();
      }
      this.render();
    }
    this.tick();
  }
  set hass(value) {
    this._hass = value;
    this.tick();
  }
  get hass() {
    return this._hass;
  }
  connectedCallback() {
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("storage", this.onStorage);
    if (this.config) {
      this.readSession();
      this.tick();
    }
    clearInterval(this.timer);
    this.timer = window.setInterval(() => this.tick(), 1000);
  }
  disconnectedCallback() {
    clearInterval(this.timer);
    this.timer = 0;
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("storage", this.onStorage);
  }
  timezone() {
    return (
      this.config?.timezone ??
      this._hass?.config?.time_zone ??
      Intl.DateTimeFormat().resolvedOptions().timeZone
    );
  }
  storageKey() {
    return this.config?.mode === "manual" && this.config.session_id
      ? `time-sequence-card:${this.config.session_id}`
      : null;
  }
  signature(config = this.config) {
    return JSON.stringify(config.phases.map((p) => [p.id, p.milliseconds]));
  }
  readSession() {
    const key = this.storageKey();
    if (!key) return;
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null");
      this.startedAt =
        saved &&
        saved.signature === this.signature() &&
        Number.isSafeInteger(saved.startedAt) &&
        saved.startedAt >= 0 &&
        Number.isFinite(
          new Date(
            saved.startedAt +
              this.config.phases.reduce((sum, p) => sum + p.milliseconds, 0),
          ).getTime(),
        )
          ? saved.startedAt
          : null;
      this.storageWarning = "";
    } catch {
      this.storageWarning =
        "Session storage unavailable; reload recovery is disabled.";
    }
  }
  saveSession() {
    const key = this.storageKey();
    if (!key) return;
    try {
      if (this.startedAt === null) localStorage.removeItem(key);
      else
        localStorage.setItem(
          key,
          JSON.stringify({
            startedAt: this.startedAt,
            signature: this.signature(),
          }),
        );
      this.storageWarning = "";
    } catch {
      this.storageWarning =
        "Session storage unavailable; reload recovery is disabled.";
    }
  }
  render() {
    const root = this.shadowRoot;
    root.replaceChildren();
    const style = element("style");
    style.textContent = styles;
    root.append(style);
    const card = element("ha-card");
    const header = element("header");
    header.append(element("h2", "", this.config.title));
    header.append(
      element(
        "span",
        "mode",
        this.config.mode === "manual" ? "MANUAL" : "DAILY",
      ),
    );
    const status = element("div", "status");
    const statusLabel = element("span", "status-label");
    statusLabel.setAttribute("role", "status");
    status.append(statusLabel, element("span", "remaining"));
    const windowLabel = element("div", "window-label");
    const timeline = element("div", "timeline");
    timeline.style.height = `${this.config.height}px`;
    timeline.setAttribute("role", "img");
    timeline.setAttribute(
      "aria-label",
      "Phase durations; details listed below",
    );
    const track = element("div", "track");
    const total = this.config.phases.reduce(
      (sum, p) => sum + p.milliseconds,
      0,
    );
    let offset = 0;
    for (const p of this.config.phases) {
      const band = element("div", "band");
      band.style.left = `${(offset / total) * 100}%`;
      band.style.width = `${(p.milliseconds / total) * 100}%`;
      band.style.setProperty("--phase-color", p.color);
      band.append(element("span", "band-label", p.label));
      track.append(band);
      offset += p.milliseconds;
    }
    const cursor = element("div", "cursor");
    cursor.append(element("span", "", "NOW"));
    track.append(cursor);
    const axis = element("div", "axis");
    offset = 0;
    for (let i = 0; i <= this.config.phases.length; i++) {
      const boundary = element("span", "boundary");
      boundary.style.left = `${(offset / total) * 100}%`;
      boundary.dataset.index = String(i);
      axis.append(boundary);
      offset += this.config.phases[i]?.milliseconds ?? 0;
    }
    timeline.append(track, axis);
    const legend = element("ol", "legend");
    for (const [i, p] of this.config.phases.entries()) {
      const row = element("li", "phase");
      row.style.setProperty("--phase-color", p.color);
      row.append(element("span", "number", String(i + 1)));
      if (p.icon) {
        const icon = element("ha-icon");
        icon.setAttribute("icon", p.icon);
        row.append(icon);
      }
      const label = element("span", "phase-name", p.label);
      label.append(element("span", "phase-time"));
      row.append(label);
      row.append(
        element("span", "phase-duration", durationText(p.milliseconds)),
      );
      legend.append(row);
    }
    const controls = element("div", "controls");
    if (this.config.mode === "manual") {
      const start = element("button", "start", "Start");
      start.addEventListener("click", () => {
        if (this.startedAt !== null) return;
        this.startedAt = Date.now();
        this.saveSession();
        this.tick();
      });
      const reset = element("button", "reset", "Reset");
      reset.addEventListener("click", () => {
        this.startedAt = null;
        this.saveSession();
        this.tick();
      });
      controls.append(start, reset);
    }
    const warning = element("div", "warning");
    warning.setAttribute("role", "alert");
    card.append(
      header,
      status,
      windowLabel,
      timeline,
      legend,
      controls,
      warning,
    );
    root.append(card);
  }
  tick() {
    if (!this.config || !this.shadowRoot.querySelector(".status")) return;
    const now = Date.now();
    const zone = this.timezone();
    const root = this.shadowRoot;
    const warning = root.querySelector(".warning");
    let sequence;
    try {
      sequence = resolveSequence(this.config, now, zone, this.startedAt);
    } catch {
      warning.textContent = "Unable to resolve time zone or scheduled time.";
      return;
    }
    warning.textContent = this.storageWarning;
    const state = sequenceState(sequence, now);
    // An idle manual timeline previews offsets without inventing a start time.
    const display =
      sequence ??
      resolveSequence({ ...this.config, mode: "manual" }, now, zone, 0);
    const time = (value) =>
      new Intl.DateTimeFormat(this._hass?.locale?.language ?? "en", {
        timeZone: zone,
        hour: "2-digit",
        minute: "2-digit",
        second:
          this.config.mode === "manual" ||
          display.phases.some(
            (p) => p.start % 60000 !== 0 || p.end % 60000 !== 0,
          )
            ? "2-digit"
            : undefined,
        hourCycle: "h23",
      }).format(value);
    const status = root.querySelector(".status");
    let label = "Ready to start",
      remaining = "";
    if (state.status === "upcoming") {
      label = "Starts in";
      remaining = durationText(display.start - now);
    }
    if (state.status === "active") {
      label = display.phases[state.index].label;
      remaining = `${durationText(display.phases[state.index].end - now)} left · ${durationText(display.end - now)} total`;
    }
    if (state.status === "finished") {
      label = "Finished";
      remaining = `${durationText(now - display.end)} since finish`;
    }
    const labelNode = status.querySelector(".status-label");
    if (labelNode.textContent !== label) labelNode.textContent = label;
    status.querySelector(".remaining").textContent = this.config.show_remaining
      ? remaining
      : "";
    root.querySelector(".window-label").textContent = sequence
      ? `${time(display.start)} → ${time(display.end)} · ${zone}`
      : `${durationText(display.end - display.start)} total · fixed windows`;
    const progress =
      ((now - display.start) / (display.end - display.start)) * 100;
    const cursor = /** @type {HTMLElement} */ (root.querySelector(".cursor"));
    cursor.hidden =
      !sequence || !this.config.show_now || state.status !== "active";
    cursor.style.left = `${Math.min(100, Math.max(0, progress))}%`;
    root.querySelectorAll(".band").forEach((band, i) => {
      band.classList.toggle("active", state.index === i);
      band.classList.toggle(
        "complete",
        !!sequence && now >= display.phases[i].end,
      );
    });
    root.querySelectorAll(".boundary").forEach((boundary, i) => {
      const value =
        i < display.phases.length ? display.phases[i].start : display.end;
      boundary.textContent = sequence ? time(value) : `+${durationText(value)}`;
      // Always retain endpoints; dense intermediate labels remain in the legend.
      const fraction = (value - display.start) / (display.end - display.start);
      boundary.classList.toggle(
        "intermediate",
        i > 0 && i < display.phases.length,
      );
      boundary.classList.toggle(
        "near-edge",
        i > 0 &&
          i < display.phases.length &&
          (fraction < 0.12 || fraction > 0.88),
      );
    });
    root.querySelectorAll(".phase").forEach((row, i) => {
      row.classList.toggle("active", state.index === i);
      row.classList.toggle(
        "complete",
        !!sequence && now >= display.phases[i].end,
      );
      if (state.index === i) row.setAttribute("aria-current", "step");
      else row.removeAttribute("aria-current");
      const p = display.phases[i];
      row.querySelector(".phase-time").textContent = sequence
        ? `${time(p.start)} – ${time(p.end)}`
        : `+${durationText(p.start)} – +${durationText(p.end)}`;
    });
    const start = /** @type {HTMLButtonElement} */ (
      root.querySelector(".start")
    );
    if (start) {
      start.disabled = this.startedAt !== null;
      /** @type {HTMLButtonElement} */ (root.querySelector(".reset")).disabled =
        this.startedAt === null;
    }
  }
}
if (!customElements.get("time-sequence-card"))
  customElements.define("time-sequence-card", TimeSequenceCard);
/** @type {any} */ (window).customCards =
  /** @type {any} */ (window).customCards ?? [];
/** @type {any} */ (window).customCards.push({
  type: "time-sequence-card",
  name: "Time Sequence Card",
  description: "Fixed-window sequences anchored to Start or a daily time.",
  preview: true,
});
