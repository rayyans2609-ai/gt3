// Opening Showcase with 'f' is itself the user gesture that starts audio, so the
// narration request races the audio start. Verifies the play control is not left dead.
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--user-data-dir=/tmp/gt3-chrome-voice', '--no-first-run',
         '--window-size=1600,900', '--enable-unsafe-swiftshader'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 120000 });
await new Promise((r) => setTimeout(r, 4000));

// First and only gesture of the session: 'f'. Showcase opens on this same event.
await page.keyboard.press('f');

const sample = async (label, waitMs) => {
  await new Promise((r) => setTimeout(r, waitMs));
  const s = await page.evaluate(() => {
    const note = document.querySelector('.showcase-voice__note');
    const btn = document.querySelector('.showcase-voice button, .showcase-voice__button');
    return {
      showcaseOpen: !!document.querySelector('#showcase-layer.is-open'),
      note: note ? note.textContent.trim() : '(no note element)',
      buttonDisabled: btn ? btn.disabled : '(no button)',
    };
  });
  console.log(`${label.padEnd(14)} ${JSON.stringify(s)}`);
  return s;
};

await sample('t=+0.4s', 400);
await sample('t=+1.5s', 1100);
const final = await sample('t=+4.0s', 2500);

console.log('--- errors ---');
console.log(errors.length ? errors.join('\n') : 'none');
const ok = final.showcaseOpen && final.buttonDisabled === false && final.note !== 'Narration unavailable';
console.log(ok ? 'RESULT: PASS — narration control is live' : 'RESULT: FAIL — control dead or narration unavailable');
await browser.close();
