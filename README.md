# Time Sequence Card

A Home Assistant dashboard card for **fixed-window sequences**, anchored to a manual Start or a daily start/finish time. No charting library, template wrapper, dummy series, or duplicated phase boundaries.

Define each phase's duration once. The card derives the timeline, highlights the current phase, and shows phase and total remaining time.

## Timing model

- **Manual:** Start fixes the sequence to the current instant. Phases advance automatically. Taking longer does not push later phases back. Reset clears the session; there is intentionally no Pause, Skip, or resume-later mode.
- **Scheduled start:** calculate phase boundaries forwards from a time of day.
- **Scheduled finish:** calculate backwards from a fixed deadline. Increasing a phase duration moves preparation earlier, not the deadline later.
- Scheduled mode repeats daily. Use Home Assistant's native conditional card/visibility rules for school days, holidays, or any existing routine-active binary sensor. The card does not replace those scheduling rules.
- Durations are elapsed time in `HH:MM:SS`, from one second to less than 24 hours. The entire sequence must be shorter than 24 hours. Supply 1–50 phases.

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
    icon: mdi:laptop
    color: "#E6AE47"
  - label: Talk
    duration: "00:10:00"
    icon: mdi:presentation
    color: "#49A9BC"
  - label: Questions
    duration: "00:03:00"
    icon: mdi:comment-question
    color: "#8EAF67"
```

The optional `session_id` enables reload recovery and synchronisation across tabs on the **same browser origin** using local storage. Use a distinct ID per independent sequence. Devices, browser profiles, and different HA URLs do not share this storage. Without an ID, the session is in-memory only; a full page reload resets it. Removing/reconnecting the same card element retains its in-memory start.

Only the start timestamp and a phase ID/duration signature are stored. A change to phase IDs, ordering or durations invalidates a saved session; do not edit timing during a run. Changing labels or colours leaves the fixed timings unchanged. Unavailable browser storage produces a visible warning rather than breaking Start. Reset removes the saved session. A finished session remains finished until Reset; it never starts again automatically.

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
    icon: mdi:food
  - label: Brush teeth
    duration: "00:05:00"
    icon: mdi:toothbrush
  - label: Get dressed
    duration: "00:10:00"
    icon: mdi:tshirt-crew
  - label: Leave
    duration: "00:10:00"
    icon: mdi:bag-personal
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

The native card editor supports title, mode, anchor, phase labels/durations/icons/colours, reordering, adding/removing phases, and a read-only calculated-time preview. The preview never starts a live session.

Optional top-level settings:

- `timezone`: IANA time-zone name; default is the Home Assistant configured time zone, falling back to the browser only before HA provides its configuration.
- `height`: timeline area height, 80–400 pixels; default 140. Narrow cards compact it to preserve space.
- `show_now`: show the active current-time marker; default `true`.
- `show_remaining`: show countdowns; default `true`.
- `session_id`: manual browser-local persistence, described above.

Each phase requires `label` and `duration`. Optional `id` must be unique, `icon` uses `mdi:name`, and `color` uses `#RRGGBB`. The visual editor assigns stable IDs before editing or reordering. YAML without IDs uses collision-free positional IDs; supply explicit IDs when reordering phases by hand so phase identity remains unambiguous. No arbitrary JavaScript, HTML, external images or CSS values are executed from configuration.

Short phases keep their proportional width. Labels may be truncated or hidden in the band; the complete ordered legend always exposes every label, duration and boundary. Completed phases are muted and the active phase is marked in both the strip and the legend. Home Assistant icons and theme colours are used when available.

## Dates, clocks and limitations

- The HA time zone determines daily anchors, not the kiosk's local time zone. An explicit `timezone` overrides it.
- Overnight sequences select an active occurrence from the previous/current/next anchor date. If DST makes long daily sequences overlap, the latest-started active occurrence wins. Otherwise the card displays the current anchor date's sequence, including its finished state.
- DST uses Temporal's compatible resolution: nonexistent local anchors shift forward by the gap; ambiguous anchors use the earlier occurrence. Durations remain real elapsed minutes/seconds, not nominal wall-clock differences.
- Display state is recomputed from the timestamp every second and immediately on page visibility changes. Sleeping or throttled browsers catch up without accumulating timer drift. Keep the browser clock synchronised.
- This first version is a **visual timeline**, not a backend automation runner. Closing the page stops rendering, not elapsed time. It does not dispatch HA actions or play sounds. Reliable notifications should remain backend automations; optional frontend audio and reusable multi-schedule presets are follow-up work.
- The interface currently uses English controls. Phase labels can use any language.

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
