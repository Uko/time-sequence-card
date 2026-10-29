import { Temporal } from "@js-temporal/polyfill";

const COLORS = ["#e6ae47", "#49a9bc", "#8eaf67", "#ae88cb", "#dc7272"];
function fail(message) {
  throw new Error(`Time Sequence Card: ${message}`);
}
export function normalizeConfig(input) {
  if (!input || !["manual", "scheduled"].includes(input.mode))
    fail("mode must be manual or scheduled");
  if (
    !Array.isArray(input.phases) ||
    input.phases.length < 1 ||
    input.phases.length > 50
  )
    fail("provide 1–50 phases");
  if (input.timezone !== undefined) {
    if (typeof input.timezone !== "string")
      fail("timezone must be an IANA name");
    try {
      new Intl.DateTimeFormat("en", { timeZone: input.timezone });
    } catch {
      fail("invalid timezone");
    }
  }
  if (
    input.mode === "scheduled" &&
    (!input.anchor ||
      !["start", "end"].includes(input.anchor.edge) ||
      typeof input.anchor.at !== "string" ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.anchor.at))
  )
    fail(
      "scheduled mode requires anchor.at (HH:MM) and anchor.edge (start/end)",
    );
  if (input.translations !== undefined) {
    const translations = input.translations;
    if (
      !translations ||
      typeof translations !== "object" ||
      Array.isArray(translations)
    )
      fail("translations must be an object");
    for (const [key, value] of Object.entries(translations)) {
      if (
        !["language", "now", "ready_to_start", "starts_in"].includes(key) ||
        typeof value !== "string"
      )
        fail("unsupported translation setting or non-text value");
    }
    if (translations.language !== undefined) {
      try {
        if (
          !translations.language ||
          Intl.getCanonicalLocales(translations.language).length !== 1
        )
          fail("invalid translation language");
      } catch {
        fail("invalid translation language");
      }
    }
    if (
      translations.starts_in !== undefined &&
      !translations.starts_in.includes("{duration}")
    )
      fail("translations.starts_in must include {duration}");
  }
  if (input.now_label !== undefined && typeof input.now_label !== "string")
    fail("now_label must be text");
  if (input.title !== undefined && typeof input.title !== "string")
    fail("title must be text");
  if (
    input.session_id !== undefined &&
    (typeof input.session_id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(input.session_id))
  )
    fail("session_id must be 1–80 letters, digits, underscores or hyphens");
  for (const key of ["show_remaining", "show_now", "minimalist"])
    if (input[key] !== undefined && typeof input[key] !== "boolean")
      fail(`${key} must be boolean`);
  if (
    input.height !== undefined &&
    (!Number.isFinite(input.height) || input.height < 80 || input.height > 400)
  )
    fail("height must be 80–400");
  for (const key of ["padding_before", "padding_after"]) {
    if (
      input[key] !== undefined &&
      (typeof input[key] !== "number" ||
        !Number.isFinite(input[key]) ||
        input[key] < 0 ||
        input[key] > 1440)
    )
      fail(`${key} must be 0–1440 minutes`);
  }
  if (
    input.event_text_scale !== undefined &&
    (typeof input.event_text_scale !== "number" ||
      !Number.isFinite(input.event_text_scale) ||
      input.event_text_scale < 0.5 ||
      input.event_text_scale > 3)
  )
    fail("event_text_scale must be a number from 0.5 to 3");
  const ids = new Set();
  const reserved = new Set(
    input.phases.map((p) => p?.id).filter((id) => id !== undefined),
  );
  const phases = input.phases.map((p, i) => {
    if (!p || typeof p.label !== "string" || !p.label.trim())
      fail(`phase ${i + 1} needs a label`);
    let id = p.id;
    if (id === undefined) {
      id = `phase-${i}`;
      while (reserved.has(id) || ids.has(id)) id += "-auto";
    }
    if (typeof id !== "string" || !id || ids.has(id))
      fail("phase IDs must be unique text");
    ids.add(id);
    if (
      p.color !== undefined &&
      (typeof p.color !== "string" || !/^#[a-fA-F0-9]{6}$/.test(p.color))
    )
      fail("colors must be #RRGGBB");
    return {
      ...p,
      id,
      color: p.color ?? COLORS[i % COLORS.length],
      milliseconds: parseDuration(p.duration),
    };
  });
  if (phases.reduce((sum, p) => sum + p.milliseconds, 0) >= 86400000)
    fail("sequence must be shorter than 24 hours");
  return {
    ...input,
    title: input.title ?? "Time sequence",
    height: input.height ?? (input.minimalist ? 80 : 120),
    minimalist: input.minimalist ?? false,
    event_text_scale: input.event_text_scale ?? 1,
    show_now: input.show_now ?? true,
    padding_before: input.padding_before ?? 0,
    padding_after: input.padding_after ?? 0,
    show_remaining: input.show_remaining ?? true,
    phases,
  };
}
function parseDuration(value) {
  if (typeof value !== "string" || !/^\d{2}:[0-5]\d:[0-5]\d$/.test(value))
    fail("duration must be HH:MM:SS");
  const [h, m, s] = value.split(":").map(Number);
  const milliseconds = ((h * 60 + m) * 60 + s) * 1000;
  if (milliseconds <= 0 || milliseconds >= 86400000)
    fail("duration must be positive and shorter than 24 hours");
  return milliseconds;
}
function scheduledOccurrences(config, now, zone) {
  const timezone = config.timezone ?? zone;
  const date = Temporal.Instant.fromEpochMilliseconds(now)
    .toZonedDateTimeISO(timezone)
    .toPlainDate();
  const duration = config.phases.reduce((sum, p) => sum + p.milliseconds, 0);
  return [-1, 0, 1, 2].map((days) => {
    const anchor = date.add({ days }).toZonedDateTime({
      timeZone: timezone,
      plainTime: config.anchor.at,
    }).epochMilliseconds;
    const start = config.anchor.edge === "end" ? anchor - duration : anchor;
    return { start, end: start + duration };
  });
}
export function nextScheduledStart(config, now, zone) {
  return Math.min(
    ...scheduledOccurrences(config, now, zone)
      .filter((s) => s.start > now)
      .map((s) => s.start),
  );
}
export function timelineWindow(config, sequence) {
  const start = sequence.start - (config.padding_before ?? 0) * 60000;
  const end = sequence.end + (config.padding_after ?? 0) * 60000;
  return { start, end, duration: end - start };
}
export function resolveSequence(config, now, zone, startedAt) {
  if (config.mode === "scheduled") {
    const occurrences = scheduledOccurrences(config, now, zone);
    const padded = occurrences
      .filter((s) => {
        const window = timelineWindow(config, s);
        return now >= window.start && now < window.end;
      })
      .sort(
        (a, b) =>
          Math.max(a.start - now, now - a.end, 0) -
            Math.max(b.start - now, now - b.end, 0) || b.start - a.start,
      );
    startedAt = (
      [...occurrences].reverse().find((s) => now >= s.start && now < s.end) ??
      padded[0] ??
      occurrences[1]
    ).start;
  }
  if (startedAt == null) return null;
  let cursor = startedAt;
  const phases = config.phases.map((p) => {
    const start = cursor;
    cursor += p.milliseconds;
    return { ...p, start, end: cursor };
  });
  return { start: startedAt, end: cursor, phases };
}
export function sequenceState(sequence, now) {
  if (!sequence) return { status: "idle", index: -1 };
  if (now < sequence.start) return { status: "upcoming", index: -1 };
  const index = sequence.phases.findIndex((p) => now >= p.start && now < p.end);
  return { status: index < 0 ? "finished" : "active", index };
}
