import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {FramePlayer,animation} from '../web/frame-player.mjs';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const classes=path.join(project,'build/frame-test');fs.mkdirSync(classes,{recursive:true});
const sources=['app/src/main/java/art/niulai/android/FramePlayer.java','app/src/main/java/art/niulai/android/IslandGeometry.java','tests/FrameHarness.java','tests/IslandGeometryHarness.java'];
const build=spawnSync('javac',['-encoding','UTF-8','--release','8','-d',classes,...sources.map(p=>path.join(project,p))],{encoding:'utf8',windowsHide:true});assert.equal(build.status,0,build.stderr);
function java(name,rows){const result=spawnSync('java',['-cp',classes,'art.niulai.android.'+name],{input:rows.join('\n')+'\n',encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);return result.stdout.trim().split(/\r?\n/);}

test('native HQ reaches every interpolated frame and preserves its pose during suspension',()=>{
 const commands=['state idle 2400 1600 0 1'];
 for(let frame=0;frame<144;frame++)commands.push(`hq ${Math.ceil(frame*2400/144)} 1 144`);
 commands.push('pause 1 1200','hq 6000 1 144','pause 0 6000','hq 6000 1 144','hq 6100 0 144');
 assert.deepEqual(java('FrameHarness',commands),[...Array.from({length:144},(_,i)=>String(i)),'72','72','0']);
});

test('native and web choose the same full drawings, pauses and burst recovery',()=>{
 const p=new FramePlayer(),commands=[],expected=[];
 for(const [index,[id,clip]]of Object.entries(animation.clips).entries()){
  const now=index*10000,spec=animation.sheets[clip.sheet];p.state(id,now,true);commands.push(`state ${id} ${spec.duration} ${clip.rest} ${now} 1`);
  for(let t=0;t<4500;t+=17){if(id==='muyu'&&t<2300&&t%51===0){p.state(id,now+t,true);commands.push(`state ${id} ${spec.duration} ${clip.rest} ${now+t} 1`);}expected.push(String(p.frame(now+t).index));commands.push(`frame ${now+t} 1`);}
 }
 assert.deepEqual(java('FrameHarness',commands),expected);
});

test('center, corner, wide notch, landscape, fold windows and absent cutouts remain bounded',()=>{
 const cases=[
 [1080,2400,3,0,96,0,72,510,18,570,78,792,132,0,0,1],
 [1080,2400,3,0,96,0,72,60,12,156,78,792,132,0,0,1],
 [1080,2400,3,0,110,0,72,300,0,780,110,792,132,0,0,1],
 [2400,1080,3,100,72,0,72,0,480,100,600,792,132,0,0,1],
 [720,720,2,0,64,0,48,338,8,382,60,720,412,0,0,1],
 [840,512,2,0,48,0,48,'-',0,0,0,720,412,0,0,0],
 [1080,2400,3,0,96,0,72,510,18,570,78,792,132,0,0,0]
 ];
 const output=java('IslandGeometryHarness',cases.map(row=>row.join(' ')));
 for(const [i,text]of output.entries()){const [x,y,w,h,gl,gr,fused,bridge]=text.split(' ');const row=cases[i];assert(+x>=0&&+y>=0);assert(+x+(+w)<=row[0]&&+y+(+h)<=row[1]);assert(+gl>=0&&+gr>=+gl&&+gr<=+w);assert.equal(fused,row[15]&&row[7]!=='-'?'true':'false');if(i===0){assert(+y<row[4]);assert(+gl>0&&+gr<+w);assert.equal(bridge,'-');}if(i===1||i===2||i===3)assert.notEqual(bridge,'-');if(i===6)assert(+y>=row[4]);}
});
