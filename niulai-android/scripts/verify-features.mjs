import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.resolve(project,'..'),web=path.join(project,'build/web');
const output=path.join(root,'outputs/android/compat-1.3.2/features');await fs.mkdir(output,{recursive:true});
const server=http.createServer(async(req,res)=>{const name=new URL(req.url,'http://localhost').pathname,file=path.resolve(web,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(web+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.wav':'audio/wav'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
const errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
const pass=name=>{checks.push({name,passed:true});console.log('PASS '+name);};
await page.addInitScript(()=>{
  window.__qaDark=false;window.__qaFeatures=[];
  window.NiulaiNative={systemDark(){return window.__qaDark;},appearance(){},configurePet(){},publishQuote(){},petStatus(){return'ready';},haptic(){},setOverlayEnabled(feature,enabled){window.__qaFeatures.push({feature,enabled});},previewIsland(){window.__qaPreview=true;},request(id,kind,value){setTimeout(()=>window.__niulaiResult(id,value.split(',').map(code=>`var hq_str_${code}="状态测试,100,1,1,0,0";`).join(''),null),0);}};
});
try{
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForSelector('.pet.ready');
  await page.locator('#settings-open').click();
  const backgroundFrame = await page.locator('#bull').evaluate(e => e.toDataURL());
  await page.waitForTimeout(350);
  assert.equal(await page.locator('#bull').evaluate(e => e.toDataURL()), backgroundFrame);
  for (const panel of ['pet', 'muyu', 'widget', 'general', 'about', 'island']) {
    await page.locator(`[data-settings=${panel}]`).click();
    assert.equal(await page.locator('[data-settings-panel]:visible').count(), 1);
  }
  pass('settings categories switch independently and pause the obscured bull');
  await page.locator('#islandEnabled').check();
  console.log('enabled?',await page.locator('#islandEnabled').isChecked(),await page.evaluate(()=>window.__qaFeatures));
  assert.equal(await page.locator('#islandEnabled').isChecked(),true);
  assert.deepEqual(await page.evaluate(()=>window.__qaFeatures.at(-1)),{feature:'island',enabled:true});
  pass('island master switch reaches the native feature bridge');
  await page.locator('#preview-island').click();assert.equal(await page.evaluate(()=>window.__qaPreview),true);
  await page.locator('#islandContent').selectOption('muyu');assert.equal(await page.locator('#island-market-settings').isVisible(),false);
  await page.locator('#islandWidth').fill('320');await page.locator('#islandWidth').dispatchEvent('change');
  await page.screenshot({path:path.join(output,'island-settings.png')});
  pass('island content and width controls persist and update the preview');
  await page.locator('#settings-dialog .close-dialog').click();
  await page.locator('[data-tab=muyu]').click();
  for(let i=0;i<5;i++)await page.locator('#wood-tap').click();
  assert.equal(await page.locator('#wood-count').textContent(),'5');
  await page.reload();await page.waitForSelector('.pet.ready');await page.locator('[data-tab=muyu]').click();assert.equal(await page.locator('#wood-count').textContent(),'5');
  await page.locator('#wood-round').click();assert.equal(await page.locator('#wood-count').textContent(),'0');assert.equal(await page.locator('#wood-total').textContent(),'5');
  await page.screenshot({path:path.join(output,'muyu.png')});
  pass('wood taps survive restart and a new round preserves the total');
  await page.evaluate(()=>{window.__qaDark=true;window.__niulaiSystemTheme();});
  assert(await page.locator('html').evaluate(e=>e.classList.contains('dark')));
  await page.screenshot({path:path.join(output,'muyu-dark.png')});
  pass('native system appearance overrides a WebView light media query');
  await page.locator('#settings-open').click();
  for(const [width,height]of [[280,512],[390,844],[844,390],[1000,760]]){
    await page.setViewportSize({width,height});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert(await page.locator('#settings-dialog').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;}));
  }
  pass('expanded settings remain usable in narrow and landscape windows');
  assert.deepEqual(errors,[]);pass('no feature settings or counter runtime errors');
  await fs.writeFile(path.join(output,'verification.json'),JSON.stringify({checkedAt:new Date().toISOString(),checks,errors,scope:'Bundled web assets with a test native bridge and deterministic test quotes.'},null,2));
}finally{console.log('runtime errors',errors);await browser.close();await new Promise(r=>server.close(r));}
