import { normalizeConfig, resolveSequence } from "./timing.js";

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
  }
  set hass(value) {
    this._hass = value;
    this.preview();
  }
  setConfig(input) {
    this.config = structuredClone(input);
    this.materializeIds();
    this.render();
  }
  materializeIds() {
    try {
      const normalized = normalizeConfig(this.config);
      this.config.phases = this.config.phases.map((p, i) => ({
        ...p,
        id: normalized.phases[i].id,
        color: normalized.phases[i].color,
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
    root.replaceChildren();
    const style = el(
      "style",
      `:host{display:block;color:var(--primary-text-color,#222);font:14px system-ui}*{box-sizing:border-box}label{display:flex;flex-direction:column;gap:5px;margin:8px 0;min-width:0}input,select,button{font:inherit;padding:9px;border:1px solid #8887;border-radius:6px;background:var(--ha-card-background,#fff);color:inherit;min-width:0}input[type=checkbox]{align-self:start}fieldset{border:1px solid #8886;border-radius:8px;margin:14px 0;padding:12px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}.actions{display:flex;gap:6px;flex-wrap:wrap}button{cursor:pointer}button:disabled{opacity:.4;cursor:default}.error{color:var(--error-color,#d44)}.preview{white-space:pre-wrap;line-height:1.8;background:#8881;padding:12px;border-radius:8px}.help{color:var(--secondary-text-color,#657080);line-height:1.5}@media(max-width:450px){.grid{grid-template-columns:1fr}}`,
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
    for (const [i, p] of (this.config.phases ?? []).entries()) {
      const group = el("fieldset");
      group.append(el("legend", `Phase ${i + 1}`));
      const grid = el("div");
      grid.className = "grid";
      group.append(grid);
      this.field(grid, `Phase ${i + 1} label`, p.label, (v) => {
        p.label = v;
        this.emit();
      });
      this.field(grid, `Phase ${i + 1} duration`, p.duration, (v) => {
        p.duration = v;
        this.emit();
      });
      this.field(grid, `Phase ${i + 1} icon`, p.icon, (v) => {
        if (v) p.icon = v;
        else delete p.icon;
        this.emit();
      });
      this.field(
        grid,
        `Phase ${i + 1} color`,
        p.color ?? "#49a9bc",
        (v) => {
          p.color = v;
          this.emit();
        },
        "color",
      );
      const actions = el("div");
      actions.className = "actions";
      for (const [label, offset] of [
        ["up", -1],
        ["down", 1],
      ]) {
        const button = el("button", `Move ${label}`);
        button.setAttribute("aria-label", `Move phase ${i + 1} ${label}`);
        button.disabled =
          i + offset < 0 || i + offset >= this.config.phases.length;
        button.addEventListener("click", () => {
          const phases = this.config.phases;
          [phases[i], phases[i + offset]] = [phases[i + offset], phases[i]];
          this.emit();
          this.render();
        });
        actions.append(button);
      }
      const remove = el("button", "Remove");
      remove.setAttribute("aria-label", `Remove phase ${i + 1}`);
      remove.disabled = this.config.phases.length === 1;
      remove.addEventListener("click", () => {
        this.config.phases.splice(i, 1);
        this.emit();
        this.render();
      });
      actions.append(remove);
      group.append(actions);
      root.append(group);
    }
    const add = el("button", "Add phase");
    add.disabled = (this.config.phases?.length ?? 0) >= 50;
    add.addEventListener("click", () => {
      this.config.phases ??= [];
      this.config.phases.push({ label: "New phase", duration: "00:05:00" });
      this.materializeIds();
      this.emit();
      this.render();
    });
    root.append(add);
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
