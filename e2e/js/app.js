import { research, searches, bibliography } from './data.js';
import { distributionPlot, sessionPlot, escapeHTML } from './charts.js';
import { downloadFigure } from './figure-export.js';

const state={study:'both',course:'both',outcome:'all',movement:'G1',sessionCourse:'G1',sessionView:'use',topic:'help',session:null,group:'',theme:'',discipline:'all',methodOnly:false,refSearch:'',refTag:''};
const groups={
  'Course comparison':['study',['both','G1','G2']],
  'Distribution course filter':['course',['both','G1','G2']],
  'Movement course':['movement',['G1','G2']],
  'Session course':['sessionCourse',['G1','G2']],
  'Session measure':['sessionView',['use','rating']],
  'Topic response type':['topic',['help','unclear']],
  'Search strategy group':['group',['all','E','M','C','J']],
};
const announce=message=>{document.getElementById('live-announcement').textContent=message;};
const all=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
const observed=new WeakSet();
const plotObserver=typeof ResizeObserver==='function'?new ResizeObserver(entries=>entries.forEach(e=>drawPlot(e.target))):null;

function drawPlot(el){
  const width=el.getBoundingClientRect().width;
  if(width<10)return;
  el.innerHTML=el.hasAttribute('data-native-distribution')?distributionPlot(el.dataset.course,el.dataset.item,width):sessionPlot(el.dataset.course,el.dataset.view,width);
}
function setupPlots(root=document){
  for(const el of all('[data-native-distribution],[data-native-session]',root)){
    drawPlot(el);
    if(plotObserver&&!observed.has(el)){plotObserver.observe(el);observed.add(el);}
  }
}
function wire(root=document){
  for(const group of all('[role="group"][aria-label]',root)){
    const config=groups[group.getAttribute('aria-label')];if(!config)continue;
    all('button',group).forEach((button,i)=>{button.dataset.action=config[0];button.dataset.value=config[1][i];});
  }
  const outcome=root.querySelector('#outcome-select');if(outcome)outcome.dataset.action='outcome';
  all('.session-timeline button',root).forEach(button=>{button.dataset.action='session';button.dataset.value=button.textContent.replace(/\D/g,'');});
  all('.figure-tools',root).forEach(tools=>{
    const figure=tools.closest('.figure-block')?.querySelector('.export-figure');if(!figure)return;
    const [download,print]=tools.querySelectorAll('button');
    download.dataset.action='download';download.dataset.figure=figure.id;
    print.dataset.action='print';
  });
  const filters=root.querySelector('.hub-filters');
  if(filters){
    const selects=filters.querySelectorAll('select');selects[0].dataset.action='theme';selects[1].dataset.action='discipline';
    filters.querySelector('input').dataset.action='methodOnly';
  }
  const refFilters=root.querySelector('.bibliography-filters');
  if(refFilters){refFilters.querySelector('input').dataset.action='refSearch';refFilters.querySelector('select').dataset.action='refTag';}
  all('.strategy-card',root).forEach((card,index)=>{
    const query=searches[index];if(!query)return;card.dataset.queryId=query.id;
    const copy=card.querySelector('.copy-button');copy.dataset.action='copy';copy.dataset.value=query.id;
  });
  all('.reference-item',root).forEach((card,index)=>card.dataset.referenceId=bibliography[index].id);
  const themeButton=root.querySelector('.nav-actions .icon-button:not(.menu-toggle)');if(themeButton)themeButton.dataset.action='toggleTheme';
  const menu=root.querySelector('.menu-toggle');if(menu)menu.dataset.action='menu';
  setupPlots(root);
}
function updateGroup(label,value){
  const group=all('[role="group"][aria-label]').find(el=>el.getAttribute('aria-label')===label);
  if(group)all('button',group).forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.value===value)));
}
function template(id){
  const source=document.getElementById(id);
  if(!(source instanceof HTMLTemplateElement))throw Error('Missing research view '+id);
  return source.content.firstElementChild.cloneNode(true);
}
function replace(current,id){
  const next=template(id),opened=new Set(all('details[open]',current).map(d=>d.querySelector('summary')?.textContent.trim()));
  all('details',next).forEach(d=>{if(opened.has(d.querySelector('summary')?.textContent.trim()))d.open=true;});
  current.replaceWith(next);wire(next);return next;
}
function distributions(){
  replace(document.getElementById('figure-distributions'),'distributions-'+state.course+'-'+state.outcome);
  const block=document.querySelector('#findings .figure-block');
  replace(block.querySelector('.disclosure'),'counts-'+state.course+'-'+state.outcome);
  updateGroup('Distribution course filter',state.course);
  announce('Response distributions updated: '+state.course+', '+state.outcome+'.');
}
function refreshSessions(focus){
  const scrollY=window.scrollY;
  const section=replace(document.getElementById('experience'),'sessions-'+state.sessionCourse+'-'+state.sessionView+'-'+state.topic);
  selectSession(state.session);
  if(focus)all('button',section).find(b=>b.dataset.action===focus.action&&b.dataset.value===focus.value)?.focus({preventScroll:true});
  window.scrollTo(0,scrollY);
  announce(state.sessionCourse+' session view updated.');
}
function selectSession(session){
  const rows=research.sessions.filter(r=>r.course===state.sessionCourse),row=rows.find(r=>r.session===Number(session))||rows[0];
  state.session=row.session;
  all('.session-timeline button').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.value)===row.session)));
  document.querySelector('.session-detail').innerHTML='<strong>'+state.sessionCourse+' / '+(state.sessionCourse==='G1'?'Week':'Session')+' '+row.session+'</strong><span>'+row.submissions+' submitted records</span><span>'+row.tool_n+' valid resource choices</span><span>'+row.rating_n+' valid ratings</span><span>Mean rating '+row.rating_mean.toFixed(3)+' / 5</span>';
}
function filterStrategies(){
  const selected=state.group!==''||state.theme!=='';let count=0;
  for(const card of all('.strategy-card')){
    const query=searches.find(q=>q.id===card.dataset.queryId);
    const show=selected&&(!state.group||state.group==='all'||query.group===state.group)&&(!state.theme||state.theme==='all'||query.theme===state.theme)&&(state.discipline==='all'||query.discipline===state.discipline)&&(!state.methodOnly||query.group==='M'||['E2','E6'].includes(query.id));
    card.hidden=!show;if(show)count++;
  }
  document.querySelector('.strategy-grid').hidden=!selected;
  document.getElementById('strategy-prompt').hidden=selected;
  const countLabel=document.querySelector('.hub-filters .filter-count');
  countLabel.hidden=!selected;countLabel.textContent=count+(count===1?' strategy':' strategies');
  document.querySelector('[data-action="resetStrategies"]').hidden=!selected;
  document.getElementById('strategy-empty').hidden=!selected||count>0;
  announce(selected?count+' matching Scopus strategies.':'Select a theme or research group to explore the search strategies.');
}
function filterReferences(){
  const selected=state.refTag!=='',search=state.refSearch.toLowerCase();let count=0;
  for(const card of all('.reference-item')){
    const ref=bibliography.find(r=>r.id===Number(card.dataset.referenceId));
    const show=selected&&(state.refTag==='all'||ref.tags.includes(state.refTag))&&[ref.title,ref.authors,ref.journal,ref.year,...ref.tags].join(' ').toLowerCase().includes(search);
    card.hidden=!show;if(show)count++;
  }
  document.querySelector('.reference-list').hidden=!selected;
  document.getElementById('reference-prompt').hidden=selected;
  const countLabel=document.querySelector('.bibliography > .filter-count');
  countLabel.hidden=!selected;countLabel.textContent=count+(count===1?' reference':' references');
  document.getElementById('reference-empty').hidden=!selected||count>0;
  const input=document.querySelector('.bibliography-filters input');
  input.disabled=!selected;
  input.placeholder=selected?'Search title, author, journal, or year...':'Select a theme to search references';
  input.closest('.search-input').classList.toggle('is-disabled',!selected);
}
const icon=path=>'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+path+'"/></svg>';
const sun='M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8M12 1v2M12 21v2M1 12h2M21 12h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2';
const moon='M20 14A8 8 0 0 1 10 4 8 8 0 1 0 20 14';
function syncTheme(){
  const theme=document.documentElement.dataset.theme==='light'?'light':'dark',button=document.querySelector('[data-action="toggleTheme"]');
  button.setAttribute('aria-label','Switch to '+(theme==='dark'?'light':'dark')+' mode');button.innerHTML=icon(theme==='dark'?sun:moon);
  document.querySelector('meta[name="theme-color"]').content=theme==='dark'?'#101827':'#F7F5EF';
}
function setMenu(open){
  const menu=document.querySelector('.menu-toggle');menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'Close navigation':'Open navigation');
  menu.innerHTML=icon(open?'m6 6 12 12M6 18 18 6':'M4 6h16M4 12h16M4 18h16');
  document.querySelector('.nav-links').classList.toggle('is-open',open);
}
async function copyQuery(button){
  const query=searches.find(q=>q.id===button.dataset.value);
  let copied=false;
  try{await navigator.clipboard.writeText(query.query);copied=true;}catch{
    const textarea=document.createElement('textarea');textarea.value=query.query;textarea.className='sr-only';document.body.append(textarea);textarea.select();
    try{copied=document.execCommand('copy');}catch{/* fallback to text selection below */}
    textarea.remove();button.focus({preventScroll:true});
  }
  if(copied){button.innerHTML=icon('m5 12 4 4L19 6')+'<span>Copied</span>';announce(query.id+' original query copied.');setTimeout(()=>{button.innerHTML=icon('M9 9h11v11H9zM4 15H3V3h12v1')+'<span>Copy query</span>';},2200);}
  else{const card=button.closest('.strategy-card');card.querySelector('details').open=true;const pre=card.querySelector('pre');pre.focus();const range=document.createRange();range.selectNodeContents(pre);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);announce('Query selected. Press Ctrl+C or use your device copy command.');}
}
document.addEventListener('click',event=>{
  const button=event.target.closest('button[data-action]');if(!button)return;
  const action=button.dataset.action,value=button.dataset.value;
  if(action==='study'){state.study=value;replace(document.querySelector('.course-grid'),'study-'+value);updateGroup('Course comparison',value);}
  else if(action==='course'){state.course=value;distributions();}
  else if(action==='movement'){
    state.movement=value;const section=replace(document.querySelector('.movement-section'),'movement-'+value);
    all('button',section).find(b=>b.dataset.value===value)?.focus({preventScroll:true});
  }
  else if(['sessionCourse','sessionView','topic'].includes(action)){
    state[action]=value;if(action==='sessionCourse')state.session=null;
    refreshSessions({action,value});
  }
  else if(action==='session'){selectSession(value);}
  else if(action==='group'){state.group=value;updateGroup('Search strategy group',value);filterStrategies();}
  else if(action==='resetStrategies'){
    state.group='';state.theme='';state.discipline='all';state.methodOnly=false;
    document.querySelector('.hub-filters select[data-action="theme"]').value='';
    document.querySelector('.hub-filters select[data-action="discipline"]').value='all';
    document.querySelector('.hub-filters input').checked=false;
    updateGroup('Search strategy group','');filterStrategies();
    document.querySelector('.hub-filters select[data-action="theme"]').focus({preventScroll:true});
  }
  else if(action==='toggleTheme'){document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';try{localStorage.setItem('e2e-theme',document.documentElement.dataset.theme);}catch{/* optional device preference */}syncTheme();}
  else if(action==='menu')setMenu(button.getAttribute('aria-expanded')!=='true');
  else if(action==='copy')void copyQuery(button);
  else if(action==='download')downloadFigure(button.dataset.figure,button.dataset.figure==='figure-distributions'?'response-distributions':'comparative-estimates');
  else if(action==='print')window.print();
});
document.addEventListener('change',event=>{
  const el=event.target,action=el.dataset.action;
  if(action==='outcome'){state.outcome=el.value;distributions();}
  else if(['theme','discipline','methodOnly'].includes(action)){state[action]=action==='methodOnly'?el.checked:el.value;filterStrategies();}
  else if(action==='refTag'){
    state.refTag=el.value;
    if(!el.value){state.refSearch='';document.querySelector('.bibliography-filters input').value='';}
    filterReferences();
  }
});
document.addEventListener('input',event=>{if(event.target.dataset.action==='refSearch'){state.refSearch=event.target.value;filterReferences();}});
document.querySelector('.nav-links').addEventListener('click',event=>{if(event.target.closest('a'))setMenu(false);});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){document.getElementById('chart-tooltip').hidden=true;if(document.querySelector('.menu-toggle').getAttribute('aria-expanded')==='true'){setMenu(false);document.querySelector('.menu-toggle').focus();}}});

// Tooltips supplement SVG titles and the exact-value tables. They also work from keyboard focus.
const tooltip=document.getElementById('chart-tooltip');
function showTip(target,x,y){
  tooltip.textContent=target.dataset.tooltip;tooltip.hidden=false;
  const rect=tooltip.getBoundingClientRect();
  tooltip.style.left=Math.max(10,Math.min(x+15,innerWidth-rect.width-10))+'px';
  tooltip.style.top=Math.max(10,Math.min(y+16,innerHeight-rect.height-10))+'px';
}
document.addEventListener('pointerover',event=>{const target=event.target.closest('[data-tooltip]');if(target)showTip(target,event.clientX,event.clientY);});
document.addEventListener('pointermove',event=>{const target=event.target.closest('[data-tooltip]');if(target&&!tooltip.hidden)showTip(target,event.clientX,event.clientY);});
document.addEventListener('pointerout',event=>{const target=event.target.closest('[data-tooltip]');if(target&&!target.contains(event.relatedTarget))tooltip.hidden=true;});
document.addEventListener('focusin',event=>{const target=event.target.closest('[data-tooltip]');if(target){const rect=target.getBoundingClientRect();showTip(target,rect.left+rect.width/2,rect.bottom);}});
document.addEventListener('focusout',event=>{if(event.target.closest('[data-tooltip]'))tooltip.hidden=true;});
window.addEventListener('scroll',()=>{tooltip.hidden=true;},{passive:true});
window.addEventListener('resize',()=>{if(!plotObserver)setupPlots();if(innerWidth>760)setMenu(false);},{passive:true});

function setupNetworkContexts(){
  const contexts=all('details[data-network-context]'),pinned=new WeakSet();
  const close=details=>{details.open=false;pinned.delete(details);};
  const closeOthers=current=>contexts.forEach(details=>{if(details!==current)close(details);});
  for(const details of contexts){
    const summary=details.querySelector('summary');
    details.addEventListener('pointerenter',event=>{
      if(event.pointerType==='touch')return;
      closeOthers(details);details.open=true;
    });
    details.addEventListener('pointerleave',()=>{
      if(!pinned.has(details)&&!details.contains(document.activeElement))details.open=false;
    });
    summary.addEventListener('click',event=>{
      event.preventDefault();
      const wasPinned=pinned.has(details);closeOthers(details);
      if(wasPinned)close(details);else{pinned.add(details);details.open=true;}
    });
    details.addEventListener('focusout',()=>queueMicrotask(()=>{
      if(!details.contains(document.activeElement)&&!details.matches(':hover'))close(details);
    }));
    details.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&details.open){event.preventDefault();close(details);summary.focus({preventScroll:true});}
    });
  }
  document.addEventListener('pointerdown',event=>{
    if(!event.target.closest('[data-network-context]'))contexts.forEach(close);
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape')contexts.forEach(close);
  });
}
wire();syncTheme();selectSession(null);setupNetworkContexts();
if('IntersectionObserver' in window){
  const navObserver=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{if(entry.isIntersecting)all('.nav-links a').forEach(a=>{if(a.hash==='#'+entry.target.id)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});});
  },{rootMargin:'-12% 0px -65% 0px'});
  all('main > section[id]').forEach(section=>navObserver.observe(section));
}
if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const reveals = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); reveals.unobserve(entry.target); }
    });
  }, { threshold: 0.04 });
  all('.figure-block, .topic-section, .insight-grid article').forEach(element => {
    element.classList.add('native-reveal');
    if (element.getBoundingClientRect().top < innerHeight) element.classList.add('is-visible');
    else reveals.observe(element);
  });
}
document.documentElement.dataset.appReady='true';
