// Editable source/candidate selection. Angles are radians, applied after source world transforms.
export const packFile = 'automobile_badges_-_main_brands.glb';
export const credits = {
 pack: ['Automobile Badges - Main Brands', 'Kryox Shade', 'https://skfb.ly/pEOrA'],
 lexus: ['Lexus Logo', 'mothomas744', 'https://skfb.ly/pC9UK'],
 nissan: ['GT-R logo', 'metarex.4d', 'https://sketchfab.com/3d-models/gt-r-logo-df71c6497b674d1687ead13db89b9a6b'],
 bmw: ['BMW Emblem', 'Jupiter', 'https://skfb.ly/o8nYR'],
 mercedes: ['Mercedes benz 3d Logo and Car Symbol silver', 'hirreyn', 'https://skfb.ly/pqLOw'],
 ferrari: ['FERRARI LOGO', 'reezla3Dworld', 'https://skfb.ly/oPGPF'],
 lamborghini: ['Lamborghini Emblem', 'BlackCube', 'https://skfb.ly/ovxUE'],
 porsche: ['Detailed Porsche logo', 'Twardun', 'https://sketchfab.com/3d-models/detailed-porsche-logo-c69d9223a21846119647223b519ecfc4'],
 audi: ['Audi emblem', 'GT3', null], aston: ['AM badge.stl', null, null],
};
export const finishes = {
 chrome: { color: [.72,.76,.8,1], metalness: 1, roughness: .15 },
 graphite: { color: [.035,.045,.055,1], metalness: 1, roughness: .38 },
 satin: { color: [.38,.41,.44,1], metalness: 1, roughness: .38 },
 gold: { color: [1,.766,.336,1], metalness: 1, roughness: .22 },
 black: { color: [.006,.008,.009,1], metalness: 0, roughness: .28 },
 green: { color: [.004,.025,.015,1], metalness: 0, roughness: .25 },
 white: { color: [.88,.9,.92,1], metalness: 0, roughness: .26 },
 blue: { color: [.008,.24,.62,1], metalness: 0, roughness: .27 },
 red: { color: [.65,.008,.012,1], metalness: 0, roughness: .28 },
 yellow: { color: [1,.72,.005,1], metalness: 0, roughness: .28 },
};
const pack = (range, extra={}) => ({ file: packFile, meshRange: range, ...extra });
export const models = {
 lexus: { chosen:'standalone', backing:true, candidates:{ standalone:{file:'lexus_logo.glb', materialOverrides:{object_0:'chrome'}} } },
 nissan: { chosen:'standalone', backing:true, candidates:{ standalone:{file:'gt-r_logo 2.glb', materialOverrides:{chrome:'chrome',Red_Metal:'red'}}, pack:pack([162,168]) } },
 audi: { chosen:'standalone', candidates:{ standalone:{file:'audi-emblem.glb', materialOverrides:{'Chrome rings':'chrome','Graphite mount':'graphite'}}, pack:pack([254,254],{backing:true}) } },
 bmw: { chosen:'standalone', candidates:{ standalone:{file:'bmw_emblem.glb', alignNode:'Circle.004_Material.029_0', materialOverrides:{'Material.029':'satin','Material.025':'chrome','Material.026':'blue','Material.027':'white','Material.028':'black','White.004':'white'}}, pack:pack([1,6],{materialOverrides:{'SVGMat.002':'white','Material':'blue'}}) } },
 mercedes: { chosen:'standalone', backing:true, candidates:{ standalone:{file:'mercedes_benz_3d_logo_and_car_symbol_silver.glb',nodes:['polySurface1_aiStandardSurface1_0'],materialOverrides:{aiStandardSurface1:'chrome'}} } },
 ferrari: { chosen:'standalone', target:16000, candidates:{ standalone:{file:'ferrari_logo.glb', materialOverrides:{'Materiale.001':'black','Materiale.004':'black','Materiale.008':'white','Materiale.009':{color:[.005,.48,.04,1],metalness:0,roughness:.28},'Materiale.010':'red','Materiale.011':'yellow'}}, pack:pack([51,151],{target:14000,excludeMeshes:[52,53,54],materialOverrides:{'Material.013':'yellow','Material.008':'red','Material.016':'green','Material.007':'black','SVGMat.1322':'black','SVGMat.1325':'black','SVGMat.1398':'black','SVGMat.1401':'black','SVGMat.002':'white'}}) } },
 aston: { chosen:'standalone', candidates:{ standalone:{file:'AM badge.stl', panel:{x:[90.4,129.6],y:[109,116.2],letterHeight:2.5},removeLoop:{x:[106.6,113.4],aboveY:116.3}}, pack:pack([15,18],{materialOverrides:{'Material.005':'green'}}) } },
 lamborghini: { chosen:'standalone', candidates:{ standalone:{file:'lamborghini_emblem.glb',nodes:['Emblem_Emblem_0','Emblem_Emblem 2_0'],rotation:[0,Math.PI,0],materialOverrides:{Emblem:{metalness:0,roughness:.28},Emblem_2:'black'}} } },
 porsche: { chosen:'standalone', target:30000, candidates:{ standalone:{file:'detailed_porsche_logo/scene.gltf', pearlTriangles:8,materialOverrides:{'Opacity.003':'gold','Yellow_Pearl.002':'gold','Red_pearl_.001':'red','Gold.002':'gold','Black.003':'black','Red_base.002':'red','Yellow_base.001':'gold'}}, pack:pack([216,248],{materialOverrides:{'Material.004':'gold','Material.006':'gold'}}) } },
};
// Full pack inventory, including brands not selected for runtime. Inclusive mesh ranges.
export const packBrands = {
 fiat:[[0,0],[19,24]], bmw:[[1,6]], lancia:[[7,14]], aston:[[15,18]],
 chevrolet:[[25,33]], alfaRomeo:[[34,50]], ferrari:[[51,151]], renault:[[152,153]],
 bentley:[[154,160]], toyota:[[161,161]], nissan:[[162,168]], landRover:[[169,183]],
 tesla:[[184,187]], mustang:[[188,191],[52,54]], ford:[[192,196]], honda:[[197,204]],
 subaru:[[205,215]], porsche:[[216,248]], volkswagen:[[249,253]], audi:[[254,254]],
 maserati:[[255,255]], rollsRoyce:[[256,278]], mazda:[[279,279]], bugatti:[[280,298]],
};
