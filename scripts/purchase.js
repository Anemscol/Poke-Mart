import { MODULE_ID, cfg, readNumber } from "./data.js";

const esc = (s) => Handlebars.escapeExpression(s);
const warn = (k, d) => ui.notifications.warn(game.i18n.format(k, d));
const error = (k, d) => ui.notifications.error(game.i18n.format(k, d));

/**
 * Buy `qty` of a mart entry for `actor`: deduct money, then give the item(s).
 * If giving the item fails, the money is refunded.
 * @returns {Promise<boolean>} true if the purchase went through
 */
export async function purchase({ entry, actor, qty }) {
  const moneyPath = cfg("moneyPath");
  const qtyPath = cfg("quantityPath");
  const symbol = cfg("currencySymbol");

  if (!actor.isOwner) return error("POKEMART.Errors.NotOwner", { actor: actor.name }), false;

  const total = entry.price * qty;
  const money = readNumber(actor, moneyPath);
  if (money === null) return error("POKEMART.Errors.NoMoneyField", { actor: actor.name, path: moneyPath }), false;
  if (money < total) return warn("POKEMART.Errors.NotEnough", { total: `${symbol}${total}`, money: `${symbol}${money}` }), false;

  const source = await fromUuid(entry.uuid);
  if (!source) return error("POKEMART.Errors.ItemMissing", { item: entry.name }), false;

  await actor.update({ [moneyPath]: money - total });
  try {
    await grantItem(actor, source, qty, qtyPath);
  } catch (err) {
    console.error(`${MODULE_ID} | Could not give item, refunding`, err);
    await actor.update({ [moneyPath]: (readNumber(actor, moneyPath) ?? 0) + total });
    error("POKEMART.Errors.GrantFailed", { item: entry.name, actor: actor.name });
    return false;
  }

  const msg = game.i18n.format("POKEMART.Chat.Purchased", {
    actor: esc(actor.name),
    qty,
    item: esc(entry.name),
    total: `${symbol}${total}`
  });
  if (cfg("chatMessages")) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="pokemart-chat"><i class="fas fa-store"></i> ${msg}</div>`,
      flags: { [MODULE_ID]: { purchase: true } }
    });
  }
  ui.notifications.info(game.i18n.format("POKEMART.Bought", { qty, item: entry.name, total: `${symbol}${total}` }));
  return true;
}

async function grantItem(actor, source, qty, qtyPath) {
  // Stack onto an existing item if this system tracks quantities
  const existing = actor.items.find((i) => i.name === source.name && i.type === source.type);
  const existingQty = existing ? readNumber(existing, qtyPath) : null;
  if (existing && existingQty !== null) {
    return existing.update({ [qtyPath]: existingQty + qty });
  }

  const data = game.items.fromCompendium(source, { clearOwnership: true });
  const hasQty = qtyPath && foundry.utils.hasProperty(data, qtyPath) && Number.isFinite(Number(foundry.utils.getProperty(data, qtyPath)));
  if (hasQty) {
    foundry.utils.setProperty(data, qtyPath, qty);
    return actor.createEmbeddedDocuments("Item", [data]);
  }
  // No quantity field: one copy per unit bought
  return actor.createEmbeddedDocuments("Item", Array.from({ length: qty }, () => foundry.utils.deepClone(data)));
}
