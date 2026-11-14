import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {chromium} from '../../niulai-android/node_modules/playwright/index.mjs';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const web=path.join(project,'dist'),out=process.env.NIULAI_MUYU_QA_OUTPUT?path.resolve(process.env.NIULAI_MUYU_QA_OUTPUT):path.resolve(project,'../outputs/polish-20261113/site/muyu');
await fs.mkdir(out,{recursive:true});
const server=http.createServer(async(req,res)=>{
  let name=new URL(req.url,'http://localhost').pathname;if(name.endsWith('/'))name+='index.html';
  const file=path.resolve(web,'.'+decodeURIComponent(name));
  if(!file.startsWith(web+path.sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.wav':'audio/wav','.png':'image/png','.mp3':'audio/mpeg','.json':'application/json'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
await context.addInitScript(()=>{window.muyuDraws=[];const draw=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(image,...args){if(this.canvas.id==='bull-frames')window.muyuDraws.push({url:image.src,args});return draw.call(this,image,...args);};});
const page=await context.newPage(),errors=[],checks=[];
const origin=process.env.NIULAI_MUYU_ORIGIN||`http://127.0.0.1:${server.address().port}`;
page.on('pageerror',error=>errors.push(error.message));
const pass=name=>{checks.push({name,passed:true});console.log('PASS '+name);};
const count=id=>page.locator('#'+id).textContent().then(s=>Number(s.replaceAll(',','')));
const drawing=()=>page.locator('#bull-frames').evaluate(canvas=>canvas.toDataURL());
try{
  await page.goto(origin+'/');await page.locator('#bull[data-ready=true]').waitFor();
  assert.equal(await page.locator('#bull').getAttribute('data-quality'),'hq512');
  const reference=await page.evaluate(async()=>{const live=document.getElementById('bull-frames'),image=new Image();image.src='assets/muyu-hq/muyu-00.webp';await image.decode();const expected=document.createElement('canvas');expected.width=expected.height=live.width;const ctx=expected.getContext('2d');ctx.imageSmoothingQuality='high';ctx.drawImage(image,0,0,512,512,0,0,expected.width,expected.height);return{matches:expected.toDataURL()===live.toDataURL(),width:live.width,target:Math.round(live.getBoundingClientRect().width*Math.min(devicePixelRatio,2)),sourceWidth:image.naturalWidth};});
  assert.equal(reference.matches,true);assert.equal(reference.width,reference.target);assert.equal(reference.sourceWidth,2048);
  pass('the official 512px lossless first frame renders exactly at the high-DPI canvas size');
  const initial=await drawing();await page.locator('#bull').click();await page.waitForTimeout(130);
  assert.equal(await count('session-count'),1);assert.notEqual(await drawing(),initial);
  await page.screenshot({path:path.join(out,'muyu-tap.png')});await page.waitForTimeout(900);
  assert.equal(await drawing(),initial);pass('one website tap plays a complete stroke and returns to its resting drawing');
  assert(await page.evaluate(()=>window.muyuDraws.some(draw=>draw.url.endsWith('/muyu-hq/muyu-01.webp'))));
  const idleDraws=await page.evaluate(()=>window.muyuDraws.length);await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>window.muyuDraws.length),idleDraws);
  pass('a complete stroke draws both predecoded pages and resting animation stops repainting');
  await page.evaluate(()=>{for(let i=0;i<50;i++)document.getElementById('bull').click();});assert.equal(await count('session-count'),51);
  await page.waitForTimeout(950);const settled=await drawing();await page.waitForTimeout(180);assert.equal(await drawing(),settled);
  pass('fifty rapid taps keep all counts and settle without an unbounded animation queue');
  await page.reload();await page.locator('#bull[data-ready=true]').waitFor();assert.equal(await count('total-count'),51);assert.equal(await count('session-count'),0);
  pass('the existing cumulative count storage survives reload');
  await page.locator('#settings-open').click();await page.locator('#motion').uncheck();await page.locator('#sound-toggle').uncheck();await page.locator('#settings-dialog .dialog-header button').click();
  await page.locator('#bull').click();const still=await drawing();await page.waitForTimeout(450);assert.equal(await drawing(),still);
  pass('the existing motion and sound switches remain effective');
  await page.locator('#settings-open').click();await page.locator('#motion').check();await page.locator('[data-tempo="800"]').click();const beforeAuto=await count('session-count');
  await page.locator('#auto-toggle').check();await page.waitForTimeout(1800);await page.locator('#auto-toggle').uncheck();assert.equal(await count('session-count'),beforeAuto+3);
  const stopped=await count('session-count');await page.waitForTimeout(950);assert.equal(await count('session-count'),stopped);
  const total=await count('total-count');await page.locator('#new-round').click();assert.equal(await count('session-count'),0);assert.equal(await count('total-count'),total);
  pass('automatic tapping, tempo selection and a new round keep their existing behavior');
  const duration=await page.evaluate(async()=>{const response=await fetch('assets/niulai-tap.wav');const ctx=new AudioContext();const sound=await ctx.decodeAudioData(await response.arrayBuffer());await ctx.close();return sound.duration;});assert(Math.abs(duration-.81)<.001);
  pass('the website loads and decodes the trimmed voice');
  for(const [width,height]of [[320,568],[390,844],[844,390],[1280,800]]){
    await page.setViewportSize({width,height});const box=await page.locator('.stage').boundingBox();assert(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=height);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  pass('the existing page layout fits small phones, landscape and desktop');
  await page.screenshot({path:path.join(out,'muyu-desktop.png')});
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForTimeout(300);await page.reload();await page.locator('#bull[data-ready=true]').waitFor();
  await context.setOffline(true);await page.reload();await page.locator('#bull[data-ready=true]').waitFor();const offlineBefore=await count('session-count');await page.locator('#bull').click();assert.equal(await count('session-count'),offlineBefore+1);await context.setOffline(false);
  pass('the new drawing and player work after an offline reload');
  await context.setOffline(true);
  const audioRange=await page.evaluate(async()=>{const r=await fetch('assets/niulai-tap.wav',{headers:{Range:'bytes=0-63'}});return{status:r.status,range:r.headers.get('content-range'),type:r.headers.get('content-type'),bytes:(await r.arrayBuffer()).byteLength};});
  assert.deepEqual(audioRange,{status:206,range:'bytes 0-63/71520',type:'audio/wav',bytes:64});await context.setOffline(false);
  pass('the cached short voice serves byte ranges for mobile media playback');
  await page.goto(origin+'/download/');
  await page.getByRole('heading',{name:'总览',exact:true}).waitFor();
  assert.equal(await page.getByRole('heading',{name:'手机版',exact:true}).count(),1);
  assert.equal(await page.getByRole('heading',{name:'电脑版',exact:true}).count(),1);
  assert.equal(await page.locator('#android .android-features').count(),0);
  const grid=await page.locator('.platform-grid').boundingBox(),section=await page.locator('#features').boundingBox();assert(grid.width>=section.width*.95);
  await page.screenshot({path:path.join(out,'platforms-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert(await page.locator('.platform-grid').evaluate(element=>getComputedStyle(element).gridTemplateColumns.split(' ').length===1));
  await page.screenshot({path:path.join(out,'platforms-mobile.png'),fullPage:true});
  pass('the overview and separate phone and desktop sections fit both viewports and omit the extra installer label');
  const fallbackContext=await browser.newContext({serviceWorkers:'block'}),fallbackPage=await fallbackContext.newPage();
  await fallbackPage.route('**/assets/muyu-hq/**',route=>route.abort());await fallbackPage.goto(origin+'/');await fallbackPage.locator('#bull[data-ready=true]').waitFor();
  assert.equal(await fallbackPage.locator('#bull').getAttribute('data-quality'),'fallback256');await fallbackPage.locator('#bull').click();assert.equal(await fallbackPage.locator('#session-count').textContent(),'1');await fallbackContext.close();
  pass('failed HQ downloads retain a working fallback and all taps still count');
  assert.deepEqual(errors,[]);pass('no website player runtime errors');
  await fs.writeFile(path.join(out,'verification.json'),JSON.stringify({origin,checks,errors,scope:'Headless Edge with 2x DPR. Website layout, settings and cumulative storage retained. No real feedback submitted.'},null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
