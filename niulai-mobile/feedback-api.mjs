const feedbackRecent=new Map();
function feedbackJson(status,value){return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
async function feedbackBody(request){
  if(Number(request.headers.get('Content-Length')||0)>16384)throw new RangeError('size');
  const reader=request.body?.getReader();if(!reader)throw new SyntaxError('body');
  const chunks=[];let size=0;
  while(true){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){reader.cancel().catch(()=>{});throw new RangeError('size');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
export async function handleFeedback(request,env){
  if(request.method!=='POST'){const response=feedbackJson(405,{ok:false,error:'method'});response.headers.set('Allow','POST');return response;}
  if(request.headers.get('Origin')!==new URL(request.url).origin)return feedbackJson(403,{ok:false,error:'origin'});
  if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))return feedbackJson(415,{ok:false,error:'content_type'});
  let body;try{body=await feedbackBody(request);}catch(error){return feedbackJson(error instanceof RangeError?413:400,{ok:false,error:'body'});}
  if(!body||typeof body!=='object'||Array.isArray(body))return feedbackJson(400,{ok:false,error:'body'});
  if(body.website)return feedbackJson(200,{ok:true,id:'received'});
  const kind=body.kind,message=typeof body.message==='string'?body.message.trim():'',contact=typeof body.contact==='string'?body.contact.trim():'',id=body.clientId;
  if(!['problem','suggestion'].includes(kind)||Array.from(message).length<5||message.length>3000||contact.length>160||(body.contact!=null&&typeof body.contact!=='string')||typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))return feedbackJson(400,{ok:false,error:'fields'});
  const db=env.FEEDBACK_DB;if(!db)return feedbackJson(503,{ok:false,error:'unavailable'});
  try{
    const existing=await db.prepare('SELECT id FROM feedback WHERE id = ?').bind(id).first();
    if(existing)return feedbackJson(200,{ok:true,id});
    const now=Date.now(),ip=request.headers.get('CF-Connecting-IP');
    if(ip&&now-(feedbackRecent.get(ip)||0)<10000)return feedbackJson(429,{ok:false,error:'slow_down'});
    const day=new Date(now).toISOString().slice(0,10)+'T00:00:00.000Z';
    const daily=await db.prepare('SELECT COUNT(*) AS count FROM feedback WHERE created_at >= ?').bind(day).first();
    if(Number(daily?.count||0)>=500)return feedbackJson(429,{ok:false,error:'daily_limit'});
    await db.prepare('INSERT INTO feedback (id, kind, message, contact, created_at, version) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING').bind(id,kind,message,contact,new Date(now).toISOString(),'1.4.0').run();
    if(ip)feedbackRecent.set(ip,now);
    if(feedbackRecent.size>2000)for(const[key,time]of feedbackRecent)if(now-time>60000)feedbackRecent.delete(key);
    return feedbackJson(201,{ok:true,id});
  }catch{return feedbackJson(503,{ok:false,error:'unavailable'});}
}
