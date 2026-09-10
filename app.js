
// ---------- shared ----------
const $=s=>document.querySelector(s);
const todayKey=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
function rng(seedStr){let h=1779033703^seedStr.length;for(let i=0;i<seedStr.length;i++){h=Math.imul(h^seedStr.charCodeAt(i),3432918353);h=h<<13|h>>>19;}
  return function(){h=Math.imul(h^(h>>>16),2246822507);h=Math.imul(h^(h>>>13),3266489909);h^=h>>>16;return (h>>>0)/4294967296;};}
const pick=(r,arr)=>arr[Math.floor(r()*arr.length)];
function shuffle(r,arr){const a=arr.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
const money=n=>'$'+Math.round(n).toLocaleString();
const fmtT=ms=>{const s=Math.floor(ms/1000);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
const DIFFS=['easy','medium','hard'];
$('#dateLabel').textContent=todayKey();
const LS={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v);}catch(e){return d;}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}};

// tabs
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{
  document.querySelectorAll('.tab').forEach(x=>x.setAttribute('aria-selected',x===t));
  ['haggle','bidder','tab'].forEach(k=>{$('#p-'+k).hidden=(k!==t.dataset.tab);});
}));

// difficulty segmented controls
function segControl(el,current,onPick){
  el.innerHTML='';DIFFS.forEach(d=>{const b=document.createElement('button');b.type='button';b.textContent=d[0].toUpperCase()+d.slice(1);b.setAttribute('aria-pressed',d===current);b.addEventListener('click',()=>onPick(d));el.appendChild(b);});
}

// timer
function makeTimer(el){
  const T={start:null,stop:null,iv:null};
  T.begin=()=>{if(T.start||T.stop)return;T.start=Date.now();el.classList.add('run');T.iv=setInterval(()=>{el.textContent=fmtT(Date.now()-T.start);},250);};
  T.end=()=>{if(!T.start||T.stop)return 0;T.stop=Date.now();clearInterval(T.iv);el.classList.remove('run');el.textContent=fmtT(T.stop-T.start);return T.stop-T.start;};
  T.reset=()=>{clearInterval(T.iv);T.start=null;T.stop=null;el.classList.remove('run');el.textContent='0:00';};
  return T;
}

// ---------- auth + leaderboard (Supabase) ----------
const CFG=window.DEALDAILY_CONFIG||{};
const configured=!!(CFG.supabaseUrl&&CFG.supabaseAnonKey&&!/YOUR-PROJECT/.test(CFG.supabaseUrl));
let sb=null,user=null;
if(configured&&window.supabase){sb=window.supabase.createClient(CFG.supabaseUrl,CFG.supabaseAnonKey);}
function displayName(u){const m=u.user_metadata||{};return (m.full_name||m.name||m.user_name||m.preferred_username||(u.email||'').split('@')[0]||'Player').slice(0,20);}
function avatarUrl(u){const m=u.user_metadata||{};return m.avatar_url||m.picture||'';}
function renderAuth(){
  const box=$('#auth');
  if(!configured){box.innerHTML=`<span class="tag warm">login not configured yet</span>`;return;}
  if(user){box.innerHTML=`${avatarUrl(user)?`<img class="avatar" src="${avatarUrl(user)}" alt="">`:''}<span class="who">${displayName(user).replace(/</g,'&lt;')}</span><button class="btn sm sec" id="logout">Log out</button>`;
    $('#logout').addEventListener('click',async()=>{await sb.auth.signOut();});}
  else{const prov=CFG.providers||['google','discord'];const label={google:'Log in with Google',discord:'Log in with Discord'};
    box.innerHTML=prov.map((p,i)=>`<button class="btn sm${i?' sec':''}" data-prov="${p}">${label[p]||p}</button>`).join('');
    box.querySelectorAll('[data-prov]').forEach(b=>b.addEventListener('click',()=>sb.auth.signInWithOAuth({provider:b.dataset.prov,options:{redirectTo:location.origin+location.pathname}})));}
}
async function initAuth(){
  renderAuth();if(!sb)return;
  const {data}=await sb.auth.getSession();user=data.session?data.session.user:null;renderAuth();
  sb.auth.onAuthStateChange((_e,session)=>{user=session?session.user:null;renderAuth();refreshAllLb();});
}
function lbKey(game,diff){return `lb/${game}-${diff}-${todayKey()}`;}
async function lbRead(game,diff){
  if(sb){try{const {data,error}=await sb.from('scores').select('name,avatar,m1,m2,ms,user_id').eq('game',game).eq('diff',diff).eq('day',todayKey()).limit(500);if(!error&&data)return data;}catch(e){}}
  return LS.get(lbKey(game,diff),[]);
}
async function lbPost(game,diff,entry){
  if(sb&&user){const row={user_id:user.id,name:displayName(user),avatar:avatarUrl(user),game,diff,day:todayKey(),m1:entry.m1,m2:entry.m2||0,ms:entry.ms};
    const {error}=await sb.from('scores').upsert(row,{onConflict:'user_id,game,diff,day'});return !error;}
  const key=lbKey(game,diff);const list=LS.get(key,[]);const name=user?displayName(user):'You';const idx=list.findIndex(e=>e.name===name);
  const row=Object.assign({name,user_id:'local'},entry);if(idx>=0)list[idx]=row;else list.push(row);LS.set(key,list.slice(0,200));return true;
}
// cols: [[label,field,fmt]]; sortFields in priority order; pending = score to post (or null)
async function renderLb(box,game,diff,cols,sortFields,pending){
  const entries=await lbRead(game,diff);
  entries.sort((a,b)=>{for(const f of sortFields){if((a[f]??0)!==(b[f]??0))return (a[f]??0)-(b[f]??0);}return 0;});
  const meId=user?user.id:'local';
  let html=`<h3>Leaderboard · ${diff} · ${todayKey()} ${sb?'<span class="tag good">global</span>':'<span class="tag">this device</span>'}</h3>`;
  if(pending){
    if(sb&&!user)html+=`<div class="note">Log in (top right) to post your score to the global board.</div>`;
    else html+=`<div class="row" style="margin:8px 0"><button class="btn sm" id="${game}Save">Post my score</button><span class="note" id="${game}Posted"></span></div>`;
  }
  if(!entries.length)html+=`<div class="empty">No scores yet today on ${diff}. Be first.</div>`;
  else{html+=`<table><tr><th>#</th><th>Player</th>${cols.map(c=>`<th class="num">${c[0]}</th>`).join('')}</tr>`+entries.slice(0,20).map((e,i)=>`<tr class="${e.user_id===meId?'me':''}"><td class="num">${i+1}</td><td>${e.avatar?`<img class="avatar sm" src="${e.avatar}" alt="">`:''}${String(e.name).replace(/</g,'&lt;')}</td>${cols.map(c=>`<td class="num">${c[2](e[c[1]])}</td>`).join('')}</tr>`).join('')+'</table>';}
  box.innerHTML=html;
  const save=$('#'+game+'Save');
  if(save){save.addEventListener('click',async()=>{save.disabled=true;const ok=await lbPost(game,diff,pending);$('#'+game+'Posted').textContent=ok?'Posted.':'Could not post — try again.';renderLb(box,game,diff,cols,sortFields,null);});}
}
let LB_REFRESH=[];
function refreshAllLb(){LB_REFRESH.forEach(f=>f());}
// ---------- HAGGLE ----------
const H_ITEMS=[['Vintage road bike',420],['Espresso machine',650],['Cast-iron skillet set',140],['Mid-century lamp',260],['Surfboard',380],['Record player',310],['Leather jacket',290],['Kayak',540],['Camera lens',480],['Mountain of LEGO',210],['Standing desk',350],['Guitar amp',300],['Telescope',460],['Dining chairs (4)',330],['Air fryer',95],['Snowboard',390],['Sewing machine',180],['Cordless drill set',220],['Mountain bike',720],['Retro arcade cabinet',900]];
const H_CFG={easy:{n:3,offers:5,bands:[0.75,0.88,0.96],round:5},medium:{n:5,offers:4,bands:[0.8,0.9,0.97],round:5},hard:{n:7,offers:3,bands:[0.85,0.93,0.985],round:1}};
const H_COLS=[['Overpaid','m1',v=>money(v)],['Offers','m2',v=>v],['Time','ms',fmtT]];
let H,hDiff=LS.get('hDiff','medium');const hT=makeTimer($('#hTimer'));
function newHaggle(){
  const cfg=H_CFG[hDiff];const r=rng(`haggle:${hDiff}:${todayKey()}`);
  const items=shuffle(r,H_ITEMS).slice(0,cfg.n).map(([name,base])=>{
    const ask=Math.round(base*(0.85+r()*0.5)/5)*5;
    const floor=Math.round(ask*(0.55+r()*0.3)/cfg.round)*cfg.round;
    return {name,ask,floor,offers:[],paid:null};
  });
  H={items,done:false,cfg};hT.reset();$('#hResult').innerHTML='';
  segControl($('#hDiff'),hDiff,d=>{hDiff=d;LS.set('hDiff',d);newHaggle();});
  renderHaggle();renderLb($('#hLb'),'haggle',hDiff,H_COLS,['m1','m2','ms'],null);
}
function reaction(ratio){const [a,b,c]=H.cfg.bands;
  if(ratio>=1)return [4,'Deal.'];if(ratio>=c)return [3,'So close I can taste it.'];if(ratio>=b)return [2,'Getting warmer.'];if(ratio>=a)return [1,'Not even close.'];return [0,'Insulting. They almost walk.'];}
function renderHaggle(){
  const box=$('#hItems');box.innerHTML='';let spent=0,offers=0,askTotal=0;
  H.items.forEach((it,i)=>{
    askTotal+=it.ask;offers+=it.offers.length;if(it.paid!=null)spent+=it.paid;
    const fullPrice=it.paid===it.ask&&it.offers.length===H.cfg.offers&&it.offers[it.offers.length-1][0]<1;
    const el=document.createElement('div');el.className='item'+(it.paid!=null?(fullPrice?' paid':' done'):'');
    el.innerHTML=`<div><div class="name">${it.name}</div><div class="ask">asking ${money(it.ask)}${it.paid!=null?' · you paid <b>'+money(it.paid)+'</b>':''}</div></div>
      <div>${it.paid!=null?'<span class="tag good">closed</span>':'<span class="tag">'+(H.cfg.offers-it.offers.length)+' offers left</span>'}</div>
      <div class="hist">${it.offers.map(([ratio,amt])=>{const [c,t]=reaction(ratio);return `<span class="chip c${c}" title="${t}">${money(amt)} · ${t}</span>`;}).join('')}</div>
      ${it.paid==null?`<div class="offer"><input type="number" inputmode="numeric" min="1" step="1" placeholder="Your offer" aria-label="Offer for ${it.name}" id="hIn${i}"><button class="btn" data-i="${i}">Offer</button></div>`:''}`;
    box.appendChild(el);
  });
  $('#hAsk').textContent=money(askTotal);$('#hSpent').textContent=money(spent);$('#hOffers').textContent=offers;
  box.querySelectorAll('button[data-i]').forEach(b=>b.addEventListener('click',()=>makeOffer(+b.dataset.i)));
  box.querySelectorAll('input').forEach(inp=>{inp.addEventListener('focus',()=>hT.begin());inp.addEventListener('keydown',e=>{if(e.key==='Enter')makeOffer(+inp.id.slice(3));});});
  if(H.items.every(it=>it.paid!=null)&&!H.done){H.done=true;finishHaggle(askTotal,spent,offers);}
}
function makeOffer(i){
  const it=H.items[i];const inp=$('#hIn'+i);const amt=Math.round(+inp.value);if(!amt||amt<1)return;
  hT.begin();const ratio=amt/it.floor;it.offers.push([ratio,amt]);
  if(ratio>=1)it.paid=amt;else if(it.offers.length>=H.cfg.offers)it.paid=it.ask;
  renderHaggle();const next=document.querySelector('#hItems input');if(next)next.focus();
}
function finishHaggle(askTotal,spent,offers){
  const ms=hT.end();const floors=H.items.reduce((s,it)=>s+it.floor,0);const saved=askTotal-spent;const over=spent-floors;
  const grade=over<=askTotal*0.03?'Shark':over<=askTotal*0.08?'Closer':over<=askTotal*0.15?'Fair':'Tourist';
  const rows=H.items.map(it=>it.offers.map(([r])=>['🟥','⬜','🟨','🟩','✅'][reaction(r)[0]]).join('')).join('\n');
  $('#hResult').innerHTML=`<div class="result">${grade}. Spent ${money(spent)} against ${money(askTotal)} asking — saved ${money(saved)}, overpaid the floors by ${money(over)}, ${offers} offers, ${fmtT(ms)}.</div>
   <div class="share">Haggle ${todayKey()} · ${hDiff} · ${grade}\n${rows}\nOverpaid ${money(over)} · ${offers} offers · ${fmtT(ms)}</div>`;
  renderLb($('#hLb'),'haggle',hDiff,H_COLS,['m1','m2','ms'],{m1:over,m2:offers,ms});
}

// ---------- BIDDER ----------
const B_NAMES=['Maya','Leo','Priya','Sam','Nora','Theo','Ava','Jonah','Zoe','Eli'];
const B_ITEMS=['the guitar','the painting','the watch','the bike','the lamp','the camera','the rug','the telescope','the espresso machine','the surfboard'];
const B_PRICES=[[40,60,90,120,180,250],[50,75,100,150,200,275],[25,45,70,110,160,220]];
const B_CFG={easy:{n:4,direct:true},medium:{n:5,direct:true},hard:{n:5,direct:false}};
const B_COLS=[['Checks','m1',v=>v],['Time','ms',fmtT]];
let B,bDiff=LS.get('bDiff','medium');const bT=makeTimer($('#bTimer'));
function permutations(a){if(a.length<=1)return [a];const out=[];a.forEach((v,i)=>{permutations(a.slice(0,i).concat(a.slice(i+1))).forEach(p=>out.push([v].concat(p)));});return out;}
const PERMS={4:permutations([0,1,2,3]),5:permutations([0,1,2,3,4])};
function makeClues(r,n,names,items,prices,sol,direct){
  const cands=[];const pr=b=>prices[sol.priceOf[b]],it=b=>items[sol.itemOf[b]];const cap=s=>s.replace(/^the /,'The ');
  for(let a=0;a<n;a++)for(let b=0;b<n;b++)if(a!==b){
    if(pr(a)>pr(b))cands.push({t:`${names[a]} paid more than ${names[b]}.`,f:s=>prices[s.priceOf[a]]>prices[s.priceOf[b]]});
    if(pr(a)>pr(b))cands.push({t:`${cap(it(a))} sold for exactly $${pr(a)-pr(b)} more than ${it(b)}.`,f:s=>{const ia=s.itemOf.indexOf(sol.itemOf[a]),ib=s.itemOf.indexOf(sol.itemOf[b]);return prices[s.priceOf[ia]]-prices[s.priceOf[ib]]===pr(a)-pr(b);}});
    if(pr(a)>pr(b))cands.push({t:`Whoever won ${it(a)} paid more than ${names[b]}.`,f:s=>{const ia=s.itemOf.indexOf(sol.itemOf[a]);return prices[s.priceOf[ia]]>prices[s.priceOf[b]];}});
  }
  for(let b=0;b<n;b++){
    if(direct){for(let k=0;k<n;k++)if(k!==sol.itemOf[b])cands.push({t:`${names[b]} did not win ${items[k]}.`,f:s=>s.itemOf[b]!==k});
      cands.push({t:`${names[b]} paid $${pr(b)}.`,f:s=>s.priceOf[b]===sol.priceOf[b]});
      cands.push({t:`${cap(it(b))} went for $${pr(b)}.`,f:s=>s.priceOf[s.itemOf.indexOf(sol.itemOf[b])]===sol.priceOf[b]});}
    if(sol.priceOf[b]===n-1)cands.push({t:`Whoever won ${it(b)} paid the most.`,f:s=>s.priceOf[s.itemOf.indexOf(sol.itemOf[b])]===n-1});
    if(sol.priceOf[b]===0)cands.push({t:`${names[b]} got the cheapest lot.`,f:s=>s.priceOf[b]===0});
    if(sol.priceOf[b]===n-1)cands.push({t:`${names[b]} paid the most of anyone.`,f:s=>s.priceOf[b]===n-1});
    const nb=(b+1)%n;
    if(Math.abs(sol.priceOf[b]-sol.priceOf[nb])===1)cands.push({t:`${names[b]} and ${names[nb]} paid adjacent prices.`,f:s=>Math.abs(s.priceOf[b]-s.priceOf[nb])===1});
    cands.push({t:`${cap(it(b))} did not go to ${names[nb]}.`,f:s=>s.itemOf[nb]!==sol.itemOf[b]});
  }
  const P=PERMS[n];
  const count=cl=>{let c=0;for(const ip of P){for(const pp of P){const s={itemOf:ip,priceOf:pp};if(cl.every(x=>x.f(s))){c++;if(c>1)return c;}}}return c;};
  const pool=shuffle(r,cands);let chosen=[];
  for(const c of pool){chosen.push(c);if(count(chosen)===1)break;if(chosen.length>12)return [];}
  if(count(chosen)!==1)return [];
  for(let i=chosen.length-1;i>=0;i--){const trial=chosen.filter((_,j)=>j!==i);if(trial.length>=3&&count(trial)===1)chosen.splice(i,1);}
  return chosen;
}
function newBidder(){
  const cfg=B_CFG[bDiff];const n=cfg.n;let r=rng(`bidder:${bDiff}:${todayKey()}`);
  let names,items,prices,sol,clues=[],tries=0;
  while(!clues.length&&tries<20){tries++;names=shuffle(r,B_NAMES).slice(0,n);items=shuffle(r,B_ITEMS).slice(0,n);prices=pick(r,B_PRICES).slice(0,n);
    sol={itemOf:shuffle(r,[...Array(n).keys()]),priceOf:shuffle(r,[...Array(n).keys()])};clues=makeClues(r,n,names,items,prices,sol,cfg.direct);}
  B={n,names,items,prices,sol,clues,checks:0,done:false};bT.reset();
  segControl($('#bDiff'),bDiff,d=>{bDiff=d;LS.set('bDiff',d);newBidder();});
  $('#bClues').innerHTML=clues.map((c,i)=>`<div class="clue"><span class="mono" style="color:var(--muted)">${i+1}.</span> ${c.t}</div>`).join('');
  const g=$('#bGrid');g.innerHTML=`<div class="h">Bidder</div><div class="h">Won</div><div class="h">Paid</div>`+names.map((nm,b)=>`<div class="nm">${nm}</div>
    <select id="bi${b}" aria-label="${nm} won"><option value="">— item —</option>${items.map((it,k)=>`<option value="${k}">${it}</option>`).join('')}</select>
    <select id="bp${b}" aria-label="${nm} paid"><option value="">— price —</option>${prices.map((p,k)=>`<option value="${k}">$${p}</option>`).join('')}</select>`).join('');
  g.querySelectorAll('select').forEach(s=>s.addEventListener('change',()=>bT.begin()));
  $('#bFeedback').textContent='';$('#bResult').innerHTML='';$('#bCheck').disabled=false;
  renderLb($('#bLb'),'bidder',bDiff,B_COLS,['m1','ms'],null);
}
function checkBidder(){
  if(B.done)return;bT.begin();B.checks++;let ok=0,filled=0;
  for(let b=0;b<B.n;b++){const i=$('#bi'+b),p=$('#bp'+b);i.classList.remove('ok');p.classList.remove('ok');
    if(i.value!=='')filled++;if(p.value!=='')filled++;
    if(i.value!==''&&+i.value===B.sol.itemOf[b]){ok++;i.classList.add('ok');}
    if(p.value!==''&&+p.value===B.sol.priceOf[b]){ok++;p.classList.add('ok');}}
  const total=B.n*2;
  if(ok===total){B.done=true;const ms=bT.end();$('#bCheck').disabled=true;$('#bFeedback').textContent='';
    $('#bResult').innerHTML=`<div class="result">Solved in ${B.checks} check${B.checks>1?'s':''}, ${fmtT(ms)}.</div><div class="share">Bidder ${todayKey()} · ${bDiff}\n${'🟩'.repeat(B.n)} ${B.checks} check${B.checks>1?'s':''} · ${fmtT(ms)}</div>`;
    renderLb($('#bLb'),'bidder',bDiff,B_COLS,['m1','ms'],{m1:B.checks,ms});}
  else $('#bFeedback').textContent=`${ok}/${total} correct · ${filled}/${total} filled · check ${B.checks}`;
}
$('#bCheck').addEventListener('click',checkBidder);

// ---------- TAB ----------
const T_MENU=[['IPA',8],['Lager',6],['Margarita',12],['Old Fashioned',14],['Nachos',11],['Wings',13],['Espresso martini',15],['Seltzer',7],['Tacos (3)',12],['Fries',6],['Mezcal neat',13],['Shots (2)',10],['Burger',16],['Cider',7],['Pretzel',9],['Negroni',13],['Wine (glass)',11],['Water (fancy)',4],['Sliders',14],['Nachos (large)',17]];
const T_NAMES=['Maya','Leo','Priya','Sam','Nora','Theo','Ava','Jonah','Zoe','Eli'];
const T_CFG={easy:{items:6,friends:3},medium:{items:8,friends:4},hard:{items:11,friends:5}};
const T_COLS=[['Checks','m1',v=>v],['Time','ms',fmtT]];
let T,tDiff=LS.get('tDiff','medium');const tT=makeTimer($('#tTimer'));
function newTab(){
  const cfg=T_CFG[tDiff];const r=rng(`tab:${tDiff}:${todayKey()}`);
  const lines=shuffle(r,T_MENU).slice(0,cfg.items).map(([nm,p])=>({nm,p:p+(r()<0.5?0:1)}));
  const friends=shuffle(r,T_NAMES).slice(0,cfg.friends);
  let owner;do{owner=lines.map(()=>Math.floor(r()*cfg.friends));}while(new Set(owner).size<cfg.friends);
  const totals=friends.map((_,f)=>lines.reduce((s,l,i)=>s+(owner[i]===f?l.p:0),0));
  T={lines,friends,totals,checks:0,done:false};tT.reset();
  segControl($('#tDiff'),tDiff,d=>{tDiff=d;LS.set('tDiff',d);newTab();});
  $('#tReceipt').innerHTML=lines.map((l,i)=>`<div class="ln"><span>${l.nm}</span><span>$${l.p}</span><select id="tl${i}" aria-label="Who had ${l.nm}"><option value="">— who? —</option>${friends.map((f,k)=>`<option value="${k}">${f}</option>`).join('')}</select></div>`).join('');
  $('#tReceipt').querySelectorAll('select').forEach(s=>s.addEventListener('change',()=>{tT.begin();renderFriends(false);}));
  $('#tFeedback').textContent='';$('#tResult').innerHTML='';$('#tCheck').disabled=false;
  renderFriends(false);renderLb($('#tLb'),'tab',tDiff,T_COLS,['m1','ms'],null);
}
function assigned(){return T.lines.map((_,i)=>{const v=$('#tl'+i).value;return v===''?-1:+v;});}
function renderFriends(checked){
  const a=assigned();const box=$('#tFriends');box.innerHTML='';
  T.friends.forEach((f,k)=>{const cur=T.lines.reduce((s,l,i)=>s+(a[i]===k?l.p:0),0);const diff=cur-T.totals[k];
    const d=document.createElement('div');d.className='friend'+(checked?(diff===0?' ok':diff>0?' over':' under'):'');
    d.innerHTML=`<b>${f}</b><span class="st">owes $${T.totals[k]}${checked?` · ${diff===0?'exact':diff>0?'$'+diff+' over':'$'+(-diff)+' under'}`:` · assigned $${cur}`}</span>`;box.appendChild(d);});
}
function checkTab(){
  if(T.done)return;tT.begin();T.checks++;const a=assigned();
  const unassigned=a.filter(v=>v<0).length;renderFriends(true);
  const allOk=unassigned===0&&T.friends.every((_,k)=>T.lines.reduce((s,l,i)=>s+(a[i]===k?l.p:0),0)===T.totals[k]);
  if(allOk){T.done=true;const ms=tT.end();$('#tCheck').disabled=true;$('#tFeedback').textContent='';
    $('#tResult').innerHTML=`<div class="result">Tab settled in ${T.checks} check${T.checks>1?'s':''}, ${fmtT(ms)}.</div><div class="share">Tab ${todayKey()} · ${tDiff}\n🧾 ${T.lines.length} lines · ${T.friends.length} friends · ${T.checks} check${T.checks>1?'s':''} · ${fmtT(ms)}</div>`;
    renderLb($('#tLb'),'tab',tDiff,T_COLS,['m1','ms'],{m1:T.checks,ms});}
  else $('#tFeedback').textContent=`${unassigned?unassigned+' unassigned · ':''}check ${T.checks}`;
}
$('#tCheck').addEventListener('click',checkTab);

// boot
newHaggle();newBidder();newTab();
LB_REFRESH=[()=>renderLb($('#hLb'),'haggle',hDiff,H_COLS,['m1','m2','ms'],null),()=>renderLb($('#bLb'),'bidder',bDiff,B_COLS,['m1','ms'],null),()=>renderLb($('#tLb'),'tab',tDiff,T_COLS,['m1','ms'],null)];
initAuth();
