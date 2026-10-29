import {
  normalizeConfig,
  resolveSequence,
  sequenceState,
  nextScheduledStart,
  timelineWindow,
} from "./timing.js";
import { styles } from "./styles.js";
import {
  translate,
  translationLanguage,
  formatStartCountdown,
} from "./localization.js";
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
    this.inspectedIndex = -1;
    this.detailPinned = false;
    this.layoutFrame = 0;
    this.resizeObserver = new ResizeObserver(() => this.scheduleLayout());
    this.onKeydown = (event) => {
      if (event.key === "Escape") this.inspectPhase(-1);
    };
    this.onOutside = (event) => {
      if (!event.composedPath().includes(this)) this.inspectPhase(-1);
    };
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
        { label: "Setup", duration: "00:01:00" },
        { label: "Talk", duration: "00:10:00" },
        {
          label: "Questions",
          duration: "00:03:00",
        },
      ],
    };
  }
  static async getConfigElement() {
    return document.createElement("time-sequence-card-editor");
  }
  getCardSize() {
    return this.config?.minimalist ? 2 : 4;
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
    document.addEventListener("keydown", this.onKeydown);
    document.addEventListener("pointerdown", this.onOutside);
    this.resizeObserver.observe(this);
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
    cancelAnimationFrame(this.layoutFrame);
    this.layoutFrame = 0;
    this.resizeObserver.disconnect();
    document.removeEventListener("keydown", this.onKeydown);
    document.removeEventListener("pointerdown", this.onOutside);
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
    cancelAnimationFrame(this.layoutFrame);
    this.layoutFrame = 0;
    this.inspectedIndex = -1;
    this.detailPinned = false;
    root.replaceChildren();
    const style = element("style");
    style.textContent = styles;
    root.append(style);
    const card = element("ha-card");
    card.style.setProperty(
      "--event-text-scale",
      String(this.config.event_text_scale),
    );
    card.classList.toggle("minimalist", this.config.minimalist);
    card.addEventListener("pointerleave", () => {
      if (
        !this.detailPinned &&
        !this.shadowRoot.activeElement?.classList.contains("band")
      )
        this.inspectPhase(-1);
    });
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
    timeline.setAttribute("role", "group");
    timeline.setAttribute(
      "aria-label",
      "Phase timeline; tap or focus a phase for details",
    );
    const track = element("div", "track");
    const total = this.config.phases.reduce(
      (sum, p) => sum + p.milliseconds,
      0,
    );
    const viewport = timelineWindow(this.config, { start: 0, end: total });
    let offset = 0;
    for (const [i, p] of this.config.phases.entries()) {
      const band = element("button", "band");
      band.type = "button";
      band.setAttribute("aria-controls", "phase-detail");
      band.setAttribute("aria-expanded", "false");
      band.addEventListener("pointerenter", (e) => {
        if (e.pointerType === "mouse" && !this.detailPinned)
          this.inspectPhase(i);
      });
      band.addEventListener("focus", () => {
        if (!this.detailPinned) this.inspectPhase(i);
      });
      band.addEventListener("blur", (e) => {
        if (
          !this.detailPinned &&
          !this.shadowRoot
            .querySelector(".phase-detail")
            ?.contains(e.relatedTarget)
        )
          this.inspectPhase(-1);
      });
      band.addEventListener("click", () => {
        const close = this.detailPinned && this.inspectedIndex === i;
        this.inspectPhase(close ? -1 : i, !close);
      });
      band.style.left = `${((offset - viewport.start) / viewport.duration) * 100}%`;
      band.style.width = `${(p.milliseconds / viewport.duration) * 100}%`;
      band.style.setProperty("--phase-color", p.color);
      band.append(element("span", "band-label", p.label));
      track.append(band);
      offset += p.milliseconds;
    }
    const cursor = element("div", "cursor");
    track.append(cursor);
    const axis = element("div", "axis");
    const nowLabel = element("span", "now-label");
    nowLabel.append(
      element("span", "now-word"),
      document.createTextNode(" "),
      element("span", "now-time"),
    );
    nowLabel.hidden = true;
    axis.append(nowLabel);
    offset = 0;
    for (let i = 0; i <= this.config.phases.length; i++) {
      const boundary = element("span", "boundary");
      boundary.style.left = `${((offset - viewport.start) / viewport.duration) * 100}%`;
      boundary.dataset.index = String(i);
      axis.append(boundary);
      offset += this.config.phases[i]?.milliseconds ?? 0;
    }
    timeline.append(track, axis);
    const detail = element("div", "phase-detail");
    detail.id = "phase-detail";
    detail.hidden = true;
    detail.setAttribute("role", "group");
    detail.setAttribute("aria-label", "Phase details");
    const detailText = element("div", "detail-text");
    detailText.append(
      element("strong", "detail-name"),
      element("span", "detail-time"),
      element("span", "detail-duration"),
    );
    const close = element("button", "detail-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close phase details");
    close.addEventListener("click", () => this.inspectPhase(-1));
    detail.append(detailText, close);
    timeline.append(detail);
    const controls = element("div", "controls");
    if (this.config.mode === "manual") {
      const start = element("button", "start", "Start");
      start.addEventListener("click", () => {
        const now = Date.now();
        if (
          this.startedAt !== null &&
          sequenceState(
            resolveSequence(this.config, now, this.timezone(), this.startedAt),
            now,
          ).status !== "finished"
        )
          return;
        this.startedAt = now;
        this.inspectedIndex = -1;
        this.detailPinned = false;
        this.saveSession();
        this.tick();
      });
      const reset = element("button", "reset", "Reset");
      reset.addEventListener("click", () => {
        this.startedAt = null;
        this.inspectedIndex = -1;
        this.detailPinned = false;
        this.saveSession();
        this.tick();
      });
      controls.append(start, reset);
    }
    const warning = element("div", "warning");
    warning.setAttribute("role", "alert");
    const topRow = element("div", "top-row");
    topRow.classList.toggle("has-controls", this.config.mode === "manual");
    topRow.append(status, controls);
    card.append(header, topRow, windowLabel, timeline, warning);
    root.append(card);
  }
  inspectPhase(index, pinned = false) {
    if (this.inspectedIndex === index && this.detailPinned === pinned) return;
    this.inspectedIndex = index;
    this.detailPinned = pinned;
    this.tick();
  }
  scheduleLayout() {
    if (this.layoutFrame || !this.isConnected) return;
    this.layoutFrame = requestAnimationFrame(() => {
      this.layoutFrame = 0;
      this.layoutAxis();
    });
  }
  layoutAxis() {
    const axis = this.shadowRoot.querySelector(".axis");
    if (!axis) return;
    const box = axis.getBoundingClientRect();
    if (!box.width) return;
    const nowLabel = /** @type {HTMLElement} */ (
      axis.querySelector(".now-label")
    );
    const labels = [...axis.querySelectorAll(".boundary")];
    // Read all geometry before changing visibility, once per animation frame.
    const rectangles = labels.map((node) => node.getBoundingClientRect());
    const nowWidth = nowLabel.hidden
      ? 0
      : nowLabel.getBoundingClientRect().width;
    const center = Math.min(
      box.width - nowWidth / 2,
      Math.max(
        nowWidth / 2,
        Number(nowLabel.dataset.fraction ?? 0) * box.width,
      ),
    );
    const status = this.shadowRoot.querySelector(".status");
    const action = /** @type {HTMLElement} */ (
      status.querySelector(".status-label")
    );
    const statusBox = status.getBoundingClientRect();
    const actionWidth = action.getBoundingClientRect().width;
    const actionCenter = Math.min(
      statusBox.width - actionWidth / 2,
      Math.max(
        actionWidth / 2,
        box.left +
          Number(nowLabel.dataset.fraction ?? 0) * box.width -
          statusBox.left,
      ),
    );
    const occupied = nowLabel.hidden
      ? []
      : [
          {
            left: box.left + center - nowWidth / 2,
            right: box.left + center + nowWidth / 2,
          },
        ];
    const visible = new Set();
    for (const index of [
      0,
      labels.length - 1,
      ...labels.map((_, i) => i).slice(1, -1),
    ]) {
      const rect = rectangles[index];
      if (
        !occupied.some(
          (other) => rect.left < other.right + 6 && rect.right > other.left - 6,
        )
      ) {
        visible.add(index);
        occupied.push(rect);
      }
    }
    nowLabel.style.left = `${center}px`;
    action.style.left = status.classList.contains("tracking")
      ? `${actionCenter}px`
      : "";
    labels.forEach((node, i) =>
      node.classList.toggle("collision", !visible.has(i)),
    );
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
    const language = this._hass?.locale?.language ?? "en";
    let label = translate(this.config, "ready_to_start", language),
      remaining = "";
    if (
      state.status === "upcoming" ||
      (state.status === "finished" && this.config.mode === "scheduled")
    ) {
      const next =
        this.config.mode === "scheduled"
          ? nextScheduledStart(this.config, now, zone)
          : display.start;
      label = translate(
        this.config,
        "starts_in",
        language,
        formatStartCountdown(
          next - now,
          translationLanguage(this.config, language),
        ),
      );
    }
    if (state.status === "active") {
      label = display.phases[state.index].label;
      remaining = `${durationText(display.phases[state.index].end - now)} left · ${durationText(display.end - now)} total`;
    }
    status.classList.toggle(
      "tracking",
      this.config.minimalist && state.status === "active",
    );

    const labelNode = status.querySelector(".status-label");
    if (labelNode.textContent !== label) labelNode.textContent = label;
    status.querySelector(".remaining").textContent = this.config.show_remaining
      ? remaining
      : "";
    root.querySelector(".window-label").textContent = sequence
      ? `${time(display.start)} → ${time(display.end)} · ${zone}`
      : `${durationText(display.end - display.start)} total · fixed windows`;
    const viewport = timelineWindow(this.config, display);
    const progress = ((now - viewport.start) / viewport.duration) * 100;
    const cursor = /** @type {HTMLElement} */ (root.querySelector(".cursor"));
    cursor.hidden =
      !sequence ||
      !this.config.show_now ||
      now < viewport.start ||
      now >= viewport.end;
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
    });
    root.querySelectorAll(".band").forEach((band, i) => {
      const p = display.phases[i];
      const range = sequence
        ? `${time(p.start)} – ${time(p.end)}`
        : `+${durationText(p.start)} – +${durationText(p.end)}`;
      band.setAttribute(
        "aria-label",
        `${p.label}, ${range}, duration ${durationText(p.milliseconds)}`,
      );
      band.setAttribute("aria-expanded", String(this.inspectedIndex === i));
      if (state.index === i) band.setAttribute("aria-current", "step");
      else band.removeAttribute("aria-current");
      if (this.inspectedIndex === i) {
        root.querySelector(".detail-name").textContent = p.label;
        root.querySelector(".detail-time").textContent = range;
        root.querySelector(".detail-duration").textContent =
          `Duration ${durationText(p.milliseconds)}`;
      }
    });
    const detail = /** @type {HTMLElement} */ (
      root.querySelector(".phase-detail")
    );
    detail.hidden = this.inspectedIndex < 0;
    this.toggleAttribute("details-open", !detail.hidden);
    const nowLabel = /** @type {HTMLElement} */ (
      root.querySelector(".now-label")
    );
    nowLabel.hidden = cursor.hidden;
    const word = translate(this.config, "now", language);
    const wordNode = /** @type {HTMLElement} */ (
      nowLabel.querySelector(".now-word")
    );
    wordNode.textContent = word;
    wordNode.hidden = word === "";
    nowLabel.querySelector(".now-time").textContent = time(now);
    nowLabel.dataset.fraction = String(
      Math.min(1, Math.max(0, progress / 100)),
    );
    this.scheduleLayout();
    const start = /** @type {HTMLButtonElement} */ (
      root.querySelector(".start")
    );
    if (start) {
      start.disabled = this.startedAt !== null && state.status !== "finished";
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
