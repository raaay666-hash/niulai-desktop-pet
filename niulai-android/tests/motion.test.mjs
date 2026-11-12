import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {MarketMood,sessionPhase} from '../web/market-mood.mjs';
import {catalog} from '../web/bull-motion.mjs';
import {FramePlayer,animation} from '../web/frame-player.mjs';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const classes=path.join(project,'build/motion-test');fs.mkdirSync(classes,{recursive:true});
const compile=spawnSync('javac',['-encoding','UTF-8','--release','8','-d',classes,path.join(project,'app/src/main/java/art/niulai/android/MarketMood.java'),path.join(project,'tests/MarketMoodHarness.java')],{encoding:'utf8',windowsHide:true});assert.equal(compile.status,0,compile.stderr);
const start=Date.parse('2026-11-10T02:00:00Z');
function row(price,pct,seconds=0,extras={}){const now=start+seconds*1000;return {price,pct,now,received:now,code:'s_sh000001',valid:true,error:false,interval:10,...extras};}
function check(rows,expected){
  const m=new MarketMood();const actual=rows.map(r=>m.update(r.valid?{code:r.code,price:r.price,changePct:r.pct,received:r.received}:null,r.error,r.now,r.interval,r.code));
  const input=rows.map(r=>[r.code,r.price,r.pct,r.received,r.valid?1:0,r.error?1:0,r.now,r.interval].join('\t')).join('\n')+'\n';
  const j=spawnSync('java',['-cp',classes,'art.niulai.android.MarketMoodHarness'],{input,encoding:'utf8',windowsHide:true});assert.equal(j.status,0,j.stderr);assert.deepEqual(j.stdout.trim().split(/\r?\n/),actual,'Native and web decisions must agree');assert.deepEqual(actual,expected);
}
test('daily quote strength is distinct from a recent rapid movement',()=>{
  for(const [pct,id] of [[.5,'rise'],[6,'rally'],[3,'clap'],[-.5,'fall'],[-2,'incense'],[-4,'cover'],[-6,'slump'],[0,'near']])check([row(100,pct)],[id]);
  check([row(100,.5),row(100.8,1.3,10)],['rise','surge']);
  check([row(100,-.5),row(99.2,-1.3,10)],['fall','drop']);
});
test('rebound and pullback use actual retrieved history and reset on stock changes',()=>{
  check([row(100,-1),row(99.2,-1.8,10),row(99.7,-1.3,20),row(220,1,30,{code:'gb_aapl',now:Date.parse('2026-11-10T15:00:00Z'),received:Date.parse('2026-11-10T15:00:00Z')})],['incense','drop','rebound','rise']);
  check([row(100,1),row(100.8,1.8,10),row(100.3,1.3,20)],['rise','surge','pullback']);
});
test('stale/failed/missing prices cannot trigger an up or down action',()=>{
  check([row(100,4),row(101,5,60,{received:start,error:true})],['clap','offline']);
  check([row(100,4,60,{received:start})],['offline']);
  check([row(0,0,0,{valid:false})],['loading']);
  check([row(100,4,0,{received:start+20000})],['offline']);
});
test('session priority uses each market clock, lunch, weekends and US DST',()=>{
  for(const [code,iso,id] of [
    ['s_sh000001','2026-11-10T01:20:00Z','preopen'],['s_sh000001','2026-11-10T01:31:00Z','opening'],
    ['s_sh000001','2026-11-10T03:45:00Z','lunch'],['rt_hk00700','2026-11-10T04:30:00Z','lunch'],
    ['s_sh000001','2026-11-10T08:00:00Z','closed'],['s_sh000001','2026-11-07T02:00:00Z','weekend'],
    ['gb_aapl','2026-07-07T13:31:00Z','opening'],['gb_aapl','2026-11-10T14:31:00Z','opening']]){
      const now=Date.parse(iso);assert.equal(sessionPhase(code,now).phase,id);check([row(100,4,0,{code,now,received:now})],[id]);
    }
});
test('retrieved narrow ranges are distinct from a price near previous close',()=>{check([row(100,4),row(100.01,4,10),row(100,4,20)],['clap','clap','flat']);});
test('small threshold changes have a cooldown and history expires across gaps',()=>{
  check([row(100,.14),row(100.01,.16,2),row(100.01,.16,9)],['near','near','rise']);
  check([row(100,.5),row(101,1.5,10),row(101,1.5,120)],['rise','surge','rise']);
});

test('27 states use 15 complete frame sequences with bounded frame indices',()=>{
  assert.equal(catalog.length,27);assert.equal(Object.keys(animation.sheets).length,15);
  for(const item of catalog){const clip=animation.clips[item.id];assert(clip);assert(fs.existsSync(path.resolve(project,'../assets/2d/frames/webp',animation.sheets[clip.sheet].file)));const p=new FramePlayer();p.state(item.id,0,true);for(let t=0;t<10000;t+=1000/60){const frame=p.frame(t);assert(frame.index>=0&&frame.index<24);assert.equal(frame.sheet,clip.sheet);}assert.equal(p.frame(15000,false).index,0);}
});
test('wood taps finish their stroke and coalesce rapid repeats into one pending stroke',()=>{
  const p=new FramePlayer();p.state('muyu',1000);assert.equal(p.frame(1100).index,0);p.state('muyu',1200,true);assert.equal(p.frame(1400).index,12);p.state('muyu',1420,true);p.state('muyu',1430,true);assert.equal(p.frame(1600).index,0);assert.equal(p.frame(1800).index,16);assert.equal(p.frame(2000).index,0);assert.equal(p.knocking,false);
});
test('pause resumes at the same drawing and drops queued wood taps',()=>{
  const p=new FramePlayer();p.state('scratch',1000,true);const before=p.frame(1400).index;p.pause(true,1400);assert.equal(p.frame(8000).index,before);p.pause(false,9000);assert.equal(p.frame(9000).index,before);p.state('muyu',10000,true);p.state('muyu',10100,true);p.pause(true,10150);assert.equal(p.queuedKnock,false);p.state('cover',10200);p.pause(false,11000);assert.equal(p.frame(11000).index,0);
});
