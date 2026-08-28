/**
 * A single entry in the locked GT3 roster.
 *
 * @typedef {Object} Car
 * @property {string} id Stable roster identifier
 * @property {number} index Coin and roster index
 * @property {string} manufacturer Marque name
 * @property {string} model Competition model name
 * @property {string} year Model or homologation year
 * @property {string} displayName Full editorial display name
 * @property {string} modelFile GLB filename in the public model directory
 * @property {string} brandColor Deep marque-derived racing colour
 * @property {string} brandColorSoft Desaturated montage backdrop colour
 * @property {string} accentText Text colour readable against brandColor
 * @property {{configuration: string, displacement: string, induction: string,
 *   power: string, torque: string, redline: string, transmission: string,
 *   drivetrain: string}} engine Engine and driveline specifications
 * @property {{weight: string, aeroFeature: string, construction: string}} chassis
 *   Chassis, weight, and aerodynamic specifications
 * @property {string} series Principal racing series
 * @property {string[]} achievements Four notable competition results
 * @property {string} fact Compact endurance or GT3 fact
 * @property {{headline: string, paragraphs: [string, string, string]}} showcase
 *   Editorial Showcase Mode copy
 * @property {string[]} images Build-populated Wikimedia image paths
 * @property {string} wikiQuery Wikimedia Commons search query
 */

/** @type {Car[]} */
export const CARS = [
  {
    id: 'lexus',
    index: 0,
    manufacturer: 'Lexus',
    model: 'RC F GT3',
    year: '2018',
    displayName: 'Lexus RC F GT3',
    modelFile: 'lexus_rcf_gt3.glb',
    brandColor: '#541F29',
    brandColorSoft: '#403236',
    accentText: '#F0E8E3',
    engine: {
      configuration: '5.4 L naturally aspirated V8, 90°',
      displacement: '5,400 cc',
      induction: 'Naturally aspirated',
      power: '≈540 hp (BoP-dependent)',
      torque: '≈550 N·m (BoP-dependent)',
      redline: '≈7,300 rpm',
      transmission: '6-speed sequential paddle-shift',
      drivetrain: 'Rear-wheel drive',
    },
    chassis: {
      weight: '≈1,300 kg (BoP-dependent)',
      aeroFeature: 'Full-width rear wing balanced by a flat floor and rear diffuser',
      construction: 'Steel unibody with FIA-spec steel roll cage and composite panels',
    },
    series: 'IMSA GTD Pro · SUPER GT GT300 · GT World Challenge',
    achievements: [
      'Mid-Ohio — IMSA GTD victory, 2018',
      'Virginia International Raceway — IMSA GTD victory, 2018',
      'Watkins Glen 6 Hours — GTD Pro and GTD class victories, 2023',
      'IMSA GTD Pro — manufacturer, team and drivers’ titles, 2023',
    ],
    fact: 'The RC F secured Lexus’s first full-season IMSA GT championship in 2023',
    showcase: {
      headline: 'A front-engined outlier built for long races',
      paragraphs: [
        'The RC F GT3 brought Lexus into international customer racing with a front-engined layout and a shape that remained close to the road coupe. FIA homologation arrived for 2017, while the 2018 campaign established the car as a regular in IMSA GTD and Japan’s GT300 field.',
        'Its enlarged 5.4-litre V8 is naturally aspirated, an increasingly uncommon choice in contemporary GT3 racing. The long bonnet and measured weight transfer give the car a deliberate corner-entry character, while the broad torque delivery and six-speed sequential gearbox suit traffic management over extended stints.',
        'Early IMSA victories at Mid-Ohio and Virginia International Raceway gave the programme credibility. Vasser Sullivan then developed the platform into a title winner, taking the 2023 GTD Pro manufacturer, team and drivers’ championships after a season defined by nine podiums from eleven starts.',
      ],
    },
    images: [],
    wikiQuery: 'Lexus RC F GT3',
  },
  {
    id: 'nissan',
    index: 1,
    manufacturer: 'Nissan',
    model: 'GT-R NISMO GT3',
    year: '2018',
    displayName: 'Nissan GT-R NISMO GT3',
    modelFile: 'nissan_gtr_gt3.glb',
    brandColor: '#293D52',
    brandColorSoft: '#394550',
    accentText: '#EDF0F2',
    engine: {
      configuration: '3.8 L twin-turbocharged V6, 60°',
      displacement: '3,799 cc',
      induction: 'Twin-turbocharged',
      power: '≥550 hp (BoP-dependent)',
      torque: '≥637 N·m (BoP-dependent)',
      redline: '≈7,000 rpm',
      transmission: '6-speed sequential paddle-shift',
      drivetrain: 'Rear-wheel drive',
    },
    chassis: {
      weight: '≈1,285 kg (BoP-dependent)',
      aeroFeature: 'Front-mounted engine sits low and rearward beneath a vented bonnet',
      construction: 'Steel unibody with welded FIA-spec roll cage and carbon-composite panels',
    },
    series: 'SUPER GT GT300 · GT World Challenge · Super Taikyu ST-X',
    achievements: [
      'Bathurst 12 Hour — overall victory, 2015',
      'Blancpain Endurance Series — Pro Cup title, 2015',
      'SUPER GT GT300 — drivers’ championship, 2020',
      'Super Taikyu ST-X — championship title, 2022',
    ],
    fact: 'Bathurst victory and the Blancpain Endurance Pro Cup arrived in the same 2015 season',
    showcase: {
      headline: 'The road-bred silhouette that crossed continents',
      paragraphs: [
        'The GT-R NISMO GT3 translated Nissan’s road-car architecture into a rear-wheel-drive customer racer. The revised 2018 specification moved the engine lower and farther rearward, improved weight distribution and reduced tyre load, extending a programme already established in Europe, Japan and Australia.',
        'A race-prepared VR38DETT V6 delivers its power through a six-speed sequential transaxle rather than the road car’s all-wheel-drive system. Turbocharged torque defines the car on corner exit, but its character is equally shaped by the long wheelbase and the stability needed for sustained, high-speed running.',
        'The earlier specification won the 2015 Bathurst 12 Hour and Blancpain Endurance Pro Cup, results that fixed the GT-R in modern GT3 history. The updated car continued that record in Japan, taking the 2020 SUPER GT GT300 championship and the 2022 Super Taikyu ST-X title.',
      ],
    },
    images: [],
    wikiQuery: 'Nissan GT-R NISMO GT3',
  },
  {
    id: 'audi',
    index: 2,
    manufacturer: 'Audi',
    model: 'R8 LMS GT3 evo',
    year: '2020',
    displayName: 'Audi R8 LMS GT3 evo',
    modelFile: 'audi_r8_gt3.glb',
    brandColor: '#3C4247',
    brandColorSoft: '#484C50',
    accentText: '#F0EEEA',
    engine: {
      configuration: '5.2 L naturally aspirated V10, 90°',
      displacement: '5,200 cc',
      induction: 'Naturally aspirated',
      power: 'Up to 585 hp (BoP-dependent)',
      torque: '>550 N·m',
      redline: '≈8,700 rpm',
      transmission: '6-speed pneumatic sequential paddle-shift',
      drivetrain: 'Rear-wheel drive',
    },
    chassis: {
      weight: '1,235 kg homologated dry weight',
      aeroFeature: 'Evo bodywork prioritises consistent balance across changing ride heights',
      construction: 'Aluminium-CFRP Audi Space Frame with stressed steel roll cage',
    },
    series: 'GT World Challenge · Nürburgring 24 Hours · DTM',
    achievements: [
      'Dubai 24 Hours — overall victory, 2019',
      'Nürburgring 24 Hours — overall victory, 2019',
      'Suzuka 10 Hours — overall victory, 2019',
      'Nürburgring 24 Hours — overall victory, 2022',
    ],
    fact: 'The V10 engine is assembled on the same line as the R8 production unit',
    showcase: {
      headline: 'A customer-racing benchmark refined through endurance',
      paragraphs: [
        'Audi’s second-generation R8 LMS became the evo for the 2019 season, with the 2020 car carrying that package into a broad customer programme. The update focused on predictable aerodynamics, longer component life and a wider operating window rather than chasing a single qualifying lap.',
        'The production-derived 5.2-litre V10 remains naturally aspirated and sits ahead of the rear axle. Its linear response, high engine speed and pneumatic six-speed transmission produce an immediate but measured delivery, while the mid-engined layout gives teams a stable baseline across sprint and endurance formats.',
        'The evo won the Dubai 24 Hours, Nürburgring 24 Hours and Suzuka 10 Hours during 2019. Another Nürburgring victory followed in 2022, earned by a chassis that had already completed multiple 24-hour races and tens of thousands of competition kilometres since its debut.',
      ],
    },
    images: [],
    wikiQuery: 'Audi R8 LMS GT3 evo',
  },
  {
    id: 'bmw',
    index: 3,
    manufacturer: 'BMW',
    model: 'M6 GT3',
    year: '2016',
    displayName: 'BMW M6 GT3',
    modelFile: 'bmw_m6_gt3.glb',
    brandColor: '#173D5C',
    brandColorSoft: '#344956',
    accentText: '#ECF0F1',
    engine: {
      configuration: '4.4 L twin-turbocharged V8, 90°',
      displacement: '4,395 cc',
      induction: 'Twin-turbocharged',
      power: 'Up to 585 hp (BoP-dependent)',
      torque: '≈700 N·m (BoP-dependent)',
      redline: '≈7,000 rpm',
      transmission: '6-speed sequential paddle-shift',
      drivetrain: 'Rear-wheel drive',
    },
    chassis: {
      weight: '≈1,300 kg (BoP-dependent)',
      aeroFeature: 'Long floor and rear diffuser generate a stable low-drag aero platform',
      construction: 'Steel body shell with welded FIA safety cell and carbon-composite panels',
    },
    series: 'GT World Challenge · IMSA GTD · Nürburgring 24 Hours',
    achievements: [
      '24 Hours of Spa — overall victory, 2016',
      '24 Hours of Spa — overall victory, 2018',
      'Nürburgring 24 Hours — overall victory, 2020',
      'Indianapolis 8 Hour — overall victory, 2020',
    ],
    fact: 'The M6 won the Spa 24 Hours on its first appearance in 2016',
    showcase: {
      headline: 'Long-wheelbase composure for the endurance era',
      paragraphs: [
        'The M6 GT3 replaced BMW’s compact Z4 with a larger platform designed around endurance racing and customer usability. Its wheelbase, cabin volume and front-engine proportions were unusual beside mid-engined rivals, yet they created a settled car with space for cooling, service access and driver accommodation.',
        'BMW’s 4.4-litre twin-turbo V8 provides a wide band of torque through a rear-mounted six-speed sequential gearbox. The car rewards measured inputs and carries speed through long corners, using its wheelbase and developed aero platform to remain composed as tyres and fuel loads change.',
        'An overall win at Spa in its first 24-hour appearance set the programme’s direction. A second Spa victory followed in 2018, before ROWE Racing won the Nürburgring 24 Hours in 2020. That result completed the M6’s standing at both of Europe’s defining GT endurance races.',
      ],
    },
    images: [],
    wikiQuery: 'BMW M6 GT3',
  },
  {
    id: 'mercedes',
    index: 4,
    manufacturer: 'Mercedes-AMG',
    model: 'GT3',
    year: '2016',
    displayName: 'Mercedes-AMG GT3',
    modelFile: 'mercedes_amg_gt3.glb',
    brandColor: '#303437',
    brandColorSoft: '#44484A',
    accentText: '#F1EFEB',
    engine: {
      configuration: '6.2 L naturally aspirated V8, 90°',
      displacement: '6,208 cc',
      induction: 'Naturally aspirated',
      power: '≈550 hp (BoP-dependent)',
      torque: '≈650 N·m (BoP-dependent)',
      redline: '≈7,500 rpm',
      transmission: '6-speed sequential paddle-shift transaxle',
      drivetrain: 'Rear-wheel drive',
    },
    chassis: {
      weight: '≈1,285 kg (BoP-dependent)',
      aeroFeature: 'Wide front splitter feeds a flat floor and adjustable rear diffuser',
      construction: 'Aluminium spaceframe with integrated high-strength steel safety cell',
    },
    series: 'GT World Challenge · DTM · ADAC GT Masters',
    achievements: [
      'Nürburgring 24 Hours — overall victory and top-four sweep, 2016',
      'Suzuka 10 Hours — overall victory, 2018',
      'FIA GT World Cup at Macau — overall victory, 2019',
      '24 Hours of Spa — overall one-two finish, 2022',
    ],
    fact: 'Its 2016 Nürburgring result placed AMG cars first through fourth',
    showcase: {
      headline: 'A large-capacity V8 shaped by endurance',
      paragraphs: [
        'The Mercedes-AMG GT3 entered customer competition in 2016 as the successor to the SLS AMG GT3. Beneath its long bonnet sits a large naturally aspirated engine, while a rear transaxle and broad track distribute the mass for repeatable behaviour across many circuit and tyre combinations.',
        'The 6.2-litre V8 favours linear response and mechanical simplicity over forced induction. Its torque arrives without boost delay, and the transaxle gearbox helps the car rotate without losing the stability expected of a front-engined platform. The result is direct, legible and suited to long stints.',
        'At the 2016 Nürburgring 24 Hours, AMG customer teams filled the first four positions, with another car sixth. The model later won at Suzuka and Macau, while the evolved specification delivered a one-two finish at the 2022 Spa 24 Hours, extending the same platform’s competition life.',
      ],
    },
    images: [],
    wikiQuery: 'Mercedes-AMG GT3',
  },
  {
    id: 'ferrari',
    index: 5,
    manufacturer: 'Ferrari',
    model: '488 GT3',
    year: '2018',
    displayName: 'Ferrari 488 GT3',
    modelFile: 'ferrari_488_gt3.glb',
    brandColor: '#6D1E24',
    brandColorSoft: '#553238',
    accentText: '#F3EAE5',
    engine: {
      configuration: '3.9 L twin-turbocharged V8, 90°',
      displacement: '3,902 cc',
      induction: 'Twin-turbocharged',
      power: '≈600 hp (BoP-dependent)',
      torque: '≈700 N·m (BoP-dependent)',
      redline: '≈7,500 rpm',
      transmission: '6-speed sequential paddle-shift',
      drivetrain: 'Rear-wheel drive',
    },
    chassis: {
      weight: '≈1,260 kg (BoP-dependent)',
      aeroFeature: 'Large rear diffuser works with a flat floor and high-mounted wing',
      construction: 'Aluminium chassis with FIA-spec steel roll cage and composite panels',
    },
    series: 'GT World Challenge · IMSA GTD · DTM',
    achievements: [
      'Laguna Seca — IMSA GTD class victory, 2017',
      'Bathurst 12 Hour — overall victory, 2017',
      '24 Hours of Spa — overall victory, 2021',
      'GT World Challenge Europe Endurance Cup — drivers’ title, 2021',
    ],
    fact: 'The 2020 Evo package could be retrofitted to existing 488 GT3 chassis',
    showcase: {
      headline: 'Maranello’s defining GT3 platform of the turbo era',
      paragraphs: [
        'The 488 GT3 was Ferrari’s first turbocharged customer car built for the category. Closely related to the 488 GTE but tailored to global GT3 rules, it became a common sight across national championships, endurance events and sprint series from its 2016 debut onward.',
        'Its compact 3.9-litre V8 sits low behind the cockpit and uses two turbochargers to produce a broad, regulated torque curve. The car combines quick direction changes with a rear end that rewards precise throttle work, while the six-speed sequential transmission keeps the power delivery continuous.',
        'Victories at Laguna Seca and Bathurst arrived in 2017. The later Evo specification preserved the underlying chassis and won the 2021 Spa 24 Hours, where Alessandro Pier Guidi completed the decisive pass in heavy rain. Ferrari also secured that season’s GT World Challenge Europe Endurance drivers’ title.',
      ],
    },
    images: [],
    wikiQuery: 'Ferrari 488 GT3',
  },
  {
    id: 'mclaren',
    index: 6,
    manufacturer: 'McLaren',
    model: '720S GT3',
    year: '2019',
    displayName: 'McLaren 720S GT3',
    modelFile: 'mclaren_720s_gt3.glb',
    brandColor: '#865034',
    brandColorSoft: '#664D3E',
    accentText: '#F3ECE6',
    engine: {
      configuration: '4.0 L twin-turbocharged V8, 90°',
      displacement: '3,994 cc',
      induction: 'Twin-turbocharged',
      power: '≈500 hp (BoP-dependent)',
      torque: '≈600 N·m (BoP-dependent)',
      redline: '≈8,000 rpm',
      transmission: '6-speed sequential paddle-shift',
      drivetrain: 'Rear-wheel drive',
    },
    chassis: {
      weight: '≈1,285 kg (BoP-dependent)',
      aeroFeature: 'Bespoke splitter, flat floor and dive planes manage front-axle load',
      construction: 'Carbon-fibre MonoCage II with FIA-approved roll cage',
    },
    series: 'GT World Challenge · British GT · International GT Open',
    achievements: [
      'Australian GT at Albert Park — pole and debut victory, 2019',
      'Gulf 12 Hours — overall victory, 2021',
      'British GT at Brands Hatch — overall victory, 2022',
      'British GT at Donington Park — overall victory, 2022',
    ],
    fact: 'More than 90 percent of the road car’s components were changed or optimised for GT3',
    showcase: {
      headline: 'Carbon architecture translated into customer racing',
      paragraphs: [
        'McLaren developed the 720S GT3 around the road car’s carbon-fibre MonoCage II, retaining the central structure while replacing most surrounding components for competition. The result is a low, compact customer racer whose proportions reflect its mid-engined layout and tightly packaged cooling system.',
        'The 4.0-litre twin-turbo V8 uses a race calibration and smaller regulated output than the road car. A broad torque curve and low rotating mass make the 720S responsive to small inputs, while bespoke suspension geometry gives teams the adjustment range required across different tyre constructions.',
        'Its first customer appearance at Albert Park produced pole position and a race win in 2019. A 720S later won the 2021 Gulf 12 Hours, and the platform established a sustained British GT presence, including overall victories at Brands Hatch and Donington Park in 2022.',
      ],
    },
    images: [],
    wikiQuery: 'McLaren 720S GT3',
  },
  {
    id: 'aston',
    index: 7,
    manufacturer: 'Aston Martin',
    model: 'Vantage GT3',
    year: '2019',
    displayName: 'Aston Martin Vantage GT3',
    modelFile: 'aston_vantage_gt3.glb',
    brandColor: '#173B31',
    brandColorSoft: '#30483F',
    accentText: '#EEF0EB',
    engine: {
      configuration: '4.0 L twin-turbocharged V8, 90°',
      displacement: '3,982 cc',
      induction: 'Twin-turbocharged',
      power: '≈535 hp (BoP-dependent)',
      torque: '>700 N·m (BoP-dependent)',
      redline: '≈7,000 rpm',
      transmission: '6-speed sequential paddle-shift',
      drivetrain: 'Rear-wheel drive',
    },
    chassis: {
      weight: '≈1,285 kg (BoP-dependent)',
      aeroFeature: 'Full-width front splitter balances a high rear wing and deep diffuser',
      construction: 'Bonded aluminium chassis with FIA-spec steel roll cage',
    },
    series: 'IMSA GTD · British GT · GT World Challenge',
    achievements: [
      'British GT — drivers’ championship, 2019',
      '24 Hours of Spa — Pro-Am class victory, 2019',
      'Watkins Glen 6 Hours — GTD Pro and GTD class victories, 2022',
      'Rolex 24 at Daytona — GTD class victory, 2023',
    ],
    fact: 'The 2023 Daytona win was Aston Martin’s first class victory there since 1964',
    showcase: {
      headline: 'A front-engined Vantage for the global grid',
      paragraphs: [
        'Introduced for the 2019 season, the Vantage GT3 replaced Aston Martin’s long-serving V12 racer with a smaller, turbocharged platform. It shares the road car’s bonded aluminium architecture and was developed alongside the GTE version, giving customer teams a mature base for international competition.',
        'The 4.0-litre V8 sits behind the front axle and sends its torque through a six-speed sequential transmission. Its front-mid-engine balance gives the car clear traction on exit and progressive responses at the limit, qualities that suit amateur and professional drivers sharing the same endurance setup.',
        'The Vantage won the 2019 British GT drivers’ title and the Pro-Am class at Spa that year. The Heart of Racing added an IMSA championship in 2022, then opened 2023 with a Daytona GTD victory, Aston Martin’s first class win at the Florida race in fifty-nine years.',
      ],
    },
    images: [],
    wikiQuery: 'Aston Martin Vantage GT3 2019',
  },
  {
    id: 'lamborghini',
    index: 8,
    manufacturer: 'Lamborghini',
    model: 'Huracán GT3 EVO2',
    year: '2023',
    displayName: 'Lamborghini Huracán GT3 EVO2',
    modelFile: 'lamborghini_huracan_gt3.glb',
    brandColor: '#795033',
    brandColorSoft: '#604C3E',
    accentText: '#F3ECE5',
    engine: {
      configuration: '5.2 L naturally aspirated V10, 90°',
      displacement: '5,204 cc',
      induction: 'Naturally aspirated',
      power: '≈570 hp (BoP-dependent)',
      torque: '≈550 N·m (BoP-dependent)',
      redline: '≈8,500 rpm',
      transmission: '6-speed sequential paddle-shift',
      drivetrain: 'Rear-wheel drive',
    },
    chassis: {
      weight: '≈1,300 kg (BoP-dependent)',
      aeroFeature: 'Roof snorkel and rear fin stabilise intake flow and high-speed balance',
      construction: 'Hybrid aluminium-carbon chassis with integrated FIA-spec roll cage',
    },
    series: 'DTM · FIA WEC LMGT3 · SUPER GT GT300',
    achievements: [
      'DTM at Nürburgring — maiden EVO2 victory, 2023',
      'SUPER GT at Motegi — GT300 class victory, 2023',
      'DTM — drivers’ championship, 2024',
      'European Le Mans Series — LMGT3 title, 2024',
    ],
    fact: 'The EVO2 is the third and final FIA-homologated Huracán GT3 generation',
    showcase: {
      headline: 'The final Huracán evolution for GT3 racing',
      paragraphs: [
        'The EVO2 is the third homologated version of Lamborghini’s Huracán GT3 and the first built fully around the FIA’s 2022 technical regulations. Derived visually from the Huracán STO, it added revised safety structures, new aerodynamics and a roof-fed intake for the 2023 season.',
        'Its 5.2-litre V10 remains naturally aspirated and drives only the rear wheels. Ten electronically controlled throttle bodies sharpen response, while the roof snorkel feeds the engine more consistently. The car’s balance is defined by immediate throttle pickup, compact dimensions and a wide range of aero adjustment.',
        'The EVO2 recorded its first DTM wins at the Nürburgring in 2023 and won in SUPER GT at Motegi later that year. Mirko Bortolotti secured the 2024 DTM drivers’ championship, while Iron Lynx took the European Le Mans Series LMGT3 title at Portimão.',
      ],
    },
    images: [],
    wikiQuery: 'Lamborghini Huracán GT3 EVO2',
  },
  {
    id: 'porsche',
    index: 9,
    manufacturer: 'Porsche',
    model: '911 GT3 R',
    year: '2023',
    displayName: 'Porsche 911 GT3 R',
    modelFile: 'porsche_911_gt3r.glb',
    brandColor: '#25211F',
    brandColorSoft: '#3C3733',
    accentText: '#F0EBE5',
    engine: {
      configuration: '4.2 L naturally aspirated flat-six',
      displacement: '4,194 cc',
      induction: 'Naturally aspirated',
      power: 'Up to 565 hp (BoP-dependent)',
      torque: '≈550 N·m (BoP-dependent)',
      redline: '9,250 rpm',
      transmission: '6-speed sequential paddle-shift',
      drivetrain: 'Rear-wheel drive',
    },
    chassis: {
      weight: '≈1,250 kg (BoP-dependent)',
      aeroFeature: 'Swan-neck rear wing and raised underbody maintain consistent downforce',
      construction: 'Steel-aluminium 992 body with welded FIA-spec roll cage and composite panels',
    },
    series: 'FIA WEC LMGT3 · IMSA GTD Pro · GT World Challenge',
    achievements: [
      'Bathurst 12 Hour — overall victory, 2024',
      '24 Hours of Le Mans — LMGT3 class victory, 2024',
      'FIA WEC — LMGT3 manufacturer, team and drivers’ titles, 2024',
      'IMSA — GTD Pro team and drivers’ titles, 2024',
    ],
    fact: 'The 992-generation car won LMGT3 on its first appearance at Le Mans',
    showcase: {
      headline: 'The rear-engined reference, redrawn for 2023',
      paragraphs: [
        'The 2023 911 GT3 R applies the 992-generation platform to Porsche’s customer-racing programme. A longer wheelbase, revised suspension and more consistent aerodynamics broaden its operating window, while the familiar rear-engine layout remains central to the car’s identity and traction characteristics.',
        'Displacement grew to 4.2 litres, giving the naturally aspirated flat-six more usable torque without sacrificing its 9,250 rpm ceiling. Porsche tilted the engine forward and moved ancillary components lower, improving weight distribution while preserving the direct response and rear-axle traction associated with the 911.',
        'After debuting at Daytona in 2023, the car’s second season produced an overall Bathurst 12 Hour victory and the inaugural LMGT3 class win at Le Mans. Porsche customer teams also secured the 2024 FIA WEC LMGT3 titles and IMSA’s GTD Pro team and drivers’ championships.',
      ],
    },
    images: [],
    wikiQuery: 'Porsche 911 GT3 R 992',
  },
];

export const CAR_BY_ID = Object.fromEntries(CARS.map((car) => [car.id, car]));

/**
 * Return the nearest valid roster entry for a numeric index.
 * Non-finite values resolve to the first car.
 *
 * @param {number} index
 * @returns {Car}
 */
export function getCar(index) {
  const numericIndex = Number.isFinite(index) ? Math.trunc(index) : 0;
  const safeIndex = Math.max(0, Math.min(CARS.length - 1, numericIndex));
  return CARS[safeIndex];
}
