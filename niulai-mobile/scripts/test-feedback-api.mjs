import test from 'node:test';
import assert from 'node:assert/strict';
import {handleFeedback} from '../feedback-api.mjs';
const origin='https://niulai.raaay.art',endpoint=origin+'/api/feedback';
const payload=()=>({kind:'suggestion',message:'希望牛来可以换一个新的帽子。',contact:'',clientId:crypto.randomUUID(),website:''});
function request(body=payload(),extra={}){return new Request(endpoint,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...extra},body:typeof body==='string'?body:JSON.stringify(body)});}
function database({daily=0,fail=false}={}){
  const rows=new Map();let writes=0;
  return {rows,get writes(){return writes;},prepare(sql){if(fail)throw Error('private database details');return{bind(...args){return{async first(){if(sql.startsWith('SELECT id'))return rows.has(args[0])?{id:args[0]}:null;if(sql.startsWith('SELECT COUNT'))return{count:rows.size+daily};throw Error('Unexpected query')},async run(){assert.match(sql,/^INSERT INTO feedback/);const[id,kind,message,contact,createdAt,version]=args;if(!rows.has(id)){rows.set(id,{kind,message,contact,createdAt,version});writes++;}return{success:true,meta:{changes:1}}}}}}}};
}
test('feedback is saved with bound values and a receipt id',async()=>{
  const db=database(),body=payload();body.message="建议保存这段原话：'; DROP TABLE feedback; --";
  const response=await handleFeedback(request(body),{FEEDBACK_DB:db});
  assert.equal(response.status,201);assert.deepEqual(await response.json(),{ok:true,id:body.clientId});
  assert.equal(db.rows.get(body.clientId).message,body.message);assert.equal(db.writes,1);
});
test('retrying the same submission creates one record',async()=>{
  const db=database(),body=payload();await handleFeedback(request(body),{FEEDBACK_DB:db});
  const retry=await handleFeedback(request(body),{FEEDBACK_DB:db});assert.equal(retry.status,200);assert.equal(db.writes,1);
});
test('public requests cannot read feedback records',async()=>{
  for(const method of ['GET','HEAD','DELETE','PUT']){
    const result=await handleFeedback(new Request(endpoint,{method}),{FEEDBACK_DB:database()});
    assert.equal(result.status,405);assert.doesNotMatch(await result.text(),/contact|message|SELECT/);
  }
});
test('cross-origin submissions are rejected before database access',async()=>{
  const db=database({fail:true});const result=await handleFeedback(request(payload(),{Origin:'https://other.example'}),{FEEDBACK_DB:db});assert.equal(result.status,403);
});
test('invalid types, lengths and receipt identifiers are rejected',async()=>{
  for(const change of [{message:'少'},{message:'😀😀😀'},{message:'字'.repeat(3001)},{contact:'x'.repeat(161)},{contact:{}},{kind:'admin'},{clientId:'not-a-uuid'}]){
    const result=await handleFeedback(request({...payload(),...change}),{FEEDBACK_DB:database()});assert.equal(result.status,400);
  }
});
test('oversized bodies are rejected without being stored',async()=>{
  const db=database();const result=await handleFeedback(request({message:'字'.repeat(6000)}),{FEEDBACK_DB:db});assert.equal(result.status,413);assert.equal(db.writes,0);
});
test('invalid JSON and non-JSON submissions are rejected',async()=>{
  assert.equal((await handleFeedback(request('{broken'),{FEEDBACK_DB:database()})).status,400);
  assert.equal((await handleFeedback(request(payload(),{'Content-Type':'text/plain'}),{FEEDBACK_DB:database()})).status,415);
});
test('the bot trap does not create records',async()=>{
  const db=database();const result=await handleFeedback(request({...payload(),website:'bot.example'}),{FEEDBACK_DB:db});assert.equal(result.status,200);assert.equal(db.writes,0);
});
test('daily limits and rapid repeats protect the private backend',async()=>{
  assert.equal((await handleFeedback(request(payload()),{FEEDBACK_DB:database({daily:500})})).status,429);
  const db=database(),headers={'CF-Connecting-IP':'192.0.2.88'};
  assert.equal((await handleFeedback(request(payload(),headers),{FEEDBACK_DB:db})).status,201);
  assert.equal((await handleFeedback(request(payload(),headers),{FEEDBACK_DB:db})).status,429);
});
test('missing or failed storage never reports successful delivery',async()=>{
  for(const env of [{},{FEEDBACK_DB:database({fail:true})}]){
    const result=await handleFeedback(request(payload()),env);assert.equal(result.status,503);assert.equal((await result.json()).ok,false);
  }
});
