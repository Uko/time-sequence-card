import {
  normalizeConfig,
  resolveSequence,
  isSoundEntry,
  timedPhases,
  sequenceWarnings,
} from "./timing.js";

function el(tag, text = "") {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}
export class TimeSequenceCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    /** @type {any} */ this.config = null;
    /** @type {any} */ this._hass = null;
    /** @type {any} */ this.drag = null;
    this.dragFrame = 0;
    this.onBlur = () => this.cancelDrag();
  }
  set hass(value) {
    this._hass = value;
    const dark = value?.themes?.darkMode;
    if (typeof dark === "boolean")
      this.style.colorScheme = dark ? "dark" : "light";
    else this.style.removeProperty("color-scheme");
    this.preview();
  }
  setConfig(input) {
    this.config = structuredClone(input);
    if (Array.isArray(this.config.phases))
      this.config.phases = this.config.phases.flatMap((p) => {
        if (p && !isSoundEntry(p) && p.sound) {
          const phase = { ...p };
          delete phase.sound;
          return [phase, { sound: p.sound }];
        }
        return [p];
      });
    this.materializeIds();
    this.render();
  }
  materializeIds() {
    try {
      const normalized = normalizeConfig(this.config);
      this.config.phases = this.config.phases.map((p, i) => ({
        ...p,
        id: normalized.phases[i].id,
        ...(!isSoundEntry(p) ? { color: normalized.phases[i].color } : {}),
      }));
    } catch {
      /* Keep invalid YAML editable; preview explains its validation error. */
    }
  }
  emit() {
    try {
      normalizeConfig(this.config);
    } catch (error) {
      this.showError(error.message);
      return;
    }
    this.showError("");
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: structuredClone(this.config) },
        bubbles: true,
        composed: true,
      }),
    );
    this.preview();
  }
  showError(message) {
    const node = this.shadowRoot.querySelector(".error");
    if (node) node.textContent = message;
  }
  connectedCallback() {
    window.addEventListener("blur", this.onBlur);
  }
  disconnectedCallback() {
    this.cancelDrag();
    window.removeEventListener("blur", this.onBlur);
  }
  moveEntry(from, to) {
    if (from === to || to < 0 || to >= this.config.phases.length) return;
    this.materializeIds();
    const [entry] = this.config.phases.splice(from, 1);
    this.config.phases.splice(to, 0, entry);
    this.emit();
    this.render();
    /** @type {HTMLElement} */ (
      this.shadowRoot.querySelector(`.drag-handle[data-index="${to}"]`)
    )?.focus();
  }
  cancelDrag() {
    cancelAnimationFrame(this.dragFrame);
    this.dragFrame = 0;
    this.drag = null;
    this.shadowRoot
      .querySelectorAll(".dragging,.drop-before,.drop-after")
      .forEach((e) =>
        e.classList.remove("dragging", "drop-before", "drop-after"),
      );
  }
  scrollContainer() {
    let node = /** @type {HTMLElement|null} */ (this);
    while (node) {
      if (
        /auto|scroll/.test(getComputedStyle(node).overflowY) &&
        node.scrollHeight > node.clientHeight
      )
        return node;
      const root = node.getRootNode();
      node =
        node.parentElement ??
        (root instanceof ShadowRoot
          ? /** @type {HTMLElement} */ (root.host)
          : null);
    }
    return window;
  }
  updateDrop() {
    const d = this.drag;
    if (!d?.active) return;
    const target = this.shadowRoot
      .elementFromPoint(d.x, d.y)
      ?.closest(".sequence-entry");
    if (!target) {
      d.insert = null;
      this.shadowRoot
        .querySelectorAll(".drop-before,.drop-after")
        .forEach((e) => e.classList.remove("drop-before", "drop-after"));
      return;
    }
    this.shadowRoot
      .querySelectorAll(".drop-before,.drop-after")
      .forEach((e) => e.classList.remove("drop-before", "drop-after"));
    const box = target.getBoundingClientRect(),
      after = d.y > box.top + box.height / 2;
    d.insert =
      Number(/** @type {HTMLElement} */ (target).dataset.index) +
      (after ? 1 : 0);
    target.classList.add(after ? "drop-after" : "drop-before");
  }
  beginDrag(handle, index, event) {
    if (event.button !== 0) return;
    event.preventDefault();
    this.cancelDrag();
    handle.focus();
    handle.setPointerCapture(event.pointerId);
    this.drag = {
      from: index,
      insert: index,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      scroll: this.scrollContainer(),
    };
  }
  dragMove(event) {
    const d = this.drag;
    if (!d) return;
    d.x = event.clientX;
    d.y = event.clientY;
    if (!d.active && Math.hypot(d.x - d.startX, d.y - d.startY) < 5) return;
    d.active = true;
    this.shadowRoot
      .querySelector(`.sequence-entry[data-index="${d.from}"]`)
      .classList.add("dragging");
    this.updateDrop();
    if (!this.dragFrame) {
      const step = () => {
        this.dragFrame = 0;
        const state = this.drag;
        if (!state?.active) return;
        const box =
          state.scroll instanceof HTMLElement
            ? state.scroll.getBoundingClientRect()
            : { top: 0, bottom: innerHeight };
        const dy =
          state.y < Math.max(0, box.top) + 40
            ? -20
            : state.y > Math.min(innerHeight, box.bottom) - 40
              ? 20
              : 0;
        if (dy) {
          state.scroll.scrollBy(0, dy);
          this.updateDrop();
        }
        this.dragFrame = requestAnimationFrame(step);
      };
      this.dragFrame = requestAnimationFrame(step);
    }
  }
  finishDrag(event) {
    const d = this.drag;
    if (!d) return;
    d.x = event.clientX;
    d.y = event.clientY;
    this.updateDrop();
    const to = d.insert - (d.insert > d.from ? 1 : 0);
    this.cancelDrag();
    if (d.active && d.insert !== null) this.moveEntry(d.from, to);
  }
  field(parent, label, value, change, type = "text") {
    const wrapper = el("label");
    wrapper.append(el("span", label));
    const input = el("input");
    input.type = type;
    if (type === "checkbox") input.checked = !!value;
    else input.value = value ?? "";
    input.setAttribute("aria-label", label);
    input.addEventListener("change", () =>
      change(type === "checkbox" ? input.checked : input.value),
    );
    wrapper.append(input);
    parent.append(wrapper);
    return input;
  }
  render() {
    const root = this.shadowRoot;
    this.cancelDrag();
    root.replaceChildren();
    const style = el(
      "style",
      `:host{display:block;color:var(--primary-text-color,#222);font:14px system-ui}*{box-sizing:border-box}label{display:flex;flex-direction:column;gap:5px;margin:8px 0;min-width:0}input,select,button{font:inherit;padding:9px;border:1px solid var(--input-idle-line-color,var(--divider-color,#8887));border-radius:6px;background:var(--input-fill-color,var(--ha-card-background,var(--card-background-color,#fff)));color:var(--input-ink-color,var(--primary-text-color,#222));min-width:0}input[type=checkbox]{align-self:start}fieldset{border:1px solid #8886;border-radius:8px;margin:14px 0;padding:12px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}.actions{display:flex;gap:6px;flex-wrap:wrap}button{cursor:pointer}button:disabled{opacity:.4;cursor:default}.drag-handle{cursor:grab;touch-action:none;user-select:none;min-width:44px;min-height:44px;margin-right:8px}.dragging{opacity:.5}.drop-before{box-shadow:0 -3px var(--primary-color,#148aa8)}.drop-after{box-shadow:0 3px var(--primary-color,#148aa8)}.sequence-warning{color:var(--warning-color,#b57900)}[hidden]{display:none!important}.error{color:var(--error-color,#d44)}.preview{white-space:pre-wrap;line-height:1.8;background:#8881;padding:12px;border-radius:8px}.help{color:var(--secondary-text-color,#657080);line-height:1.5}@media(max-width:450px){.grid{grid-template-columns:1fr}}`,
    );
    root.append(style);
    root.append(
      el(
        "p",
        "Fixed windows: later boundaries do not move when a phase overruns.",
      ),
    );
    this.field(root, "Title", this.config.title, (v) => {
      this.config.title = v;
      this.emit();
    });
    const modeLabel = el("label");
    modeLabel.append(el("span", "Timing mode"));
    const select = el("select");
    select.setAttribute("aria-label", "Timing mode");
    for (const [value, label] of [
      ["manual", "Manual Start"],
      ["scheduled", "Time of day"],
    ]) {
      const option = el("option", label);
      option.value = value;
      option.selected = this.config.mode === value;
      select.append(option);
    }
    select.addEventListener("change", () => {
      this.config.mode = select.value;
      if (select.value === "scheduled")
        this.config.anchor ??= { at: "09:00", edge: "end" };
      this.emit();
      this.render();
    });
    modeLabel.append(select);
    root.append(modeLabel);
    if (this.config.mode === "scheduled") {
      this.config.anchor ??= { at: "09:00", edge: "end" };
      this.field(
        root,
        "Anchor time",
        this.config.anchor.at,
        (v) => {
          this.config.anchor.at = v;
          this.emit();
        },
        "time",
      );
      const label = el("label");
      label.append(el("span", "Anchor edge"));
      const edge = el("select");
      edge.setAttribute("aria-label", "Anchor edge");
      for (const [value, text] of [
        ["start", "Start at this time"],
        ["end", "Finish at this time"],
      ]) {
        const option = el("option", text);
        option.value = value;
        option.selected = this.config.anchor.edge === value;
        edge.append(option);
      }
      edge.addEventListener("change", () => {
        this.config.anchor.edge = edge.value;
        this.emit();
      });
      label.append(edge);
      root.append(label);
    } else {
      this.field(
        root,
        "Session ID (optional reload recovery)",
        this.config.session_id,
        (v) => {
          if (v) this.config.session_id = v;
          else delete this.config.session_id;
          this.emit();
        },
      );
      root.append(
        el(
          "p",
          "A session ID saves timing in this browser and shares it across same-origin tabs, not across devices.",
        ),
      );
    }
    this.field(
      root,
      "Time zone (blank uses Home Assistant)",
      this.config.timezone,
      (v) => {
        if (v) this.config.timezone = v;
        else delete this.config.timezone;
        this.emit();
      },
    );
    this.field(
      root,
      "Minimalist mode",
      this.config.minimalist ?? false,
      (v) => {
        this.config.minimalist = v;
        this.emit();
      },
      "checkbox",
    );
    this.field(
      root,
      "Hide outside scheduled window",
      this.config.hide_outside_window ?? false,
      (value) => {
        this.config.hide_outside_window = value;
        this.emit();
      },
      "checkbox",
    );
    const translations = el("fieldset");
    translations.append(el("legend", "Translations"));
    translations.append(
      el(
        "p",
        "Leave overrides blank for automatic translations. Language defaults to Home Assistant.",
      ),
    );
    root.append(translations);
    for (const [key, label] of [
      ["language", "Language (blank uses Home Assistant)"],
      ["now", "Now label (blank uses selected language)"],
      ["ready_to_start", "Ready to start label"],
      ["starts_in", "Start countdown (use {duration})"],
    ]) {
      this.field(
        translations,
        label,
        this.config.translations?.[key] ??
          (key === "now" ? this.config.now_label : ""),
        (value) => {
          this.config.translations ??= {};
          if (value) this.config.translations[key] = value;
          else delete this.config.translations[key];
          if (key === "now") delete this.config.now_label;
          if (!Object.keys(this.config.translations).length)
            delete this.config.translations;
          this.emit();
        },
      );
    }
    const display = el("div");
    display.className = "grid";
    root.append(display);
    this.field(
      display,
      "Timeline height",
      this.config.height ?? (this.config.minimalist ? 80 : 120),
      (v) => {
        this.config.height = Number(v);
        this.emit();
      },
      "number",
    );
    this.field(
      display,
      "Show now marker",
      this.config.show_now ?? true,
      (v) => {
        this.config.show_now = v;
        this.emit();
      },
      "checkbox",
    );
    this.field(
      display,
      "Show remaining time",
      this.config.show_remaining ?? true,
      (v) => {
        this.config.show_remaining = v;
        this.emit();
      },
      "checkbox",
    );
    for (const [key, label] of [
      ["padding_before", "Padding before (minutes)"],
      ["padding_after", "Padding after (minutes)"],
    ]) {
      const input = this.field(
        display,
        label,
        this.config[key] ?? 0,
        (value) => {
          this.config[key] = Number(value);
          this.emit();
        },
        "number",
      );
      input.min = "0";
      input.max = "1440";
      input.step = "any";
    }
    const textScale = this.field(
      display,
      "Event text scale",
      this.config.event_text_scale ?? 1,
      (value) => {
        if (value === "") delete this.config.event_text_scale;
        else this.config.event_text_scale = Number(value);
        this.emit();
      },
      "number",
    );
    textScale.min = "0.5";
    textScale.max = "3";
    textScale.step = "0.1";
    textScale.title =
      "1 = default; 0.8 = 20% smaller; 1.2 = 20% larger. Event labels only.";
    const warning = el("p");
    warning.className = "sequence-warning";
    warning.setAttribute("role", "status");
    root.append(warning);
    let phaseNumber = 0,
      soundNumber = 0;
    for (const [i, p] of (this.config.phases ?? []).entries()) {
      const soundOnly = isSoundEntry(p),
        number = soundOnly ? ++soundNumber : ++phaseNumber;
      const kind = soundOnly ? "sound" : "phase";
      const group = el("fieldset");
      group.className = "sequence-entry";
      group.dataset.index = String(i);
      const legend = el("legend"),
        handle = el("button", "↕");
      handle.type = "button";
      handle.className = "drag-handle";
      handle.dataset.index = String(i);
      handle.setAttribute("aria-label", `Drag ${kind} ${number}`);
      handle.title =
        "Drag to reorder; use arrow keys or Move buttons as an alternative.";
      handle.addEventListener("pointerdown", (e) =>
        this.beginDrag(handle, i, e),
      );
      handle.addEventListener("pointermove", (e) => this.dragMove(e));
      handle.addEventListener("pointerup", (e) => this.finishDrag(e));
      handle.addEventListener("pointercancel", () => this.cancelDrag());
      handle.addEventListener("lostpointercapture", () => this.cancelDrag());
      handle.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          this.cancelDrag();
          return;
        }
        if (["ArrowUp", "ArrowDown"].includes(e.key)) {
          e.preventDefault();
          this.moveEntry(i, i + (e.key === "ArrowUp" ? -1 : 1));
        }
      });
      legend.append(
        handle,
        el("span", `${soundOnly ? "Sound" : "Phase"} ${number}`),
      );
      group.append(legend);
      const grid = el("div");
      grid.className = "grid";
      group.append(grid);
      if (soundOnly) {
        const input = this.field(
          grid,
          `Sound ${number} file`,
          p.sound,
          (value) => {
            p.sound = value;
            this.emit();
          },
        );
        input.placeholder = "/local/sounds/example.mp3";
      } else {
        this.field(grid, `Phase ${number} label`, p.label, (value) => {
          p.label = value;
          this.emit();
        });
        this.field(grid, `Phase ${number} duration`, p.duration, (value) => {
          p.duration = value;
          this.emit();
        });
        this.field(
          grid,
          `Phase ${number} color`,
          p.color ?? "#49a9bc",
          (value) => {
            p.color = value;
            this.emit();
          },
          "color",
        );
      }
      const actions = el("div");
      actions.className = "actions";
      for (const [label, offset] of [
        ["up", -1],
        ["down", 1],
      ]) {
        const button = el("button", `Move ${label}`);
        button.type = "button";
        button.setAttribute("aria-label", `Move ${kind} ${number} ${label}`);
        button.disabled =
          i + offset < 0 || i + offset >= this.config.phases.length;
        button.addEventListener("click", () => this.moveEntry(i, i + offset));
        actions.append(button);
      }
      const remove = el("button", "Remove");
      remove.type = "button";
      remove.setAttribute("aria-label", `Remove ${kind} ${number}`);
      remove.disabled = !soundOnly && timedPhases(this.config).length <= 1;
      remove.addEventListener("click", () => {
        this.config.phases.splice(i, 1);
        this.emit();
        this.render();
      });
      actions.append(remove);
      group.append(actions);
      root.append(group);
    }
    for (const kind of ["phase", "sound"]) {
      const add = el("button", kind === "phase" ? "Add phase" : "Add sound");
      add.type = "button";
      add.disabled =
        (this.config.phases?.length ?? 0) >= 101 ||
        (kind === "phase" && timedPhases(this.config).length >= 50);
      add.addEventListener("click", () => {
        this.config.phases ??= [];
        this.config.phases.push(
          kind === "phase"
            ? { label: "New phase", duration: "00:05:00" }
            : { sound: "" },
        );
        this.materializeIds();
        this.render();
        this.emit();
      });
      root.append(add);
    }
    root.append(
      el(
        "p",
        "Durations use HH:MM:SS. Changing a duration recalculates boundaries around the anchor.",
      ),
    );
    const error = el("p");
    error.className = "error";
    error.setAttribute("role", "alert");
    root.append(error);
    root.append(el("h3", "Calculated sequence"));
    const preview = el("div");
    preview.className = "preview";
    root.append(preview);
    this.preview();
  }
  preview() {
    const target = this.shadowRoot.querySelector(".preview");
    if (!target || !this.config) return;
    const warning = this.shadowRoot.querySelector(".sequence-warning");
    if (warning) {
      const message = sequenceWarnings(this.config.phases ?? []).join(" ");
      if (warning.textContent !== message) warning.textContent = message;
      /** @type {HTMLElement} */ (warning).hidden = !message;
    }
    try {
      const config = normalizeConfig(this.config);
      const timezone =
        config.timezone ??
        this._hass?.config?.time_zone ??
        Intl.DateTimeFormat().resolvedOptions().timeZone;
      const result = resolveSequence(config, Date.now(), timezone, 0);
      const time = (value) =>
        config.mode === "manual"
          ? `+${Math.floor(value / 60000)}:${String((value / 1000) % 60).padStart(2, "0")}`
          : new Intl.DateTimeFormat("en", {
              timeZone: timezone,
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hourCycle: "h23",
            }).format(value);
      target.textContent = result.phases
        .map((p) => `${time(p.start)} – ${time(p.end)}  ${p.label}`)
        .join("\n");
      this.showError("");
    } catch (error) {
      target.textContent = "Correct the configuration to preview the sequence.";
      this.showError(error.message);
    }
  }
}
if (!customElements.get("time-sequence-card-editor"))
  customElements.define("time-sequence-card-editor", TimeSequenceCardEditor);
