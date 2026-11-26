# Showcase badge prototype

`createBadge({ manufacturer, color, theme, locked, onHover, onClick })` returns `{ object, hitTarget, setLocked(bool), update(dt), setPointer(x, y), setHovered(bool), click(event), setTheme('day'|'night'), setColor(color), dispose() }`. Add `object` to a lit Three.js scene, raycast only against the returned `hitTarget`, forward hover/click and normalized pointer coordinates, and call update with seconds. The caller owns event registration and animation scheduling. Dispose removes the object and frees its owned resources. The locked state replaces the visible emblem with the same neutral disc for every manufacturer, suppresses identity in hover callbacks and disables clicks. This is a presentation boundary; the caller must also keep labels, application data and network assets private if identity is meant to be secret. Supported IDs are `lexus`, `nissan`, `audi`, `bmw`, `mercedes`, `ferrari`, `mclaren`, `aston`, `lamborghini`, and `porsche`. The last two show temporary neutral discs while unlocked and still support selection.

Lexus artwork: [Lexus Logo.svg](https://commons.wikimedia.org/wiki/File:Lexus_Logo.svg), by Glebushko0703. Commons currently shows an anomalous US Army public-domain tag, while its structured data identifies CC0; the underlying trademark remains protected. Confirm provenance and rights before release. Artwork is unmodified; its paths are converted to shallow bevelled geometry at runtime.

Audi artwork: [Audi-Logo 2016.svg](https://commons.wikimedia.org/wiki/File:Audi-Logo_2016.svg), credited to Strichpunkt / KMS Team; Commons labels it public domain (subject to trademark restrictions). The source SVG is unmodified. No badges have been visually reviewed in the target scene.

`createShowcaseFlag({ color, theme, onHover, onClick })` from `flag.js` provides the same lifecycle and interaction methods (flag callbacks omit the manufacturer argument). The caller owns raycasting, controls, lighting, and scene rendering. The flag uses one dynamic cloth mesh and one pole; call `dispose()` when done.

BMW artwork: [BMW.svg](https://commons.wikimedia.org/wiki/File:BMW.svg), credited to BMW, sourced by Commons from Brands of the World. Commons labels it public domain; trademark and jurisdictional limitations apply. The original SVG is used as a coloured face on a shallow metallic disc.

McLaren artwork: [McLaren Automotive logo.svg](https://commons.wikimedia.org/wiki/File:McLaren_Automotive_logo.svg), author unknown, sourced by Commons from McLaren Cars and recoloured black by its uploader. Commons labels it public domain; trademark restrictions apply. This is a wordmark and requires owner review as a representative of the physical car emblem.

Nissan artwork: [Nissan 2020 logo.svg](https://commons.wikimedia.org/wiki/File:Nissan_2020_logo.svg), credited to Nissan Motor Corporation; Commons describes it as own work using Nissan corporate artwork and labels it public domain. Trademark restrictions apply.

Mercedes star artwork: [Mercedes-Benz Star (1969-1986, 2025-).svg](https://commons.wikimedia.org/wiki/File:Mercedes-Benz_Star_(1969-1986,_2025-).svg), credited to Mercedes-Benz; Commons describes it as own work using Logopedia and labels it public domain. Trademark restrictions apply. This is the Mercedes star, not an AMG-specific mark.

Aston Martin artwork: [Aston Martin 1935.svg](https://commons.wikimedia.org/wiki/File:Aston_Martin_1935.svg), credited to Aston Martin, sourced via Logopedia and listed by Commons as public domain. The artwork is a historical lockup, not a model-year badge.

Ferrari artwork: [Ferrari wordmark.svg](https://commons.wikimedia.org/wiki/File:Ferrari_wordmark.svg), credited to Ferrari and listed by Commons as public domain. The script stands in for the [copyrighted Prancing Horse](https://commons.wikimedia.org/wiki/Category:Ferrari_logos).

Lamborghini and Porsche currently use original neutral geometry. No suitable reusable Lamborghini bull crest was established. [Porsche identifies its crest as copyright-protected and requires express permission for commercial use](https://newsroom.porsche.com/en/history/our-top-horse-in-the-stable-10891.html). All sourced marks remain subject to trademark restrictions.
