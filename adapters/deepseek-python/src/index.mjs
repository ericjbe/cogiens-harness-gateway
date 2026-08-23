import path from "node:path";
import { fileURLToPath } from "node:url";

import { OneShotProcessAdapter } from "../../process/src/one-shot-process-adapter.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNNER = path.resolve(HERE, "runner.py");

export function createDeepSeekPythonAdapter(config = {}) {
  return new OneShotProcessAdapter({
    adapterId: config.id ?? "deepseek.harness.python",
    command: config.command ?? (process.platform === "win32" ? "python" : "python3"),
    harnessVersion: config.harness_version ?? "deepseek-harness-sdk",
    versionArgs: ["-c", "import deepseek_harness; print('deepseek-harness-sdk')"],
    authModes: ["api-key"],
    platforms: ["linux", "macos"],
    requiredEnv: config.required_env ?? ["DEEPSEEK_API_KEY"],
    capabilities: { usage: false, mcp: true },
    buildInvocation: ({ prompt, cwd, session }) => ({
      args: [RUNNER],
      stdin: JSON.stringify({
        prompt,
        cwd,
        session_id: session.native_session_id,
        session_root: config.session_root ?? path.join(cwd, ".chg", "deepseek-sessions"),
        provider: config.provider ?? "deepseek-official",
        model: config.model ?? "deepseek-v4-flash",
        max_tokens: config.max_tokens ?? null,
        cordis: config.cordis ?? null
      })
    }),
    parseOutput: ({ stdout, stderr, code }) => {
      if (code !== 0) return { success: false, error: { code: "HARNESS_CRASHED", message: stderr.trim() || `DeepSeek Harness exited with code ${code}` } };
      const lines = stdout.split(/\r?\n/).filter((line) => line.trim());
      let payload;
      for (const line of lines.reverse()) {
        try { payload = JSON.parse(line); break; } catch {}
      }
      if (!payload) throw new Error("DeepSeek Harness runner returned no JSON result");
      if (payload.ok !== true) return { success: false, error: payload.error ?? { code: "HARNESS_CRASHED", message: "DeepSeek Harness failed" } };
      return {
        success: true,
        finalText: payload.final_response ?? "",
        mediaType: "text/markdown",
        finishReason: payload.finish_reason ?? null
      };
    }
  });
}
