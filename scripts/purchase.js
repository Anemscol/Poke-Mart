import { MODULE_ID, cfg, readNumber, cartReward } from "./data.js";

const esc = (s) => Handlebars.escapeExpression(s);
const warn = (k, d) => ui.notifications.warn(game.i18n.format(k, d));
const error = (k, d) => ui.notifications.error(game.i18n.format(k, d));

/**
 * Buy everything in a cart in one purchase.
 * Money is deducted first. Items that can't be given are refunded individually.
 * @param lines [{ entry, qty }]
 * @returns {Promise<{delivered: Set<string>}>} uuids of the cart lines that were delivered
 */
export async function checkout({ lines, actor, mart }) {
  const none = { delivered: new Set() };
  const moneyPath = cfg("moneyPath");
  const qtyPath = cfg("quantityPath");
  const symbol = cfg("currencySymbol");

  if (!actor.isOwner) return error("POKEMART.Errors.NotOwner", { actor: actor.name }), none;
  if (!lines.length) return none;

  const total = lines.reduce((n, l) => n + l.entry.price * l.qty, 0);
  const money = readNumber(actor, moneyPath);
  if (money === null) return error("POKEMART.Errors.NoMoneyField", { actor: actor.name, path: moneyPath }), none;
  if (money < total) return warn("POKEMART.Errors.NotEnough", { total: `${symbol}${total}`, money: `${symbol}${money}` }), none;

  // Make sure every item still exists before any money moves
  const sources = new Map();
  for (const l of lines) {
    const src = await fromUuid(l.entry.uuid).catch(() => null);
    if (!src) return error("POKEMART.Errors.ItemMissing", { item: l.entry.name }), none;
    sources.set(l.entry.uuid, src);
  }

  // Free-item promotion
  let reward = cartReward(mart, lines);
  let rewardSource = null;
  if (reward) {
    rewardSource = reward.inCart ? sources.get(reward.uuid) : await fromUuid(reward.uuid).catch(() => null);
    if (!rewardSource) {
      warn("POKEMART.Errors.RewardMissing", { item: reward.name });
      reward = null;
    }
  }

  await actor.update({ [moneyPath]: money - total });

  const delivered = new Set();
  const failed = [];
  let refund = 0;
  for (const l of lines) {
    const extra = reward?.inCart && reward.uuid === l.entry.uuid ? reward.count : 0;
    try {
      await grantItem(actor, sources.get(l.entry.uuid), l.qty + extra, qtyPath);
      delivered.add(l.entry.uuid);
    } catch (err) {
      console.error(`${MODULE_ID} | Could not give ${l.entry.name}`, err);
      refund += l.entry.price * l.qty;
      failed.push(l.entry.name);
    }
  }

  let rewardLabel = null;
  if (reward) {
    if (reward.inCart) {
      if (delivered.has(reward.uuid)) rewardLabel = `${reward.count}× ${reward.name}`;
    } else if (delivered.size) {
      try {
        await grantItem(actor, rewardSource, reward.count, qtyPath);
        rewardLabel = `${reward.count}× ${reward.name}`;
      } catch (err) {
        console.error(`${MODULE_ID} | Could not give the free item`, err);
        error("POKEMART.Errors.RewardFailed", { item: reward.name });
      }
    }
  }

  if (refund > 0) await actor.update({ [moneyPath]: (readNumber(actor, moneyPath) ?? 0) + refund });
  if (failed.length) error("POKEMART.Errors.GrantFailed", { item: failed.join(", "), actor: actor.name });
  if (!delivered.size) return { delivered };

  const bought = lines.filter((l) => delivered.has(l.entry.uuid));
  const paid = total - refund;
  let msg = game.i18n.format("POKEMART.Chat.Purchased", {
    actor: esc(actor.name),
    items: bought.map((l) => `${l.qty}× <em>${esc(l.entry.name)}</em>`).join(", "),
    total: `${symbol}${paid}`
  });
  if (rewardLabel) msg += " " + game.i18n.format("POKEMART.Chat.PurchasedFree", { free: esc(rewardLabel) });
  if (cfg("chatMessages")) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="pokemart-chat"><i class="fas fa-store"></i> ${msg}</div>`,
      flags: { [MODULE_ID]: { purchase: true } }
    });
  }
  ui.notifications.info(
    game.i18n.format("POKEMART.Bought", {
      items: bought.map((l) => `${l.qty}× ${l.entry.name}`).join(", "),
      total: `${symbol}${paid}`
    }) + (rewardLabel ? " " + game.i18n.format("POKEMART.BoughtFree", { free: rewardLabel }) : "")
  );
  return { delivered };
}

/**
 * Sell `qty` of an owned item. Money is added first; if removing the item fails, it is taken back.
 * @param unit price paid per unit
 */
export async function sell({ actor, itemId, qty, unit }) {
  const moneyPath = cfg("moneyPath");
  const qtyPath = cfg("quantityPath");
  const symbol = cfg("currencySymbol");

  if (!actor.isOwner) return error("POKEMART.Errors.NotOwner", { actor: actor.name }), false;
  const item = actor.items.get(itemId);
  if (!item) return error("POKEMART.Errors.ItemGone", { item: "?", actor: actor.name }), false;

  const stackQty = readNumber(item, qtyPath);
  const have = stackQty === null ? 1 : Math.floor(stackQty);
  if (qty > have) return warn("POKEMART.Errors.NotEnoughItems", { actor: actor.name, have, item: item.name }), false;

  const money = readNumber(actor, moneyPath);
  if (money === null) return error("POKEMART.Errors.NoMoneyField", { actor: actor.name, path: moneyPath }), false;

  const total = unit * qty;
  const name = item.name;
  await actor.update({ [moneyPath]: money + total });
  try {
    if (stackQty !== null && qty < have) await item.update({ [qtyPath]: have - qty });
    else await item.delete();
  } catch (err) {
    console.error(`${MODULE_ID} | Could not remove sold item, reverting`, err);
    await actor.update({ [moneyPath]: (readNumber(actor, moneyPath) ?? money + total) - total });
    error("POKEMART.Errors.SellFailed", { item: name });
    return false;
  }

  if (cfg("chatMessages")) {
    const msg = game.i18n.format("POKEMART.Chat.Sold", {
      actor: esc(actor.name),
      qty,
      item: esc(name),
      total: `${symbol}${total}`
    });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="pokemart-chat"><i class="fas fa-store"></i> ${msg}</div>`,
      flags: { [MODULE_ID]: { sale: true } }
    });
  }
  ui.notifications.info(game.i18n.format("POKEMART.Sold", { qty, item: name, total: `${symbol}${total}` }));
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
