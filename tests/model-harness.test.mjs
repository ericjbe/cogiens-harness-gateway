import test from 'node:test';
import assert from 'node:assert/strict';
import { modelHarnessCatalog, resolveModelSelection, tenantModelCatalog, bindingFingerprint } from '../packages/gateway-core/src/model-harness.mjs';
const adapter = { id:'m3.qwen7b', kind:'ollama-local', enabled:true, model:'qwen2.5:7b', base_url:'http://127.0.0.1:11434', selection:{node:'M3',tenant_visibility:'tenant-allowlist'} };
const config = { adapters: [adapter] };
const health = [{id:adapter.id,health:{status:'healthy'}}];
const now = Date.parse('2026-09-08T12:00:00Z');
const input = { model_choices:[adapter.id], prompt:'test', workspace:'/tmp' };
test('precheck is not inference proof; catalog projects no URLs, commands or credentials',()=>{
 const a={...adapter,api_key:'secret',command:'/private/command'};
 const choice=modelHarnessCatalog({adapters:[a]},health,now).choices[0];
 assert.equal(choice.verification,'UNVERIFIED'); assert.equal(choice.selectable,true);
 assert.equal(choice.model,'qwen2.5:7b'); assert.equal(choice.node,'M3');
 for(const key of ['api_key','command','base_url'])assert.equal(Object.hasOwn(choice,key),false);
});
test('selection resolves only configured binding, preserving prompt and workspace',()=>{
 const resolved=resolveModelSelection(config,health,input,now);
 assert.deepEqual(resolved.input.adapters,[adapter.id]);assert.equal(resolved.input.prompt,'test');
 assert.equal(resolved.selection.choices[0].model,adapter.model);
 assert.equal(resolved.selection.automatic_paid_fallback,false);
});
test('missing, duplicate, unknown, malformed and forged selection inputs are rejected',()=>{
 for(const model_choices of [undefined,[],[adapter.id,adapter.id],['unknown'],[{}]])
   assert.throws(()=>resolveModelSelection(config,health,{...input,model_choices},now));
 for(const key of ['adapters','model','base_url','command','credentials','api_key','token','model_selection'])
   assert.throws(()=>resolveModelSelection(config,health,{...input,[key]:'forged'},now));
 for(const body of [null,[],1])assert.throws(()=>resolveModelSelection(config,health,body,now));
});
test('disabled, unhealthy, unbound, unknown plugin, and paid cloud bindings fail closed',()=>{
 for(const changes of [{enabled:false},{model:''},{model:'example:cloud'},{kind:'plugin-module'},{kind:'codex-cli'},{kind:'deepseek-python'},{kind:'hermes-cli'}])
  assert.throws(()=>resolveModelSelection({adapters:[{...adapter,...changes}]},health,input,now));
 assert.throws(()=>resolveModelSelection(config,[],input,now));
});
test('evidence requires exact execution configuration, timestamp and expiration',()=>{
 const a=structuredClone(adapter);
 a.selection.evidence={status:'PASS',binding_sha256:bindingFingerprint(a),reference:'audit-001',checked_at:'2026-09-08T11:00:00Z',expires_at:'2026-09-09T11:00:00Z'};
 assert.equal(modelHarnessCatalog({adapters:[a]},health,now).choices[0].verification,'VERIFIED');
 const failedHealth=[{...health[0],last_execution:{state:'FAILED',checked_at:'2026-09-08T11:30:00Z'}}];
 assert.equal(modelHarnessCatalog({adapters:[a]},failedHealth,now).choices[0].verification,'UNVERIFIED');
 for(const changes of [{model:'other'},{base_url:'http://other:11434'},{enabled:false}])
  assert.equal(modelHarnessCatalog({adapters:[{...a,...changes}]},health,now).choices[0].verification,'UNVERIFIED');
 assert.equal(modelHarnessCatalog({adapters:[a]},health,now+86400000).choices[0].verification,'UNVERIFIED');
 assert.equal(modelHarnessCatalog({adapters:[a]},health,now-86400000).choices[0].verification,'UNVERIFIED');
});
test('tenant catalog filters grants, removes internal evidence and never enables customer execution',()=>{
 const catalog=modelHarnessCatalog(config,health,now);
 assert.throws(()=>tenantModelCatalog(catalog,{tenant_id:'A',allowed_choices:[adapter.id]}));
 const grant={authenticated:true,tenant_id:'A',allowed_choices:[adapter.id]};
 const permitted=tenantModelCatalog(catalog,grant);assert.equal(permitted.choices.length,1);
 assert.equal(permitted.choices[0].selectable,false);assert.equal(permitted.customer_access_ready,false);
 assert.equal(Object.hasOwn(permitted.choices[0],'binding_sha256'),false);
 assert.equal(tenantModelCatalog(catalog,{...grant,allowed_choices:[]}).choices.length,0);
});

test('configured management catalog exposes 10 free and 6 paid slots without pretending they are available',()=>{
 const slots=[...Array.from({length:10},(_,i)=>({slot_id:`free-${i+1}`,display_name:`免费 ${i+1}`,access_class:'free',tenant_visibility:'tenant-allowlist'})),
  ...Array.from({length:6},(_,i)=>({slot_id:`paid-${i+1}`,display_name:`收费 ${i+1}`,access_class:'paid',tenant_visibility:'operator-only'}))];
 const catalog=modelHarnessCatalog({model_harness:{slots},adapters:[]},[],now);
 assert.deepEqual(catalog.summary,{total:16,free:10,paid:6,selectable_free:0,selectable_paid:0});
 assert.equal(catalog.choices.every(choice=>choice.selectable===false),true);
 assert.equal(catalog.choices.every(choice=>choice.blocked_reason==='尚未绑定执行适配器'),true);
 assert.equal(catalog.customer_access_ready,false);
 assert.equal(catalog.automatic_paid_fallback,false);
});

test('paid selection requires explicit authorization, billing and positive remaining budget',()=>{
 const paid={id:'paid.adapter',kind:'codex-cli',enabled:true,model:'operator-configured-model',selection:{node:'HK',authorization:{status:'ACTIVE'},billing:{status:'READY'},budget:{currency:'USD',remaining:12},tenant_visibility:'operator-only'}};
 const paidConfig={model_harness:{slots:[{slot_id:'paid-01',display_name:'收费服务',access_class:'paid',adapter_id:paid.id,tenant_visibility:'operator-only'}]},adapters:[paid]};
 const paidHealth=[{id:paid.id,health:{status:'healthy'}}];
 const ready=modelHarnessCatalog(paidConfig,paidHealth,now).choices[0];
 assert.equal(ready.selectable,true);assert.equal(ready.budget.remaining,12);
 assert.deepEqual(resolveModelSelection(paidConfig,paidHealth,{...input,model_choices:['paid-01']},now).input.adapters,[paid.id]);
 for(const selection of [{authorization:{status:'MISSING'},billing:{status:'READY'},budget:{remaining:12}},
  {authorization:{status:'ACTIVE'},billing:{status:'PENDING'},budget:{remaining:12}},
  {authorization:{status:'ACTIVE'},billing:{status:'READY'},budget:{remaining:0}}]) {
   const blocked={...paid,selection:{...paid.selection,...selection}};
   assert.equal(modelHarnessCatalog({...paidConfig,adapters:[blocked]},paidHealth,now).choices[0].selectable,false);
 }
});

test('two visible slots cannot cause duplicate execution of one adapter',()=>{
 const duplicate={model_harness:{slots:[
  {slot_id:'one',display_name:'一',access_class:'free',adapter_id:adapter.id,tenant_visibility:'operator-only'},
  {slot_id:'two',display_name:'二',access_class:'free',adapter_id:adapter.id,tenant_visibility:'operator-only'}]},adapters:[adapter]};
 assert.throws(()=>resolveModelSelection(duplicate,health,{...input,model_choices:['one','two']},now),/重复绑定/);
});

test('tenant catalog excludes operator-only slots and requires execution isolation before enabling dispatch',()=>{
 const slots=[{slot_id:'tenant-free',display_name:'租户免费模型',access_class:'free',adapter_id:adapter.id,tenant_visibility:'tenant-allowlist'},
  {slot_id:'operator-paid',display_name:'管理员收费模型',access_class:'paid',tenant_visibility:'operator-only'}];
 const catalog=modelHarnessCatalog({model_harness:{slots},adapters:[adapter]},health,now);
 const grant={authenticated:true,tenant_id:'tenant-a',allowed_choices:['tenant-free','operator-paid']};
 const closed=tenantModelCatalog(catalog,grant);assert.equal(closed.choices.length,1);assert.equal(closed.choices[0].selectable,false);
 const open=tenantModelCatalog(catalog,{...grant,execution_isolation_ready:true});assert.equal(open.choices[0].selectable,true);
});

test('browser selector renders safe text, requires explicit selection and preserves it on refresh',async()=>{
 const {readFile}=await import('node:fs/promises');const {default:vm}=await import('node:vm');
 const created=[];
 function element(tag){const e={tag,children:[],listeners:{},textContent:'',classList:{add(){},remove(){}},addEventListener(k,v){this.listeners[k]=v},append(...n){this.children.push(...n)},appendChild(n){this.children.push(n)},replaceChildren(){this.children=[];this.textContent=''},querySelectorAll(){return this.children.flatMap(n=>n.children??[]).filter(n=>n.tag==='input'&&n.checked)},insertRow(){const row=element('tr');this.children.push(row);return row},insertCell(){const cell=element('td');this.children.push(cell);return cell}};created.push(e);return e;}
 const box=element('div'),rows=element('tbody');const ids={dispatchHarnesses:box,modelHarnessRows:rows};
 const document={getElementById:id=>ids[id]??null,querySelector:()=>null,querySelectorAll:()=>[],documentElement:element('html'),createElement:element,createTextNode:text=>({textContent:text})};
 const ctx=vm.createContext({document,sessionStorage:{getItem:()=>''},location:{origin:'http://localhost'},MutationObserver:class{observe(){}},setTimeout(){},setInterval(){},Headers,fetch:async()=>({ok:true,json:async()=>({})})});
 await vm.runInContext(await readFile(new URL('../apps/dashboard/dashboard.js',import.meta.url),'utf8'),ctx);
 const catalog=modelHarnessCatalog(config,health,now);catalog.choices[0].model='<script>test</script>';
 ctx.catalog=catalog;vm.runInContext('renderModelHarness(catalog)',ctx);
 assert.equal(rows.children.length,1);assert.equal(rows.children[0].children[1].textContent,'qwen2.5:7b / <script>test</script>');
 assert.equal(box.children[0].children[0].checked,false);
 box.children[0].children[0].checked=true;
 vm.runInContext('renderModelHarness(catalog)',ctx);assert.equal(box.children[0].children[0].checked,true);
 catalog.choices[0].selectable=false;
 vm.runInContext('renderModelHarness(catalog)',ctx);assert.equal(box.children[0].children[0].checked,false);assert.equal(box.children[0].children[0].disabled,true);
 assert.equal(created.some(e=>e.tag==='script'),false);
});
