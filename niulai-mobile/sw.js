const CACHE='niulai-mobile-v20-market150';
const FILES=['./','index.html','styles.css','styles.css?v=20261112-frames','theme.js','app.js','app.js?v=20261112-frames','download/','download/history/','download.css?v=20261112-market150','download.js?v=20261112-market150','assets/fonts/niulai-brush.ttf','manifest.webmanifest','assets/head.png','assets/desktop-cow-chinrest.png','assets/niulai.mp3','assets/niulai-tap.wav','assets/muyu-frames.webp','assets/icon-180.png','assets/icon-192.png','assets/icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('niulai-mobile-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==location.origin||/^\/(files|api|android)\//.test(new URL(event.request.url).pathname))return;
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request).then(async response=>{if(response.ok)await caches.open(CACHE).then(cache=>cache.put(event.request,response.clone())).catch(()=>{});return response;}).catch(async()=>await caches.match(event.request,{ignoreSearch:true})||await caches.match('index.html')));
    return;
  }
  event.respondWith((async()=>{
    const cached=await caches.match(event.request);
    if(!cached)return fetch(event.request);
    // iPhone media elements may request byte ranges, including during offline playback.
    const range=event.request.headers.get('range');
    if(range&&/\.(mp3|wav)$/.test(new URL(event.request.url).pathname)){
      const bytes=await cached.arrayBuffer(),match=/^bytes=(\d*)-(\d*)$/.exec(range);
      if(!match)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+bytes.byteLength}});
      const length=bytes.byteLength,start=match[1]?Number(match[1]):Math.max(0,length-Number(match[2])),end=match[1]?(match[2]?Math.min(Number(match[2]),length-1):length-1):length-1;
      if(start>=length||end<start)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+length}});
      const mime=new URL(event.request.url).pathname.endsWith('.wav')?'audio/wav':'audio/mpeg';
      return new Response(bytes.slice(start,end+1),{status:206,headers:{'Content-Type':mime,'Content-Length':String(end-start+1),'Accept-Ranges':'bytes','Content-Range':'bytes '+start+'-'+end+'/'+length}});
    }
    return cached;
  })());
});

