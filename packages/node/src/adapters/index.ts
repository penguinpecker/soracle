// Build the enabled Adapter list from adapters.config.json.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Adapter } from "./types.js";
import { sportsAdapter, type SportsConfig } from "./sports.js";
import { crosschainPnlAdapter, type PnlConfig } from "./crosschain-pnl.js";
import { githubAdapter, type GithubConfig } from "./github.js";
import { nftRoleAdapter, type NftRoleConfig } from "./nft-role.js";

const here = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(here, "../../adapters.config.json");

interface FeedEntry {
  kind: "sports" | "crosschain-pnl" | "github" | "nft-role";
  enabled?: boolean;
  config: any;
}

export function loadAdapters(): Adapter[] {
  const { feeds } = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as { feeds: FeedEntry[] };
  return feeds
    .filter((f) => f.enabled !== false)
    .map((f) => {
      switch (f.kind) {
        case "sports":
          return sportsAdapter(f.config as SportsConfig);
        case "crosschain-pnl":
          return crosschainPnlAdapter(f.config as PnlConfig);
        case "github":
          return githubAdapter(f.config as GithubConfig);
        case "nft-role":
          return nftRoleAdapter(f.config as NftRoleConfig);
        default:
          throw new Error(`unknown adapter kind: ${(f as any).kind}`);
      }
    });
}

export type { Adapter };
