/** Host/RAF guard for unchanged verification scripts; all browser launches are gated. */
import puppeteer from '/Users/rayyansheikh/Desktop/gt3/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';
import {preflight,hostSample,hostDegraded,wait} from '/Users/rayyansheikh/Desktop/gt3/.claude/worktrees/p3x-perf/scripts/lib/perf-host.mjs';
import {appendFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const out=process.env.GT3_OUT+'/guard';await mkdir(out,{recursive:true});
const launch=puppeteer.launch.bind(puppeteer),timers=new Set();let launchIndex=0,failed=false;
const log=async row=>appendFile(out+'/host.jsonl',JSON.stringify(row)+'\n');
puppeteer.launch=async options=>{
 const admitted=await preflight(out+'/launch-'+(++launchIndex));
 const browser=await launch(options);let page,previous=admitted,busy=false;
 const newPage=browser.newPage.bind(browser);
 browser.newPage=async(...args)=>{page=await newPage(...args);
 if(process.env.GT3_PACE==='30'){const go=page.goto.bind(page);page.goto=(url,...options)=>{const u=new URL(url);u.searchParams.set('pace','30');return go(u.href,...options);};}
 await page.evaluateOnNewDocument(()=>{
   function p3xHostPulse(){window.__p3xHostBeat=performance.now();requestAnimationFrame(p3xHostPulse);}
   requestAnimationFrame(p3xHostPulse);
 });return page;};
 const stop=async reason=>{if(failed)return;failed=true;await log({kind:'STOP',reason});
   process.kill(process.pid,'SIGTERM');
   setTimeout(()=>process.exit(143),12000).unref();
 };
 const timer=setInterval(async()=>{
  if(busy||failed)return;busy=true;
  try{const sample=await hostSample();await log({kind:'monitor',sample});
   if(hostDegraded(previous,sample))return await stop('Two consecutive host hard-stop samples');previous=sample;
   if(page&&!page.isClosed()){
    const ping=await Promise.race([page.evaluate(()=>({now:performance.now(),beat:window.__p3xHostBeat})),wait(5000).then(()=>({timeout:true}))]);
    await log({kind:'ping',ping});if(ping.timeout||(ping.beat&&ping.now-ping.beat>5000))await stop('CDP/RAF responsiveness exceeded5sec');
   }
  }catch(error){if(browser.connected)await stop(error.message);}finally{busy=false;}
 },30000);timers.add(timer);browser.once('disconnected',()=>{clearInterval(timer);timers.delete(timer);});
 await log({kind:'launch',pid:browser.process().pid});return browser;
};
try{await import(pathToFileURL(resolve(process.argv[2])).href);}finally{
 for(const timer of timers)clearInterval(timer);await log({kind:'ended',failed});
}
