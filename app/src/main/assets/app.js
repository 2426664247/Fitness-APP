const STORAGE='fitday-state-v5';
let state=JSON.parse(localStorage.getItem(STORAGE)||'null')||{
 activePlanId:null,
 progress:{},
 history:[],
 customPlans:[]
};
let restTimer=null,restRemain=0;
let editorDraft=null;

if(!Array.isArray(state.customPlans)) state.customPlans=[];
if(!state.progress) state.progress={};
if(!Array.isArray(state.history)) state.history=[];
function save(){localStorage.setItem(STORAGE,JSON.stringify(state));}
function allPlans(){return BUILTIN_PLANS.concat(state.customPlans||[]);}
function getPlan(id=state.activePlanId){return allPlans().find(p=>p.id===id)||null;}
function ensureProgress(planId){
 if(!state.progress[planId]) state.progress[planId]={current:0,setsDone:{},started:false};
 return state.progress[planId];
}
function totalSets(plan){return plan.exercises.reduce((n,e)=>n+e.sets,0);}
function doneSets(plan,prog){return Object.values(prog.setsDone||{}).reduce((a,b)=>a+b,0);}
function exerciseDone(plan,prog,i){const e=plan.exercises[i];return (prog.setsDone[e.id]||0)>=e.sets;}
function allDone(plan,prog){return plan.exercises.every((_,i)=>exerciseDone(plan,prog,i));}

function choosePlan(id){
 state.activePlanId=id;
 ensureProgress(id);
 save();
 closePlanModal();
 switchView('trainingView');
 render();
 window.scrollTo(0,0);
}
function resetPlan(id){
 state.progress[id]={current:0,setsDone:{},started:false};
 save();
 render();
}
function currentPlanHasProgress(id){
 const p=state.progress[id];
 return !!p && Object.values(p.setsDone||{}).some(v=>v>0);
}

function renderPlanCards(targetId){
 const box=document.getElementById(targetId);
 if(!box) return;
 box.innerHTML=allPlans().map(p=>{
   const prog=ensureProgress(p.id);
   const done=doneSets(p,prog),total=totalSets(p);
   const active=state.activePlanId===p.id;
   const custom=!!p.custom;
   return `<div class="planCard ${active?'selected':''}">
     <img class="planImg" src="${p.cover}" alt="${p.name}">
     <div class="planInfo">
       <div class="planTag">${p.tag}${custom?' · CUSTOM':''}</div>
       <h3>${p.name}</h3>
       <p>${p.desc}</p>
       <div class="pills"><span class="pill">${p.exercises.length} 个动作</span><span class="pill">${p.minutes||estimateMinutes(p)} min</span><span class="pill">${custom?'自定义':p.level}</span>${done?`<span class="pill">${done}/${total} 组</span>`:''}</div>
       <div class="planActions">
         <button class="choose" onclick="choosePlan('${p.id}')">${active?'继续这套':'今天练这套'}</button>
         <button class="peek" onclick="showPlanExercises('${p.id}')">查看</button>
       </div>
       <div class="planTools">
         ${custom?`<button class="toolBtn" onclick="editCustomPlan('${p.id}')">编辑</button><button class="toolBtn" onclick="duplicatePlan('${p.id}')">复制</button><button class="toolBtn danger" onclick="deleteCustomPlan('${p.id}')">删除</button>`:`<button class="toolBtn" onclick="duplicatePlan('${p.id}')">复制为自定义</button>`}
       </div>
     </div>
   </div>`;
 }).join('');
}

function estimateMinutes(plan){
 const sets=totalSets(plan);return Math.max(25,Math.round((sets*2.6+plan.exercises.length*2)/5)*5)+'–'+Math.max(35,Math.round((sets*3.2+plan.exercises.length*3)/5)*5);
}
function exerciseCatalog(){
 const map=new Map();
 BUILTIN_PLANS.forEach(p=>p.exercises.forEach(e=>{if(!map.has(e.id)) map.set(e.id,JSON.parse(JSON.stringify(e)));}));
 return Array.from(map.values());
}
function newPlanId(){return 'custom_'+Date.now()+'_'+Math.random().toString(36).slice(2,7);}
function createCustomPlan(){
 editorDraft={id:null,name:'我的训练计划',desc:'按今天的状态自由训练。',exercises:[]};
 openEditor('新建自定义计划');
}
function duplicatePlan(id){
 const src=getPlan(id);if(!src)return;
 editorDraft={id:null,name:src.name+' · 自定义',desc:src.desc,exercises:JSON.parse(JSON.stringify(src.exercises))};
 openEditor('复制并编辑');
}
function editCustomPlan(id){
 const src=(state.customPlans||[]).find(p=>p.id===id);if(!src)return;
 editorDraft={id:src.id,name:src.name,desc:src.desc,exercises:JSON.parse(JSON.stringify(src.exercises))};
 openEditor('编辑自定义计划');
}
function openEditor(title){
 document.getElementById('editorTitle').textContent=title;
 document.getElementById('planNameInput').value=editorDraft.name||'';
 document.getElementById('planDescInput').value=editorDraft.desc||'';
 renderEditor();document.getElementById('editorModal').classList.add('show');
}
function closeEditor(){document.getElementById('editorModal').classList.remove('show');editorDraft=null;}
function renderEditor(){
 if(!editorDraft)return;
 const draft=document.getElementById('draftExercises');
 draft.innerHTML=editorDraft.exercises.length?editorDraft.exercises.map((e,i)=>`<div class="draftItem">
   <div class="draftTop"><img src="${e.gif}" alt="${e.name}"><div><b>${i+1}. ${e.name}</b><span>${e.muscle}</span></div><div class="orderBtns"><button onclick="moveDraft(${i},-1)">↑</button><button onclick="moveDraft(${i},1)">↓</button></div></div>
   <div class="draftFields"><input class="miniInput" type="number" min="1" max="10" value="${e.sets}" onchange="updateDraft(${i},'sets',this.value)" title="组数"><input class="miniInput" value="${e.reps}" onchange="updateDraft(${i},'reps',this.value)" title="次数"><input class="miniInput" type="number" min="15" max="300" step="5" value="${e.rest}" onchange="updateDraft(${i},'rest',this.value)" title="休息秒数"></div>
   <div class="editorHint">组数 · 次数/目标 · 休息秒数</div><button class="removeExercise" onclick="removeDraft(${i})">移除这个动作</button>
 </div>`).join(''):'<div class="emptyDraft">还没选动作。下面点一个动作加入。</div>';
 const chosen=new Set(editorDraft.exercises.map(e=>e.id));
 document.getElementById('exerciseCatalog').innerHTML=exerciseCatalog().map(e=>`<button class="catalogBtn ${chosen.has(e.id)?'added':''}" onclick="addDraft('${e.id}')" ${chosen.has(e.id)?'disabled':''}><img src="${e.gif}" alt="${e.name}"><div><b>${e.name}</b><span>${e.muscle}</span></div></button>`).join('');
}
function addDraft(id){
 const e=exerciseCatalog().find(x=>x.id===id);if(!e||!editorDraft)return;
 if(editorDraft.exercises.some(x=>x.id===id))return;
 editorDraft.exercises.push(JSON.parse(JSON.stringify(e)));renderEditor();
}
function removeDraft(i){editorDraft.exercises.splice(i,1);renderEditor();}
function moveDraft(i,dir){const j=i+dir;if(j<0||j>=editorDraft.exercises.length)return;[editorDraft.exercises[i],editorDraft.exercises[j]]=[editorDraft.exercises[j],editorDraft.exercises[i]];renderEditor();}
function updateDraft(i,key,val){
 if(!editorDraft.exercises[i])return;
 if(key==='sets') editorDraft.exercises[i][key]=Math.max(1,Math.min(10,Number(val)||1));
 else if(key==='rest') editorDraft.exercises[i][key]=Math.max(15,Math.min(300,Number(val)||60));
 else editorDraft.exercises[i][key]=String(val||'8–12').slice(0,20);
}
function saveCustomPlan(){
 if(!editorDraft)return;
 const name=document.getElementById('planNameInput').value.trim();
 const desc=document.getElementById('planDescInput').value.trim();
 if(!name){alert('先给训练计划起个名字。');return;}
 if(!editorDraft.exercises.length){alert('至少选择 1 个动作。');return;}
 const id=editorDraft.id||newPlanId();
 const plan={id,name,short:'自',tag:'CUSTOM WORKOUT',minutes:estimateMinutes({exercises:editorDraft.exercises}),level:'自定义',desc:desc||'自定义训练计划。',cover:editorDraft.exercises[0].gif,custom:true,exercises:JSON.parse(JSON.stringify(editorDraft.exercises))};
 const idx=(state.customPlans||[]).findIndex(p=>p.id===id);
 if(idx>=0) state.customPlans[idx]=plan; else state.customPlans.push(plan);
 ensureProgress(id);state.activePlanId=id;save();closeEditor();render();switchView('plansView');
}
function deleteCustomPlan(id){
 const p=(state.customPlans||[]).find(x=>x.id===id);if(!p)return;
 if(!confirm(`删除自定义计划「${p.name}」？训练历史不会删除。`))return;
 state.customPlans=state.customPlans.filter(x=>x.id!==id);delete state.progress[id];if(state.activePlanId===id)state.activePlanId=null;save();render();
}

function renderTraining(){
 const host=document.getElementById('trainingView');
 const plan=getPlan();
 if(!plan){
   host.innerHTML=`<section class="hero"><div class="eyebrow">FLEXIBLE TRAINING</div><h1>今天练什么？</h1><p>没有固定星期表。先看你的恢复状态，然后从内置模板里选一套。</p></section>
   <div class="planGrid" id="trainingPlanGrid"></div>`;
   renderPlanCards('trainingPlanGrid');
   return;
 }
 const prog=ensureProgress(plan.id);
 if(prog.current>=plan.exercises.length) prog.current=plan.exercises.length-1;
 const e=plan.exercises[prog.current];
 const done=prog.setsDone[e.id]||0;
 const total=totalSets(plan), doneN=doneSets(plan,prog);
 const pct=Math.round(doneN/total*100);
 const dots=Array.from({length:e.sets},(_,i)=>`<button class="setDot ${i<done?'done':''}" onclick="setDirect(${i})">第 ${i+1} 组</button>`).join('');
 host.innerHTML=`
   <section class="hero"><div class="eyebrow">${plan.tag}</div><h1>${plan.name}</h1><p>${plan.desc}</p></section>
   <section class="currentBanner">
     <div class="bannerTop"><div><div class="planTag">TODAY'S WORKOUT</div><h2>${plan.name}</h2><p>${plan.exercises.length} 个动作 · ${plan.minutes} 分钟 · 不绑定日期</p></div><button class="changeBtn" onclick="openPlanModal()">更换计划</button></div>
     <div class="progressRow"><div class="ring" style="--deg:${pct*3.6}deg"><div class="ringText"><b>${pct}%</b><span>完成度</span></div></div>
       <div class="progressText"><b>${allDone(plan,prog)?'今天完成了':prog.started?'训练进行中':'准备开练'}</b><span>${doneN} / ${total} 组完成</span>
       <button class="startBtn" onclick="startOrContinue()">${allDone(plan,prog)?'保存并结束':prog.started?'继续训练':'开始训练'}</button></div>
     </div>
   </section>
   <div class="sectionHead"><h2>当前动作</h2><span>${prog.current+1} / ${plan.exercises.length}</span></div>
   <section class="exerciseCard">
     <div class="media" onclick="openDetail('${plan.id}',${prog.current})"><img src="${e.gif}" alt="${e.name}"><div class="badge">点击放大动作演示</div></div>
     <div class="exerciseBody">
       <div class="code">EXERCISE ${String(prog.current+1).padStart(2,'0')}</div><h2>${e.name}</h2><div class="en">${e.en}</div><div class="muscle">${e.muscle}</div>
       <div class="meta"><div class="metric"><b>${e.sets} 组</b><span>工作组</span></div><div class="metric"><b>${e.reps}</b><span>每组次数</span></div><div class="metric"><b>${e.rest}s</b><span>组间休息</span></div></div>
       <div class="note">${e.note}</div>
       <div class="sets">${dots}</div>
       <div class="actions"><button class="ghost" onclick="openDetail('${plan.id}',${prog.current})">动作要领</button><button class="doneSet" onclick="completeSetOrNext()">${done>=e.sets?(prog.current===plan.exercises.length-1?'完成训练':'下一个动作'):'完成一组'}</button></div>
     </div>
     <div class="tipbox"><h3>这一组只记住 3 件事</h3><ul>${e.cues.slice(0,3).map(x=>'<li>'+x+'</li>').join('')}</ul></div>
   </section>
   <div class="sectionHead"><h2>本套动作</h2><span>点动作可查看演示</span></div>
   <div>${plan.exercises.map((x,i)=>`<div class="exerciseListItem" onclick="jumpToExercise(${i})"><img src="${x.gif}" alt="${x.name}"><div><b>${i+1}. ${x.name}</b><span>${x.sets} 组 · ${x.reps} · ${x.muscle}</span></div><div class="status ${exerciseDone(plan,prog,i)?'done':''}">${exerciseDone(plan,prog,i)?'●':'○'}</div></div>`).join('')}</div>
 `;
}

function jumpToExercise(i){
 const plan=getPlan(),prog=ensureProgress(plan.id);
 prog.current=i;prog.started=true;save();renderTraining();window.scrollTo({top:0,behavior:'smooth'});
}
function setDirect(i){
 const plan=getPlan(),prog=ensureProgress(plan.id),e=plan.exercises[prog.current],old=prog.setsDone[e.id]||0;
 prog.setsDone[e.id]= i<old ? i : i+1;
 prog.started=true;save();render();
}
function completeSetOrNext(){
 const plan=getPlan(),prog=ensureProgress(plan.id),e=plan.exercises[prog.current],d=prog.setsDone[e.id]||0;
 prog.started=true;
 if(d<e.sets){
   prog.setsDone[e.id]=d+1;save();render();
   if(d+1<e.sets) startRest(e.rest);
 }else if(prog.current<plan.exercises.length-1){
   prog.current++;save();render();window.scrollTo({top:0,behavior:'smooth'});
 }else finishWorkout();
}
function startOrContinue(){
 const plan=getPlan(),prog=ensureProgress(plan.id);
 if(allDone(plan,prog)){finishWorkout();return;}
 prog.started=true;save();render();setTimeout(()=>document.querySelector('.exerciseCard')?.scrollIntoView({behavior:'smooth',block:'start'}),50);
}
function finishWorkout(){
 const plan=getPlan(),prog=ensureProgress(plan.id);
 const completed=plan.exercises.filter((_,i)=>exerciseDone(plan,prog,i)).length;
 state.history.push({date:new Date().toLocaleDateString('zh-CN'),planId:plan.id,planName:plan.name,sets:doneSets(plan,prog),exercises:completed});
 state.progress[plan.id]={current:0,setsDone:{},started:false};
 save();render();
 alert('训练已保存。下次可以继续自由选择任意一套。');
}

function openDetail(planId,i){
 const p=getPlan(planId),e=p.exercises[i];
 document.getElementById('detailGif').src=e.gif;
 document.getElementById('detailName').textContent=e.name;
 document.getElementById('detailEn').textContent=e.en;
 document.getElementById('detailMuscle').textContent=e.muscle;
 document.getElementById('detailNote').textContent=e.note;
 document.getElementById('detailCode').textContent=p.name+' · 动作 '+(i+1);
 document.getElementById('detailCues').innerHTML=e.cues.map(x=>'<li>'+x+'</li>').join('');
 document.getElementById('detailAvoid').innerHTML=e.avoid.map(x=>'<li>'+x+'</li>').join('');
 document.getElementById('detail').classList.add('show');
}
document.getElementById('closeDetail').onclick=()=>document.getElementById('detail').classList.remove('show');

function showPlanExercises(planId){
 const p=getPlan(planId);
 let text=p.name+'\\n\\n'+p.exercises.map((e,i)=>`${i+1}. ${e.name} — ${e.sets} 组 × ${e.reps}`).join('\\n');
 alert(text);
}

function openPlanModal(){renderPlanCards('planGridModal');document.getElementById('planModal').classList.add('show');}
function closePlanModal(){document.getElementById('planModal').classList.remove('show');}
document.getElementById('closePlanModal').onclick=closePlanModal;

function startRest(sec){
 clearInterval(restTimer);restRemain=sec;updateRest();document.getElementById('restOverlay').classList.add('show');
 restTimer=setInterval(()=>{restRemain--;updateRest();if(restRemain<=0){clearInterval(restTimer);document.getElementById('restOverlay').classList.remove('show');if(navigator.vibrate)navigator.vibrate([160,90,160]);}},1000);
}
function updateRest(){const m=String(Math.floor(restRemain/60)).padStart(2,'0'),s=String(restRemain%60).padStart(2,'0');document.getElementById('restTime').textContent=m+':'+s;}
document.getElementById('skipRest').onclick=()=>{clearInterval(restTimer);document.getElementById('restOverlay').classList.remove('show');}
document.getElementById('plusRest').onclick=()=>{restRemain+=30;updateRest();}

function renderHistory(){
 const box=document.getElementById('historyList');
 if(!state.history.length){box.innerHTML='<div class="historyEmpty">还没有训练记录。完成任意一套后，这里会自动保存。</div>';return;}
 box.innerHTML=state.history.slice().reverse().map(h=>`<div class="historyItem"><b>${h.date} · ${h.planName}</b><span>${h.sets} 组 · ${h.exercises} 个动作完成</span></div>`).join('');
}
function switchView(id){
 document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
 document.getElementById(id).classList.add('active');
 document.querySelectorAll('.navbtn').forEach(b=>b.classList.toggle('active',b.dataset.view===id));
 if(id==='plansView') renderPlanCards('planGrid');
 if(id==='historyView') renderHistory();
 if(id==='trainingView') renderTraining();
}
document.querySelectorAll('.navbtn').forEach(b=>b.onclick=()=>{switchView(b.dataset.view);window.scrollTo(0,0);});
document.getElementById('dateLabel').textContent=new Date().toLocaleDateString('zh-CN',{month:'short',day:'numeric'});

function render(){
 renderTraining();
 renderPlanCards('planGrid');
 renderHistory();
}
render();
