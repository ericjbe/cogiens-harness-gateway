const $ = (id) => document.getElementById(id);
const state = { summary: null };

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

document.querySelectorAll(".sidebar-nav a").forEach((link) => {
  link.addEventListener("click", () => {
    document.querySelectorAll(".sidebar-nav a").forEach((item) => item.classList.remove("active"));
    link.classList.add("active");
  });
});

setInterval(() => {
  if ($("clock")) $("clock").textContent = new Date().toLocaleString("zh-CN", { hour12: false });
}, 1000);
setInterval(refresh, 5000);
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
  const gatewayHealthy = summary.gateway?.status === "healthy";
  const healthyAdapters = adapters.filter((item) => item.enabled && item.health?.status === "healthy").length;
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
  renderModels(models, summary.models);
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
    const support = String(harness.support_status ?? "UNKNOWN");
    const passport = String(harness.combat_passport?.status ?? "NOT_READY");
    const visual = engineVisualState(health, support, passport);
    const card = document.createElement("article");
    card.className = "harness-card";
    card.innerHTML = `
      <div class="harness-title"><span class="harness-id">${esc(harness.harness_id)} · ${esc(engineShortName(harness))}</span></div>
      <div class="harness-vendor">${esc(harness.vendor ?? "")}</div>
      <div class="harness-status ${visual.className}"><span class="status-dot"></span>${esc(visual.label)}</div>`;
    grid.appendChild(card);
  }
}

function engineVisualState(health, support, passport) {
  if (health === "unhealthy") return { className: "bad", label: "ERROR" };
  if (health === "healthy") return { className: "healthy", label: "ONLINE" };
  if (/VERIFIED|QUALIFIED|ACTIVE/.test(`${support} ${passport}`)) return { className: "healthy", label: "VERIFIED" };
  if (/PARTIAL/.test(support)) return { className: "warn", label: "PARTIAL" };
  return { className: "warn", label: "WAITING" };
}

function engineShortName(harness) {
  const byId = {
    H01: "Codex",
    H02: "Claude",
    H03: "Grok",
    H04: "Kimi",
    H05: "DeepSeek",
    H06: "Qwen",
    H07: "Antigravity",
    H08: "Mistral"
  };
  return byId[harness.harness_id] ?? prettyHarnessName(harness.canonical_name ?? harness.harness_id ?? "Engine");
}

function renderModels(models, pool) {
  const list = $("modelList");
  if (!list) return;
  list.innerHTML = "";
  if (!models.length) {
    list.innerHTML = `<div class="empty">Ollama 未连接或模型池配置不可用：${esc(pool?.error ?? "no data")}</div>`;
    return;
  }
  for (const model of models) {
    const row = document.createElement("div");
    row.className = "model-row";
    row.title = `${model.ollama_tag ?? ""}${model.size_bytes ? ` · ${formatBytes(model.size_bytes)}` : ""}`;
    row.innerHTML = `<span class="model-name">${esc(model.name)}</span><span class="model-state ${model.installed ? "ok" : "missing"}">${model.installed ? "已安装" : "缺失"}</span>`;
    list.appendChild(row);
  }
}

function renderDispatchAdapters(adapters) {
  const box = $("dispatchHarnesses");
  if (!box) return;
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
  if (!body) return;
  body.innerHTML = "";
  if (!jobs.length) {
    body.innerHTML = `<tr><td colspan="7" class="empty">暂无任务。可以从“一键派单”创建第一张 Job。</td></tr>`;
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
    const item = stats.get(run.adapter_id) ?? { total: 0, success: 0 };
    item.total += 1;
    if (run.state === "SUCCEEDED") item.success += 1;
    stats.set(run.adapter_id, item);
  }
  const panel = $("arenaPanel");
  if (!panel) return;
  if (!stats.size) {
    panel.innerHTML = `<p class="muted">还没有终态 Run。完成第一轮同题竞技后，这里会显示各 Adapter 的成功率。</p>`;
    return;
  }
  const rows = [...stats.entries()].sort((a,b) => (b[1].success / b[1].total) - (a[1].success / a[1].total));
  panel.innerHTML = rows.map(([id,s], index) => `<div class="model-row"><span class="model-name">#${index + 1} · ${esc(id)}</span><span class="model-state ${s.success === s.total ? "ok" : "missing"}">${Math.round(100*s.success/s.total)}%</span></div>`).join("");
}

async function dispatchJob(event) {
  event.preventDefault();
  const adapters = [...$("dispatchHarnesses").querySelectorAll("input:checked")].map((item) => item.value);
  if (!adapters.length) return showAlert("至少选择一个可用 Adapter。", true);
  setText("dispatchStatus", "派单中…");
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
    setText("dispatchStatus", `已创建 ${shortId(job.job_id)}`);
    await refresh();
  } catch (error) {
    setText("dispatchStatus", "派单失败");
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

function setText(id, value) { const node = $(id); if (node) node.textContent = String(value ?? ""); }
function prettyHarnessName(value = "") { return value.split("_").filter(Boolean).map((word) => word[0] + word.slice(1).toLowerCase()).join(" "); }
function shortId(value = "") { return value.length > 18 ? `${value.slice(0,10)}…${value.slice(-5)}` : value; }
function fmtTime(value) { return value ? new Date(value).toLocaleString("zh-CN", { hour12:false }) : "—"; }
function formatBytes(bytes) { const units=["B","KB","MB","GB","TB"]; let n=bytes,i=0; while(n>=1024&&i<units.length-1){n/=1024;i++;} return `${n.toFixed(i>1?1:0)} ${units[i]}`; }
function esc(value) { return String(value ?? "").replace(/[&<>"']/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch])); }
function escAttr(value) { return esc(value); }
function showAlert(message, error = true) { const box=$("alertBox"); if(!box) return; box.textContent=message; box.classList.remove("hidden"); if(!error){box.style.borderColor="rgba(31,167,101,.45)";box.style.color="#198A50";} else {box.removeAttribute("style");} }
function hideAlert() { $("alertBox")?.classList.add("hidden"); }
