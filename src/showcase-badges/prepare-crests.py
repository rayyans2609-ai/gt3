"""Fetch the three GT3 private prototype crest faces. Run from the checkout root."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from subprocess import check_output
import re
import xml.etree.ElementTree as ET

OUT = Path(__file__).resolve().parents[2] / "local" / "showcase-badges"
ASSETS = {
    "ferrari": (
        "https://i.logos-download.com/588/115-52a07e4cb82fe8fcaf239d83574314f2.svg/Ferrari_Logo_2002.svg",
        None,
        "",
    ),
    "lamborghini": (
        "https://i.logos-download.com/552/29516-9c3ef29e7772eb1f1c1988899c7c5437.svg/Lamborghini_Logo_1998.svg",
        "path3040",
        "translate(-2.3121387,3.8535645)",
    ),
    "porsche": (
        "https://i.logos-download.com/57/28858-338f986e49dc58b187b0b58d73714df0.svg/Porsche_Logo_2014.svg",
        "path1959",
        "",
    ),
}
SVG_NS = "http://www.w3.org/2000/svg"


def prepare(item):
    name, (url, path_id, transform) = item
    source = check_output(["curl", "-fsSL", "--max-time", "20", url]).decode("utf-8-sig")
    root = ET.fromstring(source)
    view_box = root.attrib["viewBox"]
    _, _, width, height = map(float, view_box.split())
    scale = 512 / max(width, height)
    paths = root.iter(f"{{{SVG_NS}}}path")
    edge = next((el for el in paths if not path_id or el.get("id") == path_id))
    outline = ET.Element("svg", xmlns=SVG_NS, viewBox=view_box)
    ET.SubElement(outline, "path", d=edge.attrib["d"], transform=transform)
    # TextureLoader needs a defined intrinsic size. Keep the original viewBox and paths.
    def set_size(match):
        attrs = re.sub(r'\s+(?:width|height)=("[^"]*"|\'[^\']*\')', "", match[1])
        return f'<svg width="{width * scale:.6f}" height="{height * scale:.6f}"{attrs}>'
    source = re.sub(r"<svg\b([^>]*)>", set_size, source, count=1)
    (OUT / f"{name}.outline.svg").write_text(ET.tostring(outline, encoding="unicode"), encoding="utf-8")
    (OUT / f"{name}.face.svg").write_text(source, encoding="utf-8")
    return name


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=3) as pool:
        for manufacturer in pool.map(prepare, ASSETS.items()):
            print(f"Prepared {manufacturer} in {OUT}")
