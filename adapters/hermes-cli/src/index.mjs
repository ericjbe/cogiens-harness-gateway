import { OneShotProcessAdapter } from "../../process/src/one-shot-process-adapter.mjs";

export function createHermesCliAdapter(config = {}) {
  return new OneShotProcessAdapter({
    adapterId: config.id ?? "nous.hermes.cli",
    command: config.command ?? "hermes",
    harnessVersion: config.harness_version ?? "hermes-agent",
    versionArgs: ["--version"],
    authModes: ["provider-login", "api-key", "oauth"],
    capabilities: { mcp: true },
    buildInvocation: () => {
      const args = ["chat", "--query-file", "-"];
      if (config.provider && config.provider !== "auto") args.push("--provider", config.provider);
      if (config.model) args.push("--model", config.model);
      if (config.toolsets) args.push("--toolsets", config.toolsets);
      return { args };
    },
    parseOutput: ({ stdout, stderr, code }) => {
      if (code !== 0) {
        return { success: false, error: { code: "HARNESS_CRASHED", message: stderr.trim() || `Hermes exited with code ${code}` } };
      }
      const finalText = stdout.trim();
      if (!finalText) throw new Error("Hermes returned an empty response");
      return { success: true, finalText, mediaType: "text/markdown", finishReason: "completed" };
    }
  });
}
