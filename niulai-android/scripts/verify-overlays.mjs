import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {connectQaWebView} from '../tests/cdp-client.mjs';
const root=process.cwd(),serial='emulator-5582',adb=path.join(root,'.tools/android-sdk/platform-tools/adb.exe');
const out=path.join(root,'outputs/android/compat-1.3.2/overlays');fs.mkdirSync(out,{recursive:true});
const sh=(...args)=>execFileSync(adb,['-s',serial,'shell',...args],{encoding:'utf8',windowsHide:true,timeout:25000,maxBuffer:12000000});
assert.match(execFileSync(adb,['-s',serial,'emu','avd','name'],{encoding:'utf8',windowsHide:true}),/Niulai_API_36/);
const wait=ms=>new Promise(r=>setTimeout(r,ms)),checks=[];
const pass=name=>{checks.push({name,passed:true});console.log('PASS '+name);};
const c=await connectQaWebView();
const ui=expression=>c.evaluate(expression);
async function click(id){await ui(`document.getElementById('${id}').click()`);await wait(150);}
async function select(id,value){await ui(`(()=>{const e=document.getElementById('${id}');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);await wait(250);}
async function checkbox(id,value){
 await ui(`(()=>{const e=document.getElementById('${id}');if(e.checked!==${value})e.click();})()`);await wait(500);
 assert.equal(await ui(`document.getElementById('${id}').checked`),value,id);
}

function windowRecord(title){return sh('dumpsys','window','windows').split(/\n\s*Window #\d+/).find(s=>s.includes('u0 '+title+'}'))||'';}
function frame(title){const w=windowRecord(title),m=w.match(/\bframe=\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/)||w.match(/mFrame=\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/);assert(m,'Window bounds '+title);const[l,t,r,b]=m.slice(1).map(Number);return{l,t,r,b,w:r-l,h:b-t};}
async function until(fn,label){for(let i=0;i<40;i++){if(fn())return;await wait(250);}throw Error('Timeout '+label);}
function tap(x,y){sh('input','tap',String(Math.round(x)),String(Math.round(y)));}
function shot(name){fs.writeFileSync(path.join(out,name+'.png'),execFileSync(adb,['-s',serial,'exec-out','screencap','-p'],{windowsHide:true,timeout:25000,maxBuffer:12000000}));}
async function app(){sh('am','start','-n','art.niulai.android/.MainActivity');await wait(800);}
async function settings(panel){if(!await ui(`document.getElementById('settings-dialog').open`))await click('settings-open');await ui(`document.querySelector('[data-settings=${panel}]').click()`);await wait(150);}
const state=()=>ui('JSON.parse(NiulaiNative.restoreAppState())');
try{
 await app();await ui(`for(const d of document.querySelectorAll('dialog[open]'))d.close()`);await settings('island');await checkbox('islandHideInApp',true);await checkbox('islandCameraInteraction',false);await select('islandPlacement','below');await select('islandContent','market');await checkbox('islandEnabled',false);await checkbox('islandEnabled',true);
 assert.equal((await state()).islandEnabled,true);
 await ui(`document.getElementById('settings-dialog').scrollTop=0`);await wait(200);shot('settings-island');
 await until(()=>windowRecord('Niulai Quote Island'),'native island attached');
 assert(/mViewVisibility=0x4/.test(windowRecord('Niulai Quote Island')));
 sh('input','keyevent','3');await wait(800);
 await until(()=>/mViewVisibility=0x0/.test(windowRecord('Niulai Quote Island')),'island visible on desktop');
 const small=frame('Niulai Quote Island');assert(small.w>300&&small.h===66);
 shot('island-compact');pass('ordinary settings switch opens a native island and application visibility hides it');
 tap(small.l+small.w/2,small.t+small.h/2);await wait(400);
 const large=frame('Niulai Quote Island');assert(large.h>small.h*3);shot('island-expanded');
 const initial=await state();const symbol=initial.islandSymbol||initial.selected;tap(large.l+large.w*.36,large.b-39);await wait(800);
 assert.notEqual((await state()).islandSymbol,symbol);
 const changed=frame('Niulai Quote Island');tap(changed.r-45,changed.b-39);await wait(400);
 assert.equal(frame('Niulai Quote Island').h,small.h);pass('island expands, switches the watched stock and collapses');
 await app();await settings('pet');await checkbox('petEnabled',true);await until(()=>windowRecord('Niulai 2D Pet'),'pet attached');
 await settings('island');await checkbox('islandEnabled',false);
 assert(windowRecord('Niulai 2D Pet'));assert(!windowRecord('Niulai Quote Island'));pass('pet and island can be enabled and disabled independently');
 await settings('pet');await select('petMode','muyu');await settings('island');await select('islandContent','muyu');await checkbox('islandEnabled',true);
 const before=await ui('JSON.parse(NiulaiNative.muyuCounts())');
 await ui(`document.getElementById('settings-dialog').close();document.querySelector('[data-tab=muyu]').click()`);await click('wood-tap');assert.equal((await ui('JSON.parse(NiulaiNative.muyuCounts())')).total,before.total+1,'application tap');
 sh('input','keyevent','3');await wait(600);const pet=frame('Niulai 2D Pet'),island=frame('Niulai Quote Island');
 tap(pet.l+pet.w*.5,pet.t+pet.h*.75);await wait(180);
 assert.equal((await ui('JSON.parse(NiulaiNative.muyuCounts())')).total,before.total+2,'pet tap');
 tap(island.l+island.w*.45,island.t+island.h*.5);await wait(180);shot('muyu-floating');
 const after=await ui('JSON.parse(NiulaiNative.muyuCounts())');assert.equal(after.total,before.total+3);assert.equal(after.session,before.session+3);
 pass('application, floating bull and island taps share the same persistent counter');
 sh('input','keyevent','223');await until(()=>/mViewVisibility=0x4/.test(windowRecord('Niulai Quote Island')),'screen off');
 sh('input','keyevent','224');sh('wm','dismiss-keyguard');await until(()=>/mViewVisibility=0x0/.test(windowRecord('Niulai Quote Island')),'unlock');
 pass('screen off and unlock pause and restore both overlay surfaces');
 await app();await settings('pet');await checkbox('petEnabled',false);await settings('island');await checkbox('islandEnabled',false);
 await until(()=>!windowRecord('Niulai Quote Island')&&!windowRecord('Niulai 2D Pet'),'both closed');
 assert(!sh('dumpsys','activity','services','art.niulai.android').includes('isForeground=true'));pass('closing both features removes the windows and foreground service');
 const runtime=sh('logcat','-d','-s','AndroidRuntime:E','NiulaiPet:E','NiulaiWidget:E');assert(!runtime.includes('FATAL EXCEPTION')&&!runtime.includes('configuration failed'));
 const local=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'release/android/Niulai-Android-1.3.2.apk'))).digest('hex');
 const installed=sh('pm','path','art.niulai.android').trim().replace('package:','');assert.equal(sh('sha256sum',installed).split(/\s+/)[0],local);
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({checkedAt:new Date().toISOString(),checks,installedApkSha256:local,scope:'Dedicated Android 16 SDK emulator with production APK and test-only WebView inspector.'},null,2));
}finally{c.close();}
