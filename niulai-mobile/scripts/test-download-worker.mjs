import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{serveDownload} from '../download-worker.mjs';
const name='Niulai-1.4.0-mac-arm64.dmg',url='https://niulai.raaay.art/files/'+name;
const files={[name]:{size:4,type:'application/x-apple-diskimage',sha256:'a'.repeat(64)}};

test('streams the binary through the same-origin response without redirecting',async()=>{
  const result=await serveDownload(new Request(url),files,async(address,options)=>{
    assert.match(address,/^https:\/\/github\.com\/raaay666-hash\/niulai-desktop-pet\/releases\/download\/v1\.4\.0\//);
    assert.equal(options.headers.get('Accept-Encoding'),'identity');
    return new Response(new Uint8Array([0,1,2,255]),{headers:{'Content-Length':'4'}});
  });
  assert.equal(result.status,200);assert.equal(result.headers.get('Location'),null);
  assert.match(result.headers.get('Content-Disposition'),/attachment/);
  assert.deepEqual([...new Uint8Array(await result.arrayBuffer())],[0,1,2,255]);
});
test('HEAD returns the download length without a body',async()=>{
  const result=await serveDownload(new Request(url,{method:'HEAD'}),files,async(_,options)=>{
    assert.equal(options.method,'HEAD');return new Response(null,{headers:{'Content-Length':'4'}});
  });
  assert.equal(result.status,200);assert.equal(result.body,null);assert.equal(result.headers.get('Content-Length'),'4');
});
test('preserves byte-range requests and partial responses',async()=>{
  const result=await serveDownload(new Request(url,{headers:{Range:'bytes=1-2','If-Range':'"release"'}}),files,async(_,options)=>{
    assert.equal(options.headers.get('Range'),'bytes=1-2');assert.equal(options.headers.get('If-Range'),'"release"');
    return new Response(new Uint8Array([1,2]),{status:206,headers:{'Content-Range':'bytes 1-2/4','Content-Length':'2'}});
  });
  assert.equal(result.status,206);assert.equal(result.headers.get('Content-Range'),'bytes 1-2/4');
  assert.deepEqual([...new Uint8Array(await result.arrayBuffer())],[1,2]);
});
test('unknown files and unsupported methods never make upstream requests',async()=>{
  const fail=()=>{throw Error('Unexpected upstream request')};
  assert.equal((await serveDownload(new Request('https://niulai.raaay.art/files/https%3A%2F%2Fevil.example'),files,fail)).status,404);
  assert.equal((await serveDownload(new Request('https://niulai.raaay.art/files/__proto__'),files,fail)).status,404);
  assert.equal((await serveDownload(new Request(url,{method:'POST'}),files,fail)).status,405);
});
test('rejects incomplete upstream files',async()=>{
  const result=await serveDownload(new Request(url),files,async()=>new Response('bad',{headers:{'Content-Length':'3'}}));
  assert.equal(result.status,502);
});
test('rejects partial responses from a mismatched file',async()=>{
  const result=await serveDownload(new Request(url),files,async()=>new Response('01',{status:206,headers:{'Content-Range':'bytes 0-1/8'}}));
  assert.equal(result.status,502);
});
test('an unavailable source gives a site-local recovery page',async()=>{
  const result=await serveDownload(new Request(url),files,async()=>{throw Error('upstream secret details')});
  assert.equal(result.status,503);const html=await result.text();assert.match(html,/href="\/download\/#versions"/);assert.doesNotMatch(html,/github|secret/);
});
test('out-of-range response keeps its total file size',async()=>{
  const result=await serveDownload(new Request(url),files,async()=>new Response(null,{status:416}));
  assert.equal(result.status,416);assert.equal(result.headers.get('Content-Range'),'bytes */4');
});
test('normal site requests pass through to the existing static assets',async()=>{
  const request=new Request('https://niulai.raaay.art/');let passed;
  const result=await worker.fetch(request,{ASSETS:{fetch(req){passed=req;return new Response('wooden fish')}}});
  assert.equal(passed,request);assert.equal(await result.text(),'wooden fish');
});
test('Windows installer downloads as a same-origin executable attachment',async()=>{
  const executable='Niulai-1.4.0-Setup-x64.exe';
  const result=await serveDownload(new Request('https://niulai.raaay.art/files/'+executable),{
    [executable]:{size:4,type:'application/vnd.microsoft.portable-executable',sha256:'b'.repeat(64)}
  },async(address)=>{
    assert.ok(address.endsWith('/'+executable));
    return new Response(new Uint8Array([77,90,0,0]),{headers:{'Content-Length':'4'}});
  });
  assert.equal(result.headers.get('Content-Type'),'application/vnd.microsoft.portable-executable');
  assert.equal(result.headers.get('Content-Disposition'),'attachment; filename="'+executable+'"');
  assert.deepEqual([...new Uint8Array(await result.arrayBuffer())],[77,90,0,0]);
});

test('current Windows and Mac files and historical Mac files use their release tags', async () => {
  const installer = 'Niulai-1.5.0-Setup-x64.exe';
  const mac = 'Niulai-1.5.0-mac-arm64.dmg';
  const metadata = { ...files,
    [installer]: { size: 4, type: 'application/vnd.microsoft.portable-executable', sha256: 'b'.repeat(64), release: 'v1.5.0' },
    [mac]: { ...files[name], release: 'v1.5.0' }
  };
  const requested = [];
  const fetcher = async address => {
    requested.push(address);
    return new Response(new Uint8Array([77, 90, 0, 0]), { headers: { 'Content-Length': '4' } });
  };
  await serveDownload(new Request('https://niulai.raaay.art/files/' + installer), metadata, fetcher);
  await serveDownload(new Request('https://niulai.raaay.art/files/' + mac), metadata, fetcher);
  await serveDownload(new Request(url), metadata, fetcher);
  assert.match(requested[0], /\/v1\.5\.0\/Niulai-1\.5\.0-Setup-x64\.exe$/);
  assert.match(requested[1], /\/v1\.5\.0\/Niulai-1\.5\.0-mac-arm64\.dmg$/);
  assert.match(requested[2], /\/v1\.4\.0\/Niulai-1\.4\.0-mac-arm64\.dmg$/);
});

test('invalid release metadata never sends an upstream request', async () => {
  const bad = { [name]: { ...files[name], release: '../another-source' } };
  const result = await serveDownload(new Request(url), bad, () => { throw Error('Unexpected request'); });
  assert.equal(result.status, 502);
});
