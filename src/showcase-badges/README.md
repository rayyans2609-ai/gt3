# Showcase badges

In each private development checkout, run the following before starting Vite:

```sh
python3 src/showcase-badges/prepare-crests.py
```

The command prepares Ferrari, Lamborghini and Porsche SVG faces and their matching outlines in the ignored `local/showcase-badges/` directory. A checkout without those files can display locked badges. Unlocking a crest without its files raises a setup error. Builds made with these files present can include the artwork, so keep those builds private.

`createBadge({ manufacturer, color, theme, locked, onHover, onClick })` returns `{ object, hitTarget, setLocked, update, setPointer, setHovered, click, setTheme, setColor, dispose }`. The manufacturer IDs match `src/data/cars.js`: `lexus`, `nissan`, `audi`, `bmw`, `mercedes`, `ferrari`, `mclaren`, `aston`, `lamborghini`, and `porsche`.

Add `object` to a lit Three.js scene, with an environment map for the metallic finishes. The host controls its placement and scale. Raycast against `hitTarget`, forward hover with `setHovered(bool)` and pointer coordinates in the −1 to 1 range with `setPointer(x, y)`, and call `update(dt)` with seconds. The host forwards activation through `click(event)`. Callbacks receive `onHover(bool, manufacturer)` and `onClick(manufacturer, event)`. `setTheme` accepts `day` and `night`. Call `dispose()` on teardown.

Locked cars share the same neutral disc. Their hover callback supplies `null` for the manufacturer and click callbacks are suppressed. An initially locked badge builds its emblem geometry on first unlock. The host owns surrounding labels and car data.

`createShowcaseFlag({ color, theme, onHover, onClick })` from `flag.js` returns the same motion, theme and teardown methods. Raycast its mesh descendants or use host controls. Its hover callback receives a boolean and its click callback receives the event.

## Artwork sources

All manufacturer marks retain their respective trademark status. Commons labels the files below public domain except where noted. The three archive crests have no verified open licence. Their private prototype use does not establish permission for distribution. Review the underlying rights and any necessary permissions before public release.

| Badge | SVG source and treatment |
| --- | --- |
| Lexus | [Lexus Logo.svg, Glebushko0703](https://commons.wikimedia.org/wiki/File:Lexus_Logo.svg). Open chrome emblem. Commons shows inconsistent public domain and CC0 metadata. |
| Nissan | [Nissan 2020 logo.svg, Nissan Motor Corporation](https://commons.wikimedia.org/wiki/File:Nissan_2020_logo.svg). Open satin metal ring and lettering. |
| Audi | [Audi-Logo 2016.svg, Strichpunkt / KMS Team](https://commons.wikimedia.org/wiki/File:Audi-Logo_2016.svg). Cutout chrome rings. |
| BMW | [BMW.svg, BMW via Brands of the World](https://commons.wikimedia.org/wiki/File:BMW.svg). Full-colour roundel set into a machined rim. |
| Mercedes-AMG | [Mercedes-Benz (2025).svg, Mercedes-Benz](https://commons.wikimedia.org/wiki/File:Mercedes-Benz_(2025).svg). Uses the continuous three-pointed grille star path, the physical Mercedes emblem shared by AMG cars. |
| Ferrari | [Ferrari Logo 2002, Ferrari via Logos Download](https://logos-download.com/brands/ferrari). Full-colour Prancing Horse bonnet emblem with a shallow metal edge. [Copyright note](https://commons.wikimedia.org/wiki/Category:Ferrari_logos). |
| McLaren | [McLaren Speedmark.svg, Ved havet](https://commons.wikimedia.org/wiki/File:McLaren_Speedmark.svg). Standalone Speedmark relief with a red-orange finish. |
| Aston Martin | [Aston Martin 1935.svg, Aston Martin via Logopedia](https://commons.wikimedia.org/wiki/File:Aston_Martin_1935.svg). Historical wings with ivory and green inlays. |
| Lamborghini | [Lamborghini Logo 1998, Automobili Lamborghini via Logos Download](https://logos-download.com/brands/lamborghini). Black and gold bull shield. [Manufacturer reference](https://www.lamborghini.com/en-en/history/logos). |
| Porsche | [Porsche Logo 2014, Porsche via Logos Download](https://logos-download.com/brands/porsche). Full-colour crest on a beveled gold base. [Manufacturer copyright and commercial-use note](https://newsroom.porsche.com/en/history/our-top-horse-in-the-stable-10891.html). |
