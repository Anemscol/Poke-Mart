# Pokerole Poké Mart

A shop add-on for the Pokerole system in Foundry VTT (v11–v13).

## Install
Copy the `pokerole-pokemart` folder into your Foundry `Data/modules/` directory, restart Foundry, then enable it in your world under Manage Modules.

## GM: building a mart
1. Open the **Actors** tab. Click **Manage Marts** at the top.
2. **New mart**, give it a name.
3. Add items with **Add from compendium** (pick a pack, tick items) or drag items from a compendium or the Items tab into the window.
4. Set a price for each item. Prices start from the item's price field if it has one, otherwise 0.
5. Tick **Open to players** when you want it live. You can run several marts and open or close them separately.

## Players
Open the **Actors** tab and click **Poké Mart**. Choose a character, set a quantity, press Buy.
The cost is deducted from the character's money and the item is added to their sheet. If the system tracks item quantities, bought items stack.

## Macros
```js
game.modules.get("pokerole-pokemart").api.openMart();     // everyone
game.modules.get("pokerole-pokemart").api.openManager();  // GM only
```

## Settings
The module reads and writes character money and item prices through configurable field paths, so it can match the Pokerole system's data model:

| Setting | Default |
|---|---|
| Money field | `system.money` |
| Item price field | `system.price` |
| Item quantity field | `system.quantity` |

If the Buy buttons report "no money field" or items don't stack, inspect an actor or item (F12 console: `$0`/`game.actors.getName("Name").system`) and correct these paths in Module Settings.
