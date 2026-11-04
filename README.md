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

## Buy-back (selling)
In a mart's editor, tick **Buy items back from players**. Then set what percentage of the list price it pays (default 50%).
- Items the mart sells are bought back at that percentage of the **mart's** price.
- With **Also buy items this mart doesn't sell** ticked, other items are bought at that percentage of their own price field. Items with no price (such as moves and abilities) are never offered.
- Players get a **Sell** tab. Selling takes the item off the sheet (or lowers its quantity) and adds the money.

**Sell-only marts:** with buy-back on, tick **Sell only (hide the Buy tab)** to make a mart players can only sell to. Such a mart needs no items listed; tick *Also buy items this mart doesn't sell* so it pays each item's own price.

## Free-item promotion
In a mart's editor, tick **Free-item promotion**. Set how many items the cart must hold at checkout (all items count together), and how many free items the player receives. The free item is either extra copies of the **cheapest item in the cart**, or a specific item you choose (drop it onto the box, or pick it from a compendium). A specific free item doesn't have to be on the mart's list. Tick *Repeat for every multiple* to scale the reward with the cart size. Players see a banner above the item list, and the cart shows the free item once it's earned.

## Mart order
Use the up/down arrows next to each mart in the manager. That order is the one players see in the "Choose a Mart" popup.

## Descriptions
Players can click any item name, in the Buy or Sell tab, to show or hide its description. The description is read from the item's description field (see settings) and is also saved with each mart item when the GM adds it, so players can read it even without access to the compendium.

## Players
Open the **Actors** tab and click **Poké Mart**. Choose a character, set a quantity, and press **Add** to put items in the cart. Edit quantities or remove items in the cart, then press **Check out**.
The total is deducted from the character's money and the items are added to their sheet. If the system tracks item quantities, bought items stack.

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
| Item description field | `system.description` |

If the Buy buttons report "no money field" items don't stack, or descriptions are empty, inspect an actor or item (F12 console: `$0`/`game.actors.getName("Name").system`) and correct these paths in Module Settings.
