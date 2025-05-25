import React, { useState, useEffect, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

/**
 * SEMStockComparisonApp – FinWise Stock Comparison Tool (CRA‑friendly)
 * -------------------------------------------------------------------
 * • Pure React + Recharts + Tailwind classes (no ShadCN / alias imports)
 * • Fetches two raw‑CSV files on GitHub and lets users compare up to
 *   four stocks vs SEMDEX / SEM‑10 over common timeframes.
 */

const CATEGORY_CSV =
  "https://raw.githubusercontent.com/lecroyant/sem-csv/main/List%20of%20Mauritius%20Stocks-Category.csv";
const PRICES_CSV =
  "https://raw.githubusercontent.com/lecroyant/sem-csv/main/Historical-TopSEM%20Mauritius%20Stock%20Price.csv";

// ────────────────────────────────────────────────────────────
//  Tiny CSV parser (handles quoted commas)
// ────────────────────────────────────────────────────────────
function parseCSV(text) {
  const rows = text.trim().split(/\r?\n/).filter(Boolean);
  if (!rows.length) return [];
  const headers = rows[0].split(',').map((h) => h.replace(/^"|"$/g, '').trim());

  return rows.slice(1).map((raw) => {
    const vals = [];
    let buf = '';
    let inQ = false;
    for (const ch of raw) {
      if (ch === '"') inQ = !inQ;
      else if (ch === ',' && !inQ) {
        vals.push(buf.replace(/^"|"$/g, '').trim());
        buf = '';
      } else buf += ch;
    }
    vals.push(buf.replace(/^"|"$/g, '').trim());
    return headers.reduce((o, h, i) => ((o[h] = vals[i] ?? ''), o), {});
  });
}

export default function SEMStockComparisonApp() {
  // ───────── state
  const [stockList, setStockList] = useState([]);
  const [priceData, setPriceData] = useState([]);
  const [base, setBase] = useState('MCB');
  const [mode, setMode] = useState('single'); // single | peer | custom
  const [custom, setCustom] = useState([]);
  const [input, setInput] = useState('');
  const [tf, setTf] = useState('3M');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ───────── fetch CSVs once
  useEffect(() => {
    (async () => {
      try {
        const [catsRes, pricesRes] = await Promise.all([
          fetch(CATEGORY_CSV),
          fetch(PRICES_CSV),
        ]);
        if (!catsRes.ok || !pricesRes.ok) throw new Error('CSV download failed');
        const cats = parseCSV(await catsRes.text());
        const pricesText = await pricesRes.text();
        const pricesRaw = parseCSV(pricesText);

        setStockList(
          cats
            .map((r) => ({
              symbol: (r.Symbol || r.symbol || '').trim(),
              company: (r.Company || r.company || '').trim(),
              sector: (r.Sector || r.sector || '').trim(),
            }))
            .filter((s) => s.symbol)
        );

        setPriceData(
          pricesRaw
            .map((row) => {
              const d = new Date(row.Date || row.date || row.DATE);
              if (isNaN(d)) return null;
              const obj = { date: d };
              Object.entries(row).forEach(([k, v]) => {
                if (k.toLowerCase().includes('date')) return;
                const num = parseFloat(v);
                obj[k.trim()] = Number.isFinite(num) ? num : null;
              });
              return obj;
            })
            .filter(Boolean)
            .sort((a, b) => b.date - a.date)
        );
        setLoading(false);
      } catch (e) {
        setError(e.message);
        setLoading(false);
      }
    })();
  }, []);

  // ───────── derived helpers
  const peers = useMemo(() => {
    const s = stockList.find((x) => x.symbol === base);
    if (!s) return [];
    return stockList.filter((x) => x.sector === s.sector && x.symbol !== base).map((x) => x.symbol).slice(0, 3);
  }, [stockList, base]);

  const actives = useMemo(() => {
    const s = new Set([base]);
    if (mode === 'peer') peers.forEach((t) => s.add(t));
    if (mode === 'custom') custom.forEach((t) => s.add(t));
    return Array.from(s).slice(0, 4);
  }, [base, mode, peers, custom]);

  const periodData = useMemo(() => {
    if (!priceData.length) return [];
    const start = new Date(priceData[0].date);
    const m = { '1M': 1, '3M': 3, '1Y': 12, '2Y': 24, '3Y': 36 };
    if (tf === 'YTD') start.setMonth(0, 1);
    else if (m[tf]) start.setMonth(start.getMonth() - m[tf]);
    return priceData.filter((r) => r.date >= start);
  }, [priceData, tf]);

  const chartData = useMemo(() => {
    if (!periodData.length) return [];
    const bases = {};
    const tail = periodData.at(-1);
    [...actives, 'SEMDEX', 'SEM-10'].forEach((t) => (bases[t] = tail[t] || null));
    return periodData
      .slice()
      .reverse()
      .map((row) => {
        const p = { date: row.date.toLocaleDateString() };
        [...actives, 'SEMDEX', 'SEM-10'].forEach((t) => {
          const b = bases[t];
          const c = row[t];
          if (b && c) p[t] = (c / b) * 100;
        });
        return p;
      });
  }, [periodData, actives]);

  const summary = useMemo(() => {
    if (!periodData.length) return [];
    const first = periodData.at(-1);
    const last = periodData[0];
    return [...actives, 'SEMDEX', 'SEM-10'].map((t) => {
      const s = first[t], e = last[t];
      return { ticker: t, pct: s && e ? (((e - s) / s) * 100).toFixed(2) : '–' };
    });
  }, [periodData, actives]);

  // ───────── helpers
  const palette = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#64748b', '#8b5cf6'];

  const onCustomChange = (val) => {
    setInput(val);
    setCustom(
      val
        .split(/[,;\s]+/)
        .map((v) => v.toUpperCase())
        .filter(Boolean)
        .filter((v) => v !== base)
        .slice(0, 3)
    );
  };

  // ───────── early states
  if (loading) return <p className="text-center p-8">Loading…</p>;
  if (error) return <p className="text-red-600 text-center p-8">{error}</p>;

  // ───────── render
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 space-y-8">
        <header className="text-center space-y-1">
          <h1 className="text-3xl font-bold">FinWise – SEM Stock Comparison</h1>
          <p className="text-gray-600">Compare Mauritius equities vs indices</p>
        </header>

        {/* Controls */}
        <section className="grid gap-4 md:grid-cols-4">
          <div>
            <label className="block text-sm mb-1">Primary Stock</label>
            <select value={base} onChange={(e) => setBase(e.target.value)} className="w-full border p-2 rounded">
              {stockList.map((s) => (
                <option key={s.symbol} value={s.symbol}>{`${s.symbol} – ${s.company}`}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm mb-1">Timeframe</label>
            <select value={tf} onChange={(e) => setTf(e.target.value)} className="w-full border p-2 rounded">
              {['1M', '3M', '1Y', '2Y', '3Y', 'YTD'].map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </select>
          </
