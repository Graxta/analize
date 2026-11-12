// Descarcă prețurile zilnice și calculează indicatorii pentru pagina de investiții.
// Rulează automat din GitHub Actions; rezultatul ajunge în data/market.json.
import { writeFile, mkdir } from 'node:fs/promises';

export const ASSETS = [
  // ETF-uri
  ['VWCE.DE', 'Vanguard FTSE All-World (Acc)', 'etf'],
  ['FWIA.DE', 'Invesco FTSE All-World (Acc)', 'etf'],
  ['WEBN.DE', 'Amundi Prime All Country World (Acc)', 'etf'],
  ['EUNL.DE', 'iShares Core MSCI World', 'etf'],
  ['SXR8.DE', 'iShares Core S&P 500', 'etf'],
  ['VUAA.DE', 'Vanguard S&P 500 (Acc)', 'etf'],
  ['EQQQ.DE', 'Invesco Nasdaq-100', 'etf'],
  ['IS3N.DE', 'iShares Core MSCI Emerging Markets IMI', 'etf'],
  ['EXSA.DE', 'iShares STOXX Europe 600', 'etf'],
  ['TVBETETF.RO', 'ETF BET Patria-Tradeville', 'etf'],
  // Aur
  ['4GLD.DE', 'Xetra-Gold', 'aur'],
  ['EGLN.L', 'iShares Physical Gold (EGLN)', 'aur'],
  // BVB
  ['TLV.RO', 'Banca Transilvania', 'bvb'],
  ['SNP.RO', 'OMV Petrom', 'bvb'],
  ['H2O.RO', 'Hidroelectrica', 'bvb'],
  ['SNG.RO', 'Romgaz', 'bvb'],
  ['SNN.RO', 'Nuclearelectrica', 'bvb'],
  ['BRD.RO', 'BRD Groupe Société Générale', 'bvb'],
  ['TGN.RO', 'Transgaz', 'bvb'],
  ['EL.RO', 'Electrica', 'bvb'],
  ['TEL.RO', 'Transelectrica', 'bvb'],
  ['DIGI.RO', 'Digi Communications', 'bvb'],
  ['M.RO', 'MedLife', 'bvb'],
  ['ONE.RO', 'One United Properties', 'bvb'],
  ['FP.RO', 'Fondul Proprietatea', 'bvb'],
  ['AQ.RO', 'Aquila', 'bvb'],
  ['TTS.RO', 'Transport Trade Services', 'bvb'],
  ['WINE.RO', 'Purcari Wineries', 'bvb'],
  ['BVB.RO', 'Bursa de Valori București', 'bvb'],
  // Acțiuni SUA
  ['AAPL', 'Apple', 'sua'],
  ['MSFT', 'Microsoft', 'sua'],
  ['NVDA', 'Nvidia', 'sua'],
  ['GOOGL', 'Alphabet', 'sua'],
  ['AMZN', 'Amazon', 'sua'],
  ['META', 'Meta Platforms', 'sua'],
  ['TSLA', 'Tesla', 'sua'],
  ['BRK-B', 'Berkshire Hathaway', 'sua'],
  ['JPM', 'JPMorgan Chase', 'sua'],
  ['V', 'Visa', 'sua'],
  ['JNJ', 'Johnson & Johnson', 'sua'],
  ['KO', 'Coca-Cola', 'sua'],
  ['PG', 'Procter & Gamble', 'sua'],
  ['XOM', 'Exxon Mobil', 'sua'],
  // Criptomonede
  ['BTC-EUR', 'Bitcoin', 'cripto'],
  ['ETH-EUR', 'Ethereum', 'cripto'],
  ['SOL-EUR', 'Solana', 'cripto'],
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const DAY = 86400;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const round = (x, d = 4) => (x == null || !isFinite(x) ? null : +x.toFixed(d));

async function chart(ticker) {
  let last = 'fără răspuns';
  for (const host of ['query1', 'query2', 'query1']) {
    try {
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=2y&interval=1d&events=div`;
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (r.ok) {
        const res = (await r.json()).chart?.result?.[0];
        if (res?.timestamp?.length) return res;
        last = 'fără date';
      } else last = 'HTTP ' + r.status;
    } catch (e) { last = String(e.message || e); }
    await sleep(1500);
  }
  throw new Error(last);
}

export function metrics(res) {
  const ts = res.timestamp, q = res.indicators.quote[0].close;
  const adj = res.indicators.adjclose?.[0]?.adjclose || q;
  const pts = [];
  for (let i = 0; i < ts.length; i++) if (q[i] > 0) pts.push({ t: ts[i], c: q[i], a: adj[i] > 0 ? adj[i] : q[i] });
  if (pts.length < 30) throw new Error('istoric prea scurt');
  const last = pts[pts.length - 1];
  const ret = days => {
    const target = last.t - days * DAY;
    if (pts[0].t > target + 10 * DAY) return null;
    let p = pts[0];
    for (const x of pts) { if (x.t <= target) p = x; else break; }
    return last.a / p.a - 1;
  };
  const win = pts.filter(p => p.t >= last.t - 365 * DAY);
  const rets = [];
  for (let i = 1; i < win.length; i++) rets.push(win[i].a / win[i - 1].a - 1);
  const mean = rets.reduce((s, x) => s + x, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(rets.length - 1, 1));
  const years = Math.max((last.t - win[0].t) / (365 * DAY), 0.05);
  const vol = sd * Math.sqrt(rets.length / years);
  let peak = -Infinity, mdd = 0;
  for (const p of win) { peak = Math.max(peak, p.a); mdd = Math.min(mdd, p.a / peak - 1); }
  const l200 = pts.slice(-200);
  const ma200 = pts.length >= 200 ? last.c / (l200.reduce((s, p) => s + p.c, 0) / 200) - 1 : null;
  let div = 0;
  for (const d of Object.values(res.events?.dividends || {})) if (d.date >= last.t - 365 * DAY) div += d.amount || 0;
  const step = Math.max(1, Math.floor(win.length / 52));
  const spark = win.filter((_, i) => (win.length - 1 - i) % step === 0).map(p => round(p.a / win[0].a * 100, 1));
  return {
    price: round(last.c, last.c < 10 ? 4 : 2), cur: res.meta?.currency || '', date: new Date(last.t * 1000).toISOString().slice(0, 10),
    r1m: round(ret(30)), r3m: round(ret(91)), r6m: round(ret(182)), r1y: round(ret(365)),
    vol: round(vol), mdd: round(mdd), ma200: round(ma200), dy: round(div / last.c), spark,
  };
}

async function main() {
  const assets = [], failed = [];
  for (const [t, name, cat] of ASSETS) {
    try { assets.push({ t, name, cat, ...metrics(await chart(t)) }); }
    catch (e) { failed.push({ t, name, err: String(e.message || e) }); }
    await sleep(400);
  }
  console.log(`Reușite: ${assets.length}, eșuate: ${failed.length}`, failed.map(f => `${f.t} (${f.err})`).join(', '));
  if (assets.length < ASSETS.length / 3) throw new Error('Prea puține date: sursa nu răspunde, păstrez fișierul vechi.');
  await mkdir('data', { recursive: true });
  await writeFile('data/market.json', JSON.stringify({ updated: new Date().toISOString(), assets, failed }));
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
