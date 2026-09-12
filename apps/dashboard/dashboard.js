const $ = (id) => document.getElementById(id);
const state = { summary: null, adapterCodes: new Map() };

const headerBootstrap = document.querySelector('script[data-product="水枢"]');
const productSuffix = headerBootstrap?.dataset.productSuffix ?? "Cogiens Workforce OS";
let headerObserver = null;

syncCogiensHeaderBrand();
headerObserver = new MutationObserver(syncCogiensHeaderBrand);
headerObserver.observe(document.documentElement, { childList: true, subtree: true });
setTimeout(() => headerObserver?.disconnect(), 15000);

const tokenInput = $("tokenInput");
if (tokenInput) tokenInput.value = sessionStorage.getItem("chg_dashboard_token") ?? "";
if ($("gatewayUrl")) $("gatewayUrl").textContent = location.origin;
$("saveTokenBtn")?.addEventListener("click", () => {
  sessionStorage.setItem("chg_dashboard_token", tokenInput?.value.trim() ?? "");
  showAlert("Token 已保存到当前浏览器会话。", false);
  refresh();
});
$("refreshBtn")?.addEventListener("click", refresh);
$("dispatchForm")?.addEventListener("submit", dispatchJob);
$("jobsBody")?.addEventListener("click", handleJobAction);
$("modelHarnessFilter")?.addEventListener("change", () => renderModelHarness(state.summary?.model_harness));

document.querySelectorAll(".sidebar-nav a").forEach((link) => {
  link.addEventListener("click", () => {
    document.querySelectorAll(".sidebar-nav a").forEach((item) => item.classList.remove("active"));
    link.classList.add("active");
  });
});

setInterval(() => {
  if ($("clock")) $("clock").textContent = new Date().toLocaleString("zh-CN", { hour12: false });
}, 1000);
setInterval(refresh, 3000);
refresh();

$("preflightBtn")?.addEventListener("click", preflightWorkbench);
$("startTaskBtn")?.addEventListener("click", startWorkbenchTask);
$("commandPackageInput")?.addEventListener("change", importCommandPackage);

async function preflightWorkbench() {
  const status = $("workbenchStatus"); if (!status) return;
  try { const resources = await api("/v1/resources/models-harnesses"); status.textContent = `已发现 ${resources.resources?.federation?.harnesses?.length ?? 0} 个 Harness；请确认任务范围后开始执行。`; } catch (error) { status.textContent = `预检查失败：${error.message}`; }
}
async function startWorkbenchTask() {
  const prompt = $("taskPrompt")?.value.trim(); const status = $("workbenchStatus");
  if (!prompt) { if (status) status.textContent = "请先输入任务交代。"; return; }
  const healthy = (state.summary?.adapters ?? []).find(item => item.health?.status === "healthy");
  if (!healthy) { if (status) status.textContent = "当前没有已验证可用资源，任务保持 WAITING_FOR_RESOURCE。"; return; }
  try { const job = await api("/v1/jobs/selected", { method: "POST", body: JSON.stringify({ task_title: prompt.slice(0, 120), prompt: { text: prompt }, adapters: [healthy.id], workspace: location.origin === "file:" ? "." : "." }) }); if (status) status.textContent = `任务已入队：${job.job_id}`; refresh(); } catch (error) { if (status) status.textContent = `派单失败：${error.message}`; }
}
async function importCommandPackage(event) {
  const file = event.target.files?.[0]; if (!file) return; const status = $("workbenchStatus");
  try { const bytes = new Uint8Array(await file.arrayBuffer()); let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); const result = await api("/v1/command-packages/import", { method: "POST", body: JSON.stringify({ zip_base64: btoa(binary), project_id: null }) }); if (status) status.textContent = result.idempotent ? "命令包已存在，未重复创建任务。" : `命令包已进入隔离检疫：${result.sha256}`; } catch (error) { if (status) status.textContent = `命令包拒绝导入：${error.message}`; }
}

function syncCogiensHeaderBrand() {
  const header = document.querySelector("body > header");
  if (!header) return;

  const candidates = [...header.querySelectorAll("*")].filter((node) =>
    node.children.length === 0 && node.textContent?.trim() === "水枢"
  );

  for (const productName of candidates) {
    productName.classList.add("shuishu-product-name");
    const parent = productName.parentElement;
    if (!parent) continue;
    parent.classList.add("shuishu-product-lockup");
    if (parent.querySelector(":scope > .shuishu-os-label")) continue;
    const suffix = document.createElement("span");
    suffix.className = "shuishu-os-label";
    suffix.textContent = productSuffix;
    productName.insertAdjacentElement("afterend", suffix);
  }
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers ?? {});
  const token = tokenInput?.value.trim() ?? "";
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    let payload = null;
    try { payload = await response.json(); } catch {}
    throw new Error(payload?.error?.message ?? `HTTP ${response.status}`);
  }
  return response.json();
}

async function refresh() {
  try {
    const summary = await api("/v1/dashboard/summary");
    state.summary = summary;
    render(summary);
    await refreshSyncedResults();
    if ($("lastUpdated")) {
      $("lastUpdated").textContent = `更新时间 ${new Date(summary.checked_at).toLocaleTimeString("zh-CN", { hour12: false })}`;
    }
    hideAlert();
  } catch (error) {
    showAlert(`Dashboard 数据读取失败：${safeUiError(error.message)}`);
  }
}

function render(summary) {
  const harnesses = summary.federation?.harnesses ?? [];
  const adapters = summary.adapters ?? [];
  const models = summary.models?.models ?? [];
  const jobs = summary.jobs ?? [];
  state.adapterCodes = buildAdapterCodeMap(harnesses, adapters);

  const terminalRuns = jobs.flatMap((job) => job.runs ?? []).filter((run) => ["SUCCEEDED","FAILED","CANCELLED","TIMED_OUT"].includes(run.state));
  const succeeded = terminalRuns.filter((run) => run.state === "SUCCEEDED").length;
  const running = jobs.filter((job) => job.gateway_status === "RUNNING").length;
  const gatewayHealthy = summary.gateway?.status === "healthy";
  const healthyAdapters = adapters.filter((item) => item.enabled && item.health?.status === "healthy" && state.adapterCodes.has(item.id)).length;
  const installedModels = models.filter((item) => item.installed).length;
  const localResourcesReady = summary.models?.status === "connected" && installedModels > 0;
  const availableUnits = healthyAdapters;
  const successRate = terminalRuns.length ? `${Math.round(100 * succeeded / terminalRuns.length)}%` : "—";

  setText("metricHarnesses", `${harnesses.length}/8`);
  setText("metricHealthy", availableUnits);
  setText("metricModels", summary.models?.status === 'connected' ? `${installedModels}/10` : '尚未同步');
  setText("metricRunning", state.syncedResults?.sync_status === 'SYNCED' ? state.syncedResults.jobs.filter(j => j.status === 'RUNNING').length : '尚未同步');

  setText("sidebarSystemStatus", gatewayHealthy ? "正常运行" : String(summary.gateway?.status ?? "检查中"));
  setText("sidebarVersion", summary.gateway?.version ?? "—");
  setText("sidebarUpdated", summary.checked_at ? new Date(summary.checked_at).toLocaleTimeString("zh-CN", { hour12: false }) : "—");

  setText("runtimeGateway", String(summary.gateway?.status ?? "unknown").toUpperCase());
  setText("runtimeSuccess", successRate);
  setText("runtimeVersion", summary.gateway?.version ?? "—");
  setText("runtimeChecked", summary.checked_at ? new Date(summary.checked_at).toLocaleTimeString("zh-CN", { hour12: false }) : "—");

  renderHarnesses(harnesses, adapters, localResourcesReady);
  renderModels(models);
  renderModelHarness(summary.model_harness);
  renderJobs(jobs);
  renderArena(jobs);
}

function renderHarnesses(harnesses, adapters, localResourcesReady) {
  const grid = $("harnessGrid");
  if (!grid) return;
  grid.innerHTML = "";

  for (const harness of harnesses) {
    const matched = matchAdapter(harness, adapters);
    const health = matched?.health?.status ?? "not_configured";
    const visual = engineVisualState(health, localResourcesReady);
    const last = matched?.last_execution;
    const card = document.createElement("article");
    card.className = "harness-card";
    card.title = `${harness.harness_id} · ${visual.label}`;
    card.innerHTML = `
      <div class="harness-title"><span class="harness-id">${esc(harness.harness_id)}</span></div>
      <div class="harness-vendor">Cogiens 执行单元</div>
      <div class="harness-status ${visual.className}"><span class="status-dot"></span>${esc(visual.label)}</div>
      <div class="muted">最近执行：${esc(last?.state ?? "尚无验收记录")}</div>
      <div class="muted">${esc(matched?.health?.details?.execution_capability ?? matched?.kind ?? "未配置")}</div>`;
    grid.appendChild(card);
  }
}

function engineVisualState(health, localResourcesReady) {
  if (health === "healthy") return { className: "healthy", label: "预检查通过（非任务验收）" };
  if (health === "unhealthy") return { className: "bad", label: "异常" };
  return { className: "warn", label: "资源未就绪" };
}

function renderModels(models) {
  const list = $("modelList");
  if (!list) return;
  list.innerHTML = "";
  if (!models.length) {
    list.innerHTML = `<div class="empty">本地执行资源服务暂不可用。</div>`;
    return;
  }
  for (const model of models) {
    const row = document.createElement("div");
    row.className = "model-row";
    const resourceId = String(model.id ?? "M--").toUpperCase();
    row.title = model.size_bytes ? `${resourceId} · ${formatBytes(model.size_bytes)}` : resourceId;
    row.innerHTML = `<span class="model-name">${esc(resourceId)} · 本地执行资源</span><span class="model-state ${model.installed ? "ok" : "missing"}">${state.summary?.models?.status !== 'connected' ? '尚未同步' : model.installed ? "已安装（未验证推理）" : "未就绪"}</span>`;
    list.appendChild(row);
  }
}

function renderModelHarness(catalog) {
  const box = $("dispatchHarnesses");
  const rows = $("modelHarnessRows");
  const choices = catalog?.choices ?? [];
  if (!box || !rows) return;
  const totals = catalog?.summary ?? {
    free: choices.filter(choice => choice.access_class === "free").length,
    paid: choices.filter(choice => choice.access_class === "paid").length,
    selectable_free: choices.filter(choice => choice.access_class === "free" && choice.selectable).length,
    selectable_paid: choices.filter(choice => choice.access_class === "paid" && choice.selectable).length
  };
  setText("catalogFree", `${totals.selectable_free ?? 0}/${totals.free ?? 0}`);
  setText("catalogPaid", `${totals.selectable_paid ?? 0}/${totals.paid ?? 0}`);
  setText("catalogTenant", catalog?.customer_access_ready ? "已开放" : "关闭");
  setText("catalogFallback", catalog?.automatic_paid_fallback ? "已开启" : "关闭");
  const filter = $("modelHarnessFilter")?.value ?? "all";
  const visible = choices.filter(choice => filter === "all" || choice.access_class === filter || (filter === "selectable" && choice.selectable));
  const previous = new Set([...box.querySelectorAll("input:checked")].map(item => item.value));
  box.replaceChildren(); rows.replaceChildren();
  if (!choices.length) {
    const message = "尚未配置模型与 Harness 组合，等待接入执行节点。";
    box.textContent = message;
    const row = rows.insertRow(); const cell = row.insertCell(); cell.colSpan = 8; cell.textContent = message;
  }
  if (choices.length && !visible.length) {
    const row = rows.insertRow(); const cell = row.insertCell(); cell.colSpan = 8; cell.textContent = "当前筛选条件下没有模型槽位。";
  }
  for (const choice of choices) {
    const status = choice.blocked_reason ?? (choice.verification === "VERIFIED" ? "已验证（仍需任务验收）" : "预检查通过 · 推理未验收");
    const tier = choice.access_class === "paid" ? "收费" : "免费";
    const label = document.createElement("label"); label.className = "check-item";
    const checkbox = document.createElement("input"); checkbox.type = "checkbox";
    checkbox.value = choice.choice_id; checkbox.disabled = !choice.selectable;
    checkbox.checked = choice.selectable && previous.has(choice.choice_id);
    label.append(checkbox, document.createTextNode(` ${tier} · ${choice.model ?? choice.display_name ?? choice.choice_id} · ${choice.harness} · ${choice.node} — ${status}`));
    box.appendChild(label);
  }
  for (const choice of visible) {
    const row = rows.insertRow();
    const status = choice.blocked_reason ?? (choice.verification === "VERIFIED" ? "已验证（仍需任务验收）" : "预检查通过 · 推理未验收");
    const tier = choice.access_class === "paid" ? "收费" : "免费";
    const model = choice.model ? `${choice.display_name ?? choice.choice_id} / ${choice.model}` : `${choice.display_name ?? choice.choice_id} / 尚未绑定`;
    const finance = choice.access_class === "paid"
      ? `授权 ${choice.authorization_status ?? "MISSING"} · 计费 ${choice.billing_status ?? "PENDING"} · 余额 ${formatBudget(choice.budget)}`
      : "本地资源 · 无调用费";
    for (const value of [tier, model, choice.harness, choice.node, finance, tenantVisibilityLabel(choice.tenant_visibility), status]) row.insertCell().textContent = value;
    const actionCell = row.insertCell();
    const action = document.createElement("button"); action.type = "button"; action.className = "button compact";
    action.textContent = choice.selectable ? "加入派单" : "不可用"; action.disabled = !choice.selectable;
    action.addEventListener("click", () => {
      const target = [...box.querySelectorAll("input")].find(input => input.value === choice.choice_id);
      if (target) { target.checked = true; target.scrollIntoView?.({ block: "nearest" }); }
    });
    actionCell.appendChild(action);
  }
  const submit = $("dispatchForm")?.querySelector('button[type="submit"]');
  if (submit) submit.disabled = !choices.some(choice => choice.selectable);
}

function tenantVisibilityLabel(value) {
  if (value === "all-tenants") return "全部授权租户";
  if (value === "tenant-allowlist") return "租户白名单";
  return "仅超级管理员";
}

function formatBudget(budget) {
  if (!budget || !Number.isFinite(Number(budget.remaining))) return "未配置";
  const currency = budget.currency ? `${budget.currency} ` : "";
  return `${currency}${Number(budget.remaining).toFixed(2)}`;
}

function renderJobs(jobs) {
  const body = $("jobsBody");
  if (!body) return;
  body.innerHTML = "";
  if (!jobs.length) {
    body.innerHTML = `<tr><td colspan="7" class="empty">暂无任务。可以从“一键派单”创建第一张任务。</td></tr>`;
    return;
  }
  for (const job of jobs) {
    const runs = job.runs ?? [];
    const artifacts = runs.reduce((sum, run) => sum + (run.artifacts?.length ?? 0), 0);
    const chips = runs.map((run) => {
      const code = publicEngineCode(run.adapter_id);
      return `<span class="run-chip ${escAttr(run.state)}" title="${escAttr(code)}">${esc(code)}:${esc(run.state)}</span>`;
    }).join("");
    const canCancel = job.gateway_status === "RUNNING";
    const action = canCancel
      ? `<button class="button" type="button" data-job-action="cancel" data-job-id="${escAttr(job.job_id)}">停止</button>`
      : "";
    const requested = (job.requested_adapters ?? []).map(publicEngineCode).join(", ");
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><button class="button" type="button" data-job-action="details" data-job-id="${escAttr(job.job_id)}">${esc(shortId(job.job_id))}<br>查看结果</button></td><td><div>${esc(job.task_title ?? "未命名任务")}</div><div class="muted">${esc(job.project_id ?? "")}</div></td><td class="job-status ${escAttr(job.gateway_status)}">${esc(job.gateway_status)} ${action}</td><td>${esc(requested || "—")}</td><td>${chips || "—"}</td><td>${artifacts}</td><td>${fmtTime(job.updated_at)}</td>`;
    body.appendChild(tr);
  }
}

function renderArena(jobs) {
  const stats = new Map();
  for (const run of jobs.flatMap((job) => job.runs ?? [])) {
    if (!["SUCCEEDED","FAILED","CANCELLED","TIMED_OUT"].includes(run.state)) continue;
    const code = publicEngineCode(run.adapter_id);
    const item = stats.get(code) ?? { total: 0, success: 0 };
    item.total += 1;
    if (run.state === "SUCCEEDED") item.success += 1;
    stats.set(code, item);
  }
  const panel = $("arenaPanel");
  if (!panel) return;
  if (!stats.size) {
    panel.innerHTML = `<p class="muted">还没有终态运行记录。完成第一轮同题竞技后，这里会显示各执行单元的成功率。</p>`;
    return;
  }
  const rows = [...stats.entries()].sort((a,b) => (b[1].success / b[1].total) - (a[1].success / a[1].total));
  panel.innerHTML = rows.map(([code,s], index) => `<div class="model-row"><span class="model-name">#${index + 1} · ${esc(code)}</span><span class="model-state ${s.success === s.total ? "ok" : "missing"}">${Math.round(100*s.success/s.total)}%</span></div>`).join("");
}

async function dispatchJob(event) {
  event.preventDefault();
  const adapters = [...$("dispatchHarnesses").querySelectorAll("input:checked:not(:disabled)")].map((item) => item.value);
  if (!adapters.length) return showAlert("请先选择大模型与 Harness 组合。", true);
  const prompt = $("prompt").value.trim();
  if (!prompt) return showAlert("请输入任务指令。", true);
  setText("dispatchStatus", "派单中…");
  try {
    const job = await api("/v1/jobs/selected", {
      method: "POST",
      body: JSON.stringify({
        project_id: $("projectId").value.trim(),
        workspace: $("workspace").value.trim(),
        task_title: makeTaskTitle(prompt),
        prompt,
        model_choices: adapters,
        max_concurrency: 1,
        network: "restricted"
      })
    });
    setText("dispatchStatus", `已创建 ${shortId(job.job_id)}`);
    showAlert(`任务已进入执行队列：${job.task_title ?? shortId(job.job_id)}`, false);
    await refresh();
  } catch (error) {
    setText("dispatchStatus", "派单失败");
    showAlert(`派单失败：${safeUiError(error.message)}`);
  }
}

async function handleJobAction(event) {
  const button = event.target.closest("button[data-job-action]");
  if (!button) return;
  if (button.dataset.jobAction === "details") return openJobDetails(button.dataset.jobId);
  if (button.dataset.jobAction !== "cancel") return;
  const jobId = button.dataset.jobId;
  if (!jobId) return;
  if (!window.confirm("确认停止这个任务及其仍在运行的执行单元吗？")) return;
  button.disabled = true;
  button.textContent = "停止中…";
  try {
    await api(`/v1/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason: "dashboard-user" })
    });
    showAlert(`已提交停止请求：${shortId(jobId)}`, false);
    await refresh();
  } catch (error) {
    button.disabled = false;
    button.textContent = "停止";
    showAlert(`停止任务失败：${safeUiError(error.message)}`);
  }
}

function makeTaskTitle(prompt) {
  return prompt.split(/\r?\n/).map((line) => line.trim()).find(Boolean)?.slice(0, 80) ?? "未命名任务";
}

function buildAdapterCodeMap(harnesses, adapters) {
  const map = new Map();
  for (const adapter of adapters) {
    const direct = adapterCodeFromId(adapter.id);
    if (direct) map.set(adapter.id, direct);
  }
  for (const harness of harnesses) {
    const matched = matchAdapter(harness, adapters);
    if (matched?.id && harness.harness_id) map.set(matched.id, harness.harness_id);
  }
  return map;
}

function publicEngineCode(adapterId) {
  return state.adapterCodes.get(adapterId) ?? adapterCodeFromId(adapterId) ?? "H--";
}

function adapterCodeFromId(adapterId) {
  const match = String(adapterId ?? "").match(/(?:^|[._-])(h0[1-8])(?:$|[._-])/i);
  return match ? match[1].toUpperCase() : null;
}

function matchAdapter(harness, adapters) {
  const direct = adapters.find((adapter) => adapterCodeFromId(adapter.id) === harness.harness_id);
  if (direct) return direct;

  const haystack = `${harness.canonical_name ?? ""} ${harness.vendor ?? ""}`.toLowerCase();
  const tokens = [
    ["codex", "openai"], ["claude", "anthropic"], ["grok", "xai"], ["kimi", "moonshot"],
    ["deepseek"], ["qwen"], ["antigravity", "google"], ["mistral", "vibe"]
  ].find((group) => group.some((token) => haystack.includes(token))) ?? [];
  return adapters.find((adapter) => tokens.some((token) => `${adapter.id} ${adapter.kind} ${adapter.descriptor?.name ?? ""}`.toLowerCase().includes(token))) ?? null;
}

function safeUiError(value) {
  const text = String(value ?? "执行异常");
  if (/codex|openai|claude|anthropic|grok|xai|kimi|moonshot|deepseek|qwen|google|mistral|vibe|ollama/i.test(text)) {
    return "执行单元返回异常，请查看系统日志。";
  }
  return text;
}

function setText(id, value) { const node = $(id); if (node) node.textContent = String(value ?? ""); }
function shortId(value = "") { return value.length > 18 ? `${value.slice(0,10)}…${value.slice(-5)}` : value; }
function fmtTime(value) { return value ? new Date(value).toLocaleString("zh-CN", { hour12:false }) : "—"; }
function formatBytes(bytes) { const units=["B","KB","MB","GB","TB"]; let n=bytes,i=0; while(n>=1024&&i<units.length-1){n/=1024;i++;} return `${n.toFixed(i>1?1:0)} ${units[i]}`; }
function esc(value) { return String(value ?? "").replace(/[&<>"']/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch])); }
function escAttr(value) { return esc(value); }
function showAlert(message, error = true) { const box=$("alertBox"); if(!box) return; box.textContent=message; box.classList.remove("hidden"); if(!error){box.style.borderColor="rgba(31,167,101,.45)";box.style.color="#198A50";} else {box.removeAttribute("style");} }
function hideAlert() { $("alertBox")?.classList.add("hidden"); }

function runError(run) {
  return run.error ?? [...(run.events ?? [])].reverse().find(event => event.payload?.error)?.payload.error ?? null;
}
function downloadText(name, content, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name.replace(/[^a-zA-Z0-9_.-]/g, '_');
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function openJobDetails(jobId) {
  try {
    const job = await api('/v1/jobs/' + encodeURIComponent(jobId));
    document.getElementById('jobResultDialog')?.remove();
    const dialog = document.createElement('dialog');
    dialog.id = 'jobResultDialog';
    dialog.className = 'job-result-dialog';
    const text = (tag, value, parent = dialog) => {
      const node = document.createElement(tag);
      node.textContent = String(value ?? '');
      parent.appendChild(node);
      return node;
    };
    const button = (label, action, parent = dialog) => {
      const node = text('button', label, parent);
      node.type = 'button'; node.className = 'button';
      node.addEventListener('click', action);
    };
    button('关闭', () => { dialog.close(); dialog.remove(); });
    button('刷新详情', () => openJobDetails(jobId));
    text('h2', job.task_title || job.job_id);
    text('p', '任务：' + job.job_id + '\n状态：' + job.gateway_status + '；业务验收：' + job.status + '\n项目：' + job.project_id + '\n工作目录：' + job.workspace + '\n更新时间：' + fmtTime(job.updated_at));
    text('p', '执行成功不等于软件验收。文字产物是模型回复；代码交付需结合文件及测试证据判断。');
    button('下载任务记录 JSON', () => downloadText(job.job_id + '.json', JSON.stringify(job, null, 2), 'application/json;charset=utf-8'));
    if (job.error) text('pre', JSON.stringify(job.error, null, 2));
    for (const run of job.runs ?? []) {
      const section = document.createElement('section'); dialog.appendChild(section);
      text('h3', publicEngineCode(run.adapter_id) + ' · ' + run.state, section);
      const selection = job.model_selection?.choices?.find(choice => choice.choice_id === run.adapter_id);
      if (selection) text('p', '所选模型：' + selection.model + '；Harness：' + selection.harness + '；节点：' + selection.node, section);
      text('p', '实际适配器：' + run.adapter_id + '；业务验收：' + (run.business_acceptance ?? 'PENDING'), section);
      const error = runError(run);
      if (error) text('pre', '错误：' + (error.code ?? '') + '\n' + (error.message ?? JSON.stringify(error)), section);
      const messages = (run.events ?? []).filter(event => event.type === 'assistant.message.completed').map(event => event.payload?.message).filter(value => typeof value === 'string');
      if (messages.length) {
        text('h4', '执行输出', section); text('pre', messages.join('\n\n'), section);
        button('下载输出 TXT', () => downloadText(run.run_id + '-output.txt', messages.join('\n\n')), section);
      }
      const artifacts = run.artifacts ?? [];
      if (!artifacts.length) text('p', '无登记产物。', section);
      for (const artifact of artifacts) {
        text('h4', '产物：' + artifact.artifact_id, section);
        text('p', '类型：' + (artifact.media_type ?? '未知') + '；记录位置：任务 JSON / runs / artifacts / content', section);
        if (typeof artifact.content === 'string') {
          text('pre', artifact.content, section);
          const extension = artifact.media_type === 'text/markdown' ? '.md' : '.txt';
          button('下载文字产物', () => downloadText(artifact.artifact_id + extension, artifact.content), section);
        } else {
          text('p', '此产物未内嵌内容，需核验实际文件位置：' + (artifact.uri ?? '未提供'), section);
        }
      }
      const events = document.createElement('details'); section.appendChild(events);
      text('summary', '事件日志（展开查看）', events);
      text('pre', JSON.stringify(run.events ?? [], null, 2), events);
    }
    document.body.appendChild(dialog); dialog.showModal();
  } catch (error) { showAlert('读取任务详情失败：' + error.message); }
}


async function refreshSyncedResults() {
  let panel = document.getElementById('syncedResults');
  if (!panel) {
    panel = document.createElement('section'); panel.id = 'syncedResults'; panel.className = 'panel sync-results';
    document.querySelector('main')?.prepend(panel);
  }
  try {
    const data = await api('/v1/result-sync/summary'); state.syncedResults = data;
    panel.replaceChildren();
    const add = (tag, text, parent = panel) => { const el = document.createElement(tag); el.textContent = text; parent.append(el); return el; };
    add('h2', '真实任务与自动恢复');
    if (data.sync_status !== 'SYNCED') { add('p', '尚未同步：等待执行节点主动推送结果。'); setText('metricRunning', '尚未同步'); return; }
    const newest = [...data.jobs].sort((a,b) => b.updated_at.localeCompare(a.updated_at));
    add('p', `已同步 ${newest.length} 条真实工单记录 · 状态 READY_FOR_REVIEW 表示待审查，DEPLOYED 表示已部署`);
    for (const node of data.nodes) {
      const stale = Date.now() - Date.parse(node.last_heartbeat) > 180000;
      add('p', `${node.node_id} · 最后心跳 ${new Date(node.last_heartbeat).toLocaleString('zh-CN')} · ${stale ? '心跳过期，显示最后已知结果' : '同步正常'}`);
    }
    setText('metricRunning', newest.filter(j => j.status === 'RUNNING').length);
    for (const job of newest) {
      const item = add('article', ''); item.className = 'sync-job'; item.dataset.jobId = job.job_id;
      add('h3', job.job_id, item);
      const badge = add('strong', job.status, item); badge.className = `sync-status sync-${job.status}`;
      add('p', `完整 verify：${job.tests ? `${job.tests.passed}/${job.tests.total} 通过，${job.tests.failed} 失败` : '尚无测试记录'}`, item);
      add('p', `恢复根工单：${job.root_job_id} · 上一工单：${job.parent_job_id ?? '无'}`, item);
      const details = add('details','',item); add('summary','关联标识与审计摘要',details);
      add('p', `run_id: ${job.run_id} · trace_id: ${job.trace_id}（同步适配器派生标识）`,details);
      add('p', `原始结果 SHA-256: ${job.source_sha256}`,details);
      const stages = add('ol','',item); stages.className = 'sync-stages';
      const labels = ['生产只读诊断','Git 保全','隔离基线','清单完整性','完整测试','候选运行','生产保全门禁'];
      for (const stage of job.stages) add('li', `${stage.number}. ${labels[stage.number-1]}：${stage.status}${stage.inherited_from ? '（最终尝试）' : ''}`, stages);
      if (job.summary_code === 'PAYLOAD_GATE_REJECTED') add('p','测试通过；清单门禁拒绝。失败历史已保留。',item);
      for (const artifact of job.artifacts) {
        const link = add('a', '下载经批准的结果证据', item); link.href = artifact.download_url; link.download = artifact.name;
        add('p', `${artifact.bytes} bytes · SHA-256 ${artifact.sha256}`, details);
      }
    }
  } catch {
    panel.replaceChildren(); const message = document.createElement('p'); message.textContent = '尚未同步：结果服务暂不可用，不能据此判断任务数量。'; panel.append(message);
    state.syncedResults = null; setText('metricRunning','尚未同步');
  }
}
