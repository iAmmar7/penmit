import { run } from "./cli.js";

run().catch((err: unknown) => {
  console.error("Fatal error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
