# Showcase badge prototype

`createBadge({ manufacturer, color, theme, onHover, onClick })` returns `{ object, update(dt), setPointer(x, y), setHovered(bool), click(event), setTheme('day'|'night'), setColor(color), dispose() }`. Add `object` to a lit Three.js scene, raycast against its descendants, forward hover/click and normalized pointer coordinates, and call update with seconds. The caller owns event registration and animation scheduling. Dispose removes the object and frees its owned resources. The interface is preliminary and currently supports only `lexus`.

Lexus artwork: [Lexus Logo.svg](https://commons.wikimedia.org/wiki/File:Lexus_Logo.svg), by Glebushko0703. Commons currently shows an anomalous US Army public-domain tag, while its structured data identifies CC0; the underlying trademark remains protected. Confirm provenance and rights before release. Artwork is unmodified; its paths are converted to shallow bevelled geometry at runtime.
