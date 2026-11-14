import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {parseSinaQuote,parseTencentQuote,normalizeMarketSymbol} from '../web/core.mjs';
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const classes=path.join(project,'build/native-market-test');fs.mkdirSync(classes,{recursive:true});
const source=path.join(project,'app/src/main/java/art/niulai/android/NativeMarket.java');
const compilation=spawnSync('javac',['-encoding','UTF-8','--release','8','-d',classes,source,path.join(project,'tests/NativeMarketHarness.java')],{encoding:'utf8',windowsHide:true});
assert.equal(compilation.status,0,compilation.stderr);
const b64=s=>Buffer.from(s,'utf8').toString('base64');
function java(lines){const result=spawnSync('java',['-cp',classes,'art.niulai.android.NativeMarketHarness'],{input:lines.join('\n')+'\n',encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);return result.stdout.trim().split(/\r?\n/);}
test('native and existing desktop parsers agree on all three markets and both quote sources',()=>{
  const hk=Array(20).fill('');Object.assign(hk,{1:'腾讯控股',3:'410',6:'415',7:'5',8:'1.22',17:'2026/11/10',18:'16:08:12'});
  const us=Array(30).fill('');Object.assign(us,{0:'苹果',1:'220',2:'-0.90',3:'2026-11-10 10:25:00',4:'-2',26:'222'});
  const detail=Array(40).fill('');Object.assign(detail,{1:'腾讯控股',3:'415',4:'410',30:'20261110160812',31:'5',32:'1.22'});
  const post=[...us];Object.assign(post,{3:'2026-11-11 07:00:00',21:'224',24:'Nov 10 05:30PM EST',25:'Nov 10 04:00PM EST'});
  const pre=[...us];Object.assign(pre,{3:'2026-11-10 22:00:00',21:'224',24:'Nov 10 08:30AM EST',25:'Nov 9 04:00PM EST'});
  const fixtures=[
    ['s_sh000001',false,'var hq_str_s_sh000001="上证指数,3000,-30,-0.99,10,20";'],
    ['s_sz399001',false,'var hq_str_s_sz399001="深证成指,10000,100,1.01,10,20";'],
    ['rt_hk00700',false,`var hq_str_rt_hk00700="${hk.join(',')}";`],
    ['gb_aapl',false,`var hq_str_gb_aapl="${us.join(',')}";`],
    ['gb_aapl',false,`var hq_str_gb_aapl="${post.join(',')}";`],
    ['gb_aapl',false,`var hq_str_gb_aapl="${pre.join(',')}";`],
    ['s_sh000001',true,'v_s_sh000001="1~上证指数~000001~3000~-30~-0.99~10~20";'],
    ['rt_hk00700',true,`v_hk00700="${detail.join('~')}";`],
    ['gb_aapl',true,`v_usAAPL="${detail.join('~')}";`],
    ['s_sh000001',false,'var hq_str_s_sh000001="";'],
    ['s_sh000001',false,'var hq_str_s_sh000001="无效,NaN,0,0";'],
    ['s_sh000001',true,'v_s_sh000001="1~停牌~000001~0~0~0";']
  ];
  const results=java(fixtures.map(([code,backup,body])=>`Q\t${code}\t${backup?1:0}\t${b64(body)}`));
  fixtures.forEach(([code,backup,body],i)=>{const expected=(backup?parseTencentQuote:parseSinaQuote)(body,code);if(!expected||expected.price<=0){assert.equal(results[i],'-');return;}const fields=results[i].split('\t');for(const [j,key]of ['price','change','changePct','prevClose'].entries())assert(Math.abs(Number(fields[j])-expected[key])<1e-8,`${code} ${key}`);assert.equal(Buffer.from(fields[4],'base64').toString('utf8'),expected.name);assert.equal(Buffer.from(fields[5]||'','base64').toString('utf8'),expected.time);});
});
test('native symbol entry uses the same A/HK/US canonical codes',()=>{
  const inputs=['600519','sh000001','sz000001','上证','00700','hk700','700.hk','AAPL','$AAPL','AAPL.US','gb_msft','https://bad.example','12345678'];
  const results=java(inputs.map(s=>'N\t'+b64(s)));inputs.forEach((s,i)=>assert.equal(results[i],normalizeMarketSymbol(s)||'-',s));
});
