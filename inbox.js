// ── Inbox ──────────────────────────────────────────────────────────
var _inboxLastSeen=null,_inboxDocs=[],_inboxPage=0,_inboxPPG=10,_inboxFilter=null,_inboxMode='docs';
var _myOfficersCache=null;
async function _getMyOfficers(uid){if(_myOfficersCache)return _myOfficersCache;var mRes=await window._sb.from('nass_officer_mappings').select('officer_name').eq('user_id',uid);if(mRes.error)throw mRes.error;_myOfficersCache=(mRes.data||[]).map(function(m){return m.officer_name;});return _myOfficersCache;}
function _switchInboxMode(mode){_inboxMode=mode;var gtb=document.getElementById('gm-toolbar');var mtb=document.getElementById('ml-toolbar');var il=document.getElementById('inbox-list');var ml=document.getElementById('ml-list');var md=document.getElementById('ml-detail');var sub=document.getElementById('inbox-sub');if(gtb)gtb.style.display=mode==='docs'?'flex':'none';if(mtb)mtb.style.display=mode==='mail'?'flex':'none';if(il)il.style.display=mode==='docs'?'block':'none';if(ml)ml.style.display=mode==='mail'?'block':'none';if(md)md.style.display='none';if(sub)sub.style.display=mode==='docs'?'block':'none';}
async function loadInbox(){
  var el=document.getElementById('inbox-list');
  var sub=document.getElementById('inbox-sub');
  if(!el)return;
  el.innerHTML='<div class="gm-loading">Loading…</div>';
  try{
    var uid=(window.userSession&&window.userSession.user&&window.userSession.user.id)||'';
    var myOfficers=await _getMyOfficers(uid);
    if(!myOfficers.length){
      el.innerHTML='<div class="gm-empty">No officer mapping found.<br><small>Ask your admin to map your account to an officer name.</small></div>';
      if(sub)sub.textContent='No officer assigned to your account';
      _gmUpdateToolbar(0,0);return;
    }
    var seenRes=await window._sb.from('nass_inbox_seen').select('last_seen_at').eq('user_id',uid).maybeSingle();
    _inboxLastSeen=seenRes.data?new Date(seenRes.data.last_seen_at):new Date(0);
    var rRes=await window._sb.from('nass_records').select('*').in('officer',myOfficers).order('updated_at',{ascending:false}).limit(200);
    if(rRes.error)throw rRes.error;
    _inboxDocs=rRes.data||[];
    _inboxPage=0;
    if(!_inboxDocs.length){
      el.innerHTML='<div class="gm-empty">No documents assigned to you.</div>';
      if(sub)sub.textContent='Officer: '+myOfficers.join(', ');
      _gmUpdateToolbar(0,0);return;
    }
    var unread=_inboxDocs.filter(function(d){return new Date(d.updated_at||d.created_at)>_inboxLastSeen;}).length;
    if(sub)sub.textContent='Officer: '+myOfficers.join(', ');
    var uct=document.getElementById('gm-unread-ct');
    if(uct){uct.textContent=unread?String(unread):'';uct.style.display=unread?'':'none';}
    _inboxFilter=null;
    _gmUpdateSidebar();
    _renderInboxPage();
    markInboxSeen();
    updateInboxBadge(0);
  }catch(e){
    console.error('[Inbox]',e);
    el.innerHTML='<div class="gm-empty">Could not load inbox. Check connection.</div>';
  }
}
function _gmGetFiltered(){
  if(!_inboxFilter)return _inboxDocs;
  if(_inboxFilter==='Unread')return _inboxDocs.filter(function(d){return new Date(d.updated_at||d.created_at)>_inboxLastSeen;});
  if(_inboxFilter==='OVERDUE')return _inboxDocs.filter(function(d){return (d.delay_flag||'')==='OVERDUE';});
  return _inboxDocs.filter(function(d){return d.status===_inboxFilter;});
}
function _gmUpdateSidebar(){
  var statuses=['Active','Completed','On Hold','Cancelled','Filed','OVERDUE'];
  statuses.forEach(function(st){
    var el=document.getElementById('gm-ct-'+st);
    if(!el)return;
    var count=st==='OVERDUE'?_inboxDocs.filter(function(d){return (d.delay_flag||'')==='OVERDUE';}).length:_inboxDocs.filter(function(d){return d.status===st;}).length;
    el.textContent=count?String(count):'';
    el.style.display=count?'':'none';
  });
  var unreadEl=document.getElementById('gm-ct-Unread');
  var unreadCt=_inboxDocs.filter(function(d){return new Date(d.updated_at||d.created_at)>_inboxLastSeen;}).length;
  if(unreadEl){unreadEl.textContent=unreadCt?String(unreadCt):'';unreadEl.style.display=unreadCt?'':'none';}
}
function _renderInboxPage(){
  var el=document.getElementById('inbox-list');
  if(!el)return;
  var filtered=_gmGetFiltered();
  var total=filtered.length;
  var start=_inboxPage*_inboxPPG;
  var page=filtered.slice(start,start+_inboxPPG);
  _gmUpdateToolbar(start,total);
  el.innerHTML='';
  var tbl=document.createElement('table');
  tbl.className='gm-tbl';
  page.forEach(function(d){
    var isNew=new Date(d.updated_at||d.created_at)>_inboxLastSeen;
    var fl=d.delay_flag||'';
    var statusCls=d.status==='Active'?'ds-active':d.status==='Completed'?'ds-completed':d.status==='On Hold'?'ds-hold':d.status==='Cancelled'?'ds-cancelled':d.status==='Filed'?'ds-filed':'';
    var flagCls=fl==='OVERDUE'?'flag-overdue':fl==='ON TIME'?'flag-ontime':'';
    var dt=new Date(d.updated_at||d.created_at||0);
    var now=new Date();
    var sameDay=dt.getFullYear()===now.getFullYear()&&dt.getMonth()===now.getMonth()&&dt.getDate()===now.getDate();
    var dateStr=sameDay?dt.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):dt.toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
    var tr=document.createElement('tr');
    tr.className='gm-row'+(isNew?' gm-unread':'');
    tr.innerHTML=
      '<td class="gm-td-chk"><input type="checkbox" class="gm-row-chk" onclick="event.stopPropagation();this.closest(\'tr\').classList.toggle(\'gm-selected\',this.checked)"></td>'+
      '<td class="gm-td-dot">'+(isNew?'<span class="gm-dot"></span>':'')+'</td>'+
      '<td class="gm-td-from">'+_esc(d.officer||'—')+'</td>'+
      '<td class="gm-td-subj">'+
        '<span class="gm-subj-main">'+_esc((d.subject||'').substring(0,90))+'</span>'+
        '<span class="gm-subj-ref"> — '+_esc(d.file_ref||'')+'</span>'+
      '</td>'+
      '<td class="gm-td-badges">'+
        (d.status?'<span class="detail-status '+statusCls+'">'+_esc(d.status)+'</span>':'')+
        (fl&&flagCls?'<span class="inbox-flag '+flagCls+'">'+_esc(fl)+'</span>':'')+
      '</td>'+
      '<td class="gm-td-date">'+_esc(dateStr)+'</td>';
    tr.addEventListener('click',function(e){
      if(e.target.type==='checkbox')return;
      var idx=rows.findIndex(function(r){return (r[1]||'')===(d.file_ref||'');});
      if(idx>=0){showView('tracker');openDetail(idx);}
      else showView('tracker');
    });
    tbl.appendChild(tr);
  });
  el.appendChild(tbl);
}
function _gmUpdateToolbar(start,total){
  var info=document.getElementById('gm-pg-info');
  var prev=document.getElementById('gm-prev-btn');
  var next=document.getElementById('gm-next-btn');
  var sa=document.getElementById('gm-sel-all');
  if(info)info.textContent=total?(start+1)+'–'+Math.min(start+_inboxPPG,total)+' of '+total:'No messages';
  if(prev)prev.disabled=_inboxPage===0;
  if(next)next.disabled=(start+_inboxPPG)>=total;
  if(sa)sa.checked=false;
}
window._gmSelAll=function(checked){document.querySelectorAll('.gm-row-chk').forEach(function(c){c.checked=checked;c.closest('tr').classList.toggle('gm-selected',checked);});};
window._gmPrev=function(){if(_inboxPage>0){_inboxPage--;_renderInboxPage();}};
window._gmNext=function(){if((_inboxPage+1)*_inboxPPG<_gmGetFiltered().length){_inboxPage++;_renderInboxPage();}};
window._gmFilter=function(filter,el){_switchInboxMode('docs');_inboxFilter=filter;_inboxPage=0;document.querySelectorAll('.gm-side-lbl').forEach(function(l){l.classList.remove('gm-side-active');});if(el)el.classList.add('gm-side-active');_renderInboxPage();};
async function markInboxSeen(){
  try{
    var uid=(window.userSession&&window.userSession.user&&window.userSession.user.id)||'';
    if(!uid)return;
    await window._sb.from('nass_inbox_seen').upsert({user_id:uid,last_seen_at:new Date().toISOString()},{onConflict:'user_id'});
  }catch(e){}
}
function updateInboxBadge(count){
  var b=document.getElementById('inbox-badge');
  if(!b)return;
  if(count>0){b.textContent=count>9?'9+':String(count);b.style.display='';}
  else{b.style.display='none';}
}
async function checkInboxUnread(){
  try{
    var uid=(window.userSession&&window.userSession.user&&window.userSession.user.id)||'';
    if(!uid)return;
    var myOfficers=await _getMyOfficers(uid);
    if(!myOfficers.length)return;
    var seenRes=await window._sb.from('nass_inbox_seen').select('last_seen_at').eq('user_id',uid).maybeSingle();
    var lastSeen=seenRes.data?new Date(seenRes.data.last_seen_at):new Date(0);
    var rRes=await window._sb.from('nass_records').select('id,updated_at,created_at').in('officer',myOfficers).gt('updated_at',lastSeen.toISOString());
    var count=(rRes.data||[]).length;
    updateInboxBadge(count);
    var tbi=document.getElementById('tb-inbox');
    if(tbi)tbi.style.display='';
  }catch(e){}
}

// ── Internal Mail ─────────────────────────────────────────────────
var _mlFolder='inbox',_mlList=[],_mlPage=0,_mlPPG=15,_mlUsersMap={},_mlAllUsers=[],_mlComposeDraftId=null,_mlComposeReplyTo=null;
var _mlPollInterval=null,_mlPollLastAt=null;
function _mlRemoveFromList(mailId){var d=document.getElementById('ml-detail');if(d&&d.style.display!=='none')d.style.display='none';_mlList=_mlList.filter(function(m){return m.id!==mailId;});_mlRenderList();_mlLoadBadges();}
function _mlStartPolling(){if(_mlPollInterval)return;_mlPollLastAt=new Date().toISOString();_mlPollInterval=setInterval(_mlPollNew,15000);}
function _mlPollNew(){
  if(!window._sb||!window.userSession)return;
  var uid=window.userSession.user.id;
  var since=_mlPollLastAt;_mlPollLastAt=new Date().toISOString();
  window._sb.from('nass_mail_recipients').select('mail_id,read_at,id,type').eq('recipient_id',uid).is('deleted_at',null).gt('created_at',since).then(function(r){
    if(!r.data||!r.data.length)return;
    var mailIds=r.data.map(function(x){return x.mail_id;});
    var rm={};r.data.forEach(function(x){rm[x.mail_id]=x;});
    window._sb.from('nass_mail').select('id,subject,sender_id,created_at,body').in('id',mailIds).order('created_at',{ascending:false}).then(function(mRes){
      if(!mRes.data||!mRes.data.length)return;
      var existing=new Set(_mlList.map(function(m){return m.id;}));
      var newMails=mRes.data.filter(function(m){return!existing.has(m.id);}).map(function(m){return Object.assign({},m,{_read:false,_recip_row_id:rm[m.id]&&rm[m.id].id,_recip_type:rm[m.id]&&rm[m.id].type});});
      if(!newMails.length)return;
      if(typeof _inboxMode!=='undefined'&&_inboxMode==='mail'&&_mlFolder==='inbox'){
        newMails.forEach(function(m){_mlList.unshift(m);});_mlRenderList();
      }
      _mlLoadBadges();
    });
  });
}

function loadMail(folder){
  if(folder)_mlFolder=folder;
  if(!window._sb||!window.userSession)return;
  var uid=window.userSession.user.id;
  if(!_mlAllUsers.length){
    window._sb.from('nass_profiles').select('user_id,email').then(function(r){
      _mlAllUsers=r.data||[];
      _mlAllUsers.forEach(function(u){_mlUsersMap[u.user_id]=u.email;});
      _mlFetch(uid);
    });
  } else {_mlFetch(uid);}
}

function _mlFetch(uid){
  var fTitle={inbox:'Inbox',sent:'Sent',drafts:'Drafts',trash:'Trash'};
  var ft=document.getElementById('ml-folder-title');if(ft)ft.textContent=fTitle[_mlFolder]||'Mail';
  document.querySelectorAll('.gm-side-lbl[id^="ml-f-"]').forEach(function(el){el.classList.remove('gm-side-active');});
  var act=document.getElementById('ml-f-'+_mlFolder);if(act)act.classList.add('gm-side-active');
  var ml=document.getElementById('ml-list');var md=document.getElementById('ml-detail');
  if(ml){ml.innerHTML='<div class="gm-loading">Loading…</div>';ml.style.display='block';}
  if(md)md.style.display='none';
  _mlPage=0;

  if(_mlFolder==='inbox'){
    window._sb.from('nass_mail_recipients').select('id,mail_id,type,read_at').eq('recipient_id',uid).is('deleted_at',null).then(function(rRes){
      var recips=rRes.data||[];
      if(!recips.length){_mlList=[];_mlRenderList();return;}
      var ids=recips.map(function(r){return r.mail_id;});
      var rm={};recips.forEach(function(r){rm[r.mail_id]=r;});
      window._sb.from('nass_mail').select('id,subject,body,is_draft,created_at,sender_id,parent_id').in('id',ids).eq('is_draft',false).order('created_at',{ascending:false}).then(function(mRes){
        _mlList=(mRes.data||[]).map(function(m){return Object.assign({},m,{_read:!!(rm[m.id]&&rm[m.id].read_at),_recip_row_id:rm[m.id]&&rm[m.id].id,_recip_type:rm[m.id]&&rm[m.id].type});});
        _mlRenderList();_mlLoadBadges();
      });
    });
  } else if(_mlFolder==='sent'){
    window._sb.from('nass_mail').select('id,subject,body,is_draft,created_at,sender_id,parent_id').eq('sender_id',uid).eq('is_draft',false).order('created_at',{ascending:false}).then(function(mRes){
      var mails=mRes.data||[];
      if(!mails.length){_mlList=[];_mlRenderList();return;}
      var ids=mails.map(function(m){return m.id;});
      window._sb.from('nass_mail_recipients').select('mail_id,recipient_id,type').in('mail_id',ids).eq('type','to').then(function(rRes){
        var rm={};(rRes.data||[]).forEach(function(r){if(!rm[r.mail_id])rm[r.mail_id]=[];rm[r.mail_id].push(r.recipient_id);});
        _mlList=mails.map(function(m){return Object.assign({},m,{_to_ids:rm[m.id]||[]});});
        _mlRenderList();
      });
    });
  } else if(_mlFolder==='drafts'){
    window._sb.from('nass_mail').select('id,subject,body,is_draft,created_at,sender_id,parent_id').eq('sender_id',uid).eq('is_draft',true).order('created_at',{ascending:false}).then(function(mRes){
      _mlList=mRes.data||[];_mlRenderList();_mlLoadBadges();
    });
  } else {
    window._sb.from('nass_mail_recipients').select('id,mail_id,type,read_at').eq('recipient_id',uid).not('deleted_at','is',null).then(function(rRes){
      var recips=rRes.data||[];
      if(!recips.length){_mlList=[];_mlRenderList();return;}
      var ids=recips.map(function(r){return r.mail_id;});
      var rm={};recips.forEach(function(r){rm[r.mail_id]=r;});
      window._sb.from('nass_mail').select('id,subject,body,is_draft,created_at,sender_id,parent_id').in('id',ids).order('created_at',{ascending:false}).then(function(mRes){
        _mlList=(mRes.data||[]).map(function(m){return Object.assign({},m,{_read:true,_recip_row_id:rm[m.id]&&rm[m.id].id,_trashed:true});});
        _mlRenderList();
      });
    });
  }
}

function _mlRenderList(){
  var ml=document.getElementById('ml-list');if(!ml)return;
  if(!_mlList.length){ml.innerHTML='<div class="gm-empty">No messages here.</div>';_mlUpdatePager();return;}
  var start=_mlPage*_mlPPG,end=Math.min(start+_mlPPG,_mlList.length);
  var slice=_mlList.slice(start,end);
  var h='<table class="gm-tbl"><tbody>';
  slice.forEach(function(m){
    var unread=_mlFolder==='inbox'&&!m._read;
    var from='';
    if(_mlFolder==='sent'){from='To: '+((m._to_ids||[]).map(function(id){return _mlUsersMap[id]||id;}).join(', ')||'(no recipients)');}
    else {from=_mlUsersMap[m.sender_id]||m.sender_id||'Unknown';}
    h+='<tr class="gm-row'+(unread?' gm-unread':'')+'" onclick="_mlOpenMail(\''+m.id+'\')">'
      +'<td class="gm-td-from">'+_esc(from)+'</td>'
      +'<td class="gm-td-subject">'+(unread?'<span class="gm-dot"></span>':'')+(_mlFolder==='drafts'?'<span class="ml-draft-lbl">Draft</span>':'')+_esc(m.subject||'(no subject)')+'</td>'
      +'<td class="gm-td-date">'+_mlFmtDate(m.created_at)+'</td>'
      +'<td class="gm-td-act">'+(_mlFolder!=='trash'?'<button class="ml-del-btn" onclick="event.stopPropagation();_mlTrashMail(\''+m.id+'\')" title="Delete">\u{1F5D1}</button>':'<button class="ml-del-btn" onclick="event.stopPropagation();_mlRestoreMail(\''+m.id+'\')" title="Restore to Inbox">&#8635;</button>')+'</td>'
    +'</tr>';
  });
  h+='</tbody></table>';
  ml.innerHTML=h;_mlUpdatePager();
}

function _mlUpdatePager(){
  var total=_mlList.length,start=_mlPage*_mlPPG,end=Math.min(start+_mlPPG,total);
  var pg=document.getElementById('ml-pg-info');if(pg)pg.textContent=total?(start+1)+'–'+end+' of '+total:'';
  var pp=document.getElementById('ml-pg-prev');if(pp)pp.disabled=_mlPage===0;
  var pn=document.getElementById('ml-pg-next');if(pn)pn.disabled=end>=total;
}

function _mlPagePrev(){if(_mlPage>0){_mlPage--;_mlRenderList();}}
function _mlPageNext(){if((_mlPage+1)*_mlPPG<_mlList.length){_mlPage++;_mlRenderList();}}
function _mlSetFolder(folder,el){_switchInboxMode('mail');document.querySelectorAll('.gm-side-lbl').forEach(function(l){l.classList.remove('gm-side-active');});var act=document.getElementById('ml-f-'+folder);if(act)act.classList.add('gm-side-active');_mlFolder=folder;loadMail();}

function _mlFmtDate(ts){
  if(!ts)return'';
  var d=new Date(ts),now=new Date();
  var today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  var dt=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  if(dt.getTime()===today.getTime())return d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  return d.toLocaleDateString([],{day:'2-digit',month:'short'});
}

function _mlOpenMail(mailId){
  var m=_mlList.find(function(x){return x.id===mailId;});if(!m)return;
  if(_mlFolder==='inbox'&&!m._read&&m._recip_row_id){
    window._sb.from('nass_mail_recipients').update({read_at:new Date().toISOString()}).eq('id',m._recip_row_id).then();
    m._read=true;_mlLoadBadges();
  }
  var ml=document.getElementById('ml-list');var md=document.getElementById('ml-detail');
  if(ml)ml.style.display='none';if(!md)return;md.style.display='block';
  var sender=_mlUsersMap[m.sender_id]||m.sender_id||'Unknown';
  var toLine='';
  if(m._to_ids&&m._to_ids.length)toLine='<div class="ml-det-meta">To: '+_esc(m._to_ids.map(function(id){return _mlUsersMap[id]||id;}).join(', '))+'</div>';
  var actions='<button class="btn btn-ghost" onclick="_mlBackToList()">&#8592; Back</button>';
  if(_mlFolder==='inbox'||_mlFolder==='trash')actions+='<button class="btn btn-ghost" onclick="openMailCompose({replyTo:\''+mailId+'\',subject:\'Re: '+_esc((m.subject||'').replace(/'/g,''))+'\',toEmail:\''+_esc(_mlUsersMap[m.sender_id]||'')+'\'})" style="margin-left:8px">&#8617; Reply</button>';
  if(_mlFolder==='drafts')actions+='<button class="btn btn-gold" onclick="_mlEditDraft(\''+mailId+'\')" style="margin-left:8px">&#9998; Edit Draft</button>';
  actions+='<button class="btn btn-ghost" onclick="_mlTrashMail(\''+mailId+'\')" style="margin-left:auto;color:#b81c2e">&#128465; Delete</button>';
  md.innerHTML='<div class="ml-det-toolbar">'+actions+'</div>'
    +'<div class="ml-det-head">'
      +'<div class="ml-det-subject">'+_esc(m.subject||'(no subject)')+'</div>'
      +'<div class="ml-det-from">From: <strong>'+_esc(sender)+'</strong></div>'
      +toLine
      +'<div class="ml-det-date">'+new Date(m.created_at).toLocaleString()+'</div>'
    +'</div>'
    +'<div class="ml-det-body"><pre class="ml-body-pre">'+_esc(m.body||'(empty message)')+'</pre></div>';
}

function _mlBackToList(){
  var ml=document.getElementById('ml-list');var md=document.getElementById('ml-detail');
  if(ml)ml.style.display='block';if(md)md.style.display='none';
}

function _mlRemoveFromList(mailId){_mlList=_mlList.filter(function(x){return x.id!==mailId;});var md=document.getElementById('ml-detail');if(md&&md.style.display!=='none'){md.style.display='none';var ml=document.getElementById('ml-list');if(ml)ml.style.display='block';}_mlRenderList();_mlLoadBadges();}
function _mlTrashMail(mailId){
  var uid=window.userSession&&window.userSession.user.id;
  var m=_mlList.find(function(x){return x.id===mailId;});
  if(_mlFolder==='sent'||_mlFolder==='drafts'){
    if(!confirm('Permanently delete this message?'))return;
    window._sb.from('nass_mail').delete().eq('id',mailId).eq('sender_id',uid).then(function(r){if(r.error){showToast('Delete failed.','error');return;}showToast('Deleted.','ok');_mlRemoveFromList(mailId);});
  } else if(_mlFolder==='trash'){
    if(!confirm('Permanently delete this message?'))return;
    if(m&&m._recip_row_id)window._sb.from('nass_mail_recipients').delete().eq('id',m._recip_row_id).then(function(r){if(r.error){showToast('Delete failed.','error');return;}showToast('Deleted.','ok');_mlRemoveFromList(mailId);});
  } else {
    if(m&&m._recip_row_id)window._sb.from('nass_mail_recipients').update({deleted_at:new Date().toISOString()}).eq('id',m._recip_row_id).then(function(r){if(r.error){showToast('Delete failed.','error');return;}showToast('Moved to Trash.','ok');_mlRemoveFromList(mailId);});
  }
}

function _mlRestoreMail(mailId){
  var m=_mlList.find(function(x){return x.id===mailId;});
  if(m&&m._recip_row_id)window._sb.from('nass_mail_recipients').update({deleted_at:null}).eq('id',m._recip_row_id).then(function(r){if(r.error){showToast('Restore failed.','error');return;}showToast('Restored to Inbox.','ok');_mlRemoveFromList(mailId);});
}

function _mlEditDraft(mailId){
  var m=_mlList.find(function(x){return x.id===mailId;});if(!m)return;
  openMailCompose({draftId:m.id,subject:m.subject,body:m.body});
}

function _mlSubscribeRealtime(sb){
  if(!sb||!window.userSession)return;
  var uid=window.userSession.user.id;
  sb.channel('nass_mail_inbox_'+uid)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'nass_mail_recipients',filter:'recipient_id=eq.'+uid},function(payload){
      var nr=payload.new;
      _mlLoadBadges();
      if(_inboxMode!=='mail'||_mlFolder!=='inbox')return;
      sb.from('nass_mail').select('id,subject,body,is_draft,created_at,sender_id,parent_id').eq('id',nr.mail_id).eq('is_draft',false).maybeSingle().then(function(res){
        if(!res.data)return;
        var already=_mlList.find(function(x){return x.id===res.data.id;});
        if(already)return;
        var m=Object.assign({},res.data,{_read:false,_recip_row_id:nr.id,_recip_type:nr.type});
        _mlList.unshift(m);_mlRenderList();
      });
    })
    .subscribe();
}
function _mlLoadBadges(){
  if(!window._sb||!window.userSession)return;
  var uid=window.userSession.user.id;
  window._sb.from('nass_mail_recipients').select('id',{count:'exact',head:true}).eq('recipient_id',uid).is('deleted_at',null).is('read_at',null).then(function(r){
    var ct=r.count||0;
    var ib=document.getElementById('ml-badge-inbox');if(ib){ib.textContent=ct;ib.style.display=ct?'inline-flex':'none';}
    var tb=document.getElementById('ml-tab-badge');if(tb){tb.textContent=ct;tb.style.display=ct?'inline-flex':'none';}
    var ibt=document.getElementById('inbox-badge');if(ibt){ibt.textContent=ct;ibt.style.display=ct?'inline-flex':'none';}
  });
  window._sb.from('nass_mail').select('id',{count:'exact',head:true}).eq('sender_id',window.userSession.user.id).eq('is_draft',true).then(function(r){
    var ct=r.count||0;var db=document.getElementById('ml-badge-drafts');if(db){db.textContent=ct;db.style.display=ct?'inline-flex':'none';}
  });
}

function openMailCompose(opts){
  opts=opts||{};
  _mlComposeDraftId=opts.draftId||null;
  _mlComposeReplyTo=opts.replyTo||null;
  if(!_mlAllUsers.length&&window._sb){
    window._sb.from('nass_profiles').select('user_id,email').then(function(r){
      _mlAllUsers=r.data||[];
      _mlAllUsers.forEach(function(u){_mlUsersMap[u.user_id]=u.email;});
    });
  }
  var panel=document.getElementById('ml-compose');if(!panel)return;
  document.getElementById('ml-to').value=opts.toEmail||opts.to||'';
  document.getElementById('ml-cc').value=opts.cc||'';
  document.getElementById('ml-subj').value=opts.subject||'';
  document.getElementById('ml-body-txt').value=opts.body||'';
  document.getElementById('ml-compose-title').textContent=opts.replyTo?'Reply':opts.draftId?'Edit Draft':'New Message';
  panel.style.display='block';panel.classList.remove('ml-minimized');
  document.getElementById('ml-compose-body').style.display='block';
  setTimeout(function(){var t=document.getElementById('ml-to');if(t)t.focus();},80);
}

function _mlCloseCompose(){var p=document.getElementById('ml-compose');if(p)p.style.display='none';_mlComposeDraftId=null;_mlComposeReplyTo=null;}
function _mlDiscardDraft(){if(!confirm('Discard this message?'))return;_mlCloseCompose();}
function _mlMinimize(){
  var p=document.getElementById('ml-compose');var b=document.getElementById('ml-compose-body');
  if(!p)return;p.classList.toggle('ml-minimized');if(b)b.style.display=p.classList.contains('ml-minimized')?'none':'block';
}

function _mlSuggestTo(val){
  var box=document.getElementById('ml-to-suggest');if(!box)return;
  if(!val||val.length<2){box.style.display='none';box.innerHTML='';return;}
  var q=val.toLowerCase();
  var matches=_mlAllUsers.filter(function(u){return u.email.toLowerCase().includes(q);}).slice(0,7);
  if(!matches.length){box.style.display='none';return;}
  box.innerHTML=matches.map(function(u){return'<div class="ml-suggest-item" onclick="_mlPickSuggest(\''+_esc(u.email)+'\')">'+_esc(u.email)+'</div>';}).join('');
  box.style.display='block';
}
function _mlPickSuggest(email){var i=document.getElementById('ml-to');if(i)i.value=email;var b=document.getElementById('ml-to-suggest');if(b){b.style.display='none';b.innerHTML='';}}

function _mlSend(){
  var toVal=(document.getElementById('ml-to').value||'').trim();
  var ccVal=(document.getElementById('ml-cc').value||'').trim();
  var subj=(document.getElementById('ml-subj').value||'').trim();
  var body=(document.getElementById('ml-body-txt').value||'').trim();
  if(!toVal){showToast('Enter at least one recipient.','warn');return;}
  if(!subj){showToast('Subject cannot be empty.','warn');return;}
  if(!body){showToast('Message body cannot be empty.','warn');return;}
  var uid=window.userSession.user.id;
  var toEmails=toVal.split(',').map(function(e){return e.trim();}).filter(Boolean);
  var ccEmails=ccVal?ccVal.split(',').map(function(e){return e.trim();}).filter(Boolean):[];
  var toIds=toEmails.map(function(e){var u=_mlAllUsers.find(function(x){return x.email.toLowerCase()===e.toLowerCase();});return u?u.user_id:null;}).filter(Boolean);
  var ccIds=ccEmails.map(function(e){var u=_mlAllUsers.find(function(x){return x.email.toLowerCase()===e.toLowerCase();});return u?u.user_id:null;}).filter(Boolean);
  if(!toIds.length){showToast('Recipient not found. Must be a registered user.','warn');return;}
  var mailData={sender_id:uid,subject:subj,body:body,is_draft:false};
  if(_mlComposeReplyTo)mailData.parent_id=_mlComposeReplyTo;
  var insertOrUpdate=_mlComposeDraftId
    ?window._sb.from('nass_mail').update(mailData).eq('id',_mlComposeDraftId).select('id').single()
    :window._sb.from('nass_mail').insert(mailData).select('id').single();
  insertOrUpdate.then(function(res){
    if(res.error){showToast('Send failed: '+res.error.message,'error');return;}
    var mid=res.data.id;
    var rows=toIds.map(function(id){return{mail_id:mid,recipient_id:id,type:'to'};});
    ccIds.forEach(function(id){rows.push({mail_id:mid,recipient_id:id,type:'cc'});});
    window._sb.from('nass_mail_recipients').upsert(rows,{onConflict:'mail_id,recipient_id'}).then(function(){
      showToast('Message sent.','ok');_mlCloseCompose();
      if(_inboxMode==='mail'&&_mlFolder==='sent'){
        var sent=Object.assign({},mailData,{id:mid,_to_ids:toIds,created_at:new Date().toISOString()});
        _mlList.unshift(sent);_mlRenderList();
      } else {_mlLoadBadges();}
    });
  });
}

function _mlSaveDraft(){
  var subj=(document.getElementById('ml-subj').value||'').trim()||'(no subject)';
  var body=(document.getElementById('ml-body-txt').value||'').trim();
  var uid=window.userSession.user.id;
  var data={sender_id:uid,subject:subj,body:body,is_draft:true,updated_at:new Date().toISOString()};
  if(_mlComposeDraftId){
    window._sb.from('nass_mail').update(data).eq('id',_mlComposeDraftId).then(function(r){
      if(r.error)showToast('Draft save failed.','error');else showToast('Draft saved.','ok');_mlLoadBadges();
    });
  } else {
    window._sb.from('nass_mail').insert(data).select('id').single().then(function(r){
      if(r.error)showToast('Draft save failed.','error');else{_mlComposeDraftId=r.data.id;showToast('Draft saved.','ok');_mlLoadBadges();}
    });
  }
}
