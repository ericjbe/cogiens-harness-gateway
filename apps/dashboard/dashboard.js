const $ = (id) => document.getElementById(id);
const state = { summary: null };

const tokenInput = $("tokenInput");
tokenInput.value = sessionStorage.getItem("chg_dashboard_token") ?? "";
$("gatewayUrl").textContent = location.origin;
$("saveTokenBtn").addEventListener("click", () => {
  sessionStorage.setItem("chg_dashboard_token", tokenInput.value.trim());
  showAlert("Token 已保存到当前浏览器会话。", false);
  refresh();
});
$("refreshBtn").addEventListener("click", refresh);
$("dispatchForm").addEventListener("submit", dispatchJob);

setInterval(() => $("clock").textContent = new Date().toLocaleString("zh-CN", { hour12: false }), 1000);
setInterval(refresh, 5000);
refresh();

async function api(path, options = {}) {
  const headers = new Headers(options.headers ?? {});
  const token = tokenInput.value.trim();
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
    $("lastUpdated").textContent = `更新时间 ${new Date(summary.checked_at).toLocaleTimeString("zh-CN", { hour12: false })}`;
    hideAlert();
  } catch (error) {
    showAlert(`Dashboard 数据读取失败：${error.message}`);
  }
}

function render(summary) {
  const harnesses = summary.federation?.harnesses ?? [];
  const adapters = summary.adapters ?? [];
  const models = summary.models?.models ?? [];
  const jobs = summary.jobs ?? [];
  const terminalRuns = jobs.flatMap((job) => job.runs ?? []).filter((run) => ["SUCCEEDED","FAILED","CANCELLED","TIMED_OUT"].includes(run.state));
  const succeeded = terminalRuns.filter((run) => run.state === "SUCCEEDED").length;
  const running = jobs.filter((job) => job.gateway_status === "RUNNING").length;

  $("metricHarnesses").textContent = `${harnesses.length}/8`;
  $("metricHealthy").textContent = adapters.filter((item) => item.enabled && item.health?.status === "healthy").length;
  $("metricModels").textContent = `${models.filter((item) => item.installed).length}/10`;
  $("metricRunning").textContent = running;
  $("metricSuccess").textContent = terminalRuns.length ? `${Math.round(100 * succeeded / terminalRuns.length)}%` : "—";
  $("metricGateway").textContent = String(summary.gateway?.status ?? "unknown").toUpperCase();
  $("metricGateway").style.color = summary.gateway?.status === "healthy" ? "var(--green)" : "var(--amber)";
  $("metricChecked").textContent = summary.gateway?.version ?? "runtime";

  renderHarnesses(harnesses, adapters);
  renderModels(models, summary.models);
  renderDispatchAdapters(adapters);
  renderJobs(jobs);
  renderArena(jobs);
}

function renderHarnesses(harnesses, adapters) {
  const grid = $("harnessGrid");
  grid.innerHTML = "";
  for (const harness of harnesses) {
    const matched = matchAdapter(harness, adapters);
    const health = matched?.health?.status ?? "not_configured";
    const visual = health === "healthy" ? "healthy" : health === "unhealthy" ? "bad" : "warn";
    const deployment = harness.local_deployment_status ?? "NOT_PROBED";
    const support = harness.support_status ?? "UNKNOWN";
    const passport = harness.combat_passport?.status ?? "NOT_READY";
    const card = document.createElement("article");
    card.className = "harness-card";
    card.innerHTML = `
      <div class="harness-title"><span class="harness-id">${esc(harness.harness_id)}</span><span class="status-pill ${visual}">${esc(health.toUpperCase())}</span></div>
      <div class="harness-name">${esc(prettyHarnessName(harness.canonical_name))}</div>
      <div class="harness-vendor">${esc(harness.vendor ?? "")}</div>
      <div class="harness-meta">
        <div><small>Support</small><b>${esc(support)}</b></div>
        <div><small>M-3</small><b>${esc(deployment)}</b></div>
        <div><small>Passport</small><b>${esc(passport)}</b></div>
        <div><small>Adapter</small><b>${esc(matched?.id ?? "未接入")}</b></div>
      </div>`;
    grid.appendChild(card);
  }
}

function renderModels(models, pool) {
  const list = $("modelList");
  list.innerHTML = "";
  if (!models.length) {
    list.innerHTML = `<div class="empty">Ollama 未连接或模型池配置不可用：${esc(pool?.error ?? "no data")}</div>`;
    return;
  }
  for (const model of models) {
    const row = document.createElement("div");
    row.className = "model-row";
    row.innerHTML = `<span class="model-id">${esc(model.id)}</span><span class="model-name">${esc(model.name)}</span><span class="model-tag">${esc(model.ollama_tag)}</span><span class="model-size">${model.size_bytes ? formatBytes(model.size_bytes) : "—"}</span><span class="model-state ${model.installed ? "ok" : "missing"}">${model.installed ? "INSTALLED" : "MISSING"}</span>`;
    list.appendChild(row);
  }
}

function renderDispatchAdapters(adapters) {
  const box = $("dispatchHarnesses");
  const previous = new Set([...box.querySelectorAll("input:checked")].map((item) => item.value));
  box.innerHTML = "";
  const available = adapters.filter((item) => item.enabled);
  if (!available.length) {
    box.innerHTML = `<span class="muted">当前没有可派单 Adapter。先完成 H01–H08 本机验军。</span>`;
    return;
  }
  for (const adapter of available) {
    const label = document.createElement("label");
    label.className = "check-item";
    const checked = previous.size ? previous.has(adapter.id) : adapter.health?.status === "healthy";
    label.innerHTML = `<input type="checkbox" value="${escAttr(adapter.id)}" ${checked ? "checked" : ""}/> ${esc(adapter.id)} · ${esc(adapter.health?.status ?? "unknown")}`;
    box.appendChild(label);
  }
}

function renderJobs(jobs) {
  const body = $("jobsBody");
  body.innerHTML = "";
  if (!jobs.length) {
    body.innerHTML = `<tr><td colspan="7" class="empty">暂无任务。可以从右侧“一键派单”创建第一张 Job。</td></tr>`;
    return;
  }
  for (const job of jobs) {
    const runs = job.runs ?? [];
    const artifacts = runs.reduce((sum, run) => sum + (run.artifacts?.length ?? 0), 0);
    const chips = runs.map((run) => `<span class="run-chip ${escAttr(run.state)}" title="${escAttr(run.error?.message ?? "")}">${esc(run.adapter_id)}:${esc(run.state)}</span>`).join("");
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><code>${esc(shortId(job.job_id))}</code></td><td>${esc(job.project_id ?? "")}</td><td class="job-status ${escAttr(job.gateway_status)}">${esc(job.gateway_status)}</td><td>${esc((job.requested_adapters ?? []).join(", "))}</td><td>${chips || "—"}</td><td>${artifacts}</td><td>${fmtTime(job.updated_at)}</td>`;
    body.appendChild(tr);
  }
}

function renderArena(jobs) {
  const stats = new Map();
  for (const run of jobs.flatMap((job) => job.runs ?? [])) {
    if (!["SUCCEEDED","FAILED","CANCELLED","TIMED_OUT"].includes(run.state)) continue;
    const item = stats.get(run.adapter_id) ?? { total: 0, success: 0, duration: 0, timed: 0 };
    item.total += 1;
    if (run.state === "SUCCEEDED") item.success += 1;
    const ms = Date.parse(run.updated_at) - Date.parse(run.created_at);
    if (Number.isFinite(ms) && ms >= 0) { item.duration += ms; item.timed += 1; }
    stats.set(run.adapter_id, item);
  }
  const panel = $("arenaPanel");
  if (!stats.size) {
    panel.innerHTML = `<p class="muted">还没有终态 Run。完成第一轮同题竞技后，这里会显示各 Adapter 的成功率和平均耗时。</p>`;
    return;
  }
  const rows = [...stats.entries()].sort((a,b) => (b[1].success / b[1].total) - (a[1].success / a[1].total));
  panel.innerHTML = rows.map(([id,s], index) => `<div class="model-row"><span class="model-id">#${index + 1}</span><span class="model-name">${esc(id)}</span><span class="model-tag">${s.success}/${s.total} success</span><span class="model-size">${s.timed ? formatDuration(s.duration / s.timed) : "—"}</span><span class="model-state ${s.success === s.total ? "ok" : "missing"}">${Math.round(100*s.success/s.total)}%</span></div>`).join("");
}

async function dispatchJob(event) {
  event.preventDefault();
  const adapters = [...$("dispatchHarnesses").querySelectorAll("input:checked")].map((item) => item.value);
  if (!adapters.length) return showAlert("至少选择一个可用 Adapter。", true);
  $("dispatchStatus").textContent = "派单中…";
  try {
    const job = await api("/v1/jobs/fanout", {
      method: "POST",
      body: JSON.stringify({
        project_id: $("projectId").value.trim(),
        workspace: $("workspace").value.trim(),
        prompt: $("prompt").value.trim(),
        adapters,
        max_concurrency: Math.min(4, adapters.length),
        network: "restricted"
      })
    });
    $("dispatchStatus").textContent = `已创建 ${shortId(job.job_id)}`;
    await refresh();
  } catch (error) {
    $("dispatchStatus").textContent = "派单失败";
    showAlert(`派单失败：${error.message}`);
  }
}

function matchAdapter(harness, adapters) {
  const haystack = `${harness.canonical_name ?? ""} ${harness.vendor ?? ""}`.toLowerCase();
  const tokens = [
    ["codex", "openai"], ["claude", "anthropic"], ["grok", "xai"], ["kimi", "moonshot"],
    ["deepseek"], ["qwen"], ["antigravity", "google"], ["mistral", "vibe"]
  ].find((group) => group.some((token) => haystack.includes(token))) ?? [];
  return adapters.find((adapter) => tokens.some((token) => `${adapter.id} ${adapter.kind} ${adapter.descriptor?.name ?? ""}`.toLowerCase().includes(token))) ?? null;
}

function prettyHarnessName(value = "") { return value.split("_").map((word) => word[0] + word.slice(1).toLowerCase()).join(" "); }
function shortId(value = "") { return value.length > 18 ? `${value.slice(0,10)}…${value.slice(-5)}` : value; }
function fmtTime(value) { return value ? new Date(value).toLocaleString("zh-CN", { hour12:false }) : "—"; }
function formatBytes(bytes) { const units=["B","KB","MB","GB","TB"]; let n=bytes,i=0; while(n>=1024&&i<units.length-1){n/=1024;i++;} return `${n.toFixed(i>1?1:0)} ${units[i]}`; }
function formatDuration(ms) { if (ms < 1000) return `${Math.round(ms)}ms`; if (ms < 60000) return `${(ms/1000).toFixed(1)}s`; return `${(ms/60000).toFixed(1)}m`; }
function esc(value) { return String(value ?? "").replace(/[&<>"']/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch])); }
function escAttr(value) { return esc(value); }
function showAlert(message, error = true) { const box=$("alertBox"); box.textContent=message; box.classList.remove("hidden"); if(!error){box.style.borderColor="rgba(53,208,127,.45)";box.style.color="#8ce8b5";} else {box.removeAttribute("style");} }
function hideAlert() { $("alertBox").classList.add("hidden"); }
