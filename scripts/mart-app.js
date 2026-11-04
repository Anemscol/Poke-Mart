import {
  MODULE_ID, openApps, getMarts, cfg, readNumber, confirmDialog,
  martSell, sellUnitPrice, rawDescription, enrichDescription, martBogo, cartReward
} from "./data.js";
import { checkout, sell } from "./purchase.js";

const AppV1 = foundry.appv1?.api?.Application ?? Application;
const esc = (s) => Handlebars.escapeExpression(s);
const T = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));
const clampQty = (v, max = 99) => Math.min(max, Math.max(1, Math.floor(Number(v)) || 1));

/** The player-facing shop window. */
export class MartApp extends AppV1 {
  constructor(martId, options = {}) {
    super({ id: `${MODULE_ID}-mart-${martId}`, ...options });
    this.martId = martId;
    this.actorId = null;
    this.tab = "buy";
    this.search = "";
    this.qty = {}; // quantity typed in each row
    this.cart = new Map(); // item uuid -> quantity
    this.expanded = new Set(); // rows whose description is open
    this.descCache = new Map();
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["pokemart"],
      template: `modules/${MODULE_ID}/templates/mart.hbs`,
      width: 620,
      height: 720,
      resizable: true
    });
  }

  get title() {
    return getMarts()[this.martId]?.name ?? T("POKEMART.Title");
  }

  render(...args) {
    openApps.add(this);
    return super.render(...args);
  }

  async close(options) {
    openApps.delete(this);
    return super.close(options);
  }

  /** Keep the item list's scroll position across re-renders. */
  async _render(...args) {
    const scroll = this.element?.[0]?.querySelector(".pokemart-items")?.scrollTop ?? 0;
    await super._render(...args);
    const list = this.element?.[0]?.querySelector(".pokemart-items");
    if (list) list.scrollTop = scroll;
  }

  /** Characters the current user can spend money for. */
  _buyers() {
    const path = cfg("moneyPath");
    return game.actors
      .filter((a) => a.isOwner && readNumber(a, path) !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Cart lines as [{ entry, qty }], dropping anything the GM has since removed from the mart. */
  _cartLines(mart) {
    const lines = [];
    for (const [uuid, qty] of [...this.cart]) {
      const entry = mart?.items.find((i) => i.uuid === uuid);
      if (!entry) this.cart.delete(uuid);
      else lines.push({ entry, qty });
    }
    return lines;
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

    const sellCfg = martSell(mart);
    const sellOn = sellCfg.enabled;
    const sellOnly = sellCfg.sellOnly;
    if (!sellOn) this.tab = "buy";
    else if (sellOnly) this.tab = "sell";

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

    // Promotion banner
    const bogo = martBogo(mart);
    const bogoValid = bogo.enabled && (bogo.same || bogo.item);
    let bogoBanner = "";
    if (bogoValid) {
      bogoBanner = bogo.same
        ? T("POKEMART.BogoBannerSame", { n: bogo.qty, count: bogo.count })
        : T("POKEMART.BogoBannerItem", { n: bogo.qty, count: bogo.count, item: bogo.item.name });
      if (bogo.repeat) bogoBanner += " " + T("POKEMART.BogoRepeatNote", { n: bogo.qty });
    }

    // Cart
    const lines = this._cartLines(mart);
    const itemCount = lines.reduce((n, l) => n + l.qty, 0);
    const cartTotal = lines.reduce((n, l) => n + l.entry.price * l.qty, 0);
    const reward = cartReward(mart, lines);
    const cart = {
      lines: lines.map((l) => ({
        key: l.entry.uuid, name: l.entry.name, qty: l.qty, currency, lineTotal: l.entry.price * l.qty
      })),
      count: itemCount,
      total: cartTotal,
      tooMuch: cartTotal > money,
      free: reward ? { label: `${reward.count}× ${reward.name}` } : null,
      hint: bogoValid && !reward && itemCount > 0 && itemCount < bogo.qty
        ? T("POKEMART.BogoAlmost", { n: bogo.qty - itemCount })
        : ""
    };

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
      showTabs: sellOn && !sellOnly,
      bogoBanner,
      isBuy: this.tab === "buy",
      isSell: this.tab === "sell",
      items: (mart?.items ?? []).map((e) => ({
        ...e,
        key: e.uuid,
        currency,
        qty: this.qty[e.uuid] ?? 1,
        inCart: this.cart.get(e.uuid) ?? 0
      })),
      sellItems,
      cart
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

    html.find(".pokemart-item input.qty").on("input", (ev) => {
      const li = ev.currentTarget.closest(".pokemart-item");
      this.qty[li.dataset.key] = ev.currentTarget.value;
    });

    // Click an item's name to show or hide its description
    html.find(".item-name").on("click", (ev) => this._toggleDescription(ev.currentTarget.closest(".pokemart-item")));
    html.find(".pokemart-item").each((_, li) => {
      if (this.expanded.has(li.dataset.key)) this._showDescription(li);
    });

    // Cart
    html.find("button.add-to-cart").on("click", (ev) => {
      const li = ev.currentTarget.closest(".pokemart-item");
      const key = li.dataset.key;
      this.cart.set(key, Math.min(99, (this.cart.get(key) ?? 0) + this._readQty(li)));
      delete this.qty[key];
      this.render(false);
    });
    html.find("input.cart-qty").on("change", (ev) => {
      this.cart.set(ev.currentTarget.closest("li").dataset.key, clampQty(ev.currentTarget.value));
      this.render(false);
    });
    html.find(".cart-remove").on("click", (ev) => {
      this.cart.delete(ev.currentTarget.closest("li").dataset.key);
      this.render(false);
    });
    html.find(".clear-cart").on("click", () => {
      this.cart.clear();
      this.render(false);
    });
    html.find("button.checkout").on("click", (ev) => this._onCheckout(ev));

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
    if (!this.descCache.has(li.dataset.key)) panel.textContent = T("POKEMART.LoadingDescription");
    const html = await this._loadDescription(li.dataset.key);
    panel.innerHTML = html || `<em>${T("POKEMART.NoDescription")}</em>`;
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

  /* ---------- Checkout & selling ---------- */

  async _onCheckout(ev) {
    const button = ev.currentTarget;
    const mart = getMarts()[this.martId];
    const actor = game.actors.get(this.actorId);
    if (!mart || !actor) return;

    const lines = this._cartLines(mart);
    if (!lines.length) return;

    const count = lines.reduce((n, l) => n + l.qty, 0);
    const total = lines.reduce((n, l) => n + l.entry.price * l.qty, 0);
    const reward = cartReward(mart, lines);
    const freeNote = reward ? " " + T("POKEMART.ConfirmFree", { free: esc(`${reward.count}× ${reward.name}`) }) : "";

    button.disabled = true;
    try {
      if (cfg("confirmPurchases")) {
        const ok = await confirmDialog(
          T("POKEMART.ConfirmTitle"),
          T("POKEMART.CheckoutConfirmBody", {
            actor: esc(actor.name), n: count, total: `${cfg("currencySymbol")}${total}`, free: freeNote
          })
        );
        if (!ok) return;
      }
      const { delivered } = await checkout({ lines, actor, mart });
      for (const uuid of delivered) this.cart.delete(uuid);
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
          T("POKEMART.ConfirmSellTitle"),
          T("POKEMART.SellConfirmBody", {
            actor: esc(actor.name), qty, item: esc(item.name), total: `${cfg("currencySymbol")}${total}`
          })
        );
        if (!ok) return;
      }
      if (await sell({ actor, itemId: item.id, qty, unit })) delete this.qty[li.dataset.key];
    } finally {
      this.render(false);
    }
  }

  _readQty(li) {
    const input = li.querySelector("input.qty");
    return clampQty(input.value, Number(input.max) || 99);
  }
}
