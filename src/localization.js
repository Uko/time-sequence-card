const WORDS = new Map([
  [
    "en",
    {
      now: "Now",
      ready_to_start: "Ready to start",
      starts_in: "Start in {duration}",
    },
  ],
  [
    "de",
    {
      now: "Jetzt",
      ready_to_start: "Bereit zum Start",
      starts_in: "Start in {duration}",
    },
  ],
  [
    "uk",
    {
      now: "Зараз",
      ready_to_start: "Готово до початку",
      starts_in: "Початок через {duration}",
    },
  ],
  [
    "fr",
    {
      now: "Maintenant",
      ready_to_start: "Prêt à démarrer",
      starts_in: "Début dans {duration}",
    },
  ],
  [
    "es",
    {
      now: "Ahora",
      ready_to_start: "Listo para empezar",
      starts_in: "Inicio en {duration}",
    },
  ],
  [
    "pl",
    {
      now: "Teraz",
      ready_to_start: "Gotowe do rozpoczęcia",
      starts_in: "Start za {duration}",
    },
  ],
]);
export function translationLanguage(config, language = "en") {
  return config.translations?.language ?? language;
}
export function translate(config, key, language = "en", duration = "") {
  const locale = translationLanguage(config, language);
  const base =
    typeof locale === "string" ? locale.toLowerCase().split(/[-_]/)[0] : "en";
  const words = WORDS.get(base) ?? WORDS.get("en");
  const custom =
    config.translations?.[key] ??
    (key === "now" ? config.now_label : undefined);
  const text = custom ?? words[key];
  return key === "starts_in" ? text.replaceAll("{duration}", duration) : text;
}
/** Legacy standalone wording remains supported; grouped overrides take precedence. */
export function resolveNowLabel(configured, language = "en") {
  return translate({ now_label: configured }, "now", language);
}
export function formatStartCountdown(milliseconds, language = "en") {
  const [unit, divisor] =
    milliseconds >= 3600000
      ? ["hour", 3600000]
      : milliseconds >= 60000
        ? ["minute", 60000]
        : ["second", 1000];
  return new Intl.NumberFormat(language, {
    style: "unit",
    unit,
    unitDisplay: "narrow",
  }).format(Math.max(0, Math.ceil(milliseconds / divisor)));
}
