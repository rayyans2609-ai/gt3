import { createWriteStream } from 'node:fs';
import { access, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

import { CARS } from '../src/data/cars.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const IMAGES_ROOT = path.join(ROOT, 'public', 'images');
const MANIFEST_PATH = path.join(ROOT, 'src', 'data', 'carImages.js');
const CREDITS_PATH = path.join(IMAGES_ROOT, 'CREDITS.md');
const API_URL = 'https://commons.wikimedia.org/w/api.php';
const USER_AGENT =
  'GT3GrandTourImageFetcher/1.0 (Wikimedia attribution build script; Node.js)';
const MAX_IMAGES = 3;
const API_DELAY_MS = 500;
const DOWNLOAD_DELAY_MS = 1500;
const MAX_DOWNLOAD_ATTEMPTS = 4;

const REQUIRED_TITLE_TERMS = {
  lexus: ['lexus', 'rc', 'f', 'gt3'],
  nissan: ['nissan', 'gt', 'r', 'gt3'],
  audi: ['audi', 'r8', 'gt3'],
  bmw: ['bmw', 'm6', 'gt3'],
  mercedes: ['mercedes', 'amg', 'gt3'],
  ferrari: ['ferrari', '488', 'gt3'],
  mclaren: ['mclaren', '720s', 'gt3'],
  aston: ['aston', 'vantage', 'gt3'],
  lamborghini: ['lamborghini', 'huracan', 'gt3'],
  porsche: ['porsche', '911', 'gt3'],
};

const NON_PHOTO_TERMS = [
  'badge',
  'blueprint',
  'brochure',
  'diagram',
  'drawing',
  'emblem',
  'icon',
  'illustration',
  'logo',
  'map',
  'poster',
  'render',
  'scale model',
  'schematic',
  'silhouette',
  'sketch',
  'sticker',
  'vector',
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(value = '') {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function decodeEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([0-9a-f]+);/gi, (_, number) =>
      String.fromCodePoint(Number.parseInt(number, 16)),
    )
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:0*39|x0*27);/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function plainText(value = '') {
  return decodeEntities(
    String(value)
      .replace(/<br\s*\/?\s*>/gi, ' ')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function metadataValue(metadata, key) {
  return plainText(metadata?.[key]?.value ?? '');
}

function isReusableLicence(shortName) {
  const licence = normalize(shortName).replace(/\s/g, '');
  if (licence.includes('publicdomain') || licence === 'pdm') return true;
  if (licence.startsWith('cc0') || licence.startsWith('cczero')) return true;
  return /^ccby(?:sa)?\d*$/.test(licence);
}

function isRelevantPhoto(car, page, info) {
  const title = normalize(page.title.replace(/^File:/i, ''));
  const required = REQUIRED_TITLE_TERMS[car.id];
  const hasCarName = required.every((term) => title.split(' ').includes(term));
  const isObviousNonPhoto = NON_PHOTO_TERMS.some((term) => title.includes(term));
  const longEdge = Math.max(info.width ?? 0, info.height ?? 0);

  return (
    hasCarName &&
    !isObviousNonPhoto &&
    info.mime === 'image/jpeg' &&
    longEdge >= 800
  );
}

function candidateFromPage(car, page) {
  const info = page.imageinfo?.[0];
  if (!info || !isRelevantPhoto(car, page, info)) return null;

  const metadata = info.extmetadata ?? {};
  const licence = metadataValue(metadata, 'LicenseShortName');
  const author = metadataValue(metadata, 'Artist') || metadataValue(metadata, 'Credit');
  const sourceUrl = info.descriptionurl;
  if (!isReusableLicence(licence) || !author || !sourceUrl) return null;

  const useThumbnail = info.width > 1400 && info.thumburl;
  return {
    downloadUrl: useThumbnail ? info.thumburl : info.url,
    width: useThumbnail ? info.thumbwidth : info.width,
    height: useThumbnail ? info.thumbheight : info.height,
    title: page.title.replace(/^File:/i, ''),
    author,
    licence,
    sourceUrl,
    landscape: info.width >= info.height,
    area: info.width * info.height,
  };
}

async function queryCommons(search) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'search',
    gsrnamespace: '6',
    gsrlimit: '40',
    gsrsearch: search,
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '1400',
  });
  const response = await fetch(`${API_URL}?${params}`, {
    headers: {
      'Api-User-Agent': USER_AGENT,
      'User-Agent': USER_AGENT,
    },
  });
  if (!response.ok) {
    throw new Error(`Commons API returned ${response.status} ${response.statusText}`);
  }
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.info ?? payload.error.code);
  return payload.query?.pages ?? [];
}

async function findCandidates(car, excludedTitles) {
  const searches = [
    `intitle:"${car.wikiQuery}" filetype:bitmap`,
    `"${car.wikiQuery}" filetype:bitmap`,
    `${car.wikiQuery} GT3 racing car filetype:bitmap`,
  ];
  const candidates = new Map();

  for (const search of searches) {
    try {
      const pages = await queryCommons(search);
      for (const page of pages) {
        const candidate = candidateFromPage(car, page);
        if (
          candidate &&
          !excludedTitles.has(candidate.title) &&
          !candidates.has(candidate.title)
        ) {
          candidates.set(candidate.title, candidate);
        }
      }
    } catch (error) {
      console.warn(`  Search failed (${search}): ${error.message}`);
    }
    if (candidates.size >= MAX_IMAGES) break;
    await sleep(API_DELAY_MS);
  }

  return [...candidates.values()].sort(
    (a, b) => Number(b.landscape) - Number(a.landscape) || b.area - a.area,
  );
}

async function fileExists(filePath) {
  try {
    const details = await stat(filePath);
    return details.isFile() && details.size > 0;
  } catch {
    return false;
  }
}

async function loadExistingManifest() {
  try {
    await access(MANIFEST_PATH);
    const moduleUrl = `${pathToFileURL(MANIFEST_PATH).href}?read=${Date.now()}`;
    const imported = await import(moduleUrl);
    return imported.CAR_IMAGES ?? {};
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn(`Could not read the existing manifest: ${error.message}`);
    }
    return {};
  }
}

function publicFileForSrc(src) {
  const relative = src.replace(/^\/+/, '');
  const resolved = path.resolve(ROOT, 'public', relative);
  const publicRoot = path.resolve(ROOT, 'public') + path.sep;
  return resolved.startsWith(publicRoot) ? resolved : null;
}

async function retainedEntries(car, existingManifest) {
  const retained = [];
  for (const entry of existingManifest[car.id] ?? []) {
    const filePath = publicFileForSrc(entry.src);
    if (!filePath || !(await fileExists(filePath))) continue;
    if (
      !entry.title ||
      !entry.author ||
      !isReusableLicence(entry.licence) ||
      !entry.sourceUrl ||
      !Number.isFinite(entry.width) ||
      !Number.isFinite(entry.height)
    ) {
      console.warn(`  Ignoring incomplete manifest entry for ${entry.src}`);
      continue;
    }
    retained.push(entry);
  }
  return retained.slice(0, MAX_IMAGES);
}

async function downloadImage(candidate, destination) {
  const temporary = `${destination}.part`;
  await rm(temporary, { force: true });
  let response;
  for (let attempt = 1; attempt <= MAX_DOWNLOAD_ATTEMPTS; attempt += 1) {
    response = await fetch(candidate.downloadUrl, {
      headers: {
        'Api-User-Agent': USER_AGENT,
        'User-Agent': USER_AGENT,
      },
    });
    if (response.ok) break;

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === MAX_DOWNLOAD_ATTEMPTS) {
      throw new Error(`download returned ${response.status} ${response.statusText}`);
    }

    const retryAfter = Number.parseInt(response.headers.get('retry-after') ?? '', 10);
    const backoff = Number.isFinite(retryAfter)
      ? Math.max(2000, retryAfter * 1000)
      : 2500 * 2 ** (attempt - 1);
    await response.body?.cancel();
    console.log(`  Wikimedia throttled a download; waiting ${Math.ceil(backoff / 1000)}s.`);
    await sleep(backoff);
  }

  if (!response?.ok || !response.body) throw new Error('download returned no image body');
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('image/jpeg')) {
    await response.body.cancel();
    throw new Error(`expected image/jpeg, received ${contentType || 'unknown type'}`);
  }

  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

function manifestSource(entriesByCar) {
  const json = JSON.stringify(entriesByCar, null, 2)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `/**\n * Wikimedia Commons photographs and attribution metadata.\n+ * Generated by scripts/fetch-images.mjs; do not edit by hand.\n+ */\n+export const CAR_IMAGES = ${json};\n+`;
}

function markdownCell(value) {
  return String(value).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

function creditsSource(entriesByCar) {
  const lines = [
    '# Wikimedia Commons image credits',
    '',
    'Every image below is used under the licence shown. Follow the source link for the full licence and file history.',
    '',
    '| Car | Local file | Title | Author / artist | Licence | Source |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const car of CARS) {
    for (const entry of entriesByCar[car.id]) {
      lines.push(
        `| ${markdownCell(car.displayName)} | ${markdownCell(entry.src)} | ${markdownCell(entry.title)} | ${markdownCell(entry.author)} | ${markdownCell(entry.licence)} | [Wikimedia Commons](${entry.sourceUrl}) |`,
      );
    }
  }
  lines.push('', '_Generated by `node scripts/fetch-images.mjs`._', '');
  return lines.join('\n');
}

async function main() {
  await mkdir(IMAGES_ROOT, { recursive: true });
  const existingManifest = await loadExistingManifest();
  const entriesByCar = Object.fromEntries(CARS.map((car) => [car.id, []]));

  for (const car of CARS) {
    console.log(`${car.displayName}:`);
    const carDirectory = path.join(IMAGES_ROOT, car.id);
    await mkdir(carDirectory, { recursive: true });
    const retained = await retainedEntries(car, existingManifest);
    entriesByCar[car.id].push(...retained);
    if (retained.length) console.log(`  Reusing ${retained.length} existing image(s).`);

    if (entriesByCar[car.id].length < MAX_IMAGES) {
      const excludedTitles = new Set(retained.map((entry) => entry.title));
      const candidates = await findCandidates(car, excludedTitles);

      for (const candidate of candidates) {
        if (entriesByCar[car.id].length >= MAX_IMAGES) break;
        const number = entriesByCar[car.id].length + 1;
        const destination = path.join(carDirectory, `${number}.jpg`);
        const src = `/images/${car.id}/${number}.jpg`;

        if (await fileExists(destination)) {
          console.warn(`  ${src} exists without reusable manifest metadata; leaving it untouched.`);
          continue;
        }

        try {
          await downloadImage(candidate, destination);
          const { downloadUrl, landscape, area, ...entry } = candidate;
          entriesByCar[car.id].push({ src, ...entry });
          console.log(`  Downloaded ${src} (${entry.width}×${entry.height}).`);
        } catch (error) {
          console.warn(`  Skipped ${candidate.title}: ${error.message}`);
        }
        await sleep(DOWNLOAD_DELAY_MS);
      }
    }

    const count = entriesByCar[car.id].length;
    if (count === 0) console.warn('  No suitable freely licensed photographs found; continuing.');
    else if (count < 2) console.warn(`  Only ${count} suitable photograph found; continuing.`);
    console.log(`  Total: ${count}`);
    await sleep(API_DELAY_MS);
  }

  await writeFile(MANIFEST_PATH, manifestSource(entriesByCar), 'utf8');
  await writeFile(CREDITS_PATH, creditsSource(entriesByCar), 'utf8');
  console.log('\nWrote src/data/carImages.js and public/images/CREDITS.md.');
}

main().catch((error) => {
  console.error(`Image fetch failed: ${error.stack ?? error.message}`);
  process.exitCode = 1;
});
