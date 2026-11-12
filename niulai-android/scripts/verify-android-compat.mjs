import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const serial=process.env.NIULAI_QA_SERIAL;
if(!['emulator-5578','emulator-5582','emulator-5584','127.0.0.1:16448'].includes(serial))throw Error('Use only a dedicated Niulai QA emulator.');
const adb=path.join(root,'.tools/android-sdk/platform-tools/adb.exe');
const run=(...args)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',timeout:30000,windowsHide:true});
const sh=(...args)=>run('shell',...args);
if(serial.startsWith('emulator-'))assert.match(run('emu','avd','name'),/Niulai_API_(26|36)/);
else {const info=JSON.parse(execFileSync('D:/Program Files/Netease/MuMu/nx_main/mumu-cli.exe',['info','-v','2'],{encoding:'utf8',windowsHide:true,timeout:20000}));assert.equal(info.name,'Niulai-Android-QA');assert.equal(info.adb_port,16448);assert.equal(info.is_android_started,true);}
const api=Number(sh('getprop','ro.build.version.sdk').trim());
const out=path.join(root,'outputs/android/compat-1.3.2',serial.replace(':','-'));fs.mkdirSync(out,{recursive:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,limit=15000){const end=Date.now()+limit;while(Date.now()<end){const value=fn();if(value)return value;await wait(300);}throw Error('Timeout: '+label);}
function dump(){sh('rm','-f','/sdcard/niulai-test.xml');try{sh('uiautomator','dump','/sdcard/niulai-test.xml');}catch(e){if(!String(e.stdout).includes('dumped to:'))throw e;}return sh('cat','/sdcard/niulai-test.xml');}
function nodes(xml){return [...xml.matchAll(/<node\s[^>]*>/g)].map(m=>Object.fromEntries([...m[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]])));}
function tapNode(n){assert(n,'Required UI node');const b=n.bounds.match(/\d+/g).map(Number);sh('input','tap',String(Math.round((b[0]+b[2])/2)),String(Math.round((b[1]+b[3])/2)));}
function petWindow(){return sh('dumpsys','window','windows').split(/\n\s*Window #\d+/).find(s=>s.includes('u0 Niulai 2D Pet}'))||'';}
function frame(){const w=petWindow(),m=w.match(/\bframe=\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/)||w.match(/mFrame=\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/);assert(m,'Pet window has bounds');const [l,t,r,b]=m.slice(1).map(Number);return{l,t,r,b,w:r-l,h:b-t};}
async function shot(name){const bytes=execFileSync(adb,['-s',serial,'exec-out','screencap','-p'],{timeout:30000,windowsHide:true,maxBuffer:12000000});fs.writeFileSync(path.join(out,name+'.png'),bytes);}
const checks=[];const pass=name=>{checks.push({name,passed:true});console.log('PASS '+serial+' '+name);};
const packageName='art.niulai.android';
sh('input','keyevent','224');try{sh('wm','dismiss-keyguard');}catch{sh('input','keyevent','82');}
sh('am','force-stop',packageName);sh('pm','clear',packageName);sh('appops','set',packageName,'SYSTEM_ALERT_WINDOW','ignore');
if(api>=33)try{sh('pm','revoke',packageName,'android.permission.POST_NOTIFICATIONS');}catch{}
function appLog(...tags){const pid=sh('pidof',packageName).trim().split(' ')[0];assert.match(pid,/^\d+$/);return run('logcat','-d','--pid='+pid,'-s',...tags);}
sh('am','start','-W','-n',packageName+'/.MainActivity');await wait(2400);
let log=await until(()=>{const text=appLog('NiulaiCompat:I','AndroidRuntime:E','chromium:E');return text.includes('native_ui')||text.includes('web_ready')?text:false;},'rendered interface readiness',18000);
const nativeMode=log.includes('native_ui');assert(nativeMode||log.includes('web_ready'),'A working native or web interface is required');
assert(!log.includes('FATAL EXCEPTION'));await shot('home');pass(nativeMode?'native fallback starts without a WebView provider':'complete UI starts in the installed WebView');
// The test emulators all use a 720x1280 / 240dpi viewport.
if(nativeMode)tapNode(nodes(dump()).find(n=>n.text==='开启桌宠'));else sh('input','tap','610','840');
await wait(700);let foreground=sh('dumpsys','activity','activities');assert(/Settings|settings/.test(foreground));assert(!petWindow());await shot('overlay-permission');pass('denied overlay permission opens system settings and does not start a hidden pet');
sh('appops','set',packageName,'SYSTEM_ALERT_WINDOW','allow');sh('am','start','-n',packageName+'/.MainActivity');await wait(800);
if(!petWindow()){
  const current=nodes(dump());
  if(!current.some(n=>(n['resource-id']||'').includes('permission_deny_button'))){
    if(nativeMode)tapNode(current.find(n=>n.text==='开启桌宠'));else sh('input','tap','610','840');
    await wait(700);
  }
}
if(api>=33){let ns=nodes(dump());const deny=ns.find(n=>(n['resource-id']||'').includes('permission_deny_button'));assert(deny,'Notification consent is requested on first activation');tapNode(deny);await wait(600);pass('declining notifications still permits the user-requested foreground pet');}
await until(()=>petWindow(),'pet starts after returning from permission settings');
assert.match(sh('dumpsys','activity','services',packageName),/isForeground=true/);pass('foreground service and native 2D window start on this API level');
sh('input','keyevent','3');await wait(1400);
// UIAutomator dumps the focused launcher window, not this non-focusable overlay.
// Check the actual surface/bounds and control geometry; inspect quote screenshots separately.
await until(()=>/mViewVisibility=0x0/.test(petWindow())&&/HAS_DRAWN/.test(petWindow()),'visible drawn pet surface',20000);
const resumed=sh('dumpsys','activity','activities').split('\n').filter(line=>/mResumedActivity:|topResumedActivity=/.test(line)).join('\n');assert(resumed&&!resumed.includes(packageName),'Launcher, not the main app, is resumed');
await wait(4000);await shot('desktop-pet');fs.writeFileSync(path.join(out,'desktop-pet-window.txt'),petWindow());pass('pet has a visible drawn overlay surface over the launcher');
const tap=(x,y)=>sh('input','tap',String(Math.round(x)),String(Math.round(y)));
let before=frame();let density=before.w/174;tap(before.r-49*density,before.t+14*density);await wait(350);assert(frame().w<before.w*.65);await shot('collapsed');
let compact=frame();tap(compact.r-21*density,compact.t+14*density);await wait(350);assert.equal(frame().w,before.w);pass('collapse and expand resize the native input window');
before=frame();sh('input','swipe',String(Math.round(before.l+before.w/2)),String(Math.round(before.t+before.h*.75)),String(Math.round(before.l+before.w/2+100)),String(Math.round(before.t+before.h*.75+80)),'450');await wait(300);const moved=frame();assert(before.l!==moved.l||before.t!==moved.t);assert(moved.l>=0&&moved.r<=720&&moved.b<=1280);pass('dragging stays inside the screen bounds');
sh('input','keyevent','223');await until(()=>/mViewVisibility=0x4/.test(petWindow()),'screen off hides pet');sh('input','keyevent','224');try{sh('wm','dismiss-keyguard');}catch{sh('input','keyevent','82');}await until(()=>/mViewVisibility=0x0/.test(petWindow()),'unlock restores pet');pass('screen off and unlock pause and restore the pet');
const closing=frame();tap(closing.r-18*density,closing.t+14*density);await until(()=>!petWindow(),'pet closes');assert(!sh('dumpsys','activity','services',packageName).includes('.PetService'));pass('close removes the window and foreground service');
if(nativeMode){
  sh('am','start','-W','-n',packageName+'/.MainActivity');await wait(800);let ui=nodes(dump());tapNode(ui.find(n=>n.text==='编辑'));
  ui=nodes(dump());let fields=ui.filter(n=>n.class==='android.widget.EditText');assert.equal(fields.length,2);tapNode(fields[0]);sh('input','text','3000');tapNode(fields[1]);sh('input','text','1.25');tapNode(ui.find(n=>n['resource-id']==='android:id/button1'));await wait(500);
  await until(()=>/今日.*累计/.test(dump()),'native position P&L',25000);sh('am','force-stop',packageName);sh('am','start','-W','-n',packageName+'/.MainActivity');
  await until(()=>/今日.*累计/.test(dump()),'native quote and position after restart',25000);await shot('saved-position');
  tapNode(nodes(dump()).find(n=>n.text==='编辑'));fields=nodes(dump()).filter(n=>n.class==='android.widget.EditText');assert.equal(Number(fields[0].text),3000);assert.equal(Number(fields[1].text),1.25);sh('input','keyevent','4');sh('input','keyevent','4');pass('fractional positions and P&L remain saved after a native compatibility UI restart');
}
const webview=sh('dumpsys','webviewupdate');const crash=appLog('AndroidRuntime:E','NiulaiWidget:E');assert(!crash.includes('FATAL EXCEPTION')&&!crash.includes('Widget update failed'));pass('no application or widget runtime exceptions');
const local=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'release/android/Niulai-Android-1.3.2.apk'))).digest('hex');const installed=sh('pm','path',packageName).trim().split('\n')[0].replace('package:','').trim();assert.match(installed,/^\/data\/app\/[A-Za-z0-9_/=+~.-]+\/base\.apk$/);const installedHash=sh('sha256sum',installed).split(/\s+/)[0];assert.equal(installedHash,local);
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({checkedAt:new Date().toISOString(),serial,api,nativeMode,webview,checks,installedApkSha256:local,scope:'Dedicated Niulai QA virtual device, not Xiaomi/Huawei hardware. Test-only data is cleared at startup.'},null,2));
