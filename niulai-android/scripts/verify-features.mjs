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
  Promise.prototype.finally = undefined;
  Object.fromEntries = undefined;
  if (!localStorage.getItem('niulai:android:v1')) localStorage.setItem('niulai:android:v1', JSON.stringify({interval:30}));
  window.__qaDark = false;
  window.__qaFeatures = [];
  window.__qaIslandActions = [];
  window.__qaQuoteStep = 0;
  window.__qaHeldQuotes = {};
  window.__qaIsland = {sdk:35, supported:false, notifications:true, overlayPermission:true};
  const drawImage = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function(image, ...args) {
    if (this.canvas.id === 'island-mini' && image instanceof HTMLImageElement) window.__qaDrewIslandFrame = true;
    return drawImage.call(this, image, ...args);
  };
  window.NiulaiNative = {
    systemDark(){return window.__qaDark;}, appearance(){}, configurePet(){}, publishQuote(){},
    petStatus(){return 'ready';}, haptic(){},
    setOverlayEnabled(feature,enabled){
      window.__qaFeatures.push({feature,enabled});
      if (feature === 'island') {
        Object.assign(window.__qaIsland, {systemActive:false, running:enabled, floating:enabled});
        window.__niulaiIslandChanged();
      }
    },
    islandStatus(){return JSON.stringify(window.__qaIsland);},
    islandSettings(){window.__qaIslandActions.push('notification');},
    islandOverlaySettings(){window.__qaIslandActions.push('overlay');},
    cameraInteractionReady(){return false;},
    cameraInteractionSettings(){window.__qaIslandActions.push('camera');},
    previewIsland(){window.__qaIslandActions.push('preview');},
    request(id, kind, value){
      const names = {s_sh000001:'上证样例', s_sz399001:'深证样例', s_sz399006:'创业板样例', s_sh600519:'贵州茅台', s_sh601318:'中国平安'};
      const responses = kind === 'quote' ? value.split(',').map((code, index) =>
        `var hq_str_${code}="${names[code]},${100 + 100 * index + window.__qaQuoteStep},1,1,0,0";`).join('') : '';
      const finish = () => window.__niulaiResult(id, responses, null);
      if (kind === 'quote' && ['s_sh600519', 's_sh601318'].includes(value)) window.__qaHeldQuotes[value] = finish;
      else setTimeout(finish, 0);
    }
  };
});
const islandStatus = updates => page.evaluate(value => {
  Object.assign(window.__qaIsland, value);
  window.__niulaiIslandChanged();
}, updates);
try{
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForSelector('.pet.ready');
  await page.locator('#settings-open').click();
  await page.waitForFunction(() => window.__qaDrewIslandFrame, undefined, { timeout: 3000 });
  pass('the first Island settings opening renders an actual mascot animation frame without waiting for a quote refresh');
  const backgroundFrame = await page.locator('#bull').evaluate(e => e.toDataURL());
  await page.waitForTimeout(350);
  assert.equal(await page.locator('#bull').evaluate(e => e.toDataURL()), backgroundFrame);
  for (const panel of ['pet', 'muyu', 'widget', 'general', 'about', 'island']) {
    await page.locator(`[data-settings=${panel}]`).click();
    assert.equal(await page.locator('[data-settings-panel]:visible').count(), 1);
  }
  pass('settings categories switch independently and pause the obscured bull');
  assert(await page.locator('#preview-island').isDisabled());
  await page.locator('#islandEnabled').check();
  assert.equal(await page.locator('#islandEnabled').isChecked(),true);
  assert.deepEqual(await page.evaluate(()=>window.__qaFeatures.at(-1)),{feature:'island',enabled:true});
  await page.locator('#preview-island').click();
  assert.equal(await page.evaluate(()=>window.__qaIslandActions.at(-1)), 'preview');
  await page.screenshot({path:path.join(output,'island-quote.png'), animations:'disabled'});
  pass('island master switch reaches the native feature bridge');

  await page.locator('#islandSymbol').selectOption('s_sz399001');
  assert.equal(await page.locator('#island-demo-name').textContent(), '深证样例');
  assert.equal(await page.locator('#island-demo-value').textContent(), '200.00');
  await page.locator('#islandStyle').selectOption('trend');
  assert(await page.locator('#island-demo-chart').isHidden());
  await page.locator('#settings-dialog .close-dialog').click();
  await page.evaluate(() => { window.__qaQuoteStep = 2; });
  await page.locator('#refresh').click();
  await page.waitForFunction(() => document.getElementById('price').textContent === '102.00');
  await page.locator('#settings-open').click();
  assert(await page.locator('#island-demo-chart').isVisible());
  assert.equal(await page.locator('#island-demo-value').textContent(), '202.00');
  await page.screenshot({path:path.join(output,'island-settings.png'), animations:'disabled'});
  pass('the pinned stock supplies the preview values and two real samples supply the trend');

  await page.locator('#islandStyle').selectOption('minimal');
  assert(await page.locator('.island-demo.minimal').isVisible());
  assert(await page.locator('#island-mini').isHidden());
  assert(await page.locator('#island-demo-chart').isHidden());
  assert.equal(await page.locator('#island-demo-name').textContent(), 'sz399001');
  await page.locator('#islandPrice').uncheck();
  await page.locator('#islandPercent').uncheck();
  assert(await page.locator('#island-demo-value').isHidden());
  assert(await page.locator('#island-demo-percent').isHidden());
  await page.locator('#islandPrice').check();
  await page.locator('#islandPercent').check();
  await page.locator('#islandTheme').selectOption('light');
  assert(await page.locator('.island-demo.light').isVisible());
  await page.locator('#settings-dialog').evaluate(dialog => { dialog.scrollTop = 0; });
  await page.screenshot({path:path.join(output,'island-minimal.png'), animations:'disabled'});
  await page.locator('#islandContent').selectOption('muyu');
  assert(await page.locator('#island-market-settings').isHidden());
  assert(await page.locator('#islandStyle').isHidden());
  assert.equal(await page.locator('#island-demo-value').textContent(), '本轮 0');
  await page.locator('#islandCount').uncheck();
  assert.equal(await page.locator('#island-demo-value').textContent(), '轻触敲击');
  assert(await page.locator('#island-demo-percent').isHidden());
  await page.locator('#island-position-settings summary').click();
  await page.locator('#islandWidth').fill('320');
  assert.equal(await page.locator('.island-demo').evaluate(node => node.style.width), '320px');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('niulai:android:v1')).islandWidth), 320);
  pass('preview reflects minimal layout, theme, visible values, width and wood-count preference');

  await page.locator('#islandContent').selectOption('market');
  await page.locator('#islandMode').selectOption('system');
  await islandStatus({sdk:36, supported:true, promotionAllowed:true, systemActive:true, floating:false, promoted:true});
  assert.match(await page.locator('#island-system-status').textContent(), /系统已提升/);
  assert.match(await page.locator('#preview-island').textContent(), /系统实时通知/);
  assert(await page.locator('#islandStyle').isHidden());
  assert(await page.locator('#islandPlacement').isHidden());
  await page.locator('#island-notification-settings').click();
  assert.equal(await page.evaluate(() => window.__qaIslandActions.at(-1)), 'notification');
  await islandStatus({promoted:false, systemActive:false, fallback:true, floating:true, overlayPermission:true});
  assert.match(await page.locator('#island-system-status').textContent(), /悬浮窗已就绪/);
  assert.match(await page.locator('#preview-island').textContent(), /悬浮窗/);
  assert(await page.locator('#preview-island').isEnabled());
  assert(await page.locator('#islandStyle').isVisible());
  await page.locator('#islandPlacement').selectOption('manual');
  assert(await page.locator('#camera-manual').isVisible());
  assert(await page.locator('#camera-permission').isHidden());
  await page.locator('#islandCameraInteraction').check();
  await page.locator('#camera-permission').click();
  assert.equal(await page.evaluate(() => window.__qaIslandActions.at(-1)), 'camera');
  await page.screenshot({path:path.join(output,'island-camera.png'), animations:'disabled'});
  await islandStatus({overlayPermission:false, floating:false, notifications:false});
  assert.match(await page.locator('#island-system-status').textContent(), /行情通知权限未开启.*需要授权/);
  assert(await page.locator('#preview-island').isDisabled());
  assert(await page.locator('#islandEnabled').isChecked());
  await page.locator('#settings-dialog').evaluate(dialog => { dialog.scrollTop = 0; });
  await page.screenshot({path:path.join(output,'island-fallback.png'), animations:'disabled'});
  await page.locator('#island-overlay-settings').click();
  assert.equal(await page.evaluate(() => window.__qaIslandActions.at(-1)), 'overlay');
  await islandStatus({overlayPermission:true, floating:true});
  await page.locator('#islandEnabled').uncheck();
  assert(await page.locator('#preview-island').isDisabled());
  assert.match(await page.locator('#island-system-status').textContent(), /已关闭/);
  pass('system promotion, floating fallback and permission revocation update the available controls and preview');

  await page.locator('#islandMode').selectOption('floating');
  await page.locator('#settings-dialog .close-dialog').click();
  await page.locator('[data-tab=watchlist]').click();
  await page.getByRole('button', {name:'移出 深证样例'}).click();
  await page.locator('#settings-open').click();
  assert.equal(await page.locator('#islandSymbol').inputValue(), '');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('niulai:android:v1')).islandSymbol), '');
  pass('removing the pinned stock restores following the current watch selection');
  await page.locator('#settings-dialog .close-dialog').click();

  await page.getByRole('button', {name:'添加自选'}).click();
  const search = page.locator('#search-dialog');
  const query = search.locator('#search-input');
  const button = search.getByRole('button', {name:'搜索', exact:true});
  await query.fill('600519');
  await search.getByRole('button', {name:/验证并添加/}).click();
  await page.waitForFunction(() => Boolean(window.__qaHeldQuotes.s_sh600519));
  assert(await button.isDisabled());
  await query.fill('601318');
  assert(await button.isEnabled());
  await search.getByRole('button', {name:/验证并添加/}).click();
  await page.waitForFunction(() => Boolean(window.__qaHeldQuotes.s_sh601318));
  await page.evaluate(() => window.__qaHeldQuotes.s_sh600519());
  assert(await button.isDisabled());
  await page.evaluate(() => window.__qaHeldQuotes.s_sh601318());
  await search.waitFor({state:'hidden'});
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('niulai:android:v1')).stocks.map(stock => stock.code));
  assert(saved.includes('s_sh601318'));
  assert(!saved.includes('s_sh600519'));
  pass('retyping a quote validation starts the new search and discards the earlier reply');

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
