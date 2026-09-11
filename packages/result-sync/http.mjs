import { digest } from './protocol.mjs';
export async function ingestRequest(store, request, response) {
  try {
    const chunks = []; let size = 0;
    for await (const chunk of request) { size += chunk.length; if (size > 1024 * 1024) throw Object.assign(new Error('TOO_LARGE'), {status: 413}); chunks.push(chunk); }
    const result = await store.ingest(request.headers, Buffer.concat(chunks).toString('utf8'));
    response.writeHead(200, {'content-type': 'application/json', 'cache-control': 'no-store'}); response.end(JSON.stringify(result));
  } catch (error) {
    response.writeHead(error.status ?? 500, {'content-type': 'application/json', 'cache-control': 'no-store'});
    response.end(JSON.stringify({error: {code: error.status ? error.message : 'SYNC_STORAGE_ERROR'}}));
  }
}
export function evidenceResponse(store, pathname, response) {
  const match = pathname.match(/^\/v1\/result-sync\/evidence\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)$/);
  if (!match) return false;
  const body = store.evidence(match[1], match[2]);
  response.writeHead(body === null ? 404 : 200, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...(body === null ? {} : {'content-disposition': 'attachment; filename="approved-result.json"', 'x-content-sha256': digest(body)})});
  response.end(body ?? '{"error":{"code":"NOT_FOUND"}}'); return true;
}
