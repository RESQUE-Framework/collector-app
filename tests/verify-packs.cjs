// Run: node verify-packs.cjs /path/to/collector-app
// These checks record the uploaded snapshot's behavior, including defects.
// They are characterization checks, not acceptance tests for corrected code.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(process.argv[2] || 'collector-app-main');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const pack = p => JSON.parse(read(`packs/${p}.json`));
const core = pack('core-pub'), software = pack('core-software');
const clinical = pack('EP/EP-clinical_psychology'), theory = pack('EP/EP-theory_development');
const html = read('index.html');
const previewHtml = read('preview.html');
const stores = { data: { input: [{ RaterType: 'Applicant' }] }, config: { config: { statements_only_for_top_publications: true } } };
const ctx = vm.createContext({ console, Alpine: { store: name => stores[name] } });
vm.runInContext(read('utils/score2.js') + '\nglobalThis.score=score;globalThis.scoreAll=scoreAll;', ctx);
vm.runInContext(read('utils/packutils.js').replace('export const', 'const') + '\nglobalThis.defaults=getDefaultValues;', ctx);
const block = (start,end) => html.slice(html.indexOf(start), html.indexOf(end,html.indexOf(start)));
vm.runInContext(block('const preprocessCondition =','const partialHighlight =') + '\nglobalThis.uiEval=evaluateConditionInContext;globalThis.preprocess=preprocessCondition;', ctx);
vm.runInContext(block('const filterExport =','// this is the export function') + '\nglobalThis.filterExport=filterExport;', ctx);
vm.runInContext(block('const checkCompletion =','</script>') + '\nglobalThis.checkCompletion=checkCompletion;', ctx);
vm.runInContext(block('function pick(combinedPack,','</script>') + '\nglobalThis.pick=pick;', ctx);
vm.runInContext(read('menu.js') + '\nglobalThis.pickAccordingToConfig=pickAccordingToConfig;globalThis.normalizePublicationConfig=normalizePublicationConfig;globalThis.normalizePublicationSource=normalizePublicationSource;', ctx);
const previewBlock = (start, end) => previewHtml.slice(previewHtml.indexOf(start), previewHtml.indexOf(end, previewHtml.indexOf(start)));
const previewCtx = vm.createContext({
  URLSearchParams,
  window: { location: { search: '' } },
});
vm.runInContext(
  previewBlock('// get params from query params from URL', 'const packToHTML =') + '\nglobalThis.resolvePackInQuery=resolvePackInQuery;',
  previewCtx,
);
const plain = x => JSON.parse(JSON.stringify(x));
const output = [];
const check = (name, f) => { const evidence = f(); output.push({name,evidence}); };
const scorePack = (p,r) => ctx.score({ type:'pub',...ctx.defaults(p.elements),...r },{forms:{pub:p}});
const item = (p,id,r) => plain(scorePack(p,r).items[id] ?? null);
const base = { P_Suitable:'Yes', P_Data:'Yes', P_Data_Source_NewOwn:true, P_Data_Open:'YesEntire', P_Data_Open_AccessLevel:'ZK0', P_Data_Open_Identifier:'https://example.org/data' };
check('OR sugar, negation and AND sugar',()=>{
 assert.equal(ctx.uiEval("$x =|= ['A','B']",{x:'B'}),true);
 assert.equal(ctx.uiEval("!$x =|= ['A','B']",{x:'B'}),false);
 assert.equal(ctx.uiEval("$x =&= ['A','B']",{x:'B'}),false);
 assert.equal(ctx.uiEval("$x =&= ['B','B']",{x:'B'}),true);
 return {or:ctx.preprocess("$x =|= ['A','B']"),and:ctx.preprocess("$x =&= ['A','B']")};
});
check('exists is truthiness; it does not trim or validate',()=>{
 const values=['',0,false,null,'0','   ','not a URL'];
 const result=values.map(x=>({value:x,exists:ctx.uiEval('exists($x)',{x})}));
 assert.deepEqual(result.map(x=>x.exists),[false,false,false,false,true,true,true]); return result;
});
check('A false score.condition keeps the denominator',()=>{
 const result=item(core,'P_ReproducibleScripts',{...base,P_ReproducibleScripts:'YesEntire',P_ReproducibleScripts_Identifier:''});
 assert.deepEqual(result,{max:1,score:0}); return result;
});
check('Not-applicable explanation removes the item entirely',()=>{
 const r={...base,P_ReproducibleScripts:'NotApplicable',P_ReproducibleScripts_NAExplanation:'Reason'};
 assert.equal(item(core,'P_ReproducibleScripts',r),null);
 return {withExplanation:null,withoutExplanation:item(core,'P_ReproducibleScripts',{...r,P_ReproducibleScripts_NAExplanation:''})};
});
check('ZK2 gets the access point with no justification',()=>{
 const r={...base,P_Data_Open_AccessLevel:'ZK2',P_Data_Open_AccessLevel_ZK2Explanation:''};
 const result=item(core,'P_Data_Open_AccessLevel',r); assert.deepEqual(result,{max:1,score:1});return result;
});
check('Access point survives switching open data to NotApplicable without explanation',()=>{
 const r={...base,P_Data_Open:'NotApplicable',P_Data_Open_NAExplanation:''};
 const el=core.elements.find(e=>e.id==='P_Data_Open_AccessLevel');
 const result={visible:ctx.uiEval(el.condition,r),item:item(core,el.id,r)};
 assert.equal(result.visible,false);assert.deepEqual(result.item,{max:1,score:1});return result;
});
check('Reused-data FAIR answers can never earn points without NewOwn or Simulated',()=>{
 const r={...base,P_Data_Source_NewOwn:false,P_Data_Source_ReuseOwn:true,P_Data_Open_FAIR_Codebook:true};
 const el=core.elements.find(e=>e.id==='P_Data_Open_FAIR');
 const result={visible:ctx.uiEval(el.condition,r),item:item(core,el.id,r)};
 assert.equal(result.visible,true); assert.deepEqual(result.item,{max:1,score:0}); return result;
});
check('FAIR and other child points do not require the parent evidence URL',()=>{
 const r={...base,P_Data_Open_Identifier:'',P_Data_Open_FAIR_Codebook:true,P_ReproducibleScripts:'YesEntire',P_ReproducibleScripts_Identifier:'',P_ReproducibleScripts_FAIR_OpenLicense:true,P_Preregistration:'Yes',P_Preregistration_Identifier:'',P_TypeMethod_EmpiricalQuantitative:true,P_Preregistration_Content_Hypotheses:true};
 const result=Object.fromEntries(['P_Data_Open_AccessLevel','P_Data_Open_FAIR','P_ReproducibleScripts','P_ReproducibleScripts_FAIR','P_Preregistration','P_Preregistration_Content'].map(id=>[id,item(core,id,r)]));
 assert.equal(result.P_Data_Open_AccessLevel.score,0); assert.equal(result.P_Data_Open_FAIR.score,0.5);
 assert.equal(result.P_ReproducibleScripts.score,0); assert.equal(result.P_ReproducibleScripts_FAIR.score,0.2);
 assert.equal(result.P_Preregistration.score,0); assert.equal(result.P_Preregistration_Content.score,0.2); return result;
});
check('Hidden clinical RCT fields retain points after preregistration changes to No',()=>{
 const r={P_Suitable:'Yes',P_TypeMethod_EmpiricalQuantitative:true,P_Preregistration:'No',CP_RCT:'Yes',CP_Preregistration_PrimaryMainOutcome:'Yes',CP_Methods_RCTCriteria_RandomAssignment:true};
 const el=clinical.elements.find(e=>e.id==='CP_Preregistration_PrimaryMainOutcome');
 const result={visible:ctx.uiEval(el.condition,r),primary:item(clinical,el.id,r),criteria:item(clinical,'CP_Methods_RCTCriteria',r)};
 assert.equal(result.visible,false); assert.deepEqual(result.primary,{max:1,score:1});assert.deepEqual(result.criteria,{max:2,score:0.5});return result;
});
check('Software factor, option condition and visibility do not restrict earned points',()=>{
 const r={S_License:'ClosedSource',S_URL:'',S_CodebaseActivelyMaintained:'Yes',S_CommunityActivelyMaintained:'HighVolume',S_Tests:'No',S_Tests_Quality_OpenSource:true,S_Documentation_UserFacingDocumentation:false,S_Documentation_UserFacing:'AllFunctions'};
 const s=scorePack(software,r);assert.equal(s.score,5.2);assert.equal(s.max,11);
 return {score:s.score,max:s.max,test:item(software,'S_Tests_Quality',r),hiddenDocumentation:item(software,'S_Documentation_UserFacing',r)};
});
check('No score object is required; dropdown values are ignored',()=>{
 const options=[{id:'Yes',value:1},{id:'No',value:0}];
 const p={elements:[{id:'X',type:'radio',options},{id:'Y',type:'dropdown',options}]};
 const s=scorePack(p,{X:'Yes',Y:'Yes'});assert.equal(s.score,1);assert.equal(s.max,1);return plain(s.items);
});
check('The score.score guard is inactive unless an undocumented property is added',()=>{
 const el={id:'X',type:'radio',options:[{id:'Yes',value:1}],score:{condition:'false'}};
 const before=item({elements:[el]},'X',{X:'Yes'});
 el.score.score=true;const after=item({elements:[el]},'X',{X:'Yes'});
 assert.deepEqual(before,{max:1,score:0});assert.equal(after,null);return {before,after};
});
check('config$ works for UI conditions but throws in scoring',()=>{
 assert.equal(ctx.uiEval('config$statements_only_for_top_publications',{}),true);
 const p={elements:[{id:'X',type:'radio',options:[{id:'Yes',value:1}],score:{condition:'config$statements_only_for_top_publications'}}]};
 let error;try{scorePack(p,{X:'Yes'});}catch(e){error=e.name+': '+e.message;}
 assert.match(error,/ReferenceError/);return error;
});
check('Checkbox defaults omit unselected keys; numeric zero defaults are lost',()=>{
 const actual=ctx.defaults(core.elements);
 assert.equal(actual.P_Data_Source_NewOwn,true);assert.equal(actual.P_Data_Source_ReuseOwn,undefined);
 const zero=ctx.defaults([{id:'N',type:'number',default:0}]);assert.equal(zero.N,'');
 return {NewOwn:actual.P_Data_Source_NewOwn,ReuseOwnType:typeof actual.P_Data_Source_ReuseOwn,numericZeroDefault:zero.N};
});
check('Hidden checkbox answers survive export while hidden scalar defaults do not',()=>{
 const elements=[{id:'X',type:'checkbox',condition:'false',options:[{id:'A'}]},{id:'Y',type:'radio',condition:'false',default:'Yes',options:[{id:'Yes'}]}];
 stores.forms={pub:{elements,defaultValues:ctx.defaults(elements)}};
 const result=plain(ctx.filterExport({type:'pub',X_A:true,Y:'Yes'}));
 assert.equal(result.X_A,true);assert.equal(Object.hasOwn(result,'Y'),false);return result;
});
check('Tabular completion checks the nonexistent parent key',()=>{
 const elements=[{id:'T',type:'tabular_radio',rows:[{id:'A'}],options:[{id:'Yes'}]}];
 stores.forms={pub:{elements,defaultValues:ctx.defaults(elements)}};
 const r={type:'pub',...ctx.defaults(elements)};
 const result=plain(ctx.checkCompletion(r));assert.equal(r.T_A,'');assert.equal(result.progress.ratio,1);return result.progress;
});
check('Publication URL aliases preserve current and archive filenames',()=>{
 previewCtx.window.location.search='?type=pubs';
 assert.equal(previewCtx.resolvePackInQuery().filename,'/core-pub');
 previewCtx.window.location.search='?type=pub&path=archive&version=0.8.2';
 assert.equal(previewCtx.resolvePackInQuery().filename,'archive/core-pubs-0_8_2');
 previewCtx.window.location.search='?type=pubs&path=archive&version=0.3.1';
 assert.equal(previewCtx.resolvePackInQuery().filename,'archive/core-pubs-0_3_1');
 return {current:'core-pub',archive:'archive/core-pubs-0_8_2'};
});
check('Legacy pubs configuration and source path normalize to pub',()=>{
 const legacy={pubs:{sources:['packs/core-pubs.json','extension.json']}};
 const canonical={pub:{sources:['canonical.json']},pubs:{sources:['packs/core-pubs.json']}};
 assert.deepEqual(plain(ctx.normalizePublicationConfig(legacy).pub),{sources:['packs/core-pub.json','extension.json']});
 assert.deepEqual(plain(ctx.normalizePublicationConfig(canonical).pub),{sources:['canonical.json']});
 assert.equal(ctx.normalizePublicationSource('packs/core-pubs.json'),'packs/core-pub.json');
 assert.equal(ctx.normalizePublicationSource('packs/archive/core-pubs-0_8_2.json'),'packs/archive/core-pubs-0_8_2.json');
 return {legacy:legacy.pub.sources,canonical:canonical.pub.sources};
});
check('An empty exclude list overrides include; include uses startsWith',()=>{
 const combined={pool:[{id:'A'},{id:'AChild'},{id:'B'}]};
 const excluded=ctx.pickAccordingToConfig(combined,{include:['A'],exclude:[]});
 const included=ctx.pickAccordingToConfig(combined,{include:['A']});
 assert.equal(excluded.elements.length,3);assert.equal(included.elements.length,2);
 return {withEmptyExclude:plain(excluded.elements),includeOnly:plain(included.elements)};
});
check('Overall percentage is the mean of output percentages',()=>{
 const p={elements:[{id:'X',type:'radio',options:[{id:'Yes',value:1},{id:'No',value:0}]}]};
 const q={elements:[{id:'Y',type:'radio',options:[{id:'Yes',value:9},{id:'No',value:0}]}]};
 const s=ctx.scoreAll([{forms:{pub:p,software:q}},{type:'pub',X:'Yes'},{type:'software',Y:'No'}]);
 assert.equal(s.overall.percentage,'50.0');return {overall:s.overall.percentage,pooledPointsPercentage:'10.0'};
});
check('Theory pack starts with 15 hidden possible points before filter answers',()=>{
 const s=scorePack(theory,{P_Suitable:'Yes'});assert.equal(s.max,15);return {score:s.score,max:s.max};
});
const parseResults=[];
function scan(dir){for(const ent of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){
 const p=`${dir}/${ent.name}`;if(ent.isDirectory())scan(p);else if(p.endsWith('.json')){
  try{JSON.parse(read(p));parseResults.push({file:p,valid:true});}catch(e){parseResults.push({file:p,valid:false,error:e.message});}
 }
}}
scan('packs');
console.log(JSON.stringify({checksPassed:output.length,checks:output,jsonParsing:parseResults},null,2));
