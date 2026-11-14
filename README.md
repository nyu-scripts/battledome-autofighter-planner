# Battledome Autofighter Planner

A static page that helps set up presets for the Battledome Autofighter userscript (available on [clraik.com](https://clraik.com)) turn by turn.

1. Load the `battledome.settings.json` that the Autofighter downloads (Download icon in the Battledome).
2. Pick a preset and see what the bot does with it on each turn.
3. Write the weapons and ability you want per turn, plus what to use on every other turn.
4. Download the new settings and load them back with the Autofighter's Upload icon. Only the chosen preset changes.

Everything runs in the browser, no settings leave the page.

## Development

No build step. Open `index.html`, or serve the folder with any static server. Tests: `node test/planner.test.js`.

## Weapon list

`data/weapons.json` is the source list (weapon name, Neopets picture link, usage, and `valid` for weapons that show up in every source compared). After changing it, run `node tools/build-weapons.js` to regenerate `js/weapons.js`, which only keeps the valid ones. The page loads the `.js` because browsers block reading JSON files from `file://`.

Every weapon has a fixed `id` in `data/weapons.json`, used in share links (`#plan=...`). The build numbers new weapons with the next free id; never change or reuse one, or old links point at a different weapon. Abilities use Neopets' own ability number, taken from the picture's name.

## Pictures

Ability pictures are saved in `img/abilities/` as `thumb_<id>.png` (30 files, under 0.5 MB), so they don't depend on Neopets' servers. A new ability needs its picture saved there too: the path in `js/abilities.js` says where on `images.neopets.com/bd2/abilities/` it lives. Weapon pictures load from `images.neopets.com/items/`, except the ones saved in `img/weapons/` (same file name as on Neopets): `node tools/build-weapons.js` picks those up and points the weapon at the saved copy. To save another one, download it there and rebuild.
