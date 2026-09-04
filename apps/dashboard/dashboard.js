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

for (const button of document.querySelectorAll(".priority-row button")) {
  button.addEventListener("click", () => {
    for (const item of document.querySelectorAll(".priority-row button")) item.classList.remove("selected");
    button.classList.add("selected");
  });
}

for (const link of document.querySelectorAll(".side-nav a")) {
  link.addEventListener("click", () => {
    for (const item of document.querySelectorAll(".side-nav a")) item.classList.remove("active");
    link.classList.add("active");
  });
}

const searchInput = $("dashboardSearch");
searchInput.addEventListener("input", () => filterDashboard(searchInput.value));
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    searchInput.focus();
  }
});

updateClock();
setInterval(updateClock, 1000);
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
    const checkedAt = new Date(summary.checked_at);
    $("lastUpdated").textContent = `更新时间 ${checkedAt.toLocaleTimeString("zh-CN", { hour12: false })}`;
    $("sidebarUpdated").textContent = checkedAt.toLocaleString("zh-CN", { hour12: false });
    hideAlert();
  } catch (error) {
    setSystemStatus(false, "连接异常", "—");
    showAlert(`Dashboard 数据读取失败：${error.message}`);
  }
}

function render(summary) {
  const harnesses = summary.federation?.harnesses ?? [];
  const adapters = summary.adapters ?? [];
  const models = summary.models?.models ?? [];
  const jobs = summary.jobs ?? [];
  const terminalRuns = jobs.flatMap((job) => job.runs ?? []).filter((run) => ["SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT"].includes(run.state));
  const succeeded = terminalRuns.filter((run) => run.state === "SUCCEEDED").length;
  const running = jobs.filter((job) => job.gateway_status === "RUNNING").length;
  const healthy = summary.gateway?.status === "healthy";
  const version = summary.gateway?.version ?? "runtime";

  $("metricHarnesses").textContent = `${harnesses.length}/8`;
  $("metricHealthy").textContent = adapters.filter((item) => item.enabled && item.health?.status === "healthy").length;
  $("metricModels").textContent = `${models.filter((item) => item.installed).length}/10`;
  $("metricRunning").textContent = running;
  $("metricSuccess").textContent = terminalRuns.length ? `${Math.round(100 * succeeded / terminalRuns.length)}%` : "—";
  $("metricGateway").textContent = healthy ? "正常" : String(summary.gateway?.status ?? "未知").toUpperCase();
  $("metricGateway").style.color = healthy ? "var(--green)" : "var(--amber)";
  $("metricChecked").textContent = healthy ? "所有核心服务可访问" : version;
  setSystemStatus(healthy, healthy ? "正常运行" : "需要注意", version);

  renderHarnesses(harnesses, adapters);
  renderModels(models, summary.models);
  renderDispatchAdapters(adapters);
  renderJobs(jobs);
  renderArena(jobs);
  if (searchInput.value) filterDashboard(searchInput.value);
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
    card.className = `harness-card ${visual}`;
    card.innerHTML = `
      <div class="harness-title">
        <span class="harness-id">${esc(harness.harness_id)}</span>
        <span class="status-pill ${visual}">${esc(healthLabel(health))}</span>
      </div>
      <img class="engine-mark" src="/dashboard/cogiens-mark.png" alt="" />
      <div class="harness-name">${esc(prettyHarnessName(harness.canonical_name))}</div>
      <div class="harness-vendor">${esc(harness.vendor ?? "")}</div>
      <div class="harness-meta">
        <div title="${escAttr(support)}"><small>Support</small><b>${esc(support)}</b></div>
        <div title="${escAttr(deployment)}"><small>Node</small><b>${esc(deployment)}</b></div>
        <div title="${escAttr(passport)}"><small>Passport</small><b>${esc(passport)}</b></div>
        <div title="${escAttr(matched?.id ?? "未接入")}"><small>Adapter</small><b>${esc(matched?.id ?? "未接入")}</b></div>
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
    row.innerHTML = `
      <span class="model-id">${esc(model.id)}</span>
      <span class="model-name">${esc(model.name)}</span>
      <span class="model-tag">${esc(model.ollama_tag)}</span>
      <span class="model-size">${model.size_bytes ? formatBytes(model.size_bytes) : "—"}</span>
      <span class="model-state ${model.installed ? "ok" : "missing"}">${model.installed ? "● 在线" : "○ 未安装"}</span>`;
    list.appendChild(row);
  }
}

function renderDispatchAdapters(adapters) {
  const box = $("dispatchHarnesses");
  const previous = new Set([...box.querySelectorAll("input:checked")].map((item) => item.value));
  box.innerHTML = "";
  const available = adapters.filter((item) => item.enabled);
  if (!available.length) {
    box.innerHTML = `<span class="muted">当前没有可派单执行引擎，请先完成本机验军。</span>`;
    return;
  }
  for (const adapter of available) {
    const label = document.createElement("label");
    label.className = "check-item";
    const checked = previous.size ? previous.has(adapter.id) : adapter.health?.status === "healthy";
    label.innerHTML = `<input type="checkbox" value="${escAttr(adapter.id)}" ${checked ? "checked" : ""}/> ${esc(adapter.id)} · ${esc(healthLabel(adapter.health?.status ?? "unknown"))}`;
    box.appendChild(label);
  }
}

function renderJobs(jobs) {
  const body = $("jobsBody");
  body.innerHTML = "";
  if (!jobs.length) {
    body.innerHTML = `<tr><td colspan="7" class="empty">暂无任务。可以从右侧“一键派单”创建第一张任务。</td></tr>`;
    return;
  }
  for (const job of jobs) {
    const runs = job.runs ?? [];
    const artifacts = runs.reduce((sum, run) => sum + (run.artifacts?.length ?? 0), 0);
    const chips = runs.map((run) => `<span class="run-chip ${escAttr(run.state)}" title="${escAttr(run.error?.message ?? "")}">${esc(run.adapter_id)}:${esc(stateLabel(run.state))}</span>`).join("");
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><code>${esc(shortId(job.job_id))}</code></td><td>${esc(job.project_id ?? "")}</td><td class="job-status ${escAttr(job.gateway_status)}">● ${esc(stateLabel(job.gateway_status))}</td><td>${esc((job.requested_adapters ?? []).join(", "))}</td><td>${chips || "—"}</td><td>${artifacts}</td><td>${fmtTime(job.updated_at)}</td>`;
    body.appendChild(tr);
  }
}

function renderArena(jobs) {
  const stats = new Map();
  for (const run of jobs.flatMap((job) => job.runs ?? [])) {
    if (!["SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT"].includes(run.state)) continue;
    const item = stats.get(run.adapter_id) ?? { total: 0, success: 0, duration: 0, timed: 0 };
    item.total += 1;
    if (run.state === "SUCCEEDED") item.success += 1;
    const ms = Date.parse(run.updated_at) - Date.parse(run.created_at);
    if (Number.isFinite(ms) && ms >= 0) { item.duration += ms; item.timed += 1; }
    stats.set(run.adapter_id, item);
  }
  const panel = $("arenaPanel");
  if (!stats.size) {
    panel.innerHTML = `<p class="muted">还没有终态 Run。完成第一轮同题竞技后，这里会显示各执行引擎的成功率和平均耗时。</p>`;
    return;
  }
  const rows = [...stats.entries()].sort((a, b) => (b[1].success / b[1].total) - (a[1].success / a[1].total));
  panel.innerHTML = rows.map(([id, s], index) => `<div class="model-row"><span class="model-id">#${index + 1}</span><span class="model-name">${esc(id)}</span><span class="model-tag">${s.success}/${s.total} success</span><span class="model-size">${s.timed ? formatDuration(s.duration / s.timed) : "—"}</span><span class="model-state ${s.success === s.total ? "ok" : "missing"}">${Math.round(100 * s.success / s.total)}%</span></div>`).join("");
}

async function dispatchJob(event) {
  event.preventDefault();
  const adapters = [...$("dispatchHarnesses").querySelectorAll("input:checked")].map((item) => item.value);
  if (!adapters.length) return showAlert("至少选择一个可用执行引擎。", true);
  $("dispatchStatus").textContent = "派单中……";
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

function setSystemStatus(healthy, text, version) {
  $("sidebarStatus").textContent = text;
  $("sidebarVersion").textContent = version;
  $("sidebarStatusDot").className = healthy ? "ok" : "bad";
}

function filterDashboard(query) {
  const normalized = String(query ?? "").trim().toLowerCase();
  for (const item of document.querySelectorAll(".harness-card,.model-panel .model-row,#jobsBody tr")) {
    item.hidden = Boolean(normalized) && !item.textContent.toLowerCase().includes(normalized);
  }
}

function updateClock() {
  $("clock")?.replaceChildren(document.createTextNode(new Date().toLocaleString("zh-CN", { hour12: false })));
}

function matchAdapter(harness, adapters) {
  const haystack = `${harness.canonical_name ?? ""} ${harness.vendor ?? ""}`.toLowerCase();
  const tokens = [
    ["codex", "openai"], ["claude", "anthropic"], ["grok", "xai"], ["kimi", "moonshot"],
    ["deepseek"], ["qwen"], ["antigravity", "google"], ["mistral", "vibe"]
  ].find((group) => group.some((token) => haystack.includes(token))) ?? [];
  return adapters.find((adapter) => tokens.some((token) => `${adapter.id} ${adapter.kind} ${adapter.descriptor?.name ?? ""}`.toLowerCase().includes(token))) ?? null;
}

function healthLabel(value) {
  return ({ healthy: "在线", unhealthy: "异常", not_configured: "待接入", unknown: "未知" })[value] ?? String(value).toUpperCase();
}
function stateLabel(value) {
  return ({ COMPLETED: "已完成", RUNNING: "运行中", PARTIAL: "部分完成", FAILED: "失败", SUCCEEDED: "成功", CANCELLED: "已取消", TIMED_OUT: "超时", QUEUED: "排队中" })[value] ?? String(value ?? "未知");
}
function prettyHarnessName(value = "") { return value.split("_").map((word) => word ? word[0] + word.slice(1).toLowerCase() : "").join(" "); }
function shortId(value = "") { return value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-5)}` : value; }
function fmtTime(value) { return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "—"; }
function formatBytes(bytes) { const units = ["B", "KB", "MB", "GB", "TB"]; let n = bytes, i = 0; while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; } return `${n.toFixed(i > 1 ? 1 : 0)} ${units[i]}`; }
function formatDuration(ms) { if (ms < 1000) return `${Math.round(ms)}ms`; if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`; return `${(ms / 60000).toFixed(1)}m`; }
function esc(value) { return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[ch]); }
function escAttr(value) { return esc(value); }
function showAlert(message, error = true) { const box = $("alertBox"); box.textContent = message; box.classList.remove("hidden"); if (!error) { box.style.borderColor = "#A8E1BF"; box.style.background = "#F0FBF5"; box.style.color = "#167A48"; } else { box.removeAttribute("style"); } }
function hideAlert() { $("alertBox").classList.add("hidden"); }
