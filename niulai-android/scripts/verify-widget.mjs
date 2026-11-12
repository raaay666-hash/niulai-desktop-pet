import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const cli='D:/Program Files/Netease/MuMu/nx_main/mumu-cli.exe';
const info=JSON.parse(execFileSync(cli,['info','-v','2'],{encoding:'utf8',windowsHide:true}));
assert.equal(info.name,'Niulai-Android-QA');assert.equal(info.adb_port,16448);assert(info.is_android_started);
const adb=path.join(root,'.tools/android-sdk/platform-tools/adb.exe');
const run=(...args)=>execFileSync(adb,['-s','127.0.0.1:16448',...args],{encoding:'utf8',windowsHide:true,timeout:25000,maxBuffer:12000000});
const sh=(...args)=>run('shell',...args);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const out=path.join(root,'outputs/android/compat-1.3.1');
const checks=[];const pass=name=>{checks.push({name,passed:true});console.log('PASS '+name);};
function nodes(){try{sh('uiautomator','dump','/sdcard/niulai-widget-check.xml');}catch(e){if(!String(e.stdout).includes('dumped to:'))throw e;}return [...sh('cat','/sdcard/niulai-widget-check.xml').matchAll(/<node\s[^>]*>/g)].map(m=>Object.fromEntries([...m[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]])));}
const find=(ns,id)=>ns.find(n=>n['resource-id']==='art.niulai.android:id/'+id);
function tap(n){assert(n,'Widget must already be on the dedicated QA launcher');const b=n.bounds.match(/\d+/g).map(Number);sh('input','tap',String(Math.round((b[0]+b[2])/2)),String(Math.round((b[1]+b[3])/2)));}
function shot(name){fs.writeFileSync(path.join(out,name+'.png'),execFileSync(adb,['-s','127.0.0.1:16448','exec-out','screencap','-p'],{windowsHide:true,timeout:25000,maxBuffer:12000000}));}
sh('input','keyevent','3');await wait(500);let ns=nodes();
for(let i=0;i<4&&find(ns,'widget_scene')?.text!=='牛来 · 桌宠';i++){tap(find(ns,'widget_next'));await wait(200);ns=nodes();}
const titles=['牛来 · 桌宠','牛来 · 行情','牛来 · 持仓','牛来 · 木鱼'];
for(let i=0;i<4;i++){
  assert.equal(find(ns,'widget_scene')?.text,titles[i]);assert.match(find(ns,'widget_time')?.text||'',i===3?/轻触.*数字/:/快照.*点开刷新/);
  if(i===2){assert.equal(find(ns,'widget_value')?.text,'••••');shot('android15-widget-private');}
  if(i===3){const before=Number(find(ns,'widget_value').text);tap(find(ns,'widget_value'));await wait(700);ns=nodes();assert.equal(Number(find(ns,'widget_value').text),before+1);shot('android15-widget-muyu');}
  tap(find(ns,'widget_next'));await wait(200);ns=nodes();
}
pass('all four native widget scenes switch and preserve the snapshot label');
pass('holdings are hidden by default and the wooden-fish page increments the shared counter');
shot('android15-widget');
const rootNode=find(ns,'widget_root');assert(rootNode,'Widget root');const bounds=rootNode.bounds.match(/\d+/g).map(Number);
const x=bounds[2]-35,y=bounds[3]-30;
function luminance(name){const file=path.join(out,name+'.png').replaceAll("'","''");const command="Add-Type -AssemblyName System.Drawing; $img=[System.Drawing.Bitmap]::new('"+file+"'); try { $p=$img.GetPixel("+x+","+y+"); Write-Output (($p.R+$p.G+$p.B)/3) } finally { $img.Dispose() }";return Number(execFileSync('powershell.exe',['-NoProfile','-Command',command],{encoding:'utf8',windowsHide:true}));}
sh('am','kill','art.niulai.android');
const themeTimings=[];
for(const mode of ['no','yes','no']){
  const started=Date.now();sh('cmd','uimode','night',mode);let value;
  do{await wait(500);shot('widget-theme-'+mode);value=luminance('widget-theme-'+mode);if(mode==='yes'?value<90:value>180)break;}while(Date.now()-started<12000);
  assert(mode==='yes'?value<90:value>180,'System theme '+mode+' pixel '+value);themeTimings.push({mode,milliseconds:Date.now()-started,pixel:value});
}
pass('native launcher widget follows system light-dark-light with the application background process ended');
tap(find(ns,'widget_value'));await wait(700);
assert.match(sh('dumpsys','activity','activities'),/topResumedActivity=.*art\.niulai\.android/);
pass('tapping the native widget opens the application');
const local=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'release/android/Niulai-Android-1.3.1.apk'))).digest('hex');
const installed=sh('pm','path','art.niulai.android').trim().split('\n')[0].replace('package:','').trim();
assert.match(installed,/^\/data\/app\/[A-Za-z0-9_/=+~.-]+\/base\.apk$/);assert.equal(sh('sha256sum',installed).split(/\s+/)[0],local);
pass('installed widget build matches the final APK');
fs.writeFileSync(path.join(out,'widget-verification.json'),JSON.stringify({checkedAt:new Date().toISOString(),checks,themeTimings,installedApkSha256:local,scope:'Dedicated MuMu Android 15 QA launcher, not an OEM cover screen.'},null,2));
