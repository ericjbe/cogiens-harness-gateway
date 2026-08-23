import { OneShotProcessAdapter, probe } from "../../process/src/one-shot-process-adapter.mjs";

export function createCodexCliAdapter(config = {}) {
  const command = config.command ?? "codex";
  return new OneShotProcessAdapter({
    adapterId: config.id ?? "openai.codex.cli",
    adapterVersion: "0.3.0-alpha.1",
    command,
    harnessVersion: config.harness_version ?? "codex-cli",
    versionArgs: ["--version"],
    authModes: ["provider-login", "api-key", "oauth"],
    capabilities: { structured_output: true, file_diff: true, usage: true, mcp: true },
    healthCheck: async () => {
      const status = await probe(command, ["login", "status"], 15_000);
      return status.ok ? { ok: true } : { ok: false, reason: "codex_not_authenticated" };
    },
    buildInvocation: ({ cwd, policy }) => {
      const args = [
        "exec",
        "--json",
        "--ephemeral",
        "--color", "never",
        "--sandbox", config.sandbox ?? "workspace-write",
        "--ask-for-approval", config.approval_mode ?? "never",
        "--skip-git-repo-check",
        "-C", cwd
      ];
      if (config.model) args.push("--model", config.model);
      if (policy.network === "live") args.push("--search");
      args.push("-");
      return { args };
    },
    parseOutput: ({ stdout, stderr, code }) => {
      const events = [];
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.trim()) continue;
        try { events.push(JSON.parse(line)); } catch {}
      }
      const messages = events
        .filter((event) => event.type === "item.completed" && event.item?.type === "agent_message")
        .map((event) => event.item.text)
        .filter((value) => typeof value === "string");
      const completed = [...events].reverse().find((event) => event.type === "turn.completed");
      const failed = [...events].reverse().find((event) => event.type === "turn.failed" || event.type === "error");
      if (code !== 0 || failed) {
        return {
          success: false,
          error: { code: "HARNESS_CRASHED", message: failed?.error?.message ?? stderr.trim() ?? `Codex exited with code ${code}` }
        };
      }
      if (messages.length === 0) throw new Error("Codex JSONL stream contained no final agent message");
      return {
        success: true,
        finalText: messages.at(-1),
        mediaType: "text/markdown",
        finishReason: "completed",
        usage: completed?.usage ?? null
      };
    }
  });
}
