import { research, indicators } from './data.js';

export const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shades = ['#253747','#596c7d','#9eaeb7','#d5dcd9','#b89b68'];
const text = (x,y,value,extra='') => '<text x="'+x+'" y="'+y+'" '+extra+'>'+escapeHTML(value)+'</text>';
const tip = value => ' tabindex="0" data-tooltip="'+escapeHTML(value)+'" aria-label="'+escapeHTML(value.replace(/\n/g,', '))+'"';
const line = (x1,y1,x2,y2,extra='') => '<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" '+extra+'/>';

export function distributionPlot(course,item,width=500) {
  const info=indicators.find(i=>i.id===item);
  const w=Math.max(260,Math.round(width)),left=43,right=15,plot=w-left-right;
  let parts='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+w+' 145" width="100%" height="145" role="img" aria-label="'+escapeHTML(course+' '+info.title+' PRE and POST distributions. Exact counts follow in the data table.')+'"><g font-family="Arial,sans-serif" font-size="10">';
  for(const percent of [0,25,50,75,100]) {
    const x=left+plot*percent/100;
    parts+=line(x,9,x,108,'stroke="#101827" stroke-opacity=".10"')+text(x,132,percent+'%','fill="#53616d" text-anchor="middle"');
  }
  ['pre','post'].forEach((wave,wi)=>{
    const rows=research.distributions.filter(d=>d.course===course&&d.indicator===item&&d.wave===wave);
    const y=18+wi*52;
    parts+=text(0,y+21,wave.toUpperCase(),'fill="#344352" font-size="11"');
    let x=left;
    for(const row of rows) {
      const bw=row.percent/100*plot;
      const desc=course+' '+wave.toUpperCase()+' · '+info.short+'\nCategory '+row.category+': '+row.count+' / '+row.n+' ('+row.percent.toFixed(2)+'%)';
      if(bw>0) {
        parts+='<g'+tip(desc)+'><title>'+escapeHTML(desc)+'</title><rect x="'+x+'" y="'+y+'" width="'+bw+'" height="32" fill="'+shades[row.category-1]+'" stroke="#f7f5ef" stroke-width="1.2"/>';
        if(row.category%2===1&&bw>0) {
          const id='hatch-'+course+'-'+item+'-'+wave+'-'+row.category;
          parts+='<defs><pattern id="'+id+'" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="'+(row.category<3?'#ffffff':'#101827')+'" stroke-opacity=".13"/></pattern></defs><rect x="'+x+'" y="'+y+'" width="'+bw+'" height="32" fill="url(#'+id+')" pointer-events="none"/>';
        }
        if(row.percent>=8)parts+=text(x+bw/2,y+21,row.percent.toFixed(0)+'%','text-anchor="middle" fill="'+(row.category<3?'#ffffff':'#101827')+'" font-size="11" pointer-events="none"');
        parts+='</g>';
      }
      x+=bw;
    }
  });
  return parts+'</g></svg>';
}

export function distributionCard(course,item) {
  const n=research.outcomes[item][course].n;
  return '<div class="distribution-small"><div class="chart-course-label"><strong>'+course+'</strong><span>n = '+n+' complete pairs</span></div><div class="distribution-canvas" data-native-distribution data-course="'+course+'" data-item="'+item+'">'+distributionPlot(course,item)+'</div></div>';
}
export function distributionLegend(scale) {
  return '<div class="chart-legend" aria-label="Response category legend"><span>LOWER</span>'+shades.slice(0,scale).map((color,i)=>'<span class="legend-item"><i style="background:'+color+'"></i>'+(i+1)+'</span>').join('')+'<span>HIGHER</span></div>';
}

export function estimateChart() {
  const x=v=>160+(v+.4)/1.7*480;
  let svg='<div class="forest-scroll"><svg class="forest-chart" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 850 335" role="img" aria-labelledby="forest-title forest-desc"><title id="forest-title">G1 minus G2 estimates and 95% confidence intervals</title><desc id="forest-desc">Circles and solid intervals show observed-change differences. Squares and dashed intervals show baseline-conditioned POST contrasts. Zero is the reference. Numerical annotations and a data table provide exact values.</desc><g font-family="Arial,sans-serif">';
  svg+=line(x(0),20,x(0),275,'stroke="#667582" stroke-dasharray="3 4"');
  for(const tick of [-.25,0,.25,.5,.75,1,1.25])svg+=line(x(tick),275,x(tick),281,'stroke="#73808a"')+text(x(tick),300,tick===0?'0':tick.toFixed(2),'text-anchor="middle" fill="#53616d" font-size="11"');
  indicators.forEach((item,i)=>{
    svg+=text(0,55+i*85,item.short,'fill="#101827" font-size="12" font-weight="600"')+text(0,73+i*85,'Scale 1–'+item.scale,'fill="#53616d" font-size="10"');
    research.estimates.filter(e=>e.indicator===item.id).forEach((e,j)=>{
      const y=43+i*85+j*29,color=j?'#806738':'#101827';
      const desc=item.title+' · '+(j?'Baseline-conditioned POST':'Observed change')+'\n'+e.estimate.toFixed(3)+' ['+e.lower.toFixed(3)+', '+e.upper.toFixed(3)+']';
      svg+='<g'+tip(desc)+'><title>'+escapeHTML(desc)+'</title>'+line(x(e.lower),y,x(e.upper),y,'stroke="'+color+'" stroke-width="2"'+(j?' stroke-dasharray="5 4"':''));
      for(const bound of [e.lower,e.upper])svg+=line(x(bound),y-4,x(bound),y+4,'stroke="'+color+'"');
      svg+=j?'<rect x="'+(x(e.estimate)-5)+'" y="'+(y-5)+'" width="10" height="10" fill="'+color+'"/>':'<circle cx="'+x(e.estimate)+'" cy="'+y+'" r="5" fill="'+color+'"/>';
      svg+=text(675,y+4,e.estimate.toFixed(3)+' ['+e.lower.toFixed(3)+', '+e.upper.toFixed(3)+']','fill="#344352" font-size="11"')+'</g>';
    });
  });
  return svg+text(395,327,'G1 minus G2 · coded response units','text-anchor="middle" fill="#53616d" font-size="11"')+'</g></svg></div>';
}

export function sessionPlot(course,view,width=1000) {
  const rows=research.sessions.filter(r=>r.course===course);
  const w=Math.max(300,Math.round(width)),h=290,left=35,right=14,top=20,bottom=255,plot=w-left-right;
  const max=view==='rating'?5:Math.ceil(Math.max(...rows.map(r=>r.tool_n))/20)*20;
  const y=v=>view==='rating'?bottom-(v-1)/4*(bottom-top):bottom-v/max*(bottom-top);
  const gap=plot/rows.length;
  let svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+w+' '+h+'" width="100%" height="'+h+'" role="img" aria-label="'+course+' '+(view==='use'?'session resource choice counts':'mean effectiveness ratings, scale one to five')+'"><g font-family="Arial,sans-serif" font-size="10" fill="var(--muted)">';
  const ticks=view==='rating'?[1,2,3,4,5]:Array.from({length:5},(_,i)=>max*i/4);
  ticks.forEach(t=>{svg+=line(left,y(t),w-right,y(t),'stroke="var(--line)"')+text(left-9,y(t)+4,t,'text-anchor="end"');});
  if(view==='rating')svg+='<polyline points="'+rows.map((r,i)=>(left+gap*(i+.5))+','+y(r.rating_mean)).join(' ')+'" fill="none" stroke="#b89b68" stroke-width="2"/>';
  rows.forEach((r,i)=>{
    const x=left+gap*(i+.5),label=(course==='G1'?'W':'S')+r.session;
    if(w>600||i%Math.ceil(rows.length/8)===0||i===rows.length-1)svg+=text(x,277,label,'text-anchor="middle"');
    if(view==='use'){
      let offset=0;
      for(const [key,name,color] of [['course_bot','Course chatbot','#b89b68'],['general_bot','General-purpose chatbot','#8595a3'],['no_bot','No chatbot','#62798b']]){
        const count=r[key],bw=gap*.65,cy=y(offset+count),bh=y(offset)-cy;
        const desc=course+' '+label+' · '+name+': '+count+'\n'+r.tool_n+' valid choices / '+r.submissions+' submitted records';
        if(count>0)svg+='<rect x="'+(x-bw/2)+'" y="'+cy+'" width="'+bw+'" height="'+bh+'" fill="'+color+'"'+tip(desc)+'><title>'+escapeHTML(desc)+'</title></rect>';
        offset+=count;
      }
    }else{
      const desc=course+' '+label+' · Mean effectiveness: '+r.rating_mean.toFixed(3)+' / 5\n'+r.rating_n+' valid ratings / '+r.submissions+' submitted records';
      svg+='<circle cx="'+x+'" cy="'+y(r.rating_mean)+'" r="4.5" fill="#b89b68"'+tip(desc)+'><title>'+escapeHTML(desc)+'</title></circle>';
    }
  });
  return svg+'</g></svg>';
}
