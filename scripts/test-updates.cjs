const test = require('node:test');
const assert = require('node:assert/strict');
const { compareVersions, publishedUpdate, OFFICIAL } = require('../main-modules/update-policy.cjs');
const { createUpdateChecker } = require('../main-modules/update-checker.cjs');
const NOW = Date.parse('2026-11-13T16:00:00Z');
const entry = { version: '1.7.0', status: 'published', publishedAt: '2026-11-13T12:00:00Z', url: OFFICIAL + '/download/#versions', notes: ['改善动画'] };
const manifest = value => ({ schema: 1, releases: { desktop: { ...entry, ...value } } });
test('stable numeric versions compare correctly without downgrade or prerelease prompts', () => {
  assert.equal(compareVersions('1.10.0','1.9.0'),1);
  assert.equal(compareVersions('1.6.0','1.6.0'),0);
  assert.equal(publishedUpdate(manifest({version:'1.5.0'}),'desktop','1.6.0',NOW).available,false);
  assert.throws(()=>compareVersions('1.7.0-beta','1.6.0'));
});
test('only published stable releases with official destinations and bounded notes are accepted', () => {
  for (const patch of [{status:'draft'}, {publishedAt:'2027-01-01T00:00:00Z'}, {url:'https://evil.example/'}, {notes:['x'.repeat(161)]}, {version:'bad'}])
    assert.throws(()=>publishedUpdate(manifest(patch),'desktop','1.6.0',NOW));
});
test('concurrent checks share a request, background checks notify once across restarts', async () => {
  let requests=0, notifications=0, saved={}, time=NOW;
  const options={current:'1.6.0',read:()=>saved,save:v=>saved={...v},enabled:()=>true,notify:async()=>{notifications++;return true;},changed:()=>{},now:()=>time,
    fetcher:async()=>{requests++;await new Promise(r=>setTimeout(r,10));return new Response(JSON.stringify(manifest()));}};
  let checker=createUpdateChecker(options);
  await Promise.all([checker.check(),checker.check()]);assert.equal(requests,1);assert.equal(notifications,1);
  await checker.check();assert.equal(requests,1);
  time+=21600001;checker=createUpdateChecker(options);await checker.check();assert.equal(notifications,1);
});
test('manual checks and disabled notifications still expose the in-app update without OS prompts',async()=>{
  let notifications=0;
  const checker=createUpdateChecker({current:'1.6.0',read:()=>({}),save:()=>{},enabled:()=>false,notify:async()=>{notifications++;return true;},changed:()=>{},now:()=>NOW,fetcher:async()=>new Response(JSON.stringify(manifest()))});
  assert.equal((await checker.check()).available,true);await checker.check(true);assert.equal(notifications,0);
});
test('offline and oversized responses recover and retain a known update',async()=>{
  let mode=0;
  const checker=createUpdateChecker({current:'1.6.0',read:()=>({}),save:()=>{},enabled:()=>false,notify:async()=>false,changed:()=>{},now:()=>NOW,
    fetcher:async()=>{if(mode===1)throw Error('offline');return new Response(mode===2?'x'.repeat(65537):JSON.stringify(manifest()));}});
  await checker.check(true);mode=1;assert.match((await checker.check(true)).error,/重试/);assert.equal(checker.status().available,true);
  mode=2;assert.match((await checker.check(true)).error,/重试/);mode=0;assert.equal((await checker.check(true)).error,'');
});
