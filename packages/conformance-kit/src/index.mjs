import assert from "node:assert/strict";
import { sha256Text, TERMINAL_EVENT_TYPES } from "../../adapter-sdk/src/index.mjs";

export async function collectEvents(iterable) {
  const events = [];
  for await (const event of iterable) events.push(event);
  return events;
}

export function assertMonotonicEvents(events) {
  assert.ok(events.length > 0, "At least one event is required");
  const ids = new Set();
  let previous = 0;
  for (const event of events) {
    assert.equal(event.sequence, previous + 1, "Event sequence must be contiguous");
    previous = event.sequence;
    assert.ok(!ids.has(event.event_id), "Event IDs must be unique");
    ids.add(event.event_id);
  }
}

export function assertSingleTerminalEvent(events, expectedType) {
  const terminalEvents = events.filter((event) => TERMINAL_EVENT_TYPES.has(event.type));
  assert.equal(terminalEvents.length, 1, "Exactly one terminal event is required");
  if (expectedType) assert.equal(terminalEvents[0].type, expectedType);
  return terminalEvents[0];
}

export function requireEvent(events, type) {
  const event = events.find((candidate) => candidate.type === type);
  assert.ok(event, `Missing event ${type}`);
  return event;
}

export function assertArtifactIntegrity(artifact) {
  assert.equal(artifact.sha256, sha256Text(artifact.content ?? ""));
  assert.equal(artifact.size_bytes, Buffer.byteLength(artifact.content ?? "", "utf8"));
}

export function assertSecretAbsent(events, secret) {
  assert.ok(secret.length >= 8, "Test secret must be meaningful");
  assert.ok(!JSON.stringify(events).includes(secret), "Secret appeared in event stream");
}
