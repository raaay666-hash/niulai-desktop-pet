(() => {
  'use strict';
  const dialog=document.getElementById('feedback-dialog'),form=document.getElementById('feedback-form'),status=document.getElementById('feedback-status'),submit=document.getElementById('feedback-submit'),success=document.getElementById('feedback-success');
  let submitting=false,submittedId=null;
  form.addEventListener('input',()=>{if(!submitting)delete form.dataset.clientId;});
  document.getElementById('feedback-open').addEventListener('click',()=>dialog.showModal());
  for(const id of ['feedback-close','feedback-done'])document.getElementById(id).addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
  dialog.addEventListener('close',()=>{if(submittedId){form.reset();form.hidden=false;success.hidden=true;submittedId=null;document.getElementById('feedback-title').hidden=false;dialog.setAttribute('aria-labelledby','feedback-title');status.textContent='';}});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(submitting||!form.reportValidity())return;
    const data=new FormData(form),payload={kind:data.get('kind'),message:String(data.get('message')||'').trim(),contact:String(data.get('contact')||'').trim(),website:data.get('website'),clientId:form.dataset.clientId||(form.dataset.clientId=crypto.randomUUID())};
    if(Array.from(payload.message).length<5){status.textContent='请填写至少 5 个字。';document.getElementById('feedback-message').focus();return;}
    submitting=true;submit.disabled=true;submit.textContent='正在提交…';status.textContent='';
    const fields=[...form.querySelectorAll('textarea,input:not([name="website"])')];fields.forEach(field=>field.disabled=true);
    try{
      const response=await fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
      const result=await response.json().catch(()=>({}));
      if(!response.ok||!result.ok)throw new Error(response.status===429?'提交过于频繁，请稍后再试。':'提交失败，请重试。');
      submittedId=result.id||payload.clientId;form.hidden=true;success.hidden=false;document.getElementById('feedback-title').hidden=true;dialog.setAttribute('aria-labelledby','feedback-success-title');delete form.dataset.clientId;document.getElementById('feedback-done').focus();
    }catch(error){status.textContent=error.name==='TimeoutError'||error instanceof TypeError?'网络连接失败，请重试。':error.message;}
    finally{submitting=false;submit.disabled=false;fields.forEach(field=>field.disabled=false);submit.innerHTML='提交反馈<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 11 16-7-7 16-2-7-7-2Zm7 2 5-5"/></svg>';}
  });
  if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol))navigator.serviceWorker.register('/sw.js').catch(()=>{});
})();
