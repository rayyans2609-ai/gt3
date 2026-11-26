# Showcase badges

`createBadge({ manufacturer, color, theme, locked, onHover, onClick })` retains its existing return interface. Add `object` to a lit scene, raycast the invisible `hitTarget` plane, forward input and call `dispose()` on teardown. The host owns spin, float and tilt; `update(dt)` adds a subtle hover scale only.

Nine manufacturers lazily load real 3D emblems from `/badges/manifest.json`. See [asset setup](../../docs/assets/badge-assets-setup.md) and [attribution](../../docs/assets/badge-attribution.md). The manifest is fetched once and no manifest/model work starts for an initially locked badge. Locked artwork is empty; the host supplies its DOM `?`. `badgeModelStatus(id)` reports `none`, `loading`, `ready` or `fallback`.

During loading or after optional asset failure, the existing procedural artwork remains. Missing private crest SVGs fall back to a neutral metal disc without throwing. Private crest SVGs may still be prepared with `python3 src/showcase-badges/prepare-crests.py`. McLaren's procedural artwork and separate specialist workflow are untouched by the nine-model loader.

`createShowcaseFlag` in `flag.js` retains its existing independent interface.

## Artwork sources

All manufacturer marks retain their respective trademark status. Commons labels the files below public domain except where noted. The three archive crests have no verified open licence. Their private prototype use does not establish permission for distribution. Review the underlying rights and any necessary permissions before public release.

| Badge | SVG source and treatment |
| --- | --- |
| Lexus | [Lexus Logo.svg, Glebushko0703](https://commons.wikimedia.org/wiki/File:Lexus_Logo.svg). Open chrome emblem. Commons shows inconsistent public domain and CC0 metadata. |
| Nissan | [Nissan 2020 logo.svg, Nissan Motor Corporation](https://commons.wikimedia.org/wiki/File:Nissan_2020_logo.svg). Open satin metal ring and lettering. |
| Audi | [Audi-Logo 2016.svg, Strichpunkt / KMS Team](https://commons.wikimedia.org/wiki/File:Audi-Logo_2016.svg). Open chrome rings with a rounded machined cross-section and a separate graphite mounting layer. |
| BMW | [BMW.svg, BMW via Brands of the World](https://commons.wikimedia.org/wiki/File:BMW.svg). Full-colour roundel set into a machined rim. |
| Mercedes-AMG | [Mercedes-Benz (2025).svg, Mercedes-Benz](https://commons.wikimedia.org/wiki/File:Mercedes-Benz_(2025).svg). Uses the continuous three-pointed grille star path, the physical Mercedes emblem shared by AMG cars. |
| Ferrari | [Ferrari Logo 2002, Ferrari via Logos Download](https://logos-download.com/brands/ferrari). Full-colour Prancing Horse bonnet emblem with a shallow metal edge. [Copyright note](https://commons.wikimedia.org/wiki/Category:Ferrari_logos). |
| McLaren | [McLaren Speedmark.svg, Ved havet](https://commons.wikimedia.org/wiki/File:McLaren_Speedmark.svg). Standalone Speedmark relief with a red-orange finish. |
| Aston Martin | [Aston Martin 1935.svg, Aston Martin via Logopedia](https://commons.wikimedia.org/wiki/File:Aston_Martin_1935.svg). Historical wings with ivory and green inlays. |
| Lamborghini | [Lamborghini Logo 1998, Automobili Lamborghini via Logos Download](https://logos-download.com/brands/lamborghini). Black and gold bull shield. [Manufacturer reference](https://www.lamborghini.com/en-en/history/logos). |
| Porsche | [Porsche Logo 2014, Porsche via Logos Download](https://logos-download.com/brands/porsche). Full-colour crest on a beveled gold base. [Manufacturer copyright and commercial-use note](https://newsroom.porsche.com/en/history/our-top-horse-in-the-stable-10891.html). |
