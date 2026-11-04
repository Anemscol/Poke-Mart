import { MODULE_ID, refreshApps } from "./data.js";

export function registerSettings() {
  game.settings.register(MODULE_ID, "marts", {
    scope: "world",
    config: false,
    type: Object,
    default: {},
    onChange: () => refreshApps()
  });

  const text = (key, def) =>
    game.settings.register(MODULE_ID, key, {
      name: `POKEMART.Settings.${key}.Name`,
      hint: `POKEMART.Settings.${key}.Hint`,
      scope: "world",
      config: true,
      type: String,
      default: def,
      onChange: () => refreshApps()
    });

  text("moneyPath", "system.money");
  text("pricePath", "system.price");
  text("quantityPath", "system.quantity");
  text("currencySymbol", "₽");

  game.settings.register(MODULE_ID, "chatMessages", {
    name: "POKEMART.Settings.chatMessages.Name",
    hint: "POKEMART.Settings.chatMessages.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "confirmPurchases", {
    name: "POKEMART.Settings.confirmPurchases.Name",
    hint: "POKEMART.Settings.confirmPurchases.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });
}
