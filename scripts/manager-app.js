import { MODULE_ID, openApps, getMarts, saveMarts, cfg, readPrice, rawDescription, entryFromItem, addEntries, confirmDialog, martSell, martBogo, sortedMarts } from "./data.js";
import { MartApp } from "./mart-app.js";

const AppV1 = foundry.appv1?.api?.Application ?? Application;

/** GM window: create marts, choose which items they sell, and set prices. */
export class ManagerApp extends AppV1 {
  constructor(options = {}) {
    super({ id: `${MODULE_ID}-manager`, ...options });
    this.selectedId = null;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["pokemart"],
      template: `modules/${MODULE_ID}/templates/manager.hbs`,
      title: "POKEMART.ManagerTitle",
      width: 780,
      height: 560,
      resizable: true
    });
  }

  render(...args) {
    openApps.add(this);
    return super.render(...args);
  }

  async close(options) {
    openApps.delete(this);
    return super.close(options);
  }

  getData() {
    const marts = sortedMarts();
    if (!marts.some((m) => m.id === this.selectedId)) this.selectedId = marts[0]?.id ?? null;
    return {
      marts: marts.map((m, i) => ({ ...m, selected: m.id === this.selectedId, first: i === 0, last: i === marts.length - 1 })),
      mart: marts.find((m) => m.id === this.selectedId) ?? null,
      sell: martSell(marts.find((m) => m.id === this.selectedId)),
      bogo: martBogo(marts.find((m) => m.id === this.selectedId)),
      currency: cfg("currencySymbol")
    };
  }

  /** Edit the selected mart and save. */
  async _mutate(fn) {
    const marts = getMarts();
    const mart = marts[this.selectedId];
    if (!mart) return;
    fn(mart);
    await saveMarts(marts);
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Drag & drop is attached once to the outer window element
    const root = this.element[0];
    if (!root._pokemartDnD) {
      root._pokemartDnD = true;
      root.addEventListener("dragover", (ev) => ev.preventDefault());
      root.addEventListener("drop", (ev) => this._onDrop(ev));
    }

    html.find(".new-mart").on("click", () => this._newMart());

    html.find(".move-up, .move-down").on("click", (ev) => {
      ev.stopPropagation();
      if (ev.currentTarget.classList.contains("disabled")) return;
      const id = ev.currentTarget.closest(".mart-entry").dataset.martId;
      this._moveMart(id, ev.currentTarget.classList.contains("move-up") ? -1 : 1);
    });

    html.find(".mart-entry").on("click", (ev) => {
      this.selectedId = ev.currentTarget.dataset.martId;
      this.render(false);
    });

    html.find("input[name=name]").on("change", (ev) => {
      const v = ev.currentTarget.value.trim() || game.i18n.localize("POKEMART.NewMartName");
      this._mutate((m) => (m.name = v));
    });

    html.find("input[name=open]").on("change", (ev) => {
      const v = ev.currentTarget.checked;
      this._mutate((m) => (m.open = v));
    });

    html.find("input[name=sellEnabled]").on("change", (ev) => {
      const v = ev.currentTarget.checked;
      this._mutate((m) => (m.sellEnabled = v));
    });

    const bool = (name, key) =>
      html.find(`input[name=${name}]`).on("change", (ev) => {
        const v = ev.currentTarget.checked;
        this._mutate((m) => (m[key] = v));
      });
    const whole = (name, key) =>
      html.find(`input[name=${name}]`).on("change", (ev) => {
        const v = Math.min(99, Math.max(1, Math.floor(Number(ev.currentTarget.value)) || 1));
        this._mutate((m) => (m[key] = v));
      });
    bool("bogoEnabled", "bogoEnabled");
    bool("bogoRepeat", "bogoRepeat");
    bool("bogoSame", "bogoSame");
    whole("bogoQty", "bogoQty");
    whole("bogoCount", "bogoCount");
    html.find(".clear-bogo-item").on("click", () => this._mutate((m) => (m.bogoItem = null)));
    html.find(".pick-bogo-item").on("click", () => new CompendiumPickerApp(this.selectedId, "reward").render(true));

    html.find("input[name=hideBuy]").on("change", (ev) => {
      const v = ev.currentTarget.checked;
      this._mutate((m) => (m.hideBuy = v));
    });

    html.find("input[name=sellRatio]").on("change", (ev) => {
      const v = Math.min(100, Math.max(0, Math.round(Number(ev.currentTarget.value) || 0)));
      this._mutate((m) => (m.sellRatio = v));
    });

    html.find("input[name=sellAny]").on("change", (ev) => {
      const v = ev.currentTarget.checked;
      this._mutate((m) => (m.sellAny = v));
    });

    html.find(".price-input").on("change", (ev) => {
      const uuid = ev.currentTarget.closest("tr").dataset.uuid;
      const price = Math.max(0, Math.round(Number(ev.currentTarget.value) || 0));
      this._mutate((m) => {
        const e = m.items.find((i) => i.uuid === uuid);
        if (e) e.price = price;
      });
    });

    html.find(".remove-item").on("click", (ev) => {
      const uuid = ev.currentTarget.closest("tr").dataset.uuid;
      this._mutate((m) => (m.items = m.items.filter((i) => i.uuid !== uuid)));
    });

    html.find(".open-item").on("click", async (ev) => {
      const uuid = ev.currentTarget.closest("tr").dataset.uuid;
      (await fromUuid(uuid))?.sheet.render(true);
    });

    html.find(".delete-mart").on("click", () => this._deleteMart());
    html.find(".preview-mart").on("click", () => new MartApp(this.selectedId).render(true));
    html.find(".add-compendium").on("click", () => new CompendiumPickerApp(this.selectedId).render(true));
  }

  async _newMart() {
    const marts = getMarts();
    const id = foundry.utils.randomID();
    marts[id] = { id, name: game.i18n.localize("POKEMART.NewMartName"), open: true, items: [], order: Object.keys(marts).length };
    this.selectedId = id;
    await saveMarts(marts);
  }

  /** Move a mart one place up (-1) or down (+1) in the list. This is the order players see in "Choose a Mart". */
  async _moveMart(id, dir) {
    const marts = getMarts();
    const list = sortedMarts(marts);
    const i = list.findIndex((m) => m.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    list.forEach((m, n) => (m.order = n));
    await saveMarts(marts);
  }

  async _deleteMart() {
    const mart = getMarts()[this.selectedId];
    if (!mart) return;
    const ok = await confirmDialog(
      game.i18n.localize("POKEMART.DeleteMart"),
      game.i18n.format("POKEMART.DeleteConfirm", { name: Handlebars.escapeExpression(mart.name) })
    );
    if (!ok) return;
    const marts = getMarts();
    delete marts[this.selectedId];
    this.selectedId = null;
    await saveMarts(marts);
  }

  async _onDrop(ev) {
    ev.preventDefault();
    if (!this.selectedId) return;
    const onRewardZone = !!ev.target.closest?.(".bogo-drop");
    let data;
    try {
      data = JSON.parse(ev.dataTransfer.getData("text/plain"));
    } catch (e) {
      return;
    }
    if (data?.type !== "Item" || !data.uuid) {
      return ui.notifications.warn(game.i18n.localize("POKEMART.OnlyItems"));
    }
    const item = await fromUuid(data.uuid);
    if (!item) return;
    if (item.parent) return ui.notifications.warn(game.i18n.localize("POKEMART.ItemOwned"));
    if (onRewardZone) {
      return this._mutate((m) => (m.bogoItem = { uuid: item.uuid, name: item.name, img: item.img }));
    }
    const added = await addEntries(this.selectedId, [entryFromItem(item)]);
    if (!added) ui.notifications.info(game.i18n.format("POKEMART.AlreadyInMart", { item: item.name }));
  }
}

/** Pick one or more items from any Item compendium to add to a mart. */
export class CompendiumPickerApp extends AppV1 {
  constructor(martId, mode = "mart", options = {}) {
    super({
      id: `${MODULE_ID}-picker`,
      title: mode === "reward" ? "POKEMART.ChooseReward" : "POKEMART.AddFromCompendium",
      ...options
    });
    this.martId = martId;
    this.mode = mode; // "mart": add items to the mart; "reward": pick the single free item
    this.packId = null;
    this.index = [];
    this.search = "";
    this.selected = new Set();
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["pokemart"],
      template: `modules/${MODULE_ID}/templates/picker.hbs`,
      title: "POKEMART.AddFromCompendium",
      width: 460,
      height: 620,
      resizable: true
    });
  }

  async _loadIndex() {
    const pack = game.packs.get(this.packId);
    if (!pack) {
      this.index = [];
      return;
    }
    const idx = await pack.getIndex({ fields: ["img", cfg("pricePath")] });
    this.index = idx.contents
      .map((e) => ({ uuid: e.uuid, name: e.name, img: e.img, price: readPrice(e) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getData() {
    const packs = game.packs.filter((p) => p.documentName === "Item");
    if (!this.packId || !game.packs.get(this.packId)) {
      this.packId = packs[0]?.collection ?? null;
      await this._loadIndex();
    }
    const inMart = new Set((getMarts()[this.martId]?.items ?? []).map((i) => i.uuid));
    return {
      noPacks: packs.length === 0,
      packs: packs.map((p) => ({ id: p.collection, title: p.title, selected: p.collection === this.packId })),
      search: this.search,
      currency: cfg("currencySymbol"),
      count: this.selected.size,
      reward: this.mode === "reward",
      entries: this.index.map((e) => ({ ...e, inMart: this.mode !== "reward" && inMart.has(e.uuid), checked: this.selected.has(e.uuid) }))
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find("select[name=pack]").on("change", async (ev) => {
      this.packId = ev.currentTarget.value;
      this.selected.clear();
      await this._loadIndex();
      this.render(false);
    });

    const applyFilter = () => {
      const q = this.search.trim().toLowerCase();
      html.find(".picker-row").each((_, el) => {
        el.hidden = !!q && !el.dataset.name.toLowerCase().includes(q);
      });
    };
    html.find(".picker-search").on("input", (ev) => {
      this.search = ev.currentTarget.value;
      applyFilter();
    });
    applyFilter();

    html.find("input.pick").on("change", (ev) => {
      const uuid = ev.currentTarget.closest(".picker-row").dataset.uuid;
      if (this.mode === "reward" && ev.currentTarget.checked) {
        this.selected.clear();
        html.find("input.pick").not(ev.currentTarget).prop("checked", false);
      }
      if (ev.currentTarget.checked) this.selected.add(uuid);
      else this.selected.delete(uuid);
      html.find(".add-selected .count").text(this.selected.size);
      html.find(".add-selected").prop("disabled", this.selected.size === 0);
    });

    html.find(".add-selected").on("click", async () => {
      if (this.mode === "reward") {
        const pick = this.index.find((e) => this.selected.has(e.uuid));
        const marts = getMarts();
        if (pick && marts[this.martId]) {
          marts[this.martId].bogoItem = { uuid: pick.uuid, name: pick.name, img: pick.img };
          await saveMarts(marts);
        }
        return this.close();
      }
      const entries = this.index.filter((e) => this.selected.has(e.uuid));
      // Save each item's description with the mart entry, so players can read it even without compendium access
      await Promise.all(
        entries.map(async (e) => {
          try {
            e.desc = rawDescription(await fromUuid(e.uuid));
          } catch (err) {
            /* leave it empty */
          }
        })
      );
      const added = await addEntries(this.martId, entries);
      ui.notifications.info(game.i18n.format("POKEMART.Added", { count: added }));
      this.close();
    });
  }
}
