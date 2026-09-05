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
  const successRate = terminalRuns.length ? `${Math.round(100 * succeeded / terminalRuns.length)}%` : "—";

  setText("metricHarnesses", `${harnesses.length}/8`);
  setText("metricHealthy", healthyAdapters);
  setText("metricModels", `${installedModels}/10`);
  setText("metricRunning", running);

  setText("sidebarSystemStatus", gatewayHealthy ? "正常运行" : String(summary.gateway?.status ?? "检查中"));
  setText("sidebarVersion", summary.gateway?.version ?? "—");
  setText("sidebarUpdated", summary.checked_at ? new Date(summary.checked_at).toLocaleTimeString("zh-CN", { hour12: false }) : "—");

  setText("runtimeGateway", String(summary.gateway?.status ?? "unknown").toUpperCase());
  setText("runtimeSuccess", successRate);
  setText("runtimeVersion", summary.gateway?.version ?? "—");
  setText("runtimeChecked", summary.checked_at ? new Date(summary.checked_at).toLocaleTimeString("zh-CN", { hour12: false }) : "—");

  renderHarnesses(harnesses, adapters);
  renderModels(models);
  renderDispatchAdapters(adapters);
  renderJobs(jobs);
  renderArena(jobs);
}

function renderHarnesses(harnesses, adapters) {
  const grid = $("harnessGrid");
  if (!grid) return;
  grid.innerHTML = "";

  for (const harness of harnesses) {
    const matched = matchAdapter(harness, adapters);
    const health = matched?.health?.status ?? "not_configured";
    const visual = engineVisualState(health);
    const card = document.createElement("article");
    card.className = "harness-card";
    card.title = `${harness.harness_id} · ${visual.label}`;
    card.innerHTML = `
      <div class="harness-title"><span class="harness-id">${esc(harness.harness_id)}</span></div>
      <div class="harness-vendor">Cogiens 执行单元</div>
      <div class="harness-status ${visual.className}"><span class="status-dot"></span>${esc(visual.label)}</div>`;
    grid.appendChild(card);
  }
}

function engineVisualState(health) {
  if (health === "healthy") return { className: "healthy", label: "ONLINE" };
  if (health === "unhealthy") return { className: "bad", label: "不可用" };
  if (health === "disabled") return { className: "warn", label: "未启用" };
  return { className: "warn", label: "未接入" };
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
    row.innerHTML = `<span class="model-name">${esc(resourceId)} · 本地执行资源</span><span class="model-state ${model.installed ? "ok" : "missing"}">${model.installed ? "可用" : "未就绪"}</span>`;
    list.appendChild(row);
  }
}

function renderDispatchAdapters(adapters) {
  const box = $("dispatchHarnesses");
  if (!box) return;
  const previous = new Set([...box.querySelectorAll("input:checked")].map((item) => item.value));
  box.innerHTML = "";
  const configured = adapters.filter((item) => item.enabled && state.adapterCodes.has(item.id));
  if (!configured.length) {
    box.innerHTML = `<span class="muted">当前没有可派单执行单元。任务会在执行单元就绪后开放。</span>`;
    return;
  }
  for (const adapter of configured) {
    const label = document.createElement("label");
    label.className = "check-item";
    const healthy = adapter.health?.status === "healthy";
    const checked = healthy && (previous.size ? previous.has(adapter.id) : true);
    const code = publicEngineCode(adapter.id);
    label.title = healthy ? `${code} 可派单` : `${code} 当前不可派单`;
    label.innerHTML = `<input type="checkbox" value="${escAttr(adapter.id)}" ${checked ? "checked" : ""} ${healthy ? "" : "disabled"}/> ${esc(code)} · ${healthy ? "ONLINE" : "未就绪"}`;
    box.appendChild(label);
  }
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
    tr.innerHTML = `<td><code>${esc(shortId(job.job_id))}</code></td><td><div>${esc(job.task_title ?? "未命名任务")}</div><div class="muted">${esc(job.project_id ?? "")}</div></td><td class="job-status ${escAttr(job.gateway_status)}">${esc(job.gateway_status)} ${action}</td><td>${esc(requested || "—")}</td><td>${chips || "—"}</td><td>${artifacts}</td><td>${fmtTime(job.updated_at)}</td>`;
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
  if (!adapters.length) return showAlert("当前没有健康、可执行的执行单元。", true);
  const prompt = $("prompt").value.trim();
  if (!prompt) return showAlert("请输入任务指令。", true);
  setText("dispatchStatus", "派单中…");
  try {
    const job = await api("/v1/jobs/fanout", {
      method: "POST",
      body: JSON.stringify({
        project_id: $("projectId").value.trim(),
        workspace: $("workspace").value.trim(),
        task_title: makeTaskTitle(prompt),
        prompt,
        adapters,
        max_concurrency: Math.min(4, adapters.length),
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
  if (!button || button.dataset.jobAction !== "cancel") return;
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
  for (const harness of harnesses) {
    const matched = matchAdapter(harness, adapters);
    if (matched?.id && harness.harness_id) map.set(matched.id, harness.harness_id);
  }
  return map;
}

function publicEngineCode(adapterId) {
  return state.adapterCodes.get(adapterId) ?? "H--";
}

function matchAdapter(harness, adapters) {
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
