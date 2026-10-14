#!/usr/bin/env node

import { spawn } from 'node:child_process';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI_VERSION = '4.4.2';
const WEBP_QUALITY = 80;
const PRIMARY_TEXTURE_LIMIT = 1024;
const FALLBACK_TEXTURE_LIMIT = 512;
const TARGET_BYTES = 8 * 1024 * 1024;

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, '..');
const sourceModelsDirectory = join(projectRoot, 'models');
const outputModelsDirectory = join(projectRoot, 'public', 'models');
const tourModelsDirectory = join(outputModelsDirectory, 'tour');
const TOUR_TEXTURE_LIMIT = 512;
const sourceAudiosDirectory = join(projectRoot, 'audios');
const outputAudiosDirectory = join(projectRoot, 'public', 'audios');
const voicesDirectory = join(outputAudiosDirectory, 'voices');
const reportPath = join(scriptDirectory, 'ASSETS_REPORT.md');
const npmCacheDirectory = join(tmpdir(), 'gt3-gltf-transform-npm-cache');

function formatMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2);
}

function formatSaved(sourceBytes, outputBytes) {
  return ((1 - outputBytes / sourceBytes) * 100).toFixed(1);
}

function run(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: { ...process.env, npm_config_cache: npmCacheDirectory },
      stdio: ['ignore', 'inherit', 'inherit'],
    });

    child.once('error', rejectPromise);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      const detail = signal ? `signal ${signal}` : `exit code ${code}`;
      rejectPromise(new Error(`${command} failed with ${detail}`));
    });
  });
}

async function gltfTransform(command, input, output, options = []) {
  await run('npx', [
    '--yes',
    `@gltf-transform/cli@${CLI_VERSION}`,
    command,
    input,
    output,
    ...options,
  ]);
}

async function optimizeModel(sourcePath, outputPath, textureLimit) {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'gt3-model-'));

  try {
    const stages = Array.from({ length: 8 }, (_, index) =>
      join(temporaryDirectory, `stage-${index + 1}.glb`),
    );

    // Keep this sequence explicit: it is both documentation and a guard against
    // optimize presets adding geometry simplification in a future CLI release.
    await gltfTransform('dedup', sourcePath, stages[0]);
    await gltfTransform('prune', stages[0], stages[1]);
    // The transform only instances compatible, non-animated mesh reuse. A minimum
    // of two captures repeated wheels and other safe repeated car components.
    await gltfTransform('instance', stages[1], stages[2], ['--min', '2']);
    await gltfTransform('resize', stages[2], stages[3], [
      '--width',
      String(textureLimit),
      '--height',
      String(textureLimit),
      '--filter',
      'lanczos3',
    ]);
    await gltfTransform('webp', stages[3], stages[4], [
      '--quality',
      String(WEBP_QUALITY),
      '--effort',
      '6',
      '--formats',
      '*',
    ]);
    await gltfTransform('draco', stages[4], stages[5], [
      '--method',
      'edgebreaker',
      '--quantize-position',
      '14',
      '--quantize-normal',
      '10',
      '--quantize-texcoord',
      '12',
      '--quantize-color',
      '8',
      '--quantize-generic',
      '12',
      '--quantization-volume',
      'mesh',
    ]);
    // glTF Transform 4.x welds only bitwise-identical vertices (zero tolerance),
    // the most conservative possible weld and safe for the source silhouette.
    await gltfTransform('weld', stages[5], stages[6]);
    // A standalone weld reads (and therefore decodes) the preceding Draco data.
    // Reapply the same Draco settings so the delivered file remains compressed.
    await gltfTransform('draco', stages[6], stages[7], [
      '--method',
      'edgebreaker',
      '--quantize-position',
      '14',
      '--quantize-normal',
      '10',
      '--quantize-texcoord',
      '12',
      '--quantize-color',
      '8',
      '--quantize-generic',
      '12',
      '--quantization-volume',
      'mesh',
    ]);

    await copyFile(stages[7], outputPath);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function listFiles(directory, extension) {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(extension))
    .map((entry) => entry.name)
    .sort();
}

async function copyAudios() {
  await mkdir(outputAudiosDirectory, { recursive: true });
  await mkdir(voicesDirectory, { recursive: true });

  const audioNames = await listFiles(sourceAudiosDirectory, '.mp3');
  for (const audioName of audioNames) {
    await copyFile(
      join(sourceAudiosDirectory, audioName),
      join(outputAudiosDirectory, audioName),
    );
  }

  await writeFile(join(voicesDirectory, '.gitkeep'), '');
  return audioNames.length;
}

async function writeReport(modelNames, fallbackNames) {
  const rows = [];
  const missedTargets = [];

  for (const modelName of modelNames) {
    const sourceBytes = (await stat(join(sourceModelsDirectory, modelName))).size;
    const outputPath = join(outputModelsDirectory, modelName);

    try {
      const outputBytes = (await stat(outputPath)).size;
      rows.push(
        `| ${modelName} | ${formatMB(sourceBytes)} MB | ${formatMB(outputBytes)} MB | ${formatSaved(sourceBytes, outputBytes)}% |`,
      );
      if (outputBytes >= TARGET_BYTES) missedTargets.push(modelName);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      rows.push(`| ${modelName} | ${formatMB(sourceBytes)} MB | Missing | — |`);
      missedTargets.push(modelName);
    }
  }

  const fallbackNote = fallbackNames.size
    ? `Models retried with 512px textures: ${[...fallbackNames].sort().join(', ')}.`
    : 'No models required the 512px texture fallback.';
  const targetNote = missedTargets.length
    ? `Models missing the 8 MB target: ${missedTargets.join(', ')}. The required lossless structural cleanup, WebP texture compression, conservative weld, and Draco compression were applied; geometry was not simplified.`
    : 'All 10 models are below the 8 MB per-file target.';

  const report = [
    '# Compressed Asset Report',
    '',
    `Generated by \`node scripts/compress-models.mjs\` with glTF Transform ${CLI_VERSION}. Sizes use binary megabytes (MiB, reported as MB).`,
    '',
    '| Filename | Source size | Output size | Saved |',
    '| --- | ---: | ---: | ---: |',
    ...rows,
    '',
    fallbackNote,
    '',
    targetNote,
    '',
    'Pipeline: dedup → prune → safe instancing → texture resize → WebP (quality 80) → Draco (14/10/12/8/12-bit quantization) → exact-match weld → final Draco packaging. The final packaging pass is necessary because a standalone post-Draco weld decodes its input. No mesh simplification or decimation is used.',
    '',
  ].join('\n');

  await writeFile(reportPath, report);
}

// `--tour`: build only public/models/tour/*.glb (512 px textures) from the
// source GLBs. Does not touch public/models/*.glb, ASSETS_REPORT.md or audio.
async function mainTour() {
  const modelNames = await listFiles(sourceModelsDirectory, '.glb');
  if (modelNames.length !== 10) {
    throw new Error(`Expected 10 source GLBs, found ${modelNames.length}.`);
  }
  await mkdir(tourModelsDirectory, { recursive: true });
  await mkdir(npmCacheDirectory, { recursive: true });
  // Fail fast if the pinned CLI is unavailable (network/cache).
  await run('npx', ['--yes', `@gltf-transform/cli@${CLI_VERSION}`, '--version']);

  for (const modelName of modelNames) {
    const sourcePath = join(sourceModelsDirectory, modelName);
    const outputPath = join(tourModelsDirectory, modelName);
    console.log(`\nTour ${modelName} (textures <= ${TOUR_TEXTURE_LIMIT}px)...`);
    await optimizeModel(sourcePath, outputPath, TOUR_TEXTURE_LIMIT);
    const sourceBytes = (await stat(sourcePath)).size;
    const outputBytes = (await stat(outputPath)).size;
    console.log(`${modelName}: ${formatMB(sourceBytes)} MB -> ${formatMB(outputBytes)} MB`);
  }
}

async function main() {
  if (process.argv.slice(2).includes('--tour')) {
    await mainTour();
    return;
  }
  const allModelNames = await listFiles(sourceModelsDirectory, '.glb');
  const requestedNames = process.argv.slice(2).map((value) => basename(value));
  const modelNames = requestedNames.length ? requestedNames : allModelNames;
  const unknownNames = modelNames.filter((name) => !allModelNames.includes(name));

  if (allModelNames.length !== 10) {
    throw new Error(`Expected 10 source GLBs, found ${allModelNames.length}.`);
  }
  if (unknownNames.length) {
    throw new Error(`Unknown source model(s): ${unknownNames.join(', ')}`);
  }

  await mkdir(outputModelsDirectory, { recursive: true });
  await mkdir(npmCacheDirectory, { recursive: true });

  const fallbackNames = new Set();
  for (const modelName of modelNames) {
    const sourcePath = join(sourceModelsDirectory, modelName);
    const outputPath = join(outputModelsDirectory, modelName);
    const sourceBytes = (await stat(sourcePath)).size;

    console.log(`\nOptimizing ${modelName} (textures <= ${PRIMARY_TEXTURE_LIMIT}px)...`);
    await optimizeModel(sourcePath, outputPath, PRIMARY_TEXTURE_LIMIT);
    let outputBytes = (await stat(outputPath)).size;

    if (outputBytes >= TARGET_BYTES) {
      fallbackNames.add(modelName);
      console.log(
        `${modelName} is ${formatMB(outputBytes)} MB; retrying with textures <= ${FALLBACK_TEXTURE_LIMIT}px...`,
      );
      await optimizeModel(sourcePath, outputPath, FALLBACK_TEXTURE_LIMIT);
      outputBytes = (await stat(outputPath)).size;
    }

    console.log(
      `${modelName}: ${formatMB(sourceBytes)} MB -> ${formatMB(outputBytes)} MB, ${formatSaved(sourceBytes, outputBytes)}% saved`,
    );
  }

  const audioCount = await copyAudios();
  await writeReport(allModelNames, fallbackNames);
  console.log(`\nCopied ${audioCount} MP3 files and updated scripts/ASSETS_REPORT.md.`);
}

main().catch((error) => {
  console.error(`\nAsset compression failed: ${error.stack ?? error.message}`);
  process.exitCode = 1;
});
