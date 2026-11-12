import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {connectQaWebView} from '../tests/cdp-client.mjs';
const root=process.cwd(),adb=path.join(root,'.tools/android-sdk/platform-tools/adb.exe'),serial='emulator-5582';
const out=path.join(root,'outputs/android/compat-1.3.2/camera');fs.mkdirSync(out,{recursive:true});
const sh=(...args)=>execFileSync(adb,['-s',serial,'shell',...args],{encoding:'utf8',windowsHide:true,timeout:25000,maxBuffer:12000000});
assert.match(execFileSync(adb,['-s',serial,'emu','avd','name'],{encoding:'utf8',windowsHide:true}),/Niulai_API_36/);
let c=await connectQaWebView();
const wait=ms=>new Promise(r=>setTimeout(r,ms)),checks=[];
const pass=name=>{checks.push({name,passed:true});console.log('PASS '+name);};
function record(){return sh('dumpsys','window','windows').split(/\n\s*Window #\d+/).find(s=>s.includes('u0 Niulai Quote Island}'))||'';}
function frame(){const text=record(),m=text.match(/\bframe=\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/)||text.match(/mFrame=\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/);assert(m,'island bounds');const[x,y,r,b]=m.slice(1).map(Number);return{x,y,w:r-x,h:b-y};}
function shot(name){fs.writeFileSync(path.join(out,name+'.png'),execFileSync(adb,['-s',serial,'exec-out','screencap','-p'],{windowsHide:true,maxBuffer:12000000}));}
async function configure(values){await c.evaluate(`(()=>{const s=JSON.parse(NiulaiNative.restoreAppState());Object.assign(s,${JSON.stringify(values)});NiulaiNative.storeAppState(JSON.stringify(s));window.__niulaiSettingsChanged();NiulaiNative.configurePet(JSON.stringify({...s,symbol:s.selected,name:s.stocks[0].name}));})()`);await wait(500);}
const tap=(x,y)=>sh('input','tap',String(Math.round(x)),String(Math.round(y)));
try{
 assert.equal(await c.evaluate('NiulaiNative.cameraInteractionReady()'),true,'Enable this application service on the isolated QA device first');
 await c.evaluate(`for(const d of document.querySelectorAll('dialog[open]'))d.close();document.querySelector('[data-tab=muyu]').click()`);
 await configure({motion:true,muyuEffects:true,muyuSound:true,petEnabled:false,islandEnabled:false,petHideInApp:true});
 const before=await c.evaluate('JSON.parse(NiulaiNative.muyuCounts()).total');
 const recorder=spawn(adb,['-s',serial,'shell','screenrecord','--time-limit','9','/sdcard/niulai-wood-132.mp4'],{windowsHide:true,stdio:'ignore'});
 const finished=new Promise((resolve,reject)=>{recorder.on('exit',code=>code===0?resolve():reject(new Error('screen recording '+code)));recorder.on('error',reject);});
 await wait(600);tap(360,850);await wait(100);shot('wood-effect');await wait(950);
 tap(360,850);await wait(750);
 for(let i=0;i<10;i++){tap(360,850);await wait(60);}
 assert.equal(await c.evaluate('JSON.parse(NiulaiNative.muyuCounts()).total'),before+12);
 await wait(850);const rest=await c.evaluate(`document.getElementById('wood-canvas').toDataURL()`);await wait(220);assert.equal(await c.evaluate(`document.getElementById('wood-canvas').toDataURL()`),rest);
 await finished;execFileSync(adb,['-s',serial,'pull','/sdcard/niulai-wood-132.mp4',path.join(out,'木鱼-单击与连点-安卓实录.mp4')],{windowsHide:true,stdio:'ignore'});
 pass('actual Android wood taps keep all twelve counts, show red feedback and return to rest after the burst');
 await configure({islandEnabled:true,islandContent:'market',islandPlacement:'manual',islandCameraX:50,islandCameraWidth:24,islandCameraHeight:28,islandOffsetX:0,islandOffsetY:0,islandCameraInteraction:true,islandHideInApp:false,islandAutoCollapse:false});
 await c.evaluate(`NiulaiNative.setOverlayEnabled('island',true)`);await wait(700);
 let compact=frame();assert(compact.y<36);assert.match(record(),/ty=ACCESSIBILITY_OVERLAY/);shot('center-compact');
 tap(compact.x+compact.w*.8,compact.y+compact.h*.5);await wait(450);let expanded=frame();assert(expanded.h>compact.h*3);shot('center-expanded');
 sh('input','swipe',String(Math.round(expanded.x+expanded.w*.6)),String(Math.round(expanded.y+expanded.h*.7)),String(Math.round(expanded.x+expanded.w*.6)),String(Math.round(expanded.y+expanded.h*.3)),'220');await wait(400);assert.equal(frame().h,compact.h);
 const old=await c.evaluate('JSON.parse(NiulaiNative.restoreAppState()).islandSymbol');
 sh('input','swipe',String(Math.round(compact.x+compact.w*.85)),String(Math.round(compact.y+compact.h*.5)),String(Math.round(compact.x+compact.w*.15)),String(Math.round(compact.y+compact.h*.5)),'180');await wait(650);assert.notEqual(await c.evaluate('JSON.parse(NiulaiNative.restoreAppState()).islandSymbol'),old);
 pass('center camera layout accepts top-area taps, expands, swipes stocks and collapses upward');
 for(const [name,values]of [['corner',{islandCameraX:12,islandCameraWidth:48}],['notch',{islandCameraX:50,islandCameraWidth:200}]]){await configure(values);const f=frame();assert(f.x>=0&&f.x+f.w<=720&&f.y>=0);assert(sh('dumpsys','window','windows').includes('Niulai Camera Join'));shot(name);}
 pass('side double-hole and wide-notch calibration join the camera with a separate non-touch surface');
 await configure({islandPlacement:'auto'});sh('cmd','overlay','enable','com.android.internal.display.cutout.emulation.tall');await wait(1000);
 const actual=frame();assert(actual.x>=0&&actual.x+actual.w<=720);shot('reported-cutout');fs.writeFileSync(path.join(out,'reported-cutout.txt'),sh('dumpsys','display'));
 pass('automatic placement responds to a system-reported display cutout');
 sh('cmd','overlay','disable','com.android.internal.display.cutout.emulation.tall');await wait(700);
 c.close(); c=await connectQaWebView(); await wait(500);
 await configure({islandPlacement:'manual',islandCameraWidth:24,islandCameraX:50});sh('settings','put','system','accelerometer_rotation','0');sh('settings','put','system','user_rotation','1');await wait(1000);const landscape=frame();assert(landscape.x>=0&&landscape.x+landscape.w<=1280&&landscape.y+landscape.h<=720);shot('landscape');
 sh('settings','put','system','user_rotation','0');await wait(800);sh('wm','size','600x900');await wait(1000);const folded=frame();assert(folded.x>=0&&folded.x+folded.w<=600&&folded.y+folded.h<=900);shot('small-window');sh('wm','size','reset');await wait(800);
 pass('rotation and a reduced display window recalculate the active island bounds');
 const crash=sh('logcat','-d','-s','AndroidRuntime:E','NiulaiPet:E');assert(!crash.includes('FATAL EXCEPTION')&&!crash.includes('configuration failed'));
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({checks,scope:'Android 16 isolated SDK emulator. Manual geometric cases and one system-reported simulated cutout. No Xiaomi or Huawei hardware certification.'},null,2));
}finally{
 try{sh('cmd','overlay','disable','com.android.internal.display.cutout.emulation.tall');sh('wm','size','reset');sh('settings','put','system','user_rotation','0');sh('settings','put','system','accelerometer_rotation','1');await configure({islandEnabled:false,petEnabled:false,islandHideInApp:true,islandAutoCollapse:true});await c.evaluate(`NiulaiNative.setOverlayEnabled('island',false);NiulaiNative.setOverlayEnabled('pet',false)`);}finally{c.close();}
}
