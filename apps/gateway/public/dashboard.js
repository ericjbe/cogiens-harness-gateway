const fleetNode = document.querySelector("#fleet");
const statusNode = document.querySelector("#fleet-status");
const selectionNode = document.querySelector("#selection");
const stateNode = document.querySelector("#campaign-state");
const resultsNode = document.querySelector("#results");
const selected = new Map();

export async function loadFleet(fetcher = fetch) {
  const response = await fetcher("/api/v1/fleet", { headers: authHeaders() });
  if (!response.ok) throw new Error(`Fleet discovery failed (${response.status})`);
  const { fleet } = await response.json();
  renderFleet(fleet);
  return fleet;
}

export function renderFleet(fleet) {
  fleetNode.replaceChildren(...fleet.map((item) => {
    const card = document.createElement("article");
    card.className = "fleet-card";
    card.dataset.harnessId = item.harness_id;
    card.innerHTML = `<div class="card-head"><strong>${escapeHtml(item.harness_id)}</strong><span class="health ${item.auth_health === "AUTHENTICATED" ? "good" : ""}">${escapeHtml(item.auth_health)}</span></div><h3>${escapeHtml(item.canonical_name)}</h3><p>${escapeHtml(item.vendor)} · ${escapeHtml(item.version ?? "not detected")}</p><dl><dt>Auth</dt><dd>${escapeHtml(item.auth_mode)}</dd><dt>Billing</dt><dd>${escapeHtml(item.billing_mode)}</dd></dl><label class="role">Role<input aria-label="${escapeHtml(item.harness_id)} role" placeholder="e.g. Lead implementer"></label>`;
    card.addEventListener("click", (event) => {
      if (event.target instanceof HTMLInputElement) return;
      card.classList.toggle("selected");
      if (card.classList.contains("selected")) selected.set(item.harness_id, card);
      else selected.delete(item.harness_id);
      selectionNode.textContent = selected.size ? `${selected.size} fleet asset(s) selected: ${[...selected.keys()].join(", ")}` : "Select fleet assets and assign roles.";
    });
    return card;
  }));
  statusNode.textContent = `${fleet.length} ASSETS · LIVE REGISTRY`;
}

document.querySelector("#deploy").addEventListener("click", async () => {
  try {
    if (!document.querySelector("#prompt").value.trim()) throw new Error("Mission prompt is required");
    if (!selected.size) throw new Error("Select at least one fleet asset");
    stateNode.textContent = "CAMPAIGN STATE · CREATING";
    const roles = Object.fromEntries([...selected].map(([id, card]) => [id, card.querySelector("input").value]));
    const body = {
      project: document.querySelector("#project").value,
      campaign: document.querySelector("#campaign").value,
      title: document.querySelector("#title").value,
      prompt: document.querySelector("#prompt").value,
      fleet: [...selected.keys()], roles
    };
    const workspace = document.querySelector("#workspace").value.trim();
    if (workspace) body.workspace = workspace;
    const created = await jsonFetch("/api/v1/missions", { method: "POST", body: JSON.stringify(body) });
    stateNode.textContent = "CAMPAIGN STATE · DISPATCHING";
    const dispatched = await jsonFetch(`/api/v1/missions/${created.mission_id}/dispatch`, { method: "POST", body: "{}" });
    stateNode.textContent = "CAMPAIGN STATE · DEPLOYED";
    resultsNode.textContent = JSON.stringify(dispatched, null, 2);
    pollRuns(dispatched.job.runs.map((run) => run.run_id));
  } catch (error) {
    stateNode.textContent = "CAMPAIGN STATE · BLOCKED";
    resultsNode.textContent = error.message;
  }
});

async function pollRuns(runIds) {
  const runs = await Promise.all(runIds.map((id) => jsonFetch(`/api/v1/runs/${id}`)));
  resultsNode.textContent = JSON.stringify(runs, null, 2);
  if (runs.some((run) => ["QUEUED", "STARTING", "RUNNING"].includes(run.state))) setTimeout(() => pollRuns(runIds), 1000);
  else stateNode.textContent = `CAMPAIGN STATE · ${runs.every((run) => run.state === "SUCCEEDED") ? "COMPLETE" : "NEEDS REVIEW"}`;
}

async function jsonFetch(url, options) {
  const response = await fetch(url, { ...options, headers: { "content-type": "application/json", ...authHeaders(), ...options?.headers } });
  const value = await response.json();
  if (!response.ok) throw new Error(`${value.error?.code ?? "REQUEST_FAILED"}: ${value.error?.message ?? response.status}`);
  return value;
}

function authHeaders() {
  const token = document.querySelector("#token")?.value.trim() ?? "";
  return token ? { authorization: `Bearer ${token}` } : {};
}

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]); }

document.querySelector("#token").addEventListener("change", () => loadFleet().catch(showFleetError));
loadFleet().catch(showFleetError);
function showFleetError(error) { statusNode.textContent = "AUTHENTICATION REQUIRED"; resultsNode.textContent = error.message; }
