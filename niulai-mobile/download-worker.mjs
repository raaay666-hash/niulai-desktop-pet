import {handleFeedback} from './feedback-api.mjs';
const FILES = /*__DOWNLOAD_FILES__*/ {};
const ORIGIN = 'https://github.com/raaay666-hash/niulai-desktop-pet/releases/download/';

function unavailable(status=503) {
  return new Response('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>牛来盯盘</title><link rel="stylesheet" href="/styles.css?v=20261108-downloads"><link rel="stylesheet" href="/download.css?v=20261108-downloads"><body class="download-error"><main><h1>下载暂时不可用</h1><p>请稍后重试，或返回下载页。</p><a href="/download/#versions">返回下载页</a></main></body></html>',{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}

export async function serveDownload(request, files, fetcher=fetch) {
  let name;
  try {name=decodeURIComponent(new URL(request.url).pathname.slice('/files/'.length));} catch {return new Response('Invalid path',{status:400});}
  if(!Object.hasOwn(files,name))return new Response('Not found',{status:404});
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
  const file=files[name],release=file.release||'v1.4.0';
  if(!/^v\d+\.\d+\.\d+$/.test(release))return unavailable(502);
  const headers=new Headers({'User-Agent':'Niulai-Desktop-Download/1.5.0','Accept':'application/octet-stream','Accept-Encoding':'identity'});
  for(const key of ['Range','If-Range'])if(request.headers.has(key))headers.set(key,request.headers.get(key));
  let source;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
  try {source=await fetcher(ORIGIN+encodeURIComponent(release)+'/'+encodeURIComponent(name),{method:request.method,headers,redirect:'follow',signal:controller.signal});} catch {return unavailable();} finally {clearTimeout(timer);}
  if(source.status===416)return new Response(null,{status:416,headers:{'Content-Range':source.headers.get('Content-Range')||`bytes */${file.size}`}});
  if(![200,206].includes(source.status)){source.body?.cancel().catch(()=>{});return unavailable();}
  const range=source.headers.get('Content-Range'),length=source.headers.get('Content-Length');
  if((source.status===200&&length&&Number(length)!==file.size)||(source.status===206&&(!range||!range.endsWith('/'+file.size)))){
    source.body?.cancel().catch(()=>{});return unavailable(502);
  }
  const responseHeaders=new Headers({'Content-Type':file.type,'Content-Disposition':`attachment; filename="${name}"`,'Accept-Ranges':'bytes','Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff','X-Niulai-Download':'same-origin','X-File-SHA256':file.sha256});
  for(const key of ['Content-Length','Content-Range','ETag','Last-Modified'])if(source.headers.has(key))responseHeaders.set(key,source.headers.get(key));
  return new Response(request.method==='HEAD'?null:source.body,{status:source.status,headers:responseHeaders});
}

export default {fetch(request,env){
  if(new URL(request.url).pathname==='/api/feedback')return handleFeedback(request,env);
  if(new URL(request.url).pathname.startsWith('/files/'))return serveDownload(request,FILES);
  return env.ASSETS.fetch(request);
}};
