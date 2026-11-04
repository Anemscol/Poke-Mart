import {
  MODULE_ID, openApps, getMarts, cfg, readNumber, confirmDialog,
  martSell, sellUnitPrice, rawDescription, enrichDescription
} from "./data.js";
import { purchase, sell } from "./purchase.js";

const AppV1 = foundry.appv1?.api?.Application ?? Application;
const esc = (s) => Handlebars.escapeExpression(s);

/** The player-facing shop window. */
export class MartApp extends AppV1 {
  constructor(martId, options = {}) {
    super({ id: `${MODULE_ID}-mart-${martId}`, ...options });
    this.martId = martId;
    this.actorId = null;
    this.tab = "buy";
    this.search = "";
    this.qty = {};
    this.expanded = new Set(); // rows whose description is open
    this.descCache = new Map();
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["pokemart"],
      template: `modules/${MODULE_ID}/templates/mart.hbs`,
      width: 580,
      height: 660,
      resizable: true
    });
  }

  get title() {
    return getMarts()[this.martId]?.name ?? game.i18n.localize("POKEMART.Title");
  }

  render(...args) {
    openApps.add(this);
    return super.render(...args);
  }

  async close(options) {
    openApps.delete(this);
    return super.close(options);
  }

  /** Characters the current user can spend money for. */
  _buyers() {
    const path = cfg("moneyPath");
    return game.actors
      .filter((a) => a.isOwner && readNumber(a, path) !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  getData() {
    const mart = getMarts()[this.martId];
    const moneyPath = cfg("moneyPath");
    const currency = cfg("currencySymbol");
    const buyers = this._buyers();

    if (!buyers.some((a) => a.id === this.actorId)) {
      const own = game.user.character;
      this.actorId = (own && buyers.find((a) => a.id === own.id)?.id) ?? buyers[0]?.id ?? null;
    }
    const actor = game.actors.get(this.actorId);
    const money = actor ? readNumber(actor, moneyPath) ?? 0 : 0;

    const sellOn = martSell(mart).enabled;
    if (!sellOn) this.tab = "buy";

    let sellItems = [];
    if (sellOn && actor && this.tab === "sell") {
      const qtyPath = cfg("quantityPath");
      sellItems = actor.items
        .map((item) => {
          const q = readNumber(item, qtyPath);
          const have = q === null ? 1 : Math.floor(q);
          return {
            key: item.id,
            name: item.name,
            img: item.img,
            price: sellUnitPrice(mart, item),
            currency,
            have,
            stack: q !== null,
            qty: this.qty[item.id] ?? 1
          };
        })
        .filter((r) => r.price > 0 && r.have >= 1)
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    return {
      missing: !mart,
      closed: !!mart && !mart.open && !game.user.isGM,
      gmClosed: !!mart && !mart.open && game.user.isGM,
      mart,
      currency,
      moneyPath,
      money,
      noBuyers: buyers.length === 0,
      buyers: buyers.map((a) => ({ id: a.id, name: a.name, selected: a.id === this.actorId })),
      search: this.search,
      sellOn,
      isBuy: this.tab === "buy",
      isSell: this.tab === "sell",
      items: (mart?.items ?? []).map((e) => ({
        ...e,
        key: e.uuid,
        currency,
        qty: this.qty[e.uuid] ?? 1,
        expensive: e.price > money
      })),
      sellItems
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find("select[name=actor]").on("change", (ev) => {
      this.actorId = ev.currentTarget.value;
      this.render(false);
    });

    html.find(".pokemart-tabs .tab").on("click", (ev) => {
      this.tab = ev.currentTarget.dataset.tab;
      this.render(false);
    });

    const applyFilter = () => {
      const q = this.search.trim().toLowerCase();
      html.find(".pokemart-item").each((_, el) => {
        el.hidden = !!q && !el.dataset.name.toLowerCase().includes(q);
      });
    };
    html.find(".pokemart-search").on("input", (ev) => {
      this.search = ev.currentTarget.value;
      applyFilter();
    });
    applyFilter();

    html.find("input.qty").on("input", (ev) => {
      const li = ev.currentTarget.closest(".pokemart-item");
      this.qty[li.dataset.key] = ev.currentTarget.value;
    });

    // Click an item's name to show or hide its description
    html.find(".item-name").on("click", (ev) => this._toggleDescription(ev.currentTarget.closest(".pokemart-item")));
    html.find(".pokemart-item").each((_, li) => {
      if (this.expanded.has(li.dataset.key)) this._showDescription(li);
    });

    html.find("button.buy").on("click", (ev) => this._onBuy(ev));
    html.find("button.sell").on("click", (ev) => this._onSell(ev));
  }

  /* ---------- Descriptions ---------- */

  _toggleDescription(li) {
    const key = li.dataset.key;
    const panel = li.querySelector(".item-desc");
    if (this.expanded.has(key)) {
      this.expanded.delete(key);
      panel.hidden = true;
      li.classList.remove("open");
    } else {
      this.expanded.add(key);
      this._showDescription(li);
    }
  }

  async _showDescription(li) {
    const panel = li.querySelector(".item-desc");
    li.classList.add("open");
    panel.hidden = false;
    if (!this.descCache.has(li.dataset.key)) panel.textContent = game.i18n.localize("POKEMART.LoadingDescription");
    const html = await this._loadDescription(li.dataset.key);
    panel.innerHTML = html || `<em>${game.i18n.localize("POKEMART.NoDescription")}</em>`;
  }

  async _loadDescription(key) {
    if (this.descCache.has(key)) return this.descCache.get(key);
    let html = "";
    if (this.tab === "sell") {
      const item = game.actors.get(this.actorId)?.items.get(key);
      html = await enrichDescription(rawDescription(item), item);
    } else {
      // Live item if we can read it, otherwise the description saved when the GM added it
      let item = null;
      try {
        item = await fromUuid(key);
      } catch (err) {
        /* no access to the compendium */
      }
      const entry = getMarts()[this.martId]?.items.find((i) => i.uuid === key);
      html = await enrichDescription(rawDescription(item) || entry?.desc || "", item);
    }
    this.descCache.set(key, html);
    return html;
  }

  /* ---------- Buying & selling ---------- */

  async _onBuy(ev) {
    const button = ev.currentTarget;
    const li = button.closest(".pokemart-item");
    const entry = getMarts()[this.martId]?.items.find((i) => i.uuid === li.dataset.key);
    const actor = game.actors.get(this.actorId);
    if (!entry || !actor) return;

    const qty = this._readQty(li);
    const total = entry.price * qty;
    button.disabled = true;
    try {
      if (cfg("confirmPurchases")) {
        const ok = await confirmDialog(
          game.i18n.localize("POKEMART.ConfirmTitle"),
          game.i18n.format("POKEMART.ConfirmBody", {
            actor: esc(actor.name), qty, item: esc(entry.name), total: `${cfg("currencySymbol")}${total}`
          })
        );
        if (!ok) return;
      }
      if (await purchase({ entry, actor, qty })) this.qty[entry.uuid] = 1;
    } finally {
      this.render(false);
    }
  }

  async _onSell(ev) {
    const button = ev.currentTarget;
    const li = button.closest(".pokemart-item");
    const mart = getMarts()[this.martId];
    const actor = game.actors.get(this.actorId);
    const item = actor?.items.get(li.dataset.key);
    if (!mart || !item) return;

    const unit = sellUnitPrice(mart, item);
    if (unit <= 0) return;
    const qty = this._readQty(li);
    const total = unit * qty;
    button.disabled = true;
    try {
      if (cfg("confirmPurchases")) {
        const ok = await confirmDialog(
          game.i18n.localize("POKEMART.ConfirmSellTitle"),
          game.i18n.format("POKEMART.SellConfirmBody", {
            actor: esc(actor.name), qty, item: esc(item.name), total: `${cfg("currencySymbol")}${total}`
          })
        );
        if (!ok) return;
      }
      if (await sell({ actor, itemId: item.id, qty, unit })) this.qty[li.dataset.key] = 1;
    } finally {
      this.render(false);
    }
  }

  _readQty(li) {
    const input = li.querySelector("input.qty");
    const max = Number(input.max) || 99;
    return Math.min(max, Math.max(1, Math.floor(Number(input.value) || 1)));
  }
}
