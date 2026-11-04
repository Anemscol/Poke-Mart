import { MODULE_ID, getMarts, openApps } from "./data.js";
import { registerSettings } from "./settings.js";
import { MartApp } from "./mart-app.js";
import { ManagerApp } from "./manager-app.js";

const T = (key) => game.i18n.localize(key);

async function chooseMart(marts) {
  const title = T("POKEMART.ChooseMart");
  const DV2 = foundry.applications?.api?.DialogV2;
  if (DV2?.wait) {
    return DV2.wait({
      window: { title },
      content: "",
      buttons: marts.map((m) => ({ action: m.id, label: m.name, callback: () => m.id })),
      rejectClose: false
    });
  }
  return new Promise((resolve) => {
    new Dialog({
      title,
      content: "",
      buttons: Object.fromEntries(marts.map((m) => [m.id, { label: m.name, callback: () => resolve(m.id) }])),
      close: () => resolve(null)
    }).render(true);
  });
}

/** Open a mart. Without an id: the only visible mart, or a picker if there are several. */
async function openMart(martId) {
  const visible = Object.values(getMarts()).filter((m) => game.user.isGM || m.open);
  if (!visible.length) return ui.notifications.info(T("POKEMART.NoMarts"));

  let id = martId;
  if (!id) id = visible.length === 1 ? visible[0].id : await chooseMart(visible);
  if (!id) return;

  const existing = [...openApps].find((a) => a instanceof MartApp && a.martId === id);
  if (existing) {
    existing.render(true);
    return existing.bringToTop();
  }
  return new MartApp(id).render(true);
}

function openManager() {
  if (!game.user.isGM) return ui.notifications.warn(T("POKEMART.GMOnly"));
  const existing = [...openApps].find((a) => a instanceof ManagerApp);
  if (existing) {
    existing.render(true);
    return existing.bringToTop();
  }
  return new ManagerApp().render(true);
}

Hooks.once("init", () => {
  registerSettings();
  game.modules.get(MODULE_ID).api = { openMart, openManager };
});

// Keep open windows in sync when a character's money changes
Hooks.on("updateActor", () => {
  for (const app of openApps) if (app instanceof MartApp) app.render(false);
});

// Buttons at the top of the Actors sidebar tab
Hooks.on("renderActorDirectory", (app, html) => {
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root || root.querySelector(".pokemart-buttons")) return;

  const wrap = document.createElement("div");
  wrap.className = "pokemart-buttons action-buttons flexrow";
  wrap.innerHTML = `<button type="button" class="pokemart-open"><i class="fas fa-store"></i> ${T("POKEMART.OpenMart")}</button>`;
  wrap.querySelector(".pokemart-open").addEventListener("click", () => openMart());

  if (game.user.isGM) {
    const manage = document.createElement("button");
    manage.type = "button";
    manage.className = "pokemart-manage";
    manage.innerHTML = `<i class="fas fa-cog"></i> ${T("POKEMART.ManageMarts")}`;
    manage.addEventListener("click", () => openManager());
    wrap.append(manage);
  }

  const header = root.querySelector(".directory-header");
  const anchor = header?.querySelector(".header-actions");
  if (anchor) anchor.after(wrap);
  else if (header) header.prepend(wrap);
  else root.prepend(wrap);
});
