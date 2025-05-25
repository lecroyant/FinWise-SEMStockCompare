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
 * SEMStockComparisonApp – FinWise Stock Comparison Tool (CRA version)
 * ------------------------------------------------------------------
 * • Pure React + Recharts + Tailwind classes (no ShadCN / alias imports)
 * • Fetches two raw‑CSV files on GitHub and lets users compare up to
 *   four stocks vs. SEMDEX / SEM‑10 over common timeframes.
 */

const CATEGORY_CSV =
  "https://raw.githubusercontent.com/lecroyant/sem-csv/main/List%20of%20Mauritius%20Stocks-Category.csv";
const PRICES_CSV =
  "https://raw.githubusercontent.com/lecroyant/sem-csv/main/Historical-TopSEM%20Mauritius%20Stock%20Price.csv";

/* ------------------------------------------------------------------
   Lightweight CSV parser (handles quoted commas, trims blanks)        
   ------------------------------------------------------------------*/
const parseCSV = (text) => {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0]
    .split(',')
    .map((h) => h.trim().replace(/^"|"$/g, ''));

  return lines.slice(1).map((raw) => {
    const vals = [];
    let cur = '';
    let inQuotes = false;
    for (const ch of raw) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === ',' && !inQuotes) {
        vals.push(cur.trim().replace(/^"|"$/g, ''));
        cur = '';
      } else cur += ch;
    }
    vals.push(cur.trim().replace(/^"|"$/g, ''));

    return headers.reduce((o, h, i) => {
      o[h] = vals[i] ?? '';
      return o;
    }, {});
  });
};

export default function SEMStockComparisonApp() {
  /* ---------------- state ---------------- */
  const [stockList, setStockList] = useState([]);
  const [priceData, setPriceData] = useState([]);
  const [baseTicker, setBaseTicker] = useState('MCB');
  const [mode, setMode] = useState('single'); // single | peer | custom
  const [customTickers, setCustomTickers] = useState([]);
  const [customInput, setCustomInput] = useState('');
  const [timeframe, setTimeframe] = useState('3M');
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [errorMsg, setErrorMsg] = useState('');

  /* ---------------- data fetch ---------------- */
  useEffect(() => {
    (async () => {
      try {
        const [catRes, prRes] = await Promise.all([
          fetch(CATEGORY_CSV),
          fetch(PRICES_CSV),
        ]);
        if (!catRes.ok || !prRes.ok) throw new Error('CSV download failed');

        const catRows = parseCSV(await catRes.text());
        const priceRows = parseCSV(await prRes.text());

        const stocks = catRows
          .map((r) => ({
            symbol: (r.Symbol || r.symbol || '').trim(),
            company: (r.Company || r.company || '').trim(),
            sector: (r.Sector || r.sector || '').trim(),
          }))
          .filter((s) => s.symbol);
        setStockList(stocks);

        const prices = priceRows
          .map((row) => {
            const dateStr = row.Date || row.date || row.DATE;
            const date = dateStr ? new Date(dateStr) : null;
            if (!date || isNaN(date)) return null;
            const obj = { date };
            Object.entries(row).forEach(([k, v]) => {
              if (k.toLowerCase().includes('date')) return;
              const num = parseFloat(v);
              obj[k.trim()] = Number.isFinite(num) ? num : null;
            });
            return obj;
          })
          .filter(Boolean)
          .sort((a, b) => b.date - a.date);
        setPriceData(prices);
        setStatus('ready');
      } catch (err) {
        setErrorMsg(err.message);
        setStatus('error');
      }
    })();
  }, []);

  /* ---------------- derived helpers ---------------- */
  const peerTickers = useMemo(() => {
    const base = stockList.find((s) => s.symbol === baseTicker);
    if (!base) return [];
    return stockList
      .filter((s) => s.sector === base.sector && s.symbol !== baseTicker)
      .map((s) => s.symbol)
      .slice(0, 3);
  }, [stockList, baseTicker]);

  const activeTickers = useMemo(() => {
    const set = new Set([baseTicker]);
    if (mode === 'peer') peerTickers.forEach((t) => set.add(t));
    if (mode === 'custom') customTickers.forEach((t) => set.add(t));
    return Array.from(set).slice(0, 4);
  }, [baseTicker, mode, peerTickers, customTickers]);

  const filteredData = useMemo(() => {
    if (!priceData.length) return [];
    const start = new Date(priceData[0].date);
    const map = { '1M': 1, '3M': 3, '1Y': 12, '2Y': 24, '3Y': 36 };
    if (timeframe === 'YTD') start.setMonth(0, 1);
    else if (map[timeframe]) start.setMonth(start.getMonth() - map[timeframe]);
    return priceData.filter((r) => r.date >= start);
  }, [priceData, timeframe]);

  const chartData = useMemo(() => {
    if (!filteredData.length) return [];
    const bases = {};
    const tail = filteredData.at(-1);
    [...activeTickers, 'SEMDEX', 'SEM-10'].forEach((t) => {
      bases[t] = tail[t] || null;
    });
    return filteredData
      .slice()
      .reverse()
      .map((row) => {
        const p = { date: row.date.toLocaleDateString() };
        [...activeTickers, 'SEMDEX', 'SEM-10'].forEach((t) => {
          const base = bases[t];
          const cur = row[t];
          if (base && cur) p[t] = (cur / base) * 100;
        });
        return p;
      });
  }, [filteredData, activeTickers]);

  const returnsTable = useMemo(() => {
    if (!filteredData.length) return [];
    const first = filteredData.at(-1);
    const last = filteredData[0];
    return [...activeTickers, 'SEMDEX', 'SEM-10'].map((t) => {
      const s = first[t], e = last[t];
      const pct = s && e ? (((e - s) / s) * 100).toFixed(2) : '–';
      return { ticker: t, pct };
    });
  }, [filteredData, activeTickers]);

  /* ---------------- UI helpers ---------------- */
  const colors = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#64748b', '#8b5cf6'];

  const handleCustom = (val) => {
    setCustomInput(val);
    const tickers = val
      .split(/[,;\s]+/)
      .map((v) => v.toUpperCase())
      .filter(Boolean)
      .filter((v) => v !== baseTicker)
      .slice(0, 3);
    setCustomTickers(tickers);
  };

  /* ---------------- early exits ---------------- */
  if (status === 'loading') return <p className="text-center p-8">Loading…</p>;
  if (status === 'error') return <p className="text-red-600 text-center p-8">{errorMsg}</p>;

  /* ---------------- render ---------------- */
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto space-y-8 px-4">
        {/* Header */}
        <header className="text-center space-y-1">
          <h1 className="text-3xl font-bold">FinWise – SEM Stock Comparison</h1>
          <p className="text-gray-600">Compare performance of Mauritius equities vs indices</p>
        </header>

        {/* Controls */}
        <section className="grid gap-4 md:grid-cols-4">
          {/* primary select */}
          <div>
            <label className="block text-sm mb-1">Primary Stock</label>
            <select
              value={baseTicker}
              onChange={(e) => setBaseTicker(e.target.value)}
              className="w-full border p-2 rounded"
            >
              {stockList.map((s) => (
                <option key={s.symbol} value={s.symbol}>{`${s.symbol} – ${s.company}`}</option>
              ))}
            </select>
          </div>

          {/* timeframe */}
          <div>
            <label className="block text-sm mb-1">Timeframe</label>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="w-full border p-2 rounded"
            >
              {['1M', '3M', '1Y', '2Y', '3Y', 'YTD'].map((tf) => (
                <option key={tf} value={tf}>{tf}</option>
              ))}
            </select>
          </div>

          {/* mode buttons */}
          <div className="flex items-end gap-2">
            {[
              { id: 'single', label: 'Single' },
              { id: 'peer', label: 'Peers' },
              { id: 'custom', label: 'Custom' },
            ].map((m) => (
              <button
                key={m.id}
                className={`px-3 py-2 rounded-md text-sm ${
