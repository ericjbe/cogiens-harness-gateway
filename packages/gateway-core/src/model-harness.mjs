import { createHash } from 'node:crypto';
import { AdapterError } from '../../adapter-sdk/src/index.mjs';

export const CATALOG_VERSION = 'shuishu.model-harness.v2';
const fail = (message) => { throw new AdapterError('POLICY_DENIED', message); };

export function bindingFingerprint(adapter) {
  const clean = structuredClone(adapter);
  delete clean.selection;
  function sorted(value) {
    if (Array.isArray(value)) return value.map(sorted);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, sorted(value[k])]));
    return value;
  }
  return createHash('sha256').update(JSON.stringify(sorted(clean))).digest('hex');
}

function safeEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function normalizedSlots(config) {
  const configured = config.model_harness?.slots;
  if (!Array.isArray(configured)) return (config.adapters ?? []).map(adapter => ({
    slot_id: adapter.id,
    adapter_id: adapter.id,
    display_name: adapter.selection?.label ?? adapter.model ?? adapter.id,
    access_class: adapter.kind === 'ollama-local' ? 'free' : 'paid',
    tenant_visibility: adapter.selection?.tenant_visibility ?? 'operator-only'
  }));
  return configured.map((slot, index) => ({
    slot_id: typeof slot?.slot_id === 'string' && slot.slot_id ? slot.slot_id : `invalid-slot-${index + 1}`,
    adapter_id: typeof slot?.adapter_id === 'string' && slot.adapter_id ? slot.adapter_id : null,
    display_name: typeof slot?.display_name === 'string' && slot.display_name ? slot.display_name : `模型槽位 ${index + 1}`,
    provider_label: typeof slot?.provider_label === 'string' ? slot.provider_label : null,
    harness_label: typeof slot?.harness_label === 'string' ? slot.harness_label : null,
    access_class: safeEnum(slot?.access_class, ['free', 'paid'], 'free'),
    tenant_visibility: safeEnum(slot?.tenant_visibility, ['operator-only', 'tenant-allowlist', 'all-tenants'], 'operator-only'),
    enabled: slot?.enabled !== false
  }));
}

function paidGate(meta) {
  const authorization = safeEnum(meta.authorization?.status, ['ACTIVE', 'MISSING', 'EXPIRED', 'DISABLED'], 'MISSING');
  const billing = safeEnum(meta.billing?.status, ['READY', 'PENDING', 'DISABLED'], 'PENDING');
  const remaining = Number(meta.budget?.remaining);
  if (authorization !== 'ACTIVE') return { blocked: '收费模型尚无有效授权', authorization, billing, remaining: null };
  if (billing !== 'READY') return { blocked: '收费模型计费接入尚未就绪', authorization, billing, remaining: null };
  if (!Number.isFinite(remaining) || remaining <= 0) return { blocked: '收费模型没有可用额度', authorization, billing, remaining: Number.isFinite(remaining) ? remaining : null };
  return { blocked: null, authorization, billing, remaining };
}

// Catalog entries are operator-configured slots. A visible slot is not proof that
// a model is installed, authorized, funded, healthy, or safe to execute.
export function modelHarnessCatalog(config, health = [], now = Date.now()) {
  const adapters = new Map((config.adapters ?? []).map(adapter => [adapter.id, adapter]));
  const choices = normalizedSlots(config).map(slot => {
    const adapter = slot.adapter_id ? adapters.get(slot.adapter_id) : null;
    const current = adapter ? health.find(row => row.id === adapter.id) : null;
    const meta = adapter?.selection ?? {};
    const accessClass = slot.access_class;
    const local = adapter?.kind === 'ollama-local';
    const fingerprint = adapter ? bindingFingerprint(adapter) : null;
    const evidence = meta.evidence;
    const verified = Boolean(adapter && evidence?.status === 'PASS' && evidence.binding_sha256 === fingerprint &&
      typeof evidence.reference === 'string' && evidence.reference.length > 0 &&
      Date.parse(evidence.checked_at) <= now && Date.parse(evidence.expires_at) > now &&
      !(current?.last_execution && current.last_execution.state !== 'SUCCEEDED' && Date.parse(current.last_execution.checked_at) >= Date.parse(evidence.checked_at)));
    const paid = accessClass === 'paid' ? paidGate(meta) : { blocked: null, authorization: 'NOT_REQUIRED', billing: 'NOT_REQUIRED', remaining: null };
    let blocked = null;
    if (slot.enabled === false) blocked = '模型槽位已停用';
    else if (!adapter) blocked = '尚未绑定执行适配器';
    else if (adapter.enabled !== true) blocked = '执行适配器未启用';
    else if (typeof adapter.model !== 'string' || !adapter.model.trim()) blocked = '尚未绑定明确模型';
    else if (!['ollama-local', 'codex-cli', 'hermes-cli', 'deepseek-python'].includes(adapter.kind)) blocked = '插件模型绑定契约待验证';
    else if (accessClass === 'free' && !local) blocked = '免费模型槽位必须绑定本地模型适配器';
    else if (local && /(:cloud|-cloud)(:|$)/i.test(adapter.model)) blocked = '云端模型不能作为本地免费资源派单';
    else if (paid.blocked) blocked = paid.blocked;
    else if (current?.health?.status !== 'healthy') blocked = '执行节点预检查未通过';
    return {
      choice_id: slot.slot_id,
      adapter_id: adapter?.id ?? null,
      model: adapter?.model ?? null,
      display_name: slot.display_name,
      provider_label: slot.provider_label ?? meta.provider_label ?? null,
      harness: adapter?.kind ?? slot.harness_label ?? '未绑定',
      node: meta.node ?? '未绑定节点',
      access_class: accessClass,
      execution: local ? 'local' : (adapter ? 'cloud-or-external' : 'unbound'),
      charging: accessClass === 'free' ? 'local-resource' : 'provider-billing',
      authorization_status: paid.authorization,
      billing_status: paid.billing,
      budget: accessClass === 'paid' ? { currency: meta.budget?.currency ?? null, remaining: paid.remaining } : null,
      tenant_visibility: slot.tenant_visibility,
      precheck: current?.health?.status ?? 'not_checked',
      verification: verified ? 'VERIFIED' : 'UNVERIFIED',
      evidence_reference: verified ? evidence.reference : null,
      last_execution: current?.last_execution ? { state: current.last_execution.state, checked_at: current.last_execution.checked_at } : null,
      selectable: blocked === null,
      blocked_reason: blocked,
      binding_sha256: fingerprint
    };
  });
  const count = accessClass => choices.filter(choice => choice.access_class === accessClass).length;
  const selectable = accessClass => choices.filter(choice => choice.access_class === accessClass && choice.selectable).length;
  return {
    schema_version: CATALOG_VERSION,
    customer_access_ready: config.model_harness?.customer_access_ready === true,
    automatic_paid_fallback: false,
    billing_integration: choices.some(choice => choice.access_class === 'paid' && choice.billing_status === 'READY') ? 'PARTIAL_OR_READY' : 'PENDING',
    checked_at: new Date(now).toISOString(),
    summary: { total: choices.length, free: count('free'), paid: count('paid'), selectable_free: selectable('free'), selectable_paid: selectable('paid') },
    choices
  };
}

export function resolveModelSelection(config, health, input, now = Date.now()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('任务必须是对象');
  if (!Array.isArray(input.model_choices) || !input.model_choices.length ||
      input.model_choices.some(id => typeof id !== 'string') || new Set(input.model_choices).size !== input.model_choices.length)
    fail('请选择至少一个不重复的大模型与 Harness 组合');
  for (const key of ['adapters', 'model', 'base_url', 'command', 'credentials', 'api_key', 'token', 'model_selection'])
    if (Object.hasOwn(input, key)) fail('模型选择任务不接受字段：' + key);
  const catalog = modelHarnessCatalog(config, health, now);
  const selections = input.model_choices.map(id => {
    const choice = catalog.choices.find(row => row.choice_id === id);
    if (!choice) fail('模型与 Harness 组合不存在');
    if (!choice.selectable) fail(choice.blocked_reason);
    return choice;
  });
  if (new Set(selections.map(choice => choice.adapter_id)).size !== selections.length)
    fail('不同模型槽位不能重复绑定同一执行适配器');
  const { model_choices, ...job } = input;
  return {
    input: { ...job, adapters: selections.map(row => row.adapter_id) },
    selection: { schema_version: CATALOG_VERSION, selected_at: catalog.checked_at, mode: 'explicit', automatic_paid_fallback: false, choices: selections }
  };
}

// trustedGrant comes from APP/CP, never from browser headers or request JSON.
export function tenantModelCatalog(catalog, trustedGrant) {
  if (trustedGrant?.authenticated !== true || typeof trustedGrant.tenant_id !== 'string' || !trustedGrant.tenant_id ||
      !Array.isArray(trustedGrant.allowed_choices)) fail('需要现有 APP/CP 提供有效租户授权');
  const allowed = new Set(trustedGrant.allowed_choices);
  return {
    ...catalog,
    tenant_id: trustedGrant.tenant_id,
    choices: catalog.choices.filter(choice => allowed.has(choice.choice_id) && choice.tenant_visibility !== 'operator-only').map(choice => {
      const { binding_sha256, evidence_reference, last_execution, ...publicChoice } = choice;
      const isolationReady = trustedGrant.execution_isolation_ready === true;
      return { ...publicChoice, selectable: publicChoice.selectable && isolationReady, blocked_reason: !isolationReady ? '客户任务隔离与身份适配待接入' : publicChoice.blocked_reason };
    })
  };
}
