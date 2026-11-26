# Collection badge attribution

Owner-supplied credits, verbatim. Each of these downloaded meshes is supplied under **CC BY 4.0**, https://creativecommons.org/licenses/by/4.0/:

- Automobile Badges - Main Brands — Kryox Shade — https://skfb.ly/pEOrA
- BMW Emblem — Jupiter — https://skfb.ly/o8nYR
- GT-R logo — metarex.4d — https://sketchfab.com/3d-models/gt-r-logo-df71c6497b674d1687ead13db89b9a6b
- Mercedes benz 3d Logo and Car Symbol silver — hirreyn — https://skfb.ly/pqLOw
- Detailed Porsche logo — Twardun — https://sketchfab.com/3d-models/detailed-porsche-logo-c69d9223a21846119647223b519ecfc4
- FERRARI LOGO — reezla3Dworld — https://skfb.ly/oPGPF
- Lamborghini Emblem — BlackCube — https://skfb.ly/ovxUE
- Lexus Logo — mothomas744 — https://skfb.ly/pC9UK

`AM badge.stl` has **unknown author and unknown licence**. There was no accompanying credit or licence text. Its presence in an owner-supplied download does not establish redistribution permission. No credits have been inferred. Its pack alternative carries Kryox Shade's attribution above.

Audi's standalone `audi-emblem.glb` is **GT3's own procedural export**. McLaren is **GT3's own model**: `src/showcase-badges/mclarenSpeedmark.js` builds the sculpted Speedmark procedurally at runtime from the outline already used by GT3 (no downloaded mesh, nothing to transfer). The Speedmark is McLaren's trademark; GT3 is private and non-commercial. This preparation script neither processes nor distributes a McLaren mesh.

The mesh licence (CC BY 4.0) permits adaptation subject to its attribution requirements; it does not grant manufacturer trademark rights, imply endorsement, or transfer rights in the depicted logos. GT3 is private and non-commercial. Manufacturer names, emblems and associated trademarks remain the property of their respective owners.

## Adaptations

All candidates have source world transforms baked, are centred with the face toward +Z and upright +Y, and have a one-unit larger face span. Unused nodes, cameras, lights, attributes and materials are removed. Material zones are merged, textures are resized to at most 1024 and encoded as WebP, and geometry uses Draco compression. Chrome, satin, enamel and gold receive physical material values without emissive additions. Open components get mirrored satin-metal backs and boundary walls; small residual seams receive local caps. Source closed backs are retained. Intersecting relief shells have not been boolean-unioned.

| Badge | Specific modifications |
| --- | --- |
| Lexus | Budget reduction; polished chrome; separate darker satin support follows the open L-and-oval silhouette. |
| GT-R (Nissan) | GT-R identity retained; chrome and dielectric red zones; budget reduction; mirrored rear/edge closures and graphite support. Generic Nissan exists only as a review candidate. |
| Audi | Original GT3 rounded chrome rings and graphite mount retained; canonical normalization and PBR adjustment. Pack rings/wordmark also extracted with a darker support. |
| BMW | Oblique source pose removed; blue/white quarters, black field, chrome and satin retained; open lettering/insert shells closed and merged by material. |
| Mercedes-AMG | Silver Mercedes three-pointed star retained; separate box-like support removed; chrome and graphite silhouette support. There is no Mercedes pack alternative. |
| Ferrari | Horse tessellation reduced while retaining raised geometry; yellow field, black relief, Italian tricolour enamel retained; rear closure. Pack extraction omits the remote Mustang stripe meshes and merges grayscale horse zones into black. |
| Aston Martin | One connected STL shell segmented by panel bounds, face normals and height: chrome wings/feathers, deep green-black enamel panel, raised chrome lettering. Mounting loop removed and cut boundaries closed. Pack alternative also prepared. |
| Lamborghini | Detached display wordmark removed; textured crest and original normal/finish maps retained at reduced texture size; face rotated toward +Z; existing closed rear retained. No subdivision or extra crest tessellation. |
| Porsche | 3.62-million-triangle source reduced using meshoptimizer, including eight-triangle relief beads; thousands of meshes merged into gold, black, red and satin zones; raised silhouette, lettering, horse, antlers, stripes and rim retained; backs/seams closed. Pack crest also extracted. |

The original embedded author, source, title and `license` fields are retained at the top of each GLB's `asset.extras` and copied into `asset.extras.originalAttribution`. New metadata records the selected source, author, licence uncertainty, canonical axes and modifications. The generated manifest repeats attribution and modification details per runtime badge. The original Porsche `license.txt` is reproduced in the local inventory.

Models and prepared GLBs travel outside Git. No model data belongs in this public repository.
