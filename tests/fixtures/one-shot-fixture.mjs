let input = "";
for await (const chunk of process.stdin) input += chunk.toString("utf8");
if (input.includes("hold")) {
  setInterval(() => process.stdout.write("."), 1000);
} else if (input.includes("fail")) {
  process.stderr.write("fixture failure\n");
  process.exitCode = 3;
} else if (input.includes("overflow")) {
  process.stdout.write("x".repeat(100_000));
} else {
  process.stdout.write(`fixture:${input}`);
}
