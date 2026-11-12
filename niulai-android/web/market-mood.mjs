import { marketForSymbol } from './core.mjs';
export function sessionPhase(code, now) {
  const us=marketForSymbol(code)==='us',hk=marketForSymbol(code)==='hk';
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:us?'America/New_York':'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date(now)).map(p=>[p.type,p.value]));
  const m=(Number(p.hour)%24)*60+Number(p.minute),day=`${p.year}-${p.month}-${p.day}`;
  let phase='closed';
  if(p.weekday==='Sat'||p.weekday==='Sun')phase='weekend';
  else if(m>=555&&m<570)phase='preopen';
  else if(!us&&m>=(hk?720:690)&&m<780)phase='lunch';
  else if(m>=570&&m<(us||hk?960:900))phase=m<573?'opening':'trading';
  return {phase,key:day+':'+phase};
}
export class MarketMood {
  constructor(){this.reset();}
  reset(){this.key='';this.samples=[];this.mood='loading';this.since=0;this.lastSample=0;}
  update(q,error,now=Date.now(),interval=10,code=q?.code||'s_sh000001'){
    const session=sessionPhase(code,now),key=code+':'+session.key;
    if(key!==this.key){this.samples=[];this.lastSample=0;this.key=key;this.since=0;}
    let next;
    const valid=q&&q.code===code&&Number.isFinite(q.price)&&q.price>0&&Number.isFinite(q.changePct);
    if(error||(valid&&(now-q.received>Math.max(45000,interval*2500)||q.received>now+5000)))next='offline';
    else if(session.phase!=='trading'&&session.phase!=='opening')next=session.phase;
    else if(!valid)next='loading';
    else {
      const fresh=q.received>this.lastSample;
      this.samples=this.samples.filter(s=>now-s.at<=90000);
      if(fresh){this.samples.push({at:q.received,price:q.price});this.lastSample=q.received;if(this.samples.length>24)this.samples.shift();}
      const a=this.samples,first=a[0],span=first?now-first.at:0,base=first?.price||q.price;
      const min=a.reduce((v,s)=>Math.min(v,s.price),q.price),max=a.reduce((v,s)=>Math.max(v,s.price),q.price);
      const move=(q.price/base-1)*100,fromLow=(q.price/min-1)*100,fromHigh=(q.price/max-1)*100;
      // These describe retrieved prices, not tick data, exchange limits or trading signals.
      if(a.length>=3&&span>=10000&&(min/base-1)*100<=-.5&&fromLow>=.45)next='rebound';
      else if(a.length>=3&&span>=10000&&(max/base-1)*100>=.5&&fromHigh<=-.45)next='pullback';
      else if(a.length>=2&&span>=5000&&move>=.6)next='surge';
      else if(a.length>=2&&span>=5000&&move<=-.6)next='drop';
      else if(session.phase==='opening')next='opening';
      else if(a.length>=3&&span>=20000&&(max/min-1)*100<=.12)next='flat';
      else next=q.changePct>=5?'rally':q.changePct>=2?'clap':q.changePct>.15?'rise':q.changePct>=-.15?'near':q.changePct>-1?'fall':q.changePct>-3?'incense':q.changePct>-5?'cover':'slump';
    }
    const immediate=['offline','loading','preopen','opening','lunch','closed','weekend'].includes(next);
    if(next!==this.mood&&(immediate||!this.since||now-this.since>=8000)){this.mood=next;this.since=now;}
    return this.mood;
  }
}
