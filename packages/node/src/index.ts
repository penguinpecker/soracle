// Soracle node entrypoint: load adapters, start the scheduler.
import { loadAdapters } from "./adapters/index.js";
import { startScheduler } from "./scheduler.js";

const adapters = loadAdapters();
console.log(`Soracle node: ${adapters.length} feed(s) enabled`);
const stop = startScheduler(adapters);

process.on("SIGINT", () => {
  console.log("\nstopping…");
  stop();
  process.exit(0);
});
