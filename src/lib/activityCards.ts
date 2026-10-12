/*
 * The GitHub activity as two self-contained SVG cards for the GitHub profile
 * README, in the activity panel's design: smoked gunmetal with gold readouts,
 * steel year columns and brushed-metal language segments. Each card carries
 * its styles and gradients inline and uses system fonts only, since GitHub
 * shows README images through its image proxy with no access to the site's
 * fonts or stylesheets.
 */
import type { ActivityLabels, GitHubActivity } from "../data/types";
import {
  formatDay,
  formatShare,
  formatSpan,
  languageSegments,
  METALS,
  metalIndex,
  yearColumns,
} from "./activity";

/**
 * Each src/icons/ SVG split for nesting in a card, keyed by file name
 * without ".svg": its viewBox, its root's paint attributes (`fill`, `style`)
 * and its inner markup. A single-colour icon paints with `currentColor`,
 * which the card sets through `color`.
 */
const ICONS: Record<string, { viewBox: string; paint: string; inner: string }> =
  Object.fromEntries(
    Object.entries(
      import.meta.glob<string>("../icons/*.svg", {
        query: "?raw",
        import: "default",
        eager: true,
      }),
    ).map(([path, svg]) => {
      const root = /<svg\b([^>]*)>/.exec(svg)!;
      const attribute = (name: string) =>
        new RegExp(`\\b${name}="([^"]*)"`).exec(root[1]!)?.[1];
      const fill = attribute("fill");
      const style = attribute("style");
      return [
        path.slice(path.lastIndexOf("/") + 1, -".svg".length),
        {
          viewBox: attribute("viewBox") ?? "0 0 24 24",
          paint:
            (fill ? ` fill="${fill}"` : "") +
            (style ? ` style="${style}"` : ""),
          inner: svg.slice(
            root.index + root[0].length,
            svg.lastIndexOf("</svg>"),
          ),
        },
      ];
    }),
  );

/** Width and height of each card, in pixels; two fit side by side at GitHub's README width. */
export const CARD_WIDTH = 495;
export const CARD_HEIGHT = 230;

/** Languages named in the languages card before the rest are summed as `other`. */
export const CARD_LANGUAGE_LIMIT = 6;

const SANS = "'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/** `value` with `&`, `<`, `>` and `"` escaped for SVG text and attributes. */
export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const count = (value: number) => value.toLocaleString("en-US");

/** A vertical linear gradient with `id` through `stops`. */
function gradient(id: string, stops: [number, string][]): string {
  const marks = stops
    .map(
      ([offset, color]) => `<stop offset="${offset}" stop-color="${color}"/>`,
    )
    .join("");
  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${marks}</linearGradient>`;
}

/** A card's face: smoked gunmetal, or the service record's brushed steel. */
type Face = "gunmetal" | "steel";

/** The smoked gunmetal face and its edge. */
function gunmetalFace(): string {
  return (
    `<rect x="0.5" y="0.5" width="${CARD_WIDTH - 1}" height="${CARD_HEIGHT - 1}" rx="14" fill="url(#face)" stroke="#2f353c"/>` +
    `<rect x="1.5" y="1.5" width="${CARD_WIDTH - 3}" height="${CARD_HEIGHT - 3}" rx="13" fill="none" stroke="#ffffff" stroke-opacity="0.05"/>`
  );
}

/**
 * The brushed steel face: the steel gradient under brushing streaks
 * (fractal noise stretched along x), a lit top edge, and a screw at each
 * corner.
 */
function steelFace(): string {
  const screws = [
    [14, 14, 28],
    [CARD_WIDTH - 14, 14, -52],
    [14, CARD_HEIGHT - 14, 120],
    [CARD_WIDTH - 14, CARD_HEIGHT - 14, 64],
  ]
    .map(
      ([x, y, angle]) =>
        `<g transform="translate(${x} ${y}) rotate(${angle})"><circle r="5" fill="url(#screw)" stroke="#5f666f" stroke-width="0.8"/><line x1="-3.4" x2="3.4" stroke="#3a4048" stroke-width="1.3"/></g>`,
    )
    .join("");
  return (
    `<filter id="brush" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.003 0.85" numOctaves="3" seed="11"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0.22 0.22"/></feComponentTransfer></filter>` +
    `<radialGradient id="screw" cx="0.35" cy="0.3" r="0.8"><stop offset="0" stop-color="#ffffff"/><stop offset="0.6" stop-color="#b8bec5"/><stop offset="1" stop-color="#6c737c"/></radialGradient>` +
    `<rect x="0.5" y="0.5" width="${CARD_WIDTH - 1}" height="${CARD_HEIGHT - 1}" rx="14" fill="url(#steel)" stroke="#6b727a"/>` +
    `<rect x="0.5" y="0.5" width="${CARD_WIDTH - 1}" height="${CARD_HEIGHT - 1}" rx="14" filter="url(#brush)" opacity="0.6"/>` +
    `<rect x="1.5" y="1.5" width="${CARD_WIDTH - 3}" height="${CARD_HEIGHT - 3}" rx="13" fill="none" stroke="#ffffff" stroke-opacity="0.8"/>` +
    screws
  );
}

/**
 * The card frame shared by both cards: an SVG named by `alt` through its
 * title, the gunmetal face and its edge, the engraved `heading` at the top
 * left and `meta` at the top right, around `body`.
 */
function card(
  alt: string,
  heading: string,
  meta: string,
  defs: string,
  body: string,
  face: Face = "gunmetal",
): string {
  const steel = face === "steel";
  const inks = steel
    ? ".dim{fill:#3c434b}.gold-text{fill:#3c434b}.ink{fill:#15181c}"
    : ".dim{fill:#8b94a0}.gold-text{fill:#e6c56c}.ink{fill:#eef1f4}";
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" role="img" aria-labelledby="card-title">`,
    `<title id="card-title">${escapeXml(alt)}</title>`,
    "<defs>",
    `<linearGradient id="face" x1="0.4" y1="0" x2="0.6" y2="1"><stop offset="0" stop-color="#14171c"/><stop offset="1" stop-color="#08090b"/></linearGradient>`,
    gradient("gold", METALS[0]!),
    gradient("steel", METALS[1]!),
    defs,
    "</defs>",
    `<style>.mono{font-family:${MONO}}.sans{font-family:${SANS}}${inks}</style>`,
    steel ? steelFace() : gunmetalFace(),
    `<text x="20" y="30" class="mono dim" font-size="11">${escapeXml(heading)}</text>`,
    `<text x="${CARD_WIDTH - 20}" y="30" class="mono dim" font-size="11" text-anchor="end">${escapeXml(meta)}</text>`,
    `<line x1="20" y1="42" x2="${CARD_WIDTH - 20}" y2="42" stroke="#000000" stroke-opacity="${steel ? 0.3 : 0.6}"/>`,
    `<line x1="20" y1="43" x2="${CARD_WIDTH - 20}" y2="43" stroke="#ffffff" stroke-opacity="${steel ? 0.7 : 0.07}"/>`,
    body,
    "</svg>",
  ].join("");
}

/**
 * The contributions card: the all-time total with the first contribution's
 * day, the current and longest streaks, and a column per year scaled to the
 * busiest year, the latest gold and the rest steel.
 */
export function contributionsCard(
  activity: GitHubActivity,
  labels: ActivityLabels,
): string {
  const streak = (x: number, label: string, length: number, span: string) =>
    length === 0
      ? `<text x="${x}" y="80" class="sans" font-size="18" font-weight="700" fill="url(#steel)">${escapeXml(labels.noStreak)}</text>` +
        `<text x="${x}" y="104" class="mono dim" font-size="9.5" letter-spacing="1.2">${escapeXml(label.toUpperCase())}</text>`
      : `<text x="${x}" y="80" class="sans" font-size="24" font-weight="700" fill="url(#gold)">${count(length)}<tspan font-size="12" dx="5">${escapeXml(length === 1 ? labels.day : labels.days)}</tspan></text>` +
        `<text x="${x}" y="96" class="mono dim" font-size="9.5">${escapeXml(span)}</text>` +
        `<text x="${x}" y="110" class="mono dim" font-size="9.5" letter-spacing="1.2">${escapeXml(label.toUpperCase())}</text>`;
  const { currentStreak: current, longestStreak: longest } = activity;
  const readouts = [
    `<text x="20" y="84" class="sans" font-size="34" font-weight="700" fill="url(#gold)">${count(activity.total)}</text>`,
    activity.firstContribution
      ? `<text x="20" y="100" class="mono dim" font-size="9.5">${escapeXml(`${labels.since} ${formatDay(activity.firstContribution)}`)}</text>`
      : "",
    `<text x="20" y="114" class="mono dim" font-size="9.5" letter-spacing="1.2">${escapeXml(labels.total.toUpperCase())}</text>`,
    streak(
      200,
      labels.currentStreak,
      current.length,
      current.length ? formatSpan(current.start!, current.end!) : "",
    ),
    streak(
      345,
      labels.longestStreak,
      longest.length,
      longest.length ? formatSpan(longest.start!, longest.end!) : "",
    ),
  ];
  const columns = yearColumns(activity.years);
  const slot = (CARD_WIDTH - 40) / Math.max(columns.length, 1);
  const width = Math.min(18, slot - 8);
  const top = 150;
  const height = 46;
  const bars = columns.map((column, index) => {
    const x = 20 + slot * index + (slot - width) / 2;
    const middle = x + width / 2;
    const latest = index === columns.length - 1;
    const filled = Math.max(2, column.height * (height - 4));
    return [
      `<rect x="${x.toFixed(1)}" y="${top}" width="${width.toFixed(1)}" height="${height}" rx="3" fill="#000000" fill-opacity="0.4"/>`,
      column.total > 0
        ? `<rect x="${(x + 2).toFixed(1)}" y="${(top + height - 2 - filled).toFixed(1)}" width="${(width - 4).toFixed(1)}" height="${filled.toFixed(1)}" rx="2" fill="url(#${latest ? "gold" : "steel"})"/>`
        : "",
      `<text x="${middle.toFixed(1)}" y="${top + height + 13}" class="mono ${latest ? "gold-text" : "dim"}" font-size="9" text-anchor="middle">${column.year}</text>`,
      `<text x="${middle.toFixed(1)}" y="${top - 5}" class="mono ${latest ? "gold-text" : "dim"}" font-size="8.5" text-anchor="middle">${count(column.total)}</text>`,
    ].join("");
  });
  return card(
    labels.cards.contributions,
    labels.title,
    `${labels.read} ${formatDay(activity.fetchedAt)}`,
    "",
    readouts.join("") + bars.join(""),
  );
}

/**
 * The languages card: the first `CARD_LANGUAGE_LIMIT` languages by bytes and
 * the rest as `other`, as one bar of brushed-metal segments over a
 * two-column legend: each language's metal swatch, its logo in its brand
 * colour, its name and its share, on the service record's brushed steel.
 */
export function languagesCard(
  activity: GitHubActivity,
  labels: ActivityLabels,
): string {
  const segments = languageSegments(
    activity.languages,
    CARD_LANGUAGE_LIMIT,
    labels.other,
  );
  const metal = (index: number) => metalIndex(index, segments[index]!.other);
  const defs = METALS.map((stops, index) =>
    gradient(`metal-${index}`, stops),
  ).join("");
  const barX = 20;
  const barWidth = CARD_WIDTH - 40;
  const gap = 2;
  const usable = barWidth - 6 - gap * Math.max(segments.length - 1, 0);
  let x = barX + 3;
  const bar = [
    `<text x="20" y="70" class="mono gold-text" font-size="10" letter-spacing="1.4">${escapeXml(labels.languages.toUpperCase())}</text>`,
    `<rect x="${barX}" y="82" width="${barWidth}" height="16" rx="8" fill="#14181e" fill-opacity="0.55"/>`,
    ...segments.map((segment, index) => {
      const width = Math.max(3, segment.share * usable);
      const rect = `<rect x="${x.toFixed(1)}" y="85" width="${width.toFixed(1)}" height="10" rx="3" fill="url(#metal-${metal(index)})"/>`;
      x += width + gap;
      return rect;
    }),
  ];
  const rows = Math.ceil(segments.length / 2);
  const legend = segments.map((segment, index) => {
    const column = Math.floor(index / rows);
    const row = index % rows;
    const left = 20 + column * (barWidth / 2 + 10);
    const right = left + barWidth / 2 - 10;
    const y = 132 + row * 23;
    const icon = ICONS[segment.logo.icon];
    return [
      `<rect x="${left}" y="${y - 7}" width="7" height="7" rx="1.5" fill="url(#metal-${metal(index)})" stroke="#000000" stroke-opacity="0.6"/>`,
      icon
        ? `<svg x="${left + 10}" y="${y - 13}" width="17" height="17" viewBox="${icon.viewBox}" color="${segment.logo.color}"${icon.paint}>${icon.inner}</svg>`
        : "",
      `<text x="${left + (icon ? 31 : 13)}" y="${y}" class="sans ink" font-size="12">${escapeXml(segment.name)}</text>`,
      `<text x="${right}" y="${y}" class="mono dim" font-size="10" text-anchor="end">${formatShare(segment.share)}</text>`,
    ].join("");
  });
  return card(
    labels.cards.languages,
    labels.title,
    `${labels.read} ${formatDay(activity.fetchedAt)}`,
    defs,
    bar.join("") + legend.join(""),
    "steel",
  );
}
