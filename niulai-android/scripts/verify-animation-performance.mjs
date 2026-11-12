import fs from 'node:fs/promises';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import{fileURLToPath}from'node:url';import{chromium}from'playwright';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),root=path.resolve(project,'..'),web=path.join(project,'build/web'),out=path.join(root,'outputs/android/compat-1.3.2/performance');await fs.mkdir(out,{recursive:true});
const server=http.createServer(async(req,res)=>{const name=new URL(req.url,'http://localhost').pathname,file=path.resolve(web,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(web+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.wav':'audio/wav'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
 window.__qaDraws={};const clear=CanvasRenderingContext2D.prototype.clearRect;
 CanvasRenderingContext2D.prototype.clearRect=function(...args){const id=this.canvas.id;if(id){const times=window.__qaDraws[id]||(window.__qaDraws[id]=[]);times.push(performance.now());if(times.length>600)times.shift();}return clear.apply(this,args);};
 localStorage.setItem('niulai:android:v1',JSON.stringify({smartScene:false,scene:0}));
 window.NiulaiNative={appearance(){},configurePet(){},publishQuote(){},petStatus(){return'ready';},haptic(){},request(id,kind,value){setTimeout(()=>window.__niulaiResult(id,value.split(',').map(code=>`var hq_str_${code}="帧率测试,100,0,0.5,0,0";`).join(''),null),10);}};
});
async function measure(id){
 await page.waitForTimeout(500);const start=await page.evaluate(()=>performance.now());await page.waitForTimeout(3500);
 const times=await page.evaluate(({id,start})=>(window.__qaDraws[id]||[]).filter(n=>n>=start),{id,start});assert(times.length>2);
 const gaps=times.slice(1).map((t,i)=>t-times[i]).sort((a,b)=>a-b),fps=(times.length-1)*1000/(times.at(-1)-times[0]);
 return{id,fps:Number(fps.toFixed(1)),medianMs:Number(gaps[Math.floor(gaps.length*.5)].toFixed(2)),p95Ms:Number(gaps[Math.floor(gaps.length*.95)].toFixed(2)),frames:times.length};
}
try{
 await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForSelector('.pet.ready');const samples=[];
 samples.push(await measure('bull'));
 await page.locator('[data-tab=muyu]').click();samples.push(await measure('wood-canvas'));
 for(let i=0;i<12;i++){await page.locator('#wood-tap').click();await page.waitForTimeout(80);}assert.equal(await page.locator('#wood-count').textContent(),'12');
 await page.locator('#wood-tap').click();assert.equal(await page.locator('.wood-pulse').last().textContent(),'牛气➕1 📈');
 await page.waitForTimeout(850);const settled=await page.locator('#wood-canvas').evaluate(c=>c.toDataURL());await page.waitForTimeout(200);assert.equal(await page.locator('#wood-canvas').evaluate(c=>c.toDataURL()),settled,'A single stroke returns to rest');
 const before=Number((await page.locator('#wood-count').textContent()).replaceAll(',',''));await page.evaluate(()=>{for(let i=0;i<100;i++)document.getElementById('wood-tap').click();});assert.equal(Number((await page.locator('#wood-count').textContent()).replaceAll(',','')),before+100);
 await page.waitForTimeout(900);const burstEnd=await page.locator('#wood-canvas').evaluate(c=>c.toDataURL());await page.waitForTimeout(200);assert.equal(await page.locator('#wood-canvas').evaluate(c=>c.toDataURL()),burstEnd,'Rapid taps settle without an unbounded queue');
 await page.screenshot({path:path.join(out,'muyu.png')});
 await page.locator('[data-tab=home]').click();await page.locator('[data-action=gallery]').click();await page.locator('[data-motion=clap]').click();await page.evaluate(()=>document.getElementById('motion-dialog').scrollTop=0);samples.push(await measure('motion-canvas'));
 await page.locator('#motion-dialog .close-dialog').click();await page.locator('#settings-open').click();samples.push(await measure('island-mini'));
 assert(samples.slice(0,3).every(s=>s.fps>=50),'Full-size frame animation should draw at least 50 FPS in this QA browser');assert(samples[3].fps>=25);assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,'verification.json'),JSON.stringify({checkedAt:new Date().toISOString(),samples,errors,scope:'Actual Canvas drawing in headless Edge at 390x844 and DPR 2. Target-device display FPS is measured separately.'},null,2));console.log(JSON.stringify(samples,null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
