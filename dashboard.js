// ── Dashboard ─────────────────────────────────────────────────────
var _chartJsLoaded=false;
function renderDashboard(){
  if(!_chartJsLoaded){
    var s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js';
    s.onload=function(){_chartJsLoaded=true;_drawCharts();};
    document.head.appendChild(s);
  }else{_drawCharts();}
}
function _drawCharts(){
  // ── Tally ─────────────────────────────────────────────────────
  var sc={Active:0,Completed:0,'On Hold':0,Cancelled:0,Filed:0};
  var overdue=0,officers={};
  rows.forEach(function(r){
    var s=r[10]||'';if(sc[s]!==undefined)sc[s]++;
    if(computeFlag(r)==='OVERDUE')overdue++;
    if((r[10]||'').toLowerCase()==='active'&&r[4])officers[r[4]]=(officers[r[4]]||0)+1;
  });
  // ── Summary tiles ─────────────────────────────────────────────
  var sr=document.getElementById('db-stats-row');
  if(sr)sr.innerHTML=[
    ['Total',    rows.length,          'db-t-total', '',           "clearFilter();showView('tracker')"],
    ['Active',   sc.Active,            'db-t-active','sc-active',  "setStatFilter('Active','');showView('tracker')"],
    ['Overdue',  overdue,              'db-t-over',  'sc-overdue', "setStatFilter('','OVERDUE');showView('tracker')"],
    ['Completed',sc.Completed,         'db-t-comp',  'sc-completed',"setStatFilter('Completed','');showView('tracker')"],
    ['On Hold',  sc['On Hold'],        'db-t-hold',  'sc-hold',    "setStatFilter('On Hold','');showView('tracker')"],
    ['Filed',    sc.Filed,             'db-t-filed', 'sc-filed',   "setStatFilter('Filed','');showView('tracker')"]
  ].map(function(t){return'<div class="db-tile db-tile-link '+t[2]+' '+t[3]+'" onclick="'+t[4]+'" title="View in Tracker"><div class="db-tile-n">'+t[1]+'</div><div class="db-tile-l">'+t[0]+'</div></div>';}).join('');
  // ── Donut chart (Status breakdown) ────────────────────────────
  var dCtx=document.getElementById('db-donut');if(!dCtx)return;
  if(window._dbDon)window._dbDon.destroy();
  window._dbDon=new Chart(dCtx,{type:'doughnut',data:{
    labels:['Active','Completed','On Hold','Cancelled','Filed'],
    datasets:[{data:[sc.Active,sc.Completed,sc['On Hold'],sc.Cancelled,sc.Filed],
      backgroundColor:['#0055aa','#1a7a3c','#c8a400','#b81c2e','#5a2d9a'],
      borderWidth:3,borderColor:'#fff',hoverOffset:6}]
  },options:{responsive:true,maintainAspectRatio:false,cutout:'62%',
    plugins:{legend:{position:'right',labels:{font:{size:12},padding:16,usePointStyle:true}},
      tooltip:{callbacks:{label:function(c){var v=c.parsed;var tot=c.dataset.data.reduce(function(a,b){return a+b;},0);return' '+v+' ('+Math.round(v/tot*100)+'%)';}}}}}});
  // ── Bar chart (Officer workload) ──────────────────────────────
  var bCtx=document.getElementById('db-bar');if(!bCtx)return;
  var sortedOff=Object.keys(officers).sort(function(a,b){return officers[b]-officers[a];}).slice(0,12);
  if(window._dbBar)window._dbBar.destroy();
  window._dbBar=new Chart(bCtx,{type:'bar',data:{
    labels:sortedOff,
    datasets:[{label:'Active records',data:sortedOff.map(function(o){return officers[o];}),
      backgroundColor:'rgba(0,85,170,0.82)',borderRadius:5,borderSkipped:false}]
  },options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
    plugins:{legend:{display:false}},
    scales:{x:{grid:{color:'#e8eaf0'},ticks:{stepSize:1,font:{size:11}}},
            y:{grid:{display:false},ticks:{font:{size:11}}}}}});
  // ── Overdue table (paginated) ─────────────────────────────────
  _odRows=rows.filter(function(r){return computeFlag(r)==='OVERDUE';});
  _odPage=1;renderOdPage();
}
var _odRows=[],_odPage=1,_odPageSize=10;
function renderOdPage(){
  var ol=document.getElementById('db-overdue-list');if(!ol)return;
  if(!_odRows.length){ol.innerHTML='<div class="dh-empty">No overdue records ✔️</div>';return;}
  var tot=_odRows.length,totalPages=Math.max(1,Math.ceil(tot/_odPageSize));
  _odPage=Math.min(Math.max(_odPage,1),totalPages);
  var start=(_odPage-1)*_odPageSize,slice=_odRows.slice(start,start+_odPageSize);
  var tbody=slice.map(function(r){
    var d=r[9]&&r[9].length>=8?new Date(r[9]):null;
    var days=d?Math.max(0,Math.round((new Date()-d)/86400000)):'—';
    var ri=rows.indexOf(r);
    return'<tr class="db-od-row" onclick="showView(\'tracker\');openDetail('+ri+')" title="Open record"><td>'+_esc(r[1])+'</td><td>'+_esc(r[2].length>60?r[2].slice(0,60)+'…':r[2])+'</td><td>'+_esc(r[4])+'</td><td>'+fmtDate(r[9])+'</td><td><span class="cdg-over">'+days+'d</span></td></tr>';
  }).join('');
  var pager='';
  if(totalPages>1){
    var btns='';
    var lo=Math.max(1,_odPage-2),hi=Math.min(totalPages,lo+4);lo=Math.max(1,hi-4);
    if(lo>1)btns+='<button class="db-pg-btn" onclick="goOdPage(1)">1</button>'+(lo>2?'<span class="db-pg-gap">…</span>':'');
    for(var p=lo;p<=hi;p++)btns+='<button class="db-pg-btn'+(p===_odPage?' db-pg-active':'')+'" onclick="goOdPage('+p+')">'+p+'</button>';
    if(hi<totalPages)btns+=(hi<totalPages-1?'<span class="db-pg-gap">…</span>':'')+'<button class="db-pg-btn" onclick="goOdPage('+totalPages+')">'+totalPages+'</button>';
    pager='<div class="db-pager"><button class="db-pg-btn db-pg-arrow" onclick="goOdPage('+(_odPage-1)+')"'+(_odPage===1?' disabled':'')+'>&#8592;</button>'+btns+'<button class="db-pg-btn db-pg-arrow" onclick="goOdPage('+(_odPage+1)+')"'+(_odPage===totalPages?' disabled':'')+'>&#8594;</button><span class="db-pg-info">'+start+1+'–'+Math.min(start+_odPageSize,tot)+' of '+tot+'</span></div>';
  }
  ol.innerHTML='<table class="db-od-tbl"><thead><tr><th>File Ref</th><th>Subject</th><th>Officer</th><th>Due Date</th><th>Days Over</th></tr></thead><tbody>'+tbody+'</tbody></table>'+pager;
}
function goOdPage(p){_odPage=p;renderOdPage();}
// ── Record Change History ─────────────────────────────────────────
async function loadRecordHistory(ri){
  var list=document.getElementById('d-history-list');if(!list)return;
  var uid=window.rowIds&&window.rowIds[ri];
  if(!uid){list.innerHTML='<div class="dh-empty">Not yet synced to server — save once to enable history.</div>';return;}
  list.innerHTML='<div class="dh-empty">Loading…</div>';
  try{
    var res=await window._sb.from('nass_audit').select('*').eq('record_id',uid).order('changed_at',{ascending:false}).limit(25);
    if(res.error)throw res.error;
    var data=res.data||[];
    if(!data.length){list.innerHTML='<div class="dh-empty">No changes recorded yet.</div>';return;}
    var labels={created:'Record created',status:'Status changed',location:'Location changed',officer:'Officer changed',action:'Last action changed',updated:'Details updated'};
    list.innerHTML=data.map(function(h){
      var d=new Date(h.changed_at);
      var when=d.toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
      var lbl=labels[h.action]||h.action;
      var chg=(h.old_val||h.new_val)?'<span class="dh-old">'+_esc(h.old_val||'—')+'</span><span class="dh-arr">→</span><span class="dh-new">'+_esc(h.new_val||'—')+'</span>':'';
      return'<div class="dh-item"><div class="dh-meta"><span class="dh-who">'+_esc(h.user_email||'—')+'</span><span class="dh-when">'+when+'</span></div><div class="dh-what">'+lbl+chg+'</div></div>';
    }).join('');
  }catch(e){list.innerHTML='<div class="dh-empty">Could not load history.</div>';}
}

// ── Activity Log ──────────────────────────────────────────────────
var _alPage=1,_alPageSize=25;
async function loadAuditLog(p){
  _alPage=p||1;
  var tbody=document.getElementById('al-tbody');
  if(!tbody)return;
  tbody.innerHTML='<tr><td colspan="5" style="text-align:center;padding:28px;color:#888">Loading…</td></tr>';
  try{
    var fUser=(document.getElementById('al-filter-user')||{}).value||'';
    var fAct=(document.getElementById('al-filter-action')||{}).value||'';
    var q=window._sb.from('nass_audit')
      .select('*,nass_records(file_ref,subject)',{count:'exact'})
      .order('changed_at',{ascending:false})
      .range((_alPage-1)*_alPageSize,_alPage*_alPageSize-1);
    if(fUser)q=q.ilike('user_email','%'+fUser+'%');
    if(fAct)q=q.eq('action',fAct);
    var res=await q;
    var data=res.data,error=res.error,count=res.count;
    if(error)throw error;
    tbody.innerHTML='';
    if(!data||data.length===0){tbody.innerHTML='<tr><td colspan="5" style="text-align:center;padding:28px;color:#888">No activity found.</td></tr>';return;}
    var actionLabels={created:'New Record',status:'Status',location:'Location',officer:'Officer',action:'Last Action',remarks:'Remarks',updated:'Updated'};
    data.forEach(function(h){
      var when=h.changed_at?new Date(h.changed_at).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
      var rec=h.nass_records;
      var recTxt=rec?(_esc(rec.file_ref||'?')+(rec.subject?' — '+_esc((rec.subject||'').slice(0,60)):'')):_esc(h.record_id||'—');
      var lbl=actionLabels[h.action]||h.action||'—';
      var badgeCls='al-lbl-'+(h.action||'other');
      var chg=h.action==='created'?'<span class="dh-new">Record created</span>':'<span class="dh-old">'+_esc(h.old_val||'—')+'</span><span class="dh-arr"> → </span><span class="dh-new">'+_esc(h.new_val||'—')+'</span>';
      var tr=document.createElement('tr');
      tr.innerHTML='<td class="al-td-ts">'+when+'</td><td class="al-td">'+_esc(h.user_email||'—')+'</td><td class="al-td"><span class="al-lbl '+badgeCls+'">'+_esc(lbl)+'</span></td><td class="al-td al-td-rec" title="'+_esc(recTxt)+'">'+recTxt.slice(0,80)+(recTxt.length>80?'…':'')+'</td><td class="al-td"><span class="dh-what">'+chg+'</span></td>';
      tbody.appendChild(tr);
    });
    var total=count||0;var pages=Math.max(1,Math.ceil(total/_alPageSize));
    var pg=document.getElementById('al-pager');
    if(pg){
      var ph='<span class="db-pg-info">'+total+' entr'+(total===1?'y':'ies')+'</span>';
      if(pages>1){
        ph='<button class="db-pg-btn db-pg-arrow"'+(_alPage===1?' disabled':'')+' onclick="loadAuditLog('+(_alPage-1)+')">&#8592;</button>';
        for(var pi=1;pi<=pages;pi++){if(pi===1||pi===pages||Math.abs(pi-_alPage)<=2){ph+='<button class="db-pg-btn'+(pi===_alPage?' db-pg-active':'')+'" onclick="loadAuditLog('+pi+')">'+pi+'</button>';}else if(Math.abs(pi-_alPage)===3){ph+='<span class="db-pg-gap">…</span>';}}
        ph+='<button class="db-pg-btn db-pg-arrow"'+(_alPage===pages?' disabled':'')+' onclick="loadAuditLog('+(_alPage+1)+')">&#8594;</button>';
        ph+='<span class="db-pg-info" style="margin-left:8px">'+total+' entr'+(total===1?'y':'ies')+'</span>';
      }
      pg.innerHTML=ph;
    }
  }catch(e){var tb=document.getElementById('al-tbody');if(tb)tb.innerHTML='<tr><td colspan="5" style="color:var(--signal-danger);padding:14px">Error loading activity log: '+_esc(e.message)+'</td></tr>';}
}

// ── Kanban Board ──────────────────────────────────────────────────
function renderKanban(){
  var board=document.getElementById('kb-board');
  if(!board)return;
  var lanes=['Active','On Hold','Completed','Filed','Cancelled'];
  var laneClrs={'Active':'#0055aa','On Hold':'#c8a400','Completed':'#1a7a3c','Filed':'#5a2d9a','Cancelled':'#b81c2e'};
  board.innerHTML='';
  var isEd=['editor','superuser'].includes(window.userRole||'viewer');
  lanes.forEach(function(status){
    var recs=rows.map(function(r,i){return{r:r,i:i};}).filter(function(x){return x.r[10]===status;});
    var col=document.createElement('div');col.className='kb-col';
    var head=document.createElement('div');head.className='kb-col-head';
    head.style.borderBottomColor=laneClrs[status]||'#ccc';
    head.innerHTML='<span class="kb-col-title">'+_esc(status)+'</span><span class="kb-col-cnt">'+recs.length+'</span>';
    col.appendChild(head);
    var body=document.createElement('div');body.className='kb-col-body';
    if(!recs.length){var emp=document.createElement('div');emp.className='kb-empty';emp.textContent='No records';body.appendChild(emp);}
    recs.forEach(function(x){
      var r=x.r,ri=x.i;
      var fl=computeFlag(r);
      var isOver=fl==='OVERDUE'&&!['Completed','Filed','Cancelled'].includes(r[10]||'');
      var _td2=new Date();_td2.setHours(0,0,0,0);
      var _dd2=r[9]&&r[9].length>=8?new Date(r[9]):null;if(_dd2)_dd2.setHours(0,0,0,0);
      var dLeft=_dd2?Math.round((_dd2-_td2)/86400000):null;
      var card=document.createElement('div');card.className='kb-card'+(isOver?' kb-overdue':'');
      var refEl=document.createElement('div');refEl.className='kb-card-ref';refEl.textContent=r[1]||'—';
      refEl.onclick=(function(idx){return function(){openDetail(idx);};})(ri);card.appendChild(refEl);
      var subEl=document.createElement('div');subEl.className='kb-card-sub';
      subEl.textContent=(r[2]||'').slice(0,90)+((r[2]||'').length>90?'…':'');
      subEl.onclick=(function(idx){return function(){openDetail(idx);};})(ri);card.appendChild(subEl);
      var metaEl=document.createElement('div');metaEl.className='kb-card-meta';
      var offSpan=document.createElement('span');offSpan.className='kb-card-officer';offSpan.textContent=r[4]||'—';metaEl.appendChild(offSpan);
      if(isOver&&dLeft!==null){var b=document.createElement('span');b.className='cdg-over';b.textContent=Math.abs(dLeft)+'d over';metaEl.appendChild(b);}
      else if(fl==='ON TIME'&&dLeft!==null&&dLeft>=0&&dLeft<=7){var b=document.createElement('span');b.className=dLeft<=3?'cdg-urgent':'cdg-warn';b.textContent=dLeft+'d left';metaEl.appendChild(b);}
      card.appendChild(metaEl);
      var footEl=document.createElement('div');footEl.className='kb-card-foot';
      var viewBtn=document.createElement('button');viewBtn.className='kb-view-btn';viewBtn.textContent='View';
      viewBtn.onclick=(function(idx){return function(){openDetail(idx);};})(ri);footEl.appendChild(viewBtn);
      if(isEd){
        var sel=mkSel(statuses,r[10],async function(){if(sel.value&&sel.value!==r[10]){r[10]=sel.value;await saveData();renderKanban();renderStats();}});
        sel.className='kb-status-sel';footEl.appendChild(sel);
      }
      card.appendChild(footEl);body.appendChild(card);
    });
    col.appendChild(body);board.appendChild(col);
  });
}

// ── Formal Report Export ──────────────────────────────────────────
function exportReport(){
  var data=getFiltered();
  var now=new Date();
  var dateStr=now.toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'});
  var timeStr=now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  var act=0,comp=0,hold=0,od=0,filed=0;
  data.forEach(function(r){var s=(r[10]||'').toLowerCase();if(s==='active')act++;else if(s==='completed')comp++;else if(s==='on hold')hold++;else if(s==='filed')filed++;if(computeFlag(r)==='OVERDUE')od++;});
  var tblRows=data.map(function(r,i){
    var fl=computeFlag(r);
    var stClr=r[10]==='Completed'?'#1a7a3c':r[10]==='Active'?'#0055aa':r[10]==='On Hold'?'#8a6000':r[10]==='Cancelled'?'#b81c2e':'#5a2d9a';
    var flClr=fl==='OVERDUE'?'#b81c2e':'#1a7a3c';
    return'<tr><td>'+(i+1)+'</td><td>'+_esc(r[1]||'')+'</td><td>'+_esc(r[2]||'')+'</td><td>'+_esc(r[3]||'')+'</td><td>'+_esc(r[4]||'')+'</td><td>'+_esc(fmtDate(r[6]))+'</td><td>'+_esc(fmtDate(r[9]))+'</td><td style="font-weight:700;color:'+stClr+'">'+_esc(r[10]||'')+'</td><td style="font-weight:700;color:'+flClr+'">'+_esc(fl)+'</td><td>'+_esc(r[12]||'')+'</td></tr>';
  }).join('');
  var isFiltered=data.length<rows.length;
  var subtitle=isFiltered?'FILTERED RECORDS ('+data.length+' of '+rows.length+')':'ALL RECORDS ('+rows.length+')';
  var html='<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>NASS Branch Report</title><style>'+
    'body{font-family:Arial,sans-serif;font-size:10pt;color:#000;margin:0;padding:0}'+
    '.page{padding:2cm 2.2cm}'+
    '.hdr{text-align:center;border-bottom:3px solid #002655;padding-bottom:14px;margin-bottom:18px}'+
    '.hdr-org{font-size:11pt;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#002655;margin-bottom:2px}'+
    '.hdr-title{font-size:16pt;font-weight:800;color:#002655;margin:6px 0 3px}'+
    '.hdr-sub{font-size:9pt;color:#555;text-transform:uppercase;letter-spacing:.06em}'+
    '.meta-row{display:flex;justify-content:space-between;font-size:9pt;color:#444;margin:10px 0 18px;border-top:1px solid #ccc;border-bottom:1px solid #ccc;padding:6px 0}'+
    '.stats-row{display:flex;gap:0;margin-bottom:20px;border:1px solid #ccc;border-radius:4px;overflow:hidden}'+
    '.stat{flex:1;text-align:center;padding:10px 6px;border-right:1px solid #ccc}'+
    '.stat:last-child{border-right:none}'+
    '.stat-n{font-size:20pt;font-weight:800;color:#002655;line-height:1}'+
    '.stat-l{font-size:7.5pt;text-transform:uppercase;letter-spacing:.06em;color:#666;margin-top:3px}'+
    'table{width:100%;border-collapse:collapse;font-size:8.5pt}'+
    'thead th{background:#002655;color:#fff;padding:5pt 5pt;text-align:left;font-size:8pt;font-weight:700;border:1pt solid #001a44}'+
    'tbody td{padding:4pt 5pt;border:0.5pt solid #ccd;vertical-align:top}'+
    'tbody tr:nth-child(even) td{background:#f4f6fa}'+
    '.footer{margin-top:20px;text-align:center;font-size:8pt;color:#888;border-top:1px solid #ccc;padding-top:8px}'+
    '.cls-unclass{display:inline-block;padding:2px 14px;border:2px solid #1a7a3c;color:#1a7a3c;font-weight:800;font-size:9pt;letter-spacing:.1em}'+
    '@media print{.page{padding:1cm 1.5cm}@page{margin:.8cm;size:landscape}}'+
  '</style></head><body><div class="page">'+
    '<div class="hdr">'+
      '<div class="hdr-org">Nigerian Navy &mdash; Naval Headquarters, Abuja</div>'+
      '<div class="hdr-title">NASS BRANCH DOCUMENT WORKFLOW TRACKER</div>'+
      '<div class="hdr-sub">'+subtitle+'</div>'+
      '<div style="margin-top:8px"><span class="cls-unclass">UNCLASSIFIED</span></div>'+
    '</div>'+
    '<div class="meta-row"><span><strong>Date Generated:</strong> '+dateStr+' at '+timeStr+'</span><span><strong>Generated by:</strong> '+_esc((window.userSession&&window.userSession.user.email)||'NASS Tracker')+'</span></div>'+
    '<div class="stats-row">'+
      '<div class="stat"><div class="stat-n">'+data.length+'</div><div class="stat-l">Total Shown</div></div>'+
      '<div class="stat"><div class="stat-n" style="color:#0055aa">'+act+'</div><div class="stat-l">Active</div></div>'+
      '<div class="stat"><div class="stat-n" style="color:#1a7a3c">'+comp+'</div><div class="stat-l">Completed</div></div>'+
      '<div class="stat"><div class="stat-n" style="color:#b81c2e">'+od+'</div><div class="stat-l">Overdue</div></div>'+
      '<div class="stat"><div class="stat-n" style="color:#c8a400">'+hold+'</div><div class="stat-l">On Hold</div></div>'+
      '<div class="stat"><div class="stat-n" style="color:#5a2d9a">'+filed+'</div><div class="stat-l">Filed</div></div>'+
    '</div>'+
    '<table><thead><tr><th style="width:28pt">#</th><th style="width:90pt">File Ref No.</th><th>Subject / Description</th><th style="width:70pt">Location</th><th style="width:55pt">Officer</th><th style="width:50pt">Date Rcvd</th><th style="width:50pt">Due Date</th><th style="width:55pt">Status</th><th style="width:45pt">Delay</th><th>Remarks</th></tr></thead>'+
    '<tbody>'+tblRows+'</tbody></table>'+
    '<div class="footer">NASS Branch Document Workflow Tracker &nbsp;&bull;&nbsp; Naval Headquarters, Abuja &nbsp;&bull;&nbsp; Generated '+dateStr+'</div>'+
  '</div></body></html>';
  var win=window.open('','_blank','width=1000,height=720');
  if(!win){showToast('Please allow pop-ups to generate the print report.','warn');return;}
  win.document.write(html);win.document.close();win.focus();
  setTimeout(function(){win.print();},900);
}
