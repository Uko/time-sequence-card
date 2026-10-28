const NOW_LABELS = new Map([
  ["en", "Now"],
  ["de", "Jetzt"],
  ["uk", "Зараз"],
  ["fr", "Maintenant"],
  ["es", "Ahora"],
  ["pl", "Teraz"],
]);

/** HA language selects the default; an explicit override is literal text. */
export function resolveNowLabel(configured, language = "en") {
  if (configured !== undefined) return configured;
  const base =
    typeof language === "string"
      ? language.toLowerCase().split(/[-_]/)[0]
      : "en";
  return NOW_LABELS.get(base) ?? "Now";
}
