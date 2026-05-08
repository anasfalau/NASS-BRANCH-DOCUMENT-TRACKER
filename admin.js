var _fiPage=0;function renderAdmin(){function draw(list,cid){var el=document.getElementById(cid);el.innerHTML='';list.forEach(function(item,i){var t=document.createElement('span');t.className='tag';t.textContent=item+' ';var x=document.createElement('button');x.className='tx';x.textContent='×';x.addEventListener('click',(function(idx){return function(){if(confirm('Remove "'+list[idx]+'"?')){list.splice(idx,1);renderAdmin();refresh();}};})(i));t.appendChild(x);el.appendChild(t);});}draw(officers,'at-officers');(function(){var FP=10;var e2=document.getElementById('at-fileIndex');e2.innerHTML='';var st=_fiPage*FP;fileIndex.slice(st,st+FP).forEach(function(item,pi){var ri=st+pi;var t=document.createElement('span');t.className='tag';t.textContent=item+' ';var x=document.createElement('button');x.className='tx';x.textContent='×';x.addEventListener('click',(function(idx){return function(){if(confirm('Remove "'+fileIndex[idx]+'"?')){fileIndex.splice(idx,1);if(_fiPage>0&&_fiPage*FP>=fileIndex.length)_fiPage--;renderAdmin();refresh();}};})(ri));t.appendChild(x);e2.appendChild(t);});var tp=Math.ceil(fileIndex.length/FP);if(tp>1){var pc=document.createElement('div');pc.className='fi-pg';var prevDis=(_fiPage===0)?'disabled':'';var nextDis=(_fiPage>=tp-1)?'disabled':'';pc.innerHTML='<button class="fi-pgb" '+prevDis+' onclick="_fiPage--;renderAdmin()">‹</button>'+'<span class="fi-pgn">'+(_fiPage+1)+' / '+tp+'</span>'+'<button class="fi-pgb" '+nextDis+' onclick="_fiPage++;renderAdmin()">›</button>';e2.appendChild(pc);}})();draw(statuses,'at-statuses');draw(locations,'at-locations');draw(actions,'at-actions');}
function showAI(w){document.getElementById('ai-'+w).style.display='flex';document.getElementById('av-'+w).focus();}
function hideAI(w){document.getElementById('ai-'+w).style.display='none';document.getElementById('av-'+w).value='';}
function saveAI(w){var v=document.getElementById('av-'+w).value.trim();if(!v)return;var L=w==='officers'?officers:w==='fileIndex'?fileIndex:w==='statuses'?statuses:w==='locations'?locations:actions;if(!L.includes(v))L.push(v);saveData();hideAI(w);renderAdmin();refresh();}

// ── Officer Mapping (admin) ────────────────────────────────────────
var _mappings=[];
var _allUsers=[];
async function loadMappings(){
  var el=document.getElementById('mapping-list');
  if(!el)return;
  el.innerHTML='<div style="color:var(--fg-subtle);font-size:12px">Loading…</div>';
  try{
    var [mRes,uRes]=await Promise.all([
      window._sb.from('nass_officer_mappings').select('*').order('officer_name'),
      window._sb.from('nass_profiles').select('user_id,email,role').order('email')
    ]);
    _mappings=(mRes.data||[]);
    _allUsers=(uRes.data||[]);
    renderMappings();
  }catch(e){
    el.innerHTML='<div style="color:var(--signal-danger);font-size:12px">Failed to load mappings.</div>';
  }
}
function renderMappings(){
  var el=document.getElementById('mapping-list');
  if(!el)return;
  var html='<table class="map-tbl"><thead><tr><th>Officer Name</th><th>Assigned User</th><th></th></tr></thead><tbody>';
  officers.forEach(function(off){
    var cur=_mappings.find(function(m){return m.officer_name===off;});
    var curUserId=cur?cur.user_id:'';
    html+='<tr><td class="map-off">'+_esc(off)+'</td><td>';
    html+='<select class="map-sel" data-off="'+_esc(off)+'"><option value="">— Unassigned —</option>';
    _allUsers.forEach(function(u){
      html+='<option value="'+_esc(u.user_id)+'"'+(u.user_id===curUserId?' selected':'')+'>'+_esc((u.email||'').split('@')[0])+' ('+_esc(u.email||'')+')</option>';
    });
    html+='</select></td><td>';
    if(cur)html+='<button class="btn-map-clear" data-off="'+_esc(off)+'" title="Remove mapping">&times;</button>';
    html+='</td></tr>';
  });
  html+='</tbody></table>';
  html+='<button class="btn btn-navy" style="margin-top:14px" onclick="saveMappings()">&#128190; Save Mappings</button>';
  el.innerHTML=html;
  el.querySelectorAll('.btn-map-clear').forEach(function(btn){
    btn.addEventListener('click',async function(){
      var off=this.dataset.off;
      await window._sb.from('nass_officer_mappings').delete().eq('officer_name',off);
      await loadMappings();
      showToast('Mapping removed for '+off,'success');
    });
  });
}
async function saveMappings(){
  var sels=document.querySelectorAll('.map-sel');
  var toUpsert=[],toDelete=[];
  sels.forEach(function(sel){
    var off=sel.dataset.off;
    var uid=sel.value;
    var userObj=_allUsers.find(function(u){return u.user_id===uid;});
    if(uid&&userObj){
      toUpsert.push({officer_name:off,user_id:uid,user_email:userObj.email});
    }else{
      toDelete.push(off);
    }
  });
  try{
    if(toUpsert.length)await window._sb.from('nass_officer_mappings').upsert(toUpsert,{onConflict:'officer_name'});
    if(toDelete.length)await window._sb.from('nass_officer_mappings').delete().in('officer_name',toDelete);
    _mappings=toUpsert;_myOfficersCache=null;
    showToast('Mappings saved successfully.','success');
    await loadMappings();
  }catch(e){
    showToast('Failed to save mappings: '+e.message,'error');
  }
}

function applyRolePermissions(){var r=window.userRole||'viewer';var isSU=r==='superuser';var isEd=r==='editor'||isSU;if(!isEd){document.querySelectorAll('[onclick="openModal()"]').forEach(function(b){b.style.display='none';});var exp=document.querySelector('[onclick="exportCSV()"]');if(exp)exp.style.display='none';}document.getElementById('tb-admin').style.display=isSU?'':'none';var tbu=document.getElementById('tb-users');if(tbu)tbu.style.display=isSU?'':'none';var tba=document.getElementById('tb-audit');if(tba)tba.style.display=isEd?'':'none';var tbk2=document.getElementById('tb-kanban');if(tbk2)tbk2.style.display=isEd?'':'none';if(!isEd){var dem=document.querySelector('#detail-mbg .mok');if(dem)dem.style.display='none';}var tbi2=document.getElementById('tb-inbox');if(tbi2)tbi2.style.display='';var tbml=document.getElementById('tb-mail');if(tbml)tbml.style.display='';var rb=document.getElementById('nass-user-role-badge');if(rb){rb.textContent=r.charAt(0).toUpperCase()+r.slice(1);rb.style.display='inline-block';}document.querySelector('.topbar').classList.toggle('topbar-many-tabs',isEd);}
var MU_URL='https://sblqmpmawkogbbzzkwxt.supabase.co/functions/v1/manage-users';
async function _muReq(method,body){var s=(await window._sb.auth.getSession()).data.session;var o={method:method,headers:{Authorization:'Bearer '+s.access_token,'Content-Type':'application/json'}};if(body)o.body=JSON.stringify(body);var resp=await fetch(MU_URL,o);var d=await resp.json().catch(function(){return{};});if(!resp.ok)throw new Error(d.error||'Request failed ('+resp.status+')');return d;}
async function loadUsersPanel(){var el=document.getElementById('u-list-body');if(!el)return;el.innerHTML='<tr><td colspan="4" style="text-align:center;padding:24px;color:#888">Loading…</td></tr>';try{var data=await _muReq('GET');el.innerHTML='';if(!data.length){el.innerHTML='<tr><td colspan="4" style="text-align:center;padding:24px;color:#888">No users found.</td></tr>';return;}var delSvg='<svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="1.5" y1="1.5" x2="9.5" y2="9.5"/><line x1="9.5" y1="1.5" x2="1.5" y2="9.5"/></svg>';data.forEach(function(u){var isSelf=(window.userSession&&u.user_id===window.userSession.user.id);var roles=['superuser','editor','viewer'];var selHtml='<select class="u-role-sel"'+(isSelf?' disabled':'')+' onchange="updateUserRole(\''+u.user_id+'\',this.value)">'+roles.map(function(rv){return'<option value="'+rv+'"'+(rv===u.role?' selected':'')+'>'+rv.charAt(0).toUpperCase()+rv.slice(1)+'</option>';}).join('')+'</select>';var tr=document.createElement('tr');tr.innerHTML='<td style="display:flex;align-items:center"><span class="u-avatar">'+u.email[0].toUpperCase()+'</span><span>'+u.email+(isSelf?' <span class="u-you">(you)</span>':'')+'</span></td><td><span class="role-badge role-'+u.role+'">'+u.role+'</span></td><td>'+selHtml+'</td><td style="text-align:center">'+(isSelf?'<span style="color:var(--fg-faint);font-size:12px">—</span>':'<button class="del" title="Remove user" onclick="removeUser(\''+u.user_id+'\',\''+u.email+'\')">'+delSvg+'</button>')+'</td>';el.appendChild(tr);});}catch(e){el.innerHTML='<tr><td colspan="4" style="color:var(--signal-danger);padding:14px">Error: '+e.message+'</td></tr>';}}
async function inviteUser(){var email=(document.getElementById('u-invite-email').value||'').trim();var role=document.getElementById('u-invite-role').value;var msg=document.getElementById('u-invite-msg');if(!email){msg.className='u-msg u-msg-err';msg.textContent='Please enter an email address.';return;}msg.className='u-msg';msg.textContent='Creating account…';try{var res=await _muReq('POST',{action:'invite',email:email,role:role});document.getElementById('u-invite-email').value='';await loadUsersPanel();if(res.temp_password){msg.className='u-msg u-msg-ok';msg.innerHTML='✓ Account created for <strong>'+email+'</strong>. Share the temporary password below — it must be changed on first login.<div class="u-temp-pw-box"><span class="u-temp-pw" id="u-tmp-pw-val">'+res.temp_password+'</span><button class="btn btn-navy" style="font-size:11px;padding:3px 10px;margin-left:8px" onclick="var t=document.getElementById(\'u-tmp-pw-val\');navigator.clipboard.writeText(t.textContent).then(function(){var b=this;}).catch(function(){});this.textContent=\'Copied!\';setTimeout(function(){var b=document.querySelector(\'.u-temp-pw-box .btn\');if(b)b.textContent=\'Copy\';},2000)">Copy</button></div>';}else{msg.className='u-msg u-msg-ok';msg.textContent='✓ Account created for '+email;}}catch(e){msg.className='u-msg u-msg-err';msg.textContent='Error: '+e.message;}}
async function updateUserRole(uid,role){try{await _muReq('POST',{action:'update-role',user_id:uid,role:role});loadUsersPanel();}catch(e){showToast('Could not update role: '+e.message,'error');loadUsersPanel();}}
async function removeUser(uid,email){if(!confirm('Permanently remove '+email+'?\nThis cannot be undone.'))return;try{await _muReq('POST',{action:'delete',user_id:uid});loadUsersPanel();}catch(e){showToast('Could not remove user: '+e.message,'error');}}
