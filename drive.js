/* ================================================================
   DRIVE SEARCH — public entry point
   ================================================================ */
var _dsBreadcrumb=[];
function driveSearch(){
  var q=(document.getElementById('ds-input').value||'').trim();
  if(!q)return;
  var resEl=document.getElementById('ds-results');
  resEl.innerHTML='<div class="ds-loading"><span class="ds-spinner"></span>Searching Google Drive…</div>';
  _dsBreadcrumb=[];_dsUpdateBreadcrumb();
  _gwithToken(async function(){
    try{
      var files=await _dsMultiQuery(q);
      _dsRenderResults(files,q,null);
    }catch(e){resEl.innerHTML='<div class="ds-empty-state" style="color:#c0392b">Search failed: '+_esc(e.message)+'</div>';console.error('[DriveSearch]',e);}
  });
}
function _dsRenderResults(files,q,folderLabel){
  var resEl=document.getElementById('ds-results');
  if(!files.length){resEl.innerHTML='<div class="ds-empty-state">No documents found'+(q?' for "'+_esc(q)+'"':'')+'.</div>';return;}
  var folders=files.filter(function(f){return f.mimeType==='application/vnd.google-apps.folder';});
  var docs=files.filter(function(f){return f.mimeType!=='application/vnd.google-apps.folder';});
  var dsTerms=q?_dsTerms(q):[];
  var idf=dsTerms.length?_computeIDF(dsTerms,docs.map(function(f){return f.name;})):{};
  var scored=docs.map(function(f){return{f:f,score:dsTerms.length?_dsScoreIDF(dsTerms,idf,f.name,f.mimeType):0};});
  scored.sort(function(a,b){return b.score-a.score;});
  var allItems=folders.map(function(f){return{f:f,isFolder:true};}).concat(scored.map(function(x){return{f:x.f,isFolder:false};}));
  var total=allItems.length;
  var label=folderLabel||(total+' result'+(total===1?'':'s')+(q?' for "'+_esc(q)+'"':''));
  resEl.innerHTML='<div class="ds-count">'+label+'</div>'+allItems.map(function(item){
    var f=item.f;var icon=_dsIcon(f.mimeType);
    var date=f.modifiedTime?new Date(f.modifiedTime).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):'';
    var sz=f.size?_dsFmtSize(+f.size):'';
    var typeLabel=_dsMimeLabel(f.mimeType);
    var safeName=f.name.replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;');
    var safeLink=(f.webViewLink||'').replace(/'/g,'');
    var safeId=f.id.replace(/'/g,'');
    var safeMime=(f.mimeType||'').replace(/'/g,'');
    if(item.isFolder){
      return'<div class="ds-item" style="cursor:default">'+
        '<span class="ds-icon">'+icon+'</span>'+
        '<div class="ds-info"><div class="ds-name">'+_esc(f.name)+'</div>'+
        '<div class="ds-meta"><span class="ds-type-badge">Folder</span></div></div>'+
        '<div class="ds-actions"><button class="ds-folder-browse-btn" onclick="_dsBrowseFolder(\''+safeId+'\',\''+safeName+'\')">Browse</button></div></div>';
    }
    return'<div class="ds-item" id="dsi-'+safeId+'" onclick="_dsOpenPreview(\''+safeId+'\',\''+safeName+'\',\''+safeMime+'\',\''+safeLink+'\')" style="cursor:pointer">'+
      '<span class="ds-icon">'+icon+'</span>'+
      '<div class="ds-info">'+
        '<div class="ds-name">'+(q?_dsHighlight(_esc(f.name),q):_esc(f.name))+'</div>'+
        '<div class="ds-meta">'+(date||'')+(sz?' · '+sz:'')+' · <span class="ds-type-badge">'+typeLabel+'</span></div>'+
      '</div>'+
      '<div class="ds-actions"><a class="ds-open-btn" href="'+_esc(f.webViewLink||'')+'" target="_blank" onclick="event.stopPropagation()">Open</a></div></div>';
  }).join('');
}
function _dsOpenPreview(id,name,mimeType,webViewLink){
  var panel=document.getElementById('ds-preview-panel');if(!panel)return;
  document.querySelectorAll('#ds-results .ds-item').forEach(function(el){el.classList.remove('ds-item-active');});
  var active=document.getElementById('dsi-'+id);if(active)active.classList.add('ds-item-active');
  var dlUrl='https://drive.google.com/uc?export=download&id='+id;
  var isPdf=mimeType==='application/pdf';
  var isGdoc=mimeType==='application/vnd.google-apps.document';
  var isGsheet=mimeType==='application/vnd.google-apps.spreadsheet';
  var isGslides=mimeType==='application/vnd.google-apps.presentation';
  var isFolder=mimeType==='application/vnd.google-apps.folder';
  if(isPdf){
    panel.innerHTML=
      '<div class="pdf-panel-header">'+
        '<span class="pdf-panel-label">DRIVE SEARCH</span>'+
        '<div class="pdf-panel-actions">'+
          '<span class="pdf-page-group">'+
            '<button class="pdf-rot-btn pdf-page-btn" id="ds-pdf-prev-btn" onclick="dsPdfPrevPage()" title="Previous page">&#8249;</button>'+
            '<span id="ds-pdf-page-lbl" class="pdf-page-lbl">&#8212; / &#8212;</span>'+
            '<button class="pdf-rot-btn pdf-page-btn" id="ds-pdf-next-btn" onclick="dsPdfNextPage()" title="Next page">&#8250;</button>'+
          '</span>'+
          '<button class="pdf-rot-btn" onclick="dsPdfRotate(-90)" title="Rotate left">&#8634;</button>'+
          '<button class="pdf-rot-btn" onclick="dsPdfRotate(90)" title="Rotate right">&#8635;</button>'+
          '<span class="pdf-zoom-group">'+
            '<button class="pdf-rot-btn pdf-zoom-btn" onclick="dsPdfZoom(-0.25)" title="Zoom out">&#8722;</button>'+
            '<span id="ds-pdf-zoom-lbl" class="pdf-zoom-lbl">75%</span>'+
            '<button class="pdf-rot-btn pdf-zoom-btn" onclick="dsPdfZoom(+0.25)" title="Zoom in">+</button>'+
          '</span>'+
          '<button class="pdf-rot-btn" onclick="dsPdfDownload()" title="Download" style="font-size:15px">&#10515;</button>'+
          '<a href="'+_esc(webViewLink||'')+'" target="_blank" class="pdf-open-link" style="margin-left:6px">Open &#8599;</a>'+
        '</div>'+
      '</div>'+
      '<div id="ds-pdf-title-bar"></div>'+
      '<div id="ds-pdf-rotate-wrap">'+
        '<div id="ds-pdf-thumbs" aria-label="Page thumbnails"></div>'+
        '<div id="ds-pdf-canvas-wrap"></div>'+
        '<div id="ds-pdf-loading" role="status" aria-live="polite">'+
          '<div class="pdf-load-card">'+
            '<div class="pdf-load-doc" aria-hidden="true">'+
              '<div class="pdf-load-line pdf-load-line-1"></div>'+
              '<div class="pdf-load-line pdf-load-line-2"></div>'+
              '<div class="pdf-load-line pdf-load-line-3"></div>'+
              '<div class="pdf-load-line pdf-load-line-4"></div>'+
              '<div class="pdf-load-line pdf-load-line-5"></div>'+
              '<div class="pdf-load-line pdf-load-line-6"></div>'+
              '<div class="pdf-load-corner"></div>'+
            '</div>'+
            '<div class="pdf-load-spinner" aria-hidden="true"><span></span><span></span><span></span></div>'+
            '<div class="pdf-load-title" id="ds-pdf-loading-title">Loading document</div>'+
          '</div>'+
        '</div>'+
      '</div>';
    _gwithToken(function(){requestAnimationFrame(function(){window._dsPdfLoad(id,name,_gTok);});});
  } else if(isFolder){
    panel.innerHTML='<div class="ds-preview-placeholder"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg><div>Preview not available for folders.</div></div>';
  } else {
    var previewUrl=isGdoc?'https://docs.google.com/document/d/'+id+'/preview':isGsheet?'https://docs.google.com/spreadsheets/d/'+id+'/preview':isGslides?'https://docs.google.com/presentation/d/'+id+'/preview':'https://drive.google.com/file/d/'+id+'/preview';
    panel.innerHTML=
      '<div class="ds-preview-bar">'+
        '<span class="ds-preview-title">'+_esc(name)+'</span>'+
        '<div class="pdf-panel-actions">'+
          '<a href="'+dlUrl+'" target="_blank" download class="pdf-rot-btn" title="Download" style="text-decoration:none;display:flex;align-items:center;justify-content:center;font-size:15px">&#10515;</a>'+
          '<a href="'+_esc(webViewLink||'')+'" target="_blank" class="pdf-open-link" style="margin-left:6px">Open &#8599;</a>'+
        '</div>'+
      '</div>'+
      '<div id="ds-iframe-wrap" style="flex:1;overflow:auto;position:relative;min-height:0"><iframe id="ds-iframe" src="'+previewUrl+'" allowfullscreen sandbox="allow-scripts allow-same-origin allow-forms allow-popups" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none"></iframe></div>';
  }
}
function _dsBrowseFolder(folderId,folderName){
  var resEl=document.getElementById('ds-results');
  resEl.innerHTML='<div class="ds-loading"><span class="ds-spinner"></span>Loading folder…</div>';
  _dsBreadcrumb.push({id:folderId,name:folderName});_dsUpdateBreadcrumb();
  _gwithToken(async function(){
    try{
      var flds='files(id,name,mimeType,modifiedTime,webViewLink,size)';
      var tail='&fields='+flds+'&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true&orderBy=folder,name';
      var hdr={'Authorization':'Bearer '+_gTok};
      var res=await fetch('https://www.googleapis.com/drive/v3/files?q='+encodeURIComponent("'"+folderId+"' in parents and trashed=false")+tail,{headers:hdr});
      var data=await res.json();
      _dsRenderResults(data.files||[],null,_esc(folderName)+' — '+(data.files||[]).length+' item'+((data.files||[]).length===1?'':'s'));
    }catch(e){resEl.innerHTML='<div class="ds-empty-state" style="color:#c0392b">Failed to load folder: '+_esc(e.message)+'</div>';}
  });
}
function _dsUpdateBreadcrumb(){
  var el=document.getElementById('ds-breadcrumb');if(!el)return;
  if(!_dsBreadcrumb.length){el.style.display='none';return;}
  el.style.display='flex';
  el.innerHTML='<button class="ds-breadcrumb-btn" onclick="_dsBreadcrumbHome()">Search</button>'+
    _dsBreadcrumb.map(function(seg,i){
      return'<span class="ds-breadcrumb-sep">›</span>'+
        (i<_dsBreadcrumb.length-1
          ?'<button class="ds-breadcrumb-btn" onclick="_dsBreadcrumbTo('+i+')">'+_esc(seg.name)+'</button>'
          :'<span style="font-weight:600;color:var(--fg-ink)">'+_esc(seg.name)+'</span>');
    }).join('');
}
function _dsBreadcrumbHome(){_dsBreadcrumb=[];_dsUpdateBreadcrumb();var resEl=document.getElementById('ds-results');resEl.innerHTML='<div class="ds-empty-state">Enter a search term to find documents in Google Drive.</div>';var panel=document.getElementById('ds-preview-panel');if(panel)panel.innerHTML='<div class="ds-preview-placeholder"><svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg><div>Select a file to preview</div></div>';}
function _dsBreadcrumbTo(idx){var seg=_dsBreadcrumb[idx];_dsBreadcrumb=_dsBreadcrumb.slice(0,idx);_dsBrowseFolder(seg.id,seg.name);}
/* ── Multi-strategy parallel query ─────────────────────────────── */
async function _dsMultiQuery(q){
  var seen=new Map();
  var add=function(files){(files||[]).forEach(function(f){if(!seen.has(f.id))seen.set(f.id,f);});};
  var flds='files(id,name,mimeType,modifiedTime,webViewLink,size)';
  var tail='&fields='+flds+'&pageSize=30&supportsAllDrives=true&includeItemsFromAllDrives=true';
  var hdr={'Authorization':'Bearer '+_gTok};
  var qc=q.replace(/'/g,'');

  // Tokenise: extract meaningful terms (min 3 chars, not stop-words)
  var terms=_dsTerms(q);

  // Build query set — phrase match + individual terms (up to 4), all trashed=false
  var queries=["fullText contains '"+qc+"' and trashed=false",
               "name contains '"+qc+"' and trashed=false"];
  terms.slice(0,4).forEach(function(t){
    if(t!==qc.toLowerCase())queries.push("fullText contains '"+t+"' and trashed=false");
  });

  // Fire all in parallel
  var results=await Promise.all(queries.map(function(query){
    return fetch('https://www.googleapis.com/drive/v3/files?q='+encodeURIComponent(query)+tail+'&orderBy=modifiedTime+desc',{headers:hdr})
      .then(function(r){return r.json();}).then(function(d){return d.files||[];}).catch(function(){return[];});
  }));
  results.forEach(add);
  return Array.from(seen.values());
}

/* ── Extract meaningful terms from a free-text query ───────────── */
function _dsTerms(q){
  // Extract quoted phrases first
  var phrases=[];
  q.replace(/"([^"]+)"/g,function(_,p){phrases.push(p.toLowerCase().trim());});
  var base=q.replace(/"[^"]*"/g,' ').toLowerCase().replace(/[^a-z0-9\s]/g,' ');
  var words=base.split(/\s+/).filter(function(w){return w.length>=3&&!_gStop.has(w);});
  return phrases.concat(words).filter(function(w,i,a){return a.indexOf(w)===i;});
}

/* ── Relevance score (0–1) of a filename to a query ────────────── */
function _dsRelevance(q,filename,mime){
  var fname=filename.toLowerCase().replace(/\.[a-z]{2,5}$/i,'').replace(/[^a-z0-9\s]/g,' ');
  var terms=_dsTerms(q);
  if(!terms.length)return 0;
  var qNorm=q.toLowerCase().replace(/[^a-z0-9\s]/g,' ').trim();
  // Exact phrase → perfect score
  if(fname.includes(qNorm))return 1.0;
  // Weighted term overlap — miss penalty prevents generic shared terms
  // from masking a name/service-number mismatch
  var total=0,matched=0,missed=0;
  terms.forEach(function(t){
    var w=Math.max(1,t.length-2);
    total+=w;
    if(fname.includes(t))matched+=w;
    else missed+=w;
  });
  if(!total)return 0;
  var base=Math.max(0,(matched-missed*2)/total);
  if(mime==='application/pdf')base=Math.min(1,base+0.05);
  return base;
}

/* ── IDF-weighted relevance score (0–1) for Drive Search results ── */
// Uses per-result IDF so generic terms (appear in many files) are down-weighted
// automatically; rare/unique terms (names, service numbers) carry more weight.
function _dsScoreIDF(terms,idf,filename,mime){
  var fname=filename.toLowerCase().replace(/\.[a-z]{2,5}$/i,'').replace(/[^a-z0-9\s]/g,' ');
  if(!terms.length)return 0;
  var total=0,matched=0,missed=0;
  terms.forEach(function(t){
    var w=idf[t]!=null?idf[t]:Math.max(1,t.length-2);
    total+=w;
    if(fname.includes(t))matched+=w;
    else missed+=w;
  });
  if(!total)return 0;
  var base=Math.max(0,(matched-missed*2)/total);
  if(mime==='application/pdf')base=Math.min(1,base+0.05);
  return base;
}

/* ── Highlight matched terms in the file name ───────────────────── */
function _dsHighlight(escaped,q){
  var terms=_dsTerms(q);
  var out=escaped;
  terms.slice(0,5).forEach(function(t){
    if(t.length<3)return;
    var re=new RegExp('('+t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','gi');
    out=out.replace(re,'<mark class="ds-hl">$1</mark>');
  });
  return out;
}

/* ── Helpers ────────────────────────────────────────────────────── */
function _dsIcon(mime){if(mime==='application/pdf')return'📄';if(mime.includes('spreadsheet')||mime.includes('excel'))return'📊';if(mime.includes('document')||mime.includes('word'))return'📝';if(mime.includes('presentation')||mime.includes('powerpoint'))return'📋';if(mime.includes('image'))return'🖼️';if(mime.includes('folder'))return'📁';return'📎';}
function _dsMimeLabel(mime){if(mime==='application/pdf')return'PDF';if(mime.includes('spreadsheet')||mime.includes('excel'))return'Spreadsheet';if(mime.includes('document')||mime.includes('word'))return'Document';if(mime.includes('presentation')||mime.includes('powerpoint'))return'Presentation';if(mime.includes('image'))return'Image';if(mime.includes('folder'))return'Folder';return'File';}
function _dsFmtSize(b){if(b<1024)return b+'B';if(b<1048576)return Math.round(b/1024)+'KB';return(b/1048576).toFixed(1)+'MB';}
function dsPreview(id,name,link){_dsOpenPreview(id,name,'application/pdf',link||'');}

// ── Google Drive PDF Integration ──────────────────────────────
var GDRIVE_CLIENT_ID='1073280029907-0166ddlukbg2mg6mprp6hlk34l9fsj5a.apps.googleusercontent.com';
var GDRIVE_FOLDER_ID='1aIq34zv9PNbV--h7xPC1r_p8_uZ6VjSk'; // Documents/2026 CNASS OUTGOING SCANNED DOCUMENTS
var _gTok=null,_gTC=null,_gTCb=null;

// ── Token client ──
function _gclient(){
  if(_gTC)return _gTC;
  if(!window.google||!window.google.accounts)return null;
  _gTC=google.accounts.oauth2.initTokenClient({
    client_id:GDRIVE_CLIENT_ID,
    scope:'https://www.googleapis.com/auth/drive.readonly',
    prompt:'',
    callback:function(r){if(r.access_token){_gTok=r.access_token;if(_gTCb){var c=_gTCb;_gTCb=null;c();}}}
  });
  return _gTC;
}
function _gwithToken(cb){
  if(_gTok){cb();return;}
  var tc=_gclient();
  if(!tc){setTimeout(function(){_gwithToken(cb);},400);return;}
  _gTCb=cb;
  tc.requestAccessToken({prompt:''});
}

// ── Stop words to ignore when picking search terms ──
var _gStop=new Set(['that','this','with','from','have','will','been','were','they','their','which','when','what','where','also','more','into','some','than','then','there','these','those','after','about','other','your','each','such','over','both','during','before','between','should','could','would','shall','must','being','having','making','taking','request','order','ensure','conduct','first','second','third','within','under','above','following','regard','subject','letter','dated','naval','headquarters','branch','navy','nigerian','officer','command','approval','international','assessment','assessments','establishment','establishments','infrastructure','environmental','management','conference','compliance','standardisation','production','presentation','inspection','invitation','attend','place','work','safety','report','executive','evaluation','annual','facilities','office','purchase','senior','retired','exercise','general','quarter','systems','standard','standards','equipment','items','funds','review','summary','activities','information','operations','random','hazards','joint','video','audit','ships','minute','action','forward','herewith','attached','copy','copies','reference','attention','necessary','required','submit','submitted','provide','provided','note','noted','seen','date','please','kindly','urgent','immediate','memo','signal','flag','issue','issued','direct','directed','follow','upon','into','back','down','from','been','done','made','take','came','come','went','went','come','goes','going','give','given','keep','kept','hold','held','show','shown','find','found','know','known','said','says','said','well','very','just','only','also','much','many','most','more','less','same','like','used','uses','need','needed','using','used',]);

// ── Compute IDF weights for terms across a set of filenames ──
// idf[t] = log((N+1) / max(1, df[t])), floored at 0.1.
// A term in every filename scores ~0.1 (generic); one in only 1 scores high (discriminating).
function _computeIDF(terms,fnames){
  var N=fnames.length;
  var idf={};
  terms.forEach(function(t){
    var tw=typeof t==='object'?t.w:t;
    var df=0;
    fnames.forEach(function(fn){if(fn.toLowerCase().replace(/[^a-z0-9\s]/g,' ').includes(tw))df++;});
    idf[tw]=Math.max(0.1,Math.log((N+1)/Math.max(1,df)));
  });
  return idf;
}

// ── Pick the N most distinctive words from a text ──
// Returns [{w, acronym}] — acronym=true when word was uppercase in a mixed-case subject.
function _gDistinct(text,n){
  var raw=text||'';
  var upCt=(raw.match(/[A-Z]/g)||[]).length;
  var loCt=(raw.match(/[a-z]/g)||[]).length;
  var allCaps=upCt>loCt*2;
  var seen=new Set(),words=[];
  function add(w,acr){if(w.length>2&&!_gStop.has(w)&&!seen.has(w)){seen.add(w);words.push({w:w,acronym:acr});}}
  if(!allCaps){
    (raw.match(/\b[A-Z]{2,}\b/g)||[]).forEach(function(w){add(w.toLowerCase(),true);});
    raw.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/)
      .filter(function(w){return w.length>4;}).forEach(function(w){add(w,false);});
  }else{
    raw.toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/)
      .filter(function(w){return w.length>4;})
      .sort(function(a,b){return b.length-a.length;})
      .forEach(function(w){add(w,false);});
  }
  return words.slice(0,n);
}

// ── Score a PDF filename against a record subject (0–1) ──
// Acronyms (uppercase in mixed-case text) get 2.5× weight.
// Exact phrase match → 1.0 immediately.
// Partial match: first 70% of term → 0.4× weight.
function _gScore(subject,filename,idf){
  var terms=_gDistinct(subject,12);
  var fname=filename.toLowerCase().replace(/\.pdf$/i,'').replace(/[^a-z0-9\s]/g,' ');
  if(!terms.length)return 0;
  // Exact phrase bonus
  var subNorm=subject.toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
  if(fname.includes(subNorm.slice(0,30)))return 1.0;
  var total=0,matched=0,missed=0;
  terms.forEach(function(t){
    var boost=t.acronym?2.5:1.0;
    // IDF from candidate set (if provided) supersedes length heuristic
    var termIdf=idf&&idf[t.w]!=null?idf[t.w]:Math.max(1,t.w.length-2);
    var wt=termIdf*boost;
    total+=wt;
    if(fname.includes(t.w))matched+=wt;
    else missed+=wt;
  });
  if(!total)return 0;
  return Math.max(0,(matched-missed*2)/total);
}

// ── Fetch PDF candidates — parallel fullText + name queries, 5 terms ──
async function _gCandidates(subject,fileref){
  var subjectWords=_gDistinct(subject,5).map(function(t){return t.w;});
  // Pull alphanumeric chunks from file ref (handles "NHQ:020/278/25/VOL.I" etc.)
  var refChunks=((fileref||'').match(/[A-Z0-9]{4,}/gi)||[]).slice(0,3).map(function(s){return s.toLowerCase();});
  var terms=subjectWords.concat(refChunks).filter(function(w,i,a){return a.indexOf(w)===i;}).slice(0,6);
  if(!terms.length)return[];
  console.log('[Drive] Querying with terms:',terms);
  var seen=new Map();
  var tail='&fields=files(id,name,webViewLink)&pageSize=20&supportsAllDrives=true&includeItemsFromAllDrives=true';
  var hdr={'Authorization':'Bearer '+_gTok};
  // Build fullText + name query pair per term and fire all in parallel
  var allQ=[];
  terms.forEach(function(kw){
    var k=kw.replace(/'/g,'');
    allQ.push("mimeType='application/pdf' and trashed=false and fullText contains '"+k+"'");
    allQ.push("mimeType='application/pdf' and trashed=false and name contains '"+k+"'");
  });
  var results=await Promise.all(allQ.map(function(q){
    return fetch('https://www.googleapis.com/drive/v3/files?q='+encodeURIComponent(q)+tail,{headers:hdr})
      .then(function(r){if(r.status===401){_gTok=null;return{files:[]};}return r.json();})
      .then(function(d){return d.files||[];}).catch(function(){return[];});
  }));
  results.forEach(function(files){files.forEach(function(f){if(!seen.has(f.id))seen.set(f.id,f);});});
  return Array.from(seen.values());
}

// ── One-time folder reachability check ──
var _gFolderChecked=false;
async function _gCheckFolder(){
  if(_gFolderChecked)return;
  _gFolderChecked=true;
  // Probe: list immediate children (may be subfolders) and any PDFs directly inside
  var q=encodeURIComponent("'"+GDRIVE_FOLDER_ID+"' in parents and trashed=false");
  var res=await fetch('https://www.googleapis.com/drive/v3/files?q='+q+'&fields=files(id,name,mimeType)&pageSize=10&supportsAllDrives=true&includeItemsFromAllDrives=true',{headers:{'Authorization':'Bearer '+_gTok}});
  var d=await res.json();
  console.log('[Drive] Folder children (',res.status,'):');
  (d.files||[]).forEach(function(f,i){console.log('  ['+i+']',f.mimeType==='application/vnd.google-apps.folder'?'[FOLDER]':'[FILE]',f.name);});
  if(d.error)console.error('[Drive] Probe error:',d.error);
}

// ── Find best matching PDF ──
async function _gsearch(subject, fileref){
  await _gCheckFolder();
  var candidates=await _gCandidates(subject, fileref);
  if(!candidates||!candidates.length){
    console.log('[Drive] No candidates found for:',subject.substring(0,60));
    return null;
  }
  // Compute IDF from the candidate pool — generic terms (in many files) get low weight
  var gTerms=_gDistinct(subject,12);
  var cFnames=candidates.map(function(f){return f.name;});
  var idf=_computeIDF(gTerms,cFnames);
  var best=null,bestScore=0,THRESHOLD=0.08;
  candidates.forEach(function(f){
    var s=_gScore(subject,f.name,idf);
    if(s>bestScore){bestScore=s;best=f;}
  });
  console.log('[Drive] Candidates:',candidates.length,' Best:',best?best.name:'none',' Score:',bestScore.toFixed(3));
  return bestScore>=THRESHOLD?best:null;
}

// ── UI orchestration ──
function gdriveSearchForRecord(subject, fileref){
  var panel=document.getElementById('d-pdf-panel');
  var loading=document.getElementById('d-pdf-loading');
  var frame=document.getElementById('d-pdf-frame');
  var titleEl=document.getElementById('d-pdf-title');
  var openLink=document.getElementById('d-pdf-open');
  var mbox=document.querySelector('.detail-mbox');
  if(!panel)return;
  panel.style.display='flex';
  if(loading)loading.style.display='flex';
  if(frame){frame.src='';frame.style.display='none';}
  if(titleEl)titleEl.textContent='';
  if(mbox)mbox.classList.add('detail-has-pdf');
  _gwithToken(async function(){
    var file=await _gsearch(subject, fileref);
    if(loading)loading.style.display='none';
    var subjectEl=document.getElementById('d-subject');
    if(file){
      if(titleEl)titleEl.textContent=file.name.replace(/\.pdf$/i,'');
      var wvl=file.webViewLink||'#';
      if(openLink)openLink.href=wvl;
      if(subjectEl){subjectEl.href=wvl;subjectEl.classList.add('detail-subject-linked');}
      if(frame){frame.src='https://drive.google.com/file/d/'+file.id+'/preview';frame.style.display='block';}
    }else{
      panel.style.display='none';
      if(mbox)mbox.classList.remove('detail-has-pdf');
      if(subjectEl){subjectEl.removeAttribute('href');subjectEl.classList.remove('detail-subject-linked');}
    }
  });
}