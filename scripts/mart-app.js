import { MODULE_ID, openApps, getMarts, cfg, readNumber, confirmDialog } from "./data.js";
import { purchase } from "./purchase.js";

const AppV1 = foundry.appv1?.api?.Application ?? Application;

/** The player-facing shop window. */
export class MartApp extends AppV1 {
  constructor(martId, options = {}) {
    super({ id: `${MODULE_ID}-mart-${martId}`, ...options });
    this.martId = martId;
    this.actorId = null;
    this.search = "";
    this.qty = {};
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["pokemart"],
      template: `modules/${MODULE_ID}/templates/mart.hbs`,
      width: 560,
      height: 640,
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
      items: (mart?.items ?? []).map((e) => ({
        ...e,
        currency,
        qty: this.qty[e.uuid] ?? 1,
        expensive: e.price > money
      }))
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find("select[name=actor]").on("change", (ev) => {
      this.actorId = ev.currentTarget.value;
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
      this.qty[li.dataset.uuid] = ev.currentTarget.value;
    });

    html.find(".item-name").on("click", async (ev) => {
      const uuid = ev.currentTarget.closest(".pokemart-item").dataset.uuid;
      (await fromUuid(uuid))?.sheet.render(true);
    });

    html.find("button.buy").on("click", (ev) => this._onBuy(ev));
  }

  async _onBuy(ev) {
    const button = ev.currentTarget;
    const li = button.closest(".pokemart-item");
    const entry = getMarts()[this.martId]?.items.find((i) => i.uuid === li.dataset.uuid);
    const actor = game.actors.get(this.actorId);
    if (!entry || !actor) return;

    const qty = Math.min(99, Math.max(1, Math.floor(Number(li.querySelector("input.qty").value) || 1)));
    const total = entry.price * qty;
    button.disabled = true;
    try {
      if (cfg("confirmPurchases")) {
        const ok = await confirmDialog(
          game.i18n.localize("POKEMART.ConfirmTitle"),
          game.i18n.format("POKEMART.ConfirmBody", {
            actor: Handlebars.escapeExpression(actor.name),
            qty,
            item: Handlebars.escapeExpression(entry.name),
            total: `${cfg("currencySymbol")}${total}`
          })
        );
        if (!ok) return;
      }
      if (await purchase({ entry, actor, qty })) this.qty[entry.uuid] = 1;
    } finally {
      this.render(false);
    }
  }
}
