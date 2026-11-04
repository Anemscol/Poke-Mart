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
  return { uuid: item.uuid, name: item.name, img: item.img, price: readPrice(item) };
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
