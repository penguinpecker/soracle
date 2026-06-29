// Real, keyless, CORS-reachable data sources for the live feeds. Each returns
// null on failure so the console falls back to its sample inputs (and says so).

const round5 = (p: number) => Math.round(p / 5) * 5;

/** ETH/USD from 3 independent exchanges, rounded to $5 so consensus can quorum. */
export async function fetchEthPrices(): Promise<number[] | null> {
  const tasks = [
    fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot").then((r) => r.json()).then((j) => Number(j.data.amount)),
    fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd").then((r) => r.json()).then((j) => Number(j.ethereum.usd)),
    fetch("https://api.kraken.com/0/public/Ticker?pair=ETHUSD").then((r) => r.json()).then((j) => Number(j.result.XETHZUSD.c[0])),
  ];
  const settled = await Promise.allSettled(tasks);
  const vals = settled.filter((s) => s.status === "fulfilled" && Number.isFinite((s as PromiseFulfilledResult<number>).value))
    .map((s) => round5((s as PromiseFulfilledResult<number>).value));
  if (vals.length < 2) return null;
  while (vals.length < 3) vals.push(vals[0]); // pad to the 3-source circuit; quorum still needs 2 to agree
  return vals.slice(0, 3);
}

/** Live GitHub followers + public repos. */
export async function fetchGithub(user: string): Promise<{ followers: number; repos: number } | null> {
  try {
    const r = await fetch(`https://api.github.com/users/${user}`, { headers: { accept: "application/vnd.github+json" } });
    if (!r.ok) return null;
    const j = await r.json();
    return { followers: Number(j.followers ?? 0), repos: Number(j.public_repos ?? 0) };
  } catch {
    return null;
  }
}

/** Up to 3 real ERC-20 transfers for an address → records (received=sell, sent=buy). */
export async function fetchWalletFlow(addr: string): Promise<{ buy: number; sell: number; fee: number }[] | null> {
  try {
    const r = await fetch(`https://eth.blockscout.com/api/v2/addresses/${addr}/token-transfers?type=ERC-20`);
    if (!r.ok) return null;
    const data = await r.json();
    const lower = addr.toLowerCase();
    const recs: { buy: number; sell: number; fee: number }[] = [];
    for (const t of data.items ?? []) {
      const dec = Number(t.total?.decimals ?? t.token?.decimals ?? 18);
      let whole = 0n;
      try {
        whole = BigInt(t.total?.value ?? "0") / 10n ** BigInt(dec);
      } catch {
        continue;
      }
      const w = Number(whole);
      if (!(w >= 1 && w <= 1_000_000_000)) continue; // skip dust + absurd spam values
      const incoming = (t.to?.hash ?? "").toLowerCase() === lower;
      recs.push(incoming ? { buy: 0, sell: w, fee: 0 } : { buy: w, sell: 0, fee: 0 });
      if (recs.length >= 3) break;
    }
    return recs.length ? recs : null;
  } catch {
    return null;
  }
}

/** Live native balance (whole ETH) for an address — the private predicate metric. */
export async function fetchBalanceEth(addr: string): Promise<number | null> {
  try {
    const r = await fetch(`https://eth.blockscout.com/api/v2/addresses/${addr}`);
    if (!r.ok) return null;
    const j = await r.json();
    const wei = BigInt(j.coin_balance ?? "0");
    return Number(wei / 10n ** 18n);
  } catch {
    return null;
  }
}
