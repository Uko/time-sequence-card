# Time Sequence Card

A Home Assistant dashboard card for **fixed-window sequences**, anchored to a manual Start or a daily start/finish time. No charting library, template wrapper, dummy series, or duplicated phase boundaries.

Define each phase's duration once. The card derives the timeline, highlights the current phase, and shows phase and total remaining time. Completed/upcoming phases use muted colour fills but full-contrast theme text; the active phase keeps its solid colour, outline, NOW cursor and prominent label above the bar.

## Timing model

- **Manual:** Start fixes the sequence to the current instant. Phases advance automatically. Taking longer does not push later phases back. Reset clears the session; there is intentionally no Pause, Skip, or resume-later mode.
- **Scheduled start:** calculate phase boundaries forwards from a time of day.
- **Scheduled finish:** calculate backwards from a fixed deadline. Increasing a phase duration moves preparation earlier, not the deadline later.
- Scheduled mode repeats daily. Use Home Assistant's native conditional card/visibility rules for school days, holidays, or any existing routine-active binary sensor. The card does not replace those scheduling rules.
- Durations are elapsed time in `HH:MM:SS`, from one second to less than 24 hours. The entire sequence must be shorter than 24 hours. Supply 1–50 phases.

## Install through LACS

Add this card's repository URL in LACS, as for any dashboard plugin. The root `lacs.json` declares `"type": "plugin"`; LACS merges it with `hacs.json`, which supplies the display name and `filename: "time-sequence-card.js"`. The built artifact is committed at `dist/time-sequence-card.js`; no build on Home Assistant is required.

LACS installs the repository's default branch, so merge the implementation PR before installing. It publishes and registers the JavaScript module; approve the dashboard reload when offered, then add **Time Sequence Card** from the card picker or use the YAML examples below. Do not also register the manual `/local/` resource for the same card.

## Install manually

1. Copy **`dist/time-sequence-card.js`** from this repository to your Home Assistant `/config/www/` directory.
2. Register `/local/time-sequence-card.js?v=0.1.0` as a **JavaScript Module** in dashboard resources.
3. Reload the dashboard. Find **Time Sequence Card** in the card picker, or add a Manual card using the examples below.

Only the built bundle is deployed; Home Assistant does not need Node.js or the source directory. Change the version query when replacing the bundle to avoid stale browser caches. `hacs.json` supplies frontend distribution metadata; submission to the HACS default catalog is not part of this initial version.

## Manually started presentation

```yaml
type: custom:time-sequence-card
title: Presentation
mode: manual
session_id: presentation
phases:
  - label: Laptop setup
    duration: "00:01:00"
    color: "#E6AE47"
  - label: Talk
    duration: "00:10:00"
    color: "#49A9BC"
  - label: Questions
    duration: "00:03:00"
    color: "#8EAF67"
```

The optional `session_id` enables reload recovery and synchronisation across tabs on the **same browser origin** using local storage. Use a distinct ID per independent sequence. Devices, browser profiles, and different HA URLs do not share this storage. Without an ID, the session is in-memory only; a full page reload resets it. Removing/reconnecting the same card element retains its in-memory start.

Only the start timestamp and a phase ID/duration signature are stored. A change to phase IDs, ordering or durations invalidates a saved session; do not edit timing during a run. Changing labels or colours leaves the fixed timings unchanged. Unavailable browser storage produces a visible warning rather than breaking Start. Reset removes the saved session. After a run finishes, the status returns to **Ready to start** and Start becomes available for a new run; the completed session remains stored until Start or Reset. It never restarts automatically.

## Daily routine ending at a deadline

```yaml
type: custom:time-sequence-card
title: Morning routine
mode: scheduled
anchor:
  at: "08:25"
  edge: end
phases:
  - label: Breakfast
    duration: "00:15:00"
  - label: Brush teeth
    duration: "00:05:00"
  - label: Get dressed
    duration: "00:10:00"
  - label: Leave
    duration: "00:10:00"
  - label: Buffer
    duration: "00:05:00"
    color: "#DC7272"
```

Set `edge: start` to anchor the beginning instead. All displayed boundaries and the final endpoint derive from this anchor and the durations; there is no separate deadline to maintain.

### Visibility remains Home Assistant's responsibility

```yaml
type: conditional
conditions:
  - condition: state
    entity: binary_sensor.example_routine_window
    state: "on"
card:
  type: custom:time-sequence-card
  title: Preparation
  mode: scheduled
  anchor:
    at: "09:00"
    edge: end
  phases:
    - label: Prepare
      duration: "00:10:00"
    - label: Travel
      duration: "00:15:00"
```

## Visual editor and display options

The visual editor groups controls into **Card & timing**, **Display**, **Sequence**, optional **Translations**, and **Calculated sequence**. Boolean options use keyboard-accessible toggle switches; related sizes and padding share aligned rows, phase fields use compact label/duration/colour controls, and sound paths use the full available width. Translations start collapsed unless overrides already exist. The layout responds to the editor’s actual container width, including a narrow editor on a wide desktop. YAML configuration and defaults are unchanged. It follows Home Assistant's field colours and selected light/dark mode, including native form controls. The calculated preview includes sound cues in list order, showing each timestamp and full file path alongside timed phases. It uses offsets in manual mode and clock times in scheduled mode, updates after editing or reordering, and never starts a session or plays audio.

Optional top-level settings:

- `timezone`: IANA time-zone name; default is the Home Assistant configured time zone, falling back to the browser only before HA provides its configuration.
- `minimalist`: focus on the timeline and a full-width phase name above it; hides the title, mode badge, schedule summary and countdown row. Default `false`. Manual Start/Reset remain available as compact controls.
- `height`: timeline area height (bar plus time labels), 80–400 pixels; defaults to 120, or 80 with `minimalist: true`. The bar fills the available area rather than being capped at a fixed height.
- `event_text_scale`: scale only the text printed inside event bars, from `0.5` to `3`; default `1`. For example, `event_text_scale: 1.2` makes event labels 20% larger, while `0.8` makes them 20% smaller to help fit longer names. Applies on top of the existing responsive text size, in both display modes. Does not change the current-action heading, clock/boundary labels, details, phase widths or manual session. Available in the visual editor; clearing the field restores the default. Large text still truncates rather than spilling into adjacent events.
- `hide_outside_window`: automatically hide scheduled cards outside their timeline window, including before/after padding; default `false`. Ignored in manual mode. Editor previews remain visible. See automatic scheduled visibility below.
- `show_now`: show the current-time marker during the sequence and any configured timeline padding; default `true`.
- `padding_before` / `padding_after`: extra visible time before the first phase and after the final phase, in minutes; both default to `0`. Accept finite numbers from 0 to 1440, including fractions. Available in the visual editor. These are display-only margins, not phases or delays.
- `translations`: optional language and text overrides, described below and grouped separately in the visual editor.
- `now_label`: legacy override for the current-time word; still supported. Prefer `translations.now` for new configurations.
- `show_remaining`: show active-phase countdowns; default `true`. The idle next-start countdown remains part of the status in both display modes.
- `session_id`: manual browser-local persistence, described above.

Each phase requires `label` and `duration`. Optional `id` must be unique, and `color` uses `#RRGGBB`. Legacy `icon` fields are ignored; removing them from existing YAML is optional. The visual editor assigns stable IDs before editing or reordering. YAML without IDs uses collision-free positional IDs; supply explicit IDs when reordering phases by hand so phase identity remains unambiguous. No arbitrary JavaScript, HTML, external images or CSS values are executed from configuration.

### Ordered sound cues

Interleave sound-only entries with timed phases. The list is the playback order:

```yaml
phases:
  - sound: /local/sounds/start.mp3
  - id: setup
    label: Setup
    duration: "00:01:00"
  - sound: /local/sounds/ready.mp3
  - id: talk
    label: Talk
    duration: "00:10:00"
  - sound: /local/sounds/questions.mp3
  - id: questions
    label: Questions
    duration: "00:03:00"
  - sound: /local/sounds/finish.mp3
```

A sound-only row has `sound` and an optional unique `id`; no label or duration. It plays at its position: before the first phase on manual **Start** or scheduled sequence start, between phases, or at the sequence end. All cues are optional. They create no timeline segments and consume no sequence time. Padding never moves a cue. Support remains 1–50 timed phases, with up to 101 total list entries.

The visual editor offers **Add phase**, **Add sound**, and a dedicated drag handle on each row. Mouse and touch dragging move exactly that row, not an implicit phase/sound pair; the drop line shows the insertion position. Drag near the scroll area's edge to scroll a long list. Escape, pointer cancellation and dropping outside the list cancel the move. Arrow keys on a handle and the **Move up/down** buttons provide alternatives. Input fields remain ordinary editable controls.

**Adjacent sound rows generate a non-blocking warning**, both in the editor and on the card. They share a timestamp and play consecutively in list order, without extending phase durations. If another configured sound boundary arrives before the group finishes, it replaces the unfinished group rather than delaying the timeline. Remove a sound row to make that boundary silent.

Audio plays in the browser displaying the card, not on a Home Assistant media player. Use a same-origin root-relative media URL such as `/local/sounds/end.mp3` (a file under `/config/www/sounds/`). Absolute/external URLs, protocol-relative URLs and `media-source://` identifiers are not supported. Files are requested only when a cue is attempted; no audio files are bundled.

Works in manual and scheduled mode, including final cues when automatic window hiding is enabled and across midnight. Repeated ticks or HA updates do not replay a cue. Each visible card instance/browser handles its own audio; this is not a server-side alarm and cannot guarantee playback with a closed or suspended browser.

There are no catch-up sounds on initial load/reload, config changes, preview or tab visibility recovery. Preview cards, background tabs and externally hidden cards are silent. Ordinary delayed ticks have a 75-second grace period; if several boundaries were crossed, only the most recent boundary's sounds play rather than a backlog. Reset, a new manual Start, configuration changes and disconnect stop current playback and discard queued sounds.

Browsers may require a user interaction or an autoplay permission/policy, especially for scheduled playback. Missing files, unsupported media or blocked playback produce a card warning when visible, without retrying every second. This does not bypass browser permissions or change kiosk policy. Volume follows the browser/device settings. Timing and visibility rules are unchanged.

**Compatibility:** a `sound` property on a timed phase still means play at that phase's end. The visual editor displays it as a separate following sound row and writes the mixed list when edited. Existing YAML keeps working without migration. Adding, moving or editing only sound rows does not invalidate a manual session; changing timed-phase identity, ordering or durations still does.

### Automatic scheduled visibility

```yaml
hide_outside_window: true
padding_before: 5
padding_after: 5
```

For `mode: scheduled`, show the card from the first phase's start minus `padding_before` until the final phase's end plus `padding_after`. The start is inclusive; the end is exclusive. This uses the same time-zone-aware window as the timeline, including finish anchors, midnight-spanning sequences and daylight-saving changes. Both padding values default to zero. The setting does not hide manual cards, change event times or add weekday scheduling.

Enable **Hide outside scheduled window** in the visual editor, or add the YAML flag. It defaults to `false`, preserving the idle countdown when not enabled. Native HA editor previews stay visible so the card remains editable outside its schedule. Existing HA weekday/holiday/visibility conditions still apply independently; this feature cannot override them.

The connected card's own clock checks visibility once per second and refreshes on HA updates or when the page becomes visible again, so a hidden card can reappear tomorrow without an entity update. It reports visibility changes to the native HA wrapper and remains connected while hidden, allowing standard HA layouts to collapse the wrapper instead of displaying an empty card. Third-party layouts with explicitly reserved slots may retain their own spacing. Invalid runtime time-zone resolution leaves a visible warning rather than hiding an error.

### Timeline padding

```yaml
padding_before: 5
padding_after: 5
```

The neutral margins share the timeline's time scale with the coloured phases. The cursor and current-time label can move through those margins, while phase-boundary labels still show the actual event times. Padding never changes phase durations, anchors, deadlines, next-start countdowns or stored manual starts. `show_now: false` also hides the cursor in the margins.

For daily schedules, padding can cross midnight. An actually active sequence takes priority; when only padded windows overlap, the nearest real sequence is shown. The cursor is visible from the padded start up to, but not including, the padded end.

Manual mode has no known start until Start is pressed, so its leading margin is a visual preview rather than a pre-start countdown. Pressing Start begins the first phase immediately; the cursor can continue through trailing padding after completion. Adjusting padding does not reset a running manual session.

### Idle status and translations

Outside an active scheduled sequence, the status shows **Start in 18h** (for example), counting down to the next daily sequence start. This also works after today's finish, in minimalist mode, and with `show_remaining: false`. The countdown uses rounded-up hours, then minutes below one hour, then seconds below one minute. It is calculated from actual timestamps in the configured time zone, including overnight and DST changes. It refers only to the card's daily schedule; external HA visibility/holiday rules are not interpreted.

An idle or completed manual sequence shows **Ready to start**. Start begins a fresh run after completion without requiring Reset; it remains disabled while a run is active. No automatic restart occurs.

The current-time word, readiness message and start countdown automatically follow Home Assistant's interface language. Built-in translations cover English, German, Ukrainian, French, Spanish and Polish, including regional language tags; unsupported languages fall back to English. Override the language or individual messages in one optional block:

```yaml
translations:
  language: en
  now: "Right now"
  ready_to_start: "Ready when you are"
  starts_in: "Start in {duration}"
```

All keys are optional. Omit `language` to follow HA. `starts_in` must include the literal `{duration}` placeholder; the card inserts a localized compact duration. Custom strings are plain text, never HTML. Changing language or wording does not reset timings or a running manual session. Other controls and editor labels currently remain English.

An explicit `translations.now: ""` in YAML hides the word but keeps the clock. The legacy `now_label` setting still works; `translations.now` takes precedence when both are present. The editor groups these settings under **Translations**, pre-fills a legacy override, and writes the grouped form when that field is edited. Clearing an override in the editor restores the translated default. Long current-time wording is ellipsized while keeping the clock visible.

### Timeline-first layout

There is no permanent duplicate legend in either mode. Short phases keep their proportional width; tap, hover or keyboard-focus any segment for its full name, exact boundaries and duration. Tap pins the details open; tap the segment again, use the close button, press Escape or tap outside the card to dismiss. Details overlay the page rather than reserving space below the timeline.

In minimalist mode, the current action name is centered above the NOW cursor, opposite the time label below the bar. It tracks the cursor as time advances and clamps inside the available space near either edge. Long names can wrap instead of being constrained to their phase's segment. In both modes, inspecting another phase changes only its details overlay: the top label and countdown continue to show the current action or idle status. This applies to hover, keyboard focus and pinned tap details. The active phase label is omitted inside its segment to avoid duplication.

Manual Start/Reset controls sit at the top right above the bar in both modes. Space is reserved so the action name cannot overlap them; on narrow minimalist cards the controls use a separate right-aligned row above the action label.

The NOW marker and current time sit below the bar. Time ticks automatically yield when they overlap NOW or each other; labels return as space becomes available. The marker label stays inside the card even near either endpoint. Exact boundaries remain available in each phase's details.

For a compact scheduled widget, add this at the top level:

```yaml
minimalist: true
```

Timing, phase colours and interactions are unchanged by minimalist mode. Completed phases are muted. Home Assistant theme colours are used when available.

## Dates, clocks and limitations

- The HA time zone determines daily anchors, not the kiosk's local time zone. An explicit `timezone` overrides it.
- Overnight sequences select an active occurrence from the previous/current/next anchor date. If DST makes long daily sequences overlap, the latest-started active occurrence wins. Otherwise the card displays the current anchor date's sequence, including its finished state.
- DST uses Temporal's compatible resolution: nonexistent local anchors shift forward by the gap; ambiguous anchors use the earlier occurrence. Durations remain real elapsed minutes/seconds, not nominal wall-clock differences.
- Display state is recomputed from the timestamp every second and immediately on page visibility changes. Sleeping or throttled browsers catch up without accumulating timer drift. Keep the browser clock synchronised.
- This is a **visual timeline**, not a backend automation runner. Closing the page stops rendering and browser audio, not elapsed time. It does not dispatch HA actions. Reliable notifications should remain backend automations; optional frontend sounds depend on the visible browser.
- The current-time marker and idle status have the translations described above. Other controls and editor labels currently use English. Phase labels and custom wording can use any language.

## Development

Node.js 20+, Python 3 (local test server), and Chromium test dependencies are needed.

```sh
npm ci --include=dev
npx playwright install chromium
npm run verify
```

`verify` runs JavaScript type checking, pure timing tests, builds the standalone ESM bundle, and exercises it in Chromium with a minimal HA contract fixture. Browser tests cover real custom elements and the shipped bundle, but **are not proof of deployment or rendering inside a live Home Assistant dashboard**.

For a local preview, build then run `python3 -m http.server 4173 --bind 127.0.0.1`. Open `/test/preview.html`. No HA credentials are used by the preview or test suite.

Commit `dist/time-sequence-card.js` with source changes. CI rebuilds and rejects stale distribution files. Source maps are intentionally not distributed.
