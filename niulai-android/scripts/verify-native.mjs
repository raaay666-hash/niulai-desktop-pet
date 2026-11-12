import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const adb=path.join(root,'.tools/android-sdk/platform-tools/adb.exe');
const serial=process.env.NIULAI_QA_SERIAL;
if(serial!=='127.0.0.1:16448')throw new Error('This script operates only on the dedicated Niulai QA emulator; set NIULAI_QA_SERIAL=127.0.0.1:16448 after checking the device.');
const call=(...args)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',windowsHide:true,timeout:20000});
const shell=(...args)=>call('shell',...args);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const output=path.join(root,'outputs/android');await fs.mkdir(output,{recursive:true});
const checks=[];const pass=name=>{checks.push({name,passed:true});console.log('PASS '+name);};
function overlay(){const dump=shell('dumpsys','window','windows');return dump.split(/\n\s*Window #\d+/).find(s=>s.includes('u0 Niulai 2D Pet}'))||'';}
function frame(){const block=overlay();const m=block.match(/\bframe=\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/);assert(m,'Desktop pet window is required; start it from the app first.');const [l,t,r,b]=m.slice(1).map(Number);return {l,t,r,b,w:r-l,h:b-t};}
function tap(x,y){shell('input','tap',String(Math.round(x)),String(Math.round(y)));}
async function shot(name){shell('screencap','-p','/sdcard/niulai-native.png');call('pull','/sdcard/niulai-native.png',path.join(output,name));}
const info=shell('getprop','ro.build.version.release').trim();assert.equal(info,'15');
assert.match(shell('dumpsys','activity','services','art.niulai.android'),/isForeground=true/);
let f=frame();assert(f.w<1000&&f.h<1000);assert.match(overlay(),/NOT_FOCUSABLE NOT_TOUCH_MODAL/);
pass('Android 15 runs a foreground desktop pet in a small non-focusable overlay');
await shot('android15-desktop-pet.png');
let density=f.w/174;
tap(f.r-49*density,f.t+14*density);await wait(450);
let collapsed=frame();assert(collapsed.w<f.w*.65);await shot('android15-pet-collapsed.png');
tap(collapsed.r-12.5*density,collapsed.t+12*density);await wait(400);assert.equal(frame().w,f.w);
pass('collapse shrinks the native touch window and expand restores it');
f=frame();shell('input','swipe',String(Math.round(f.l+f.w/2)),String(Math.round(f.t+f.h*.72)),String(Math.round(f.l+f.w/2+200)),String(Math.round(f.t+f.h*.72+80)),'500');await wait(350);
const moved=frame();assert(moved.l!==f.l||moved.t!==f.t);pass('dragging moves the actual overlay window');
shell('input','keyevent','223');await wait(400);assert.match(overlay(),/mViewVisibility=0x4/);
shell('input','keyevent','224');shell('wm','dismiss-keyguard');await wait(550);assert.match(overlay(),/mViewVisibility=0x0/);
pass('screen off hides the pet and unlocking restores it');
shell('monkey','-p','com.android.gallery3d','-c','android.intent.category.LAUNCHER','1');await wait(1800);assert.match(overlay(),/mViewVisibility=0x0/);await shot('android15-pet-over-gallery.png');
pass('desktop pet remains visible above another app');
f=frame();density=f.w/174;tap(f.r-18*density,f.t+14*density);await wait(1200);assert.equal(overlay(),'');
assert.doesNotMatch(shell('dumpsys','activity','services','art.niulai.android'),/\.PetService c:/);
pass('close control removes the overlay and foreground service');
shell('input','keyevent','3');await wait(500);
function xml(){shell('rm','-f','/sdcard/niulai-native-ui.xml');try{shell('uiautomator','dump','/sdcard/niulai-native-ui.xml');}catch(e){if(!String(e.stdout).includes('dumped to:'))throw e;}const raw=shell('cat','/sdcard/niulai-native-ui.xml');assert(raw.startsWith('<?xml'),'Fresh UI hierarchy is required');return raw;}
let ui=xml();
if(!ui.includes('widget_next')){shell('input','swipe','2000','600','600','600','450');await wait(400);ui=xml();}
function nodeBounds(resource){const node=ui.match(new RegExp('<node[^>]*resource-id="art\\.niulai\\.android:id/'+resource+'"[^>]*>'));assert(node,'Widget node '+resource+' must be present on the dedicated QA launcher.');const m=node[0].match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);return m.slice(1).map(Number);}
function clickNode(resource){const [l,t,r,b]=nodeBounds(resource);tap((l+r)/2,(t+b)/2);}
// Move deterministically to the holdings scene, regardless of the last selected card.
for(let i=0;i<4&&!ui.includes('我的持仓');i++){clickNode('widget_next');await wait(250);ui=xml();}
assert(ui.includes('我的持仓'));assert(ui.includes('••••'));await shot('android15-widget-private.png');
pass('native launcher widget switches scenes and masks position amounts by default');
clickNode('widget_value');await wait(650);assert.match(shell('dumpsys','activity','activities'),/topResumedActivity=.*art\.niulai\.android/);
pass('tapping the widget opens the app for a fresh quote');
const logs=call('logcat','-d','-s','NiulaiPet:I','AndroidRuntime:E','NiulaiWidget:E');assert(!logs.includes('FATAL EXCEPTION'));assert(!logs.includes('Widget update failed'));
await fs.writeFile(path.join(output,'native-verification.json'),JSON.stringify({checkedAt:new Date().toISOString(),serial,android:info,checks,logs,scope:'Dedicated new MuMu Android 15 QA instance, not Xiaomi/Huawei physical hardware. Overlay and notification permissions were granted only inside this test instance.'},null,2));
