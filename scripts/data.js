export const MODULE_ID = "pokerole-pokemart";

/** Open window instances, so they can be refreshed when data changes. */
export const openApps = new Set();

export function refreshApps() {
  for (const app of openApps) app.render(false);
}

export const cfg = (key) => game.settings.get(MODULE_ID, key);

/** All marts, keyed by id: { id, name, open, items: [{ uuid, name, img, price }] } */
export function getMarts() {
  return foundry.utils.deepClone(game.settings.get(MODULE_ID, "marts") ?? {});
}

export function saveMarts(marts) {
  return game.settings.set(MODULE_ID, "marts", marts);
}

/** Read a numeric value from a document (or index entry) by dot path. Returns null if absent/not numeric. */
export function readNumber(doc, path) {
  if (!path) return null;
  const v = foundry.utils.getProperty(doc, path);
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Default price for an item, taken from the configured price field. 0 if there isn't one. */
export function readPrice(doc) {
  const n = readNumber(doc, cfg("pricePath"));
  return n === null ? 0 : Math.max(0, Math.round(n));
}

export function entryFromItem(item) {
  return { uuid: item.uuid, name: item.name, img: item.img, price: readPrice(item), desc: rawDescription(item) };
}

/** Add entries to a mart, skipping duplicates. Returns how many were added. */
export async function addEntries(martId, entries) {
  const marts = getMarts();
  const mart = marts[martId];
  if (!mart) return 0;
  let added = 0;
  for (const e of entries) {
    if (mart.items.some((i) => i.uuid === e.uuid)) continue;
    mart.items.push(e);
    added++;
  }
  if (added) await saveMarts(marts);
  return added;
}

export async function confirmDialog(title, content) {
  const DV2 = foundry.applications?.api?.DialogV2;
  if (DV2?.confirm) {
    return DV2.confirm({ window: { title }, content: `<p>${content}</p>`, rejectClose: false, modal: true });
  }
  return Dialog.confirm({ title, content: `<p>${content}</p>` });
}

/* ---------- Item descriptions ---------- */

/** Raw description text of an item. Tries the configured field, then common fallbacks. */
export function rawDescription(item) {
  if (!item) return "";
  const paths = [
    cfg("descriptionPath"),
    "system.description.value",
    "system.description",
    "system.details",
    "system.effect",
    "system.notes"
  ];
  for (const path of paths) {
    if (!path) continue;
    let v = foundry.utils.getProperty(item, path);
    if (v && typeof v === "object") v = v.value;
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

/** Turn raw description text into safe, rendered HTML. */
export async function enrichDescription(raw, item) {
  if (!raw) return "";
  const TE = foundry.applications?.ux?.TextEditor?.implementation ?? TextEditor;
  try {
    return await TE.enrichHTML(raw, { async: true, secrets: !!item?.isOwner, relativeTo: item ?? undefined });
  } catch (err) {
    return raw;
  }
}

/* ---------- Selling ---------- */

/** A mart's buy-back settings, with defaults for marts created before selling existed. */
export function martSell(mart) {
  const ratio = Number(mart?.sellRatio);
  return {
    enabled: !!mart?.sellEnabled,
    ratio: Number.isFinite(ratio) ? Math.min(100, Math.max(0, Math.round(ratio))) : 50,
    any: mart?.sellAny ?? true
  };
}

/** The mart entry an owned item corresponds to, if the mart sells it. */
export function sellEntryFor(mart, item) {
  const src = item._stats?.compendiumSource ?? item.flags?.core?.sourceId;
  return mart.items.find((e) => (src && e.uuid === src) || e.name === item.name);
}

/** What this mart pays for one unit of an owned item. 0 means it won't buy it. */
export function sellUnitPrice(mart, item) {
  const s = martSell(mart);
  if (!s.enabled) return 0;
  const entry = sellEntryFor(mart, item);
  const base = entry ? entry.price : s.any ? readPrice(item) : 0;
  return Math.floor((base * s.ratio) / 100);
}
