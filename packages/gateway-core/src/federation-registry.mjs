import { readFile } from "node:fs/promises";
import path from "node:path";

export const CAPABILITY_STATES = Object.freeze(["SUPPORTED", "LIMITED", "UNSUPPORTED", "UNKNOWN"]);
export const SUPPORT_STATES = Object.freeze([
  "DECLARED_UNVERIFIED",
  "CONFORMANCE_PARTIAL",
  "CONFORMANCE_VERIFIED",
  "PRODUCTION_CANDIDATE",
  "PRODUCTION_CERTIFIED",
  "BLOCKED",
  "DEPRECATED"
]);
export const LOCAL_DEPLOYMENT_STATES = Object.freeze([
  "NOT_PROBED",
  "NOT_DISCOVERED",
  "DISCOVERED",
  "AUTH_REQUIRED",
  "AUTHENTICATED",
  "HEALTHY",
  "UNHEALTHY",
  "BLOCKED"
]);
export const PASSPORT_EVIDENCE_STATES = Object.freeze([
  "VERIFIED",
  "LIMITED",
  "NOT_OBSERVED",
  "UNSUPPORTED",
  "FAILED",
  "NOT_APPLICABLE"
]);
export const PASSPORT_READINESS_STATES = Object.freeze([
  "NOT_READY",
  "HUMAN_BRIDGED",
  "LIMITED_AUTONOMOUS",
  "NATIVE_AUTONOMOUS"
]);

const PROMOTION_ORDER = Object.freeze([
  "DECLARED_UNVERIFIED",
  "CONFORMANCE_PARTIAL",
  "CONFORMANCE_VERIFIED",
  "PRODUCTION_CANDIDATE",
  "PRODUCTION_CERTIFIED"
]);

const PROMOTION_REQUIREMENTS = Object.freeze({
  CONFORMANCE_PARTIAL: ["official_source", "headless_interface", "structured_output", "adapter_unit_tests"],
  CONFORMANCE_VERIFIED: ["conformance_suite", "platform_matrix", "cancellation", "artifacts", "trace"],
  PRODUCTION_CANDIDATE: ["security_review", "sandbox_or_worktree", "upgrade_rollback"],
  PRODUCTION_CERTIFIED: ["external_maintainer_review", "operational_owner", "sla_boundary"]
});

export class FederationRegistryError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "FederationRegistryError";
    this.code = code;
    this.details = details;
  }
}

export async function loadFederationRegistry(registryPath, options = {}) {
  const absolutePath = path.resolve(registryPath);
  const rootDirectory = path.resolve(options.rootDirectory ?? path.dirname(path.dirname(absolutePath)));
  let document;
  try {
    document = JSON.parse(await readFile(absolutePath, "utf8"));
  } catch (cause) {
    throw new FederationRegistryError(
      "REGISTRY_READ_FAILED",
      `Cannot read federation registry ${absolutePath}: ${cause instanceof Error ? cause.message : cause}`
    );
  }
  validateRegistryDocument(document);

  const passports = new Map();
  for (const harness of [...document.harnesses, ...(document.auxiliary ?? [])]) {
    if (!harness.combat_passport?.path) continue;
    const passportPath = path.resolve(rootDirectory, harness.combat_passport.path);
    let passport;
    try {
      passport = JSON.parse(await readFile(passportPath, "utf8"));
    } catch (cause) {
      throw new FederationRegistryError(
        "PASSPORT_READ_FAILED",
        `Cannot read Combat Passport ${passportPath}: ${cause instanceof Error ? cause.message : cause}`,
        { harness_id: harness.harness_id }
      );
    }
    validateCombatPassport(passport, harness, document.required_evidence);
    passports.set(harness.harness_id, passport);
  }

  return new FederationRegistry({ absolutePath, rootDirectory, document, passports });
}

export class FederationRegistry {
  #document;
  #passports;
  #index;

  constructor({ absolutePath, rootDirectory, document, passports = new Map() }) {
    validateRegistryDocument(document);
    this.sourcePath = absolutePath;
    this.rootDirectory = rootDirectory;
    this.#document = structuredClone(document);
    this.#passports = new Map([...passports].map(([key, value]) => [key, structuredClone(value)]));
    this.#index = new Map();
    for (const harness of [...this.#document.harnesses, ...(this.#document.auxiliary ?? [])]) {
      this.#index.set(harness.harness_id.toUpperCase(), harness);
      this.#index.set(harness.canonical_name.toUpperCase(), harness);
    }
  }

  snapshot() {
    return {
      schema_version: this.#document.schema_version,
      registry_version: this.#document.registry_version,
      product: this.#document.product,
      status: this.#document.status,
      runtime_implemented: this.#document.runtime_implemented,
      support_states: [...SUPPORT_STATES],
      local_deployment_states: [...LOCAL_DEPLOYMENT_STATES],
      capability_states: [...CAPABILITY_STATES],
      passport_readiness_states: [...PASSPORT_READINESS_STATES],
      harnesses: this.listHarnesses({ includeAuxiliary: false }),
      auxiliary: structuredClone(this.#document.auxiliary ?? []),
      required_evidence: [...this.#document.required_evidence],
      notes: structuredClone(this.#document.notes ?? [])
    };
  }

  listHarnesses({ includeAuxiliary = true } = {}) {
    const harnesses = structuredClone(this.#document.harnesses);
    return includeAuxiliary ? harnesses.concat(structuredClone(this.#document.auxiliary ?? [])) : harnesses;
  }

  getHarness(idOrCanonicalName) {
    if (typeof idOrCanonicalName !== "string") return null;
    const harness = this.#index.get(idOrCanonicalName.toUpperCase());
    return harness ? structuredClone(harness) : null;
  }

  getCapabilities(idOrCanonicalName) {
    const harness = this.getHarness(idOrCanonicalName);
    if (!harness) return null;
    return {
      harness_id: harness.harness_id,
      canonical_name: harness.canonical_name,
      support_status: harness.support_status,
      local_deployment_status: harness.local_deployment_status,
      default_capability_state: harness.default_capability_state ?? "UNKNOWN",
      capabilities: structuredClone(harness.capabilities ?? {})
    };
  }

  getCombatPassport(idOrCanonicalName) {
    const harness = this.getHarness(idOrCanonicalName);
    if (!harness) return null;
    const passport = this.#passports.get(harness.harness_id);
    return passport
      ? structuredClone(passport)
      : { harness_id: harness.harness_id, status: harness.combat_passport?.status ?? "NOT_READY", evidence: [] };
  }

  evaluateSupportTransition(idOrCanonicalName, targetStatus, options = {}) {
    const harness = this.getHarness(idOrCanonicalName);
    if (!harness) throw new FederationRegistryError("HARNESS_NOT_FOUND", `Harness not found: ${idOrCanonicalName}`);
    const passport = this.getCombatPassport(harness.harness_id);
    return evaluateSupportTransition(harness.support_status, targetStatus, passport.evidence, options);
  }
}

export function evaluateSupportTransition(currentStatus, targetStatus, evidence = [], options = {}) {
  requireEnum(currentStatus, SUPPORT_STATES, "current support status");
  requireEnum(targetStatus, SUPPORT_STATES, "target support status");
  if (currentStatus === targetStatus) return allowed(currentStatus, targetStatus);

  if (targetStatus === "BLOCKED") {
    if (!String(options.reason ?? "").trim()) return denied(currentStatus, targetStatus, ["blocking_reason"]);
    return allowed(currentStatus, targetStatus);
  }
  if (targetStatus === "DEPRECATED") return verifiedGate(currentStatus, targetStatus, evidence, ["deprecation_notice"]);
  if (currentStatus === "BLOCKED") {
    if (targetStatus !== "DECLARED_UNVERIFIED") return denied(currentStatus, targetStatus, ["blocked_remediation_to_declared_required"]);
    return verifiedGate(currentStatus, targetStatus, evidence, ["remediation_review"]);
  }
  if (currentStatus === "DEPRECATED") return denied(currentStatus, targetStatus, ["deprecated_status_is_terminal"]);

  const currentIndex = PROMOTION_ORDER.indexOf(currentStatus);
  const targetIndex = PROMOTION_ORDER.indexOf(targetStatus);
  if (targetIndex !== currentIndex + 1) return denied(currentStatus, targetStatus, ["adjacent_transition_required"]);
  return verifiedGate(currentStatus, targetStatus, evidence, PROMOTION_REQUIREMENTS[targetStatus] ?? []);
}

export function validateRegistryDocument(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) invalid("Registry root must be an object");
  if (document.schema_version !== "0.3.0-alpha.1") invalid("Registry schema_version must be 0.3.0-alpha.1");
  if (document.runtime_implemented !== true) invalid("Registry runtime_implemented must be true for P2-A");
  if (!Array.isArray(document.harnesses) || document.harnesses.length !== 8) invalid("Registry requires exactly eight first-class harnesses");
  if (!Array.isArray(document.required_evidence) || document.required_evidence.length === 0) invalid("Registry requires an evidence catalog");

  const ids = new Set();
  const names = new Set();
  for (const harness of [...document.harnesses, ...(document.auxiliary ?? [])]) {
    if (!harness?.harness_id || !harness?.canonical_name) invalid("Every harness requires harness_id and canonical_name");
    const id = harness.harness_id.toUpperCase();
    const name = harness.canonical_name.toUpperCase();
    if (ids.has(id)) invalid(`Duplicate harness_id: ${harness.harness_id}`);
    if (names.has(name)) invalid(`Duplicate canonical_name: ${harness.canonical_name}`);
    ids.add(id);
    names.add(name);
    requireEnum(harness.support_status, SUPPORT_STATES, `${harness.harness_id} support_status`);
    requireEnum(harness.local_deployment_status, LOCAL_DEPLOYMENT_STATES, `${harness.harness_id} local_deployment_status`);
    if (harness.default_capability_state !== undefined) {
      requireEnum(harness.default_capability_state, CAPABILITY_STATES, `${harness.harness_id} default_capability_state`);
    }
    for (const [capability, state] of Object.entries(harness.capabilities ?? {})) {
      requireEnum(state, CAPABILITY_STATES, `${harness.harness_id} capability ${capability}`);
    }
  }
  for (let index = 1; index <= 8; index += 1) {
    const expected = `H${String(index).padStart(2, "0")}`;
    if (!document.harnesses.some((entry) => entry.harness_id === expected)) invalid(`Missing first-class harness: ${expected}`);
  }
  return true;
}

export function validateCombatPassport(passport, harness, requiredEvidence = []) {
  if (!passport || typeof passport !== "object" || Array.isArray(passport)) invalid("Combat Passport root must be an object");
  if (passport.schema_version !== "0.3.0-alpha.1") invalid("Combat Passport schema_version must be 0.3.0-alpha.1");
  if (passport.harness_id !== harness.harness_id || passport.canonical_name !== harness.canonical_name) {
    invalid(`Combat Passport identity does not match ${harness.harness_id}`);
  }
  requireEnum(passport.evaluated_support_status, SUPPORT_STATES, `${harness.harness_id} passport evaluated_support_status`);
  requireEnum(passport.status, PASSPORT_READINESS_STATES, `${harness.harness_id} passport status`);
  if (passport.evaluated_support_status !== harness.support_status) {
    invalid(`Combat Passport support status does not match ${harness.harness_id}`);
  }
  if (passport.status !== harness.combat_passport?.status) {
    invalid(`Combat Passport readiness does not match ${harness.harness_id}`);
  }
  if (!Array.isArray(passport.evidence)) invalid(`${harness.harness_id} passport requires an evidence array`);
  const evidenceIds = new Set();
  for (const item of passport.evidence) {
    if (!item?.id) invalid(`${harness.harness_id} passport evidence requires id`);
    if (evidenceIds.has(item.id)) invalid(`${harness.harness_id} passport has duplicate evidence: ${item.id}`);
    evidenceIds.add(item.id);
    requireEnum(item.status, PASSPORT_EVIDENCE_STATES, `${harness.harness_id} evidence ${item.id}`);
  }
  const missing = requiredEvidence.filter((id) => !evidenceIds.has(id));
  if (missing.length > 0) invalid(`${harness.harness_id} passport is missing required evidence: ${missing.join(", ")}`);
  return true;
}

function verifiedGate(currentStatus, targetStatus, evidence, requirements) {
  const verified = new Set(evidence.filter((item) => item?.status === "VERIFIED").map((item) => item.id));
  const missing = requirements.filter((id) => !verified.has(id));
  return missing.length === 0 ? allowed(currentStatus, targetStatus) : denied(currentStatus, targetStatus, missing);
}

function allowed(currentStatus, targetStatus) {
  return { allowed: true, current_status: currentStatus, target_status: targetStatus, missing_evidence: [] };
}

function denied(currentStatus, targetStatus, missingEvidence) {
  return { allowed: false, current_status: currentStatus, target_status: targetStatus, missing_evidence: missingEvidence };
}

function requireEnum(value, allowedValues, label) {
  if (!allowedValues.includes(value)) invalid(`${label} must be one of: ${allowedValues.join(", ")}`);
}

function invalid(message) {
  throw new FederationRegistryError("REGISTRY_INVALID", message);
}
