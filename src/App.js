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
 * SEMStockComparisonApp – FinWise Stock Comparison Tool
 * A simplified version that works without additional UI libraries
 */

const CATEGORY_CSV =
  "https://raw.githubusercontent.com/lecroyant/sem-csv/main/List%20of%20Mauritius%20Stocks-Category.csv";
const PRICES_CSV =
  "https://raw.githubusercontent.com/lecroyant/sem-csv/main/Historical-TopSEM%20Mauritius%20Stock%20Price.csv";

// Enhanced CSV parser function to handle various CSV formats
const parseCSV = (text) => {
  const lines = text.trim().split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];
  
  // Handle headers - remove quotes and trim
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  
  return lines.slice(1).map(line => {
    // Handle CSV values that might contain commas within quotes
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim().replace(/^"|"$/g, ''));
    
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = values[index] || '';
    });
    return obj;
  }).filter(obj => Object.values(obj).some(val => val.trim())); // Remove empty rows
};

export default function SEMStockComparisonApp() {
  const [stockList, setStockList] = useState([]);
  const [priceData, setPriceData] = useState([]);
  const [baseTicker, setBaseTicker] = useState("MCB");
  const [mode, setMode] = useState("single");
  const [customTickers, setCustomTickers] = useState([]);
  const [customTickerInput, setCustomTickerInput] = useState("");
  const [timeframe, setTimeframe] = useState("3M");
  const [status, setStatus] = useState("loading");
  const [errorMsg, setErrorMsg] = useState("");

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [catRes, prRes] = await Promise.all([
          fetch(CATEGORY_CSV),
          fetch(PRICES_CSV),
        ]);
        
        if (!catRes.ok || !prRes.ok) {
          throw new Error("Failed to fetch CSV data");
        }
        
        const catsText = await catRes.text();
        const pricesText = await prRes.text();
        
        const cats = parseCSV(catsText);
        const prices = parseCSV(pricesText);
        
        // Process stock list with better field mapping
        const processedStocks = cats.map((r) => {
          // Handle different possible column names
          const symbol = (r.Symbol || r.symbol || r.SYMBOL || '').trim();
          const company = (r.Company || r.company || r.COMPANY || '').trim();
          const sector = (r.Sector || r.sector || r.SECTOR || '').trim();
          
          return { symbol, company, sector };
        }).filter(s => s.symbol); // Only include rows with valid symbols
        
        setStockList(processedStocks);
        
        console.log('Loaded stocks:', processedStocks.length);
        console.log('Sample stock:', processedStocks[0]);
        
        // Process price data with better error handling
        const processedPrices = prices
          .map((row) => {
            // Handle different possible date column names
            const dateStr = row.Date || row.date || row.DATE;
            if (!dateStr) return null;
            
            // Try different date formats
            let date;
            if (dateStr.includes('/')) {
              // Handle MM/DD/YYYY or DD/MM/YYYY format
              const parts = dateStr.split('/');
              if (parts.length === 3) {
                // Assume MM/DD/YYYY format first
                date = new Date(parts[2], parts[0] - 1, parts[1]);
                if (isNaN(date.getTime())) {
                  // Try DD/MM/YYYY format
                  date = new Date(parts[2], parts[1] - 1, parts[0]);
                }
              }
            } else {
              date = new Date(dateStr);
            }
            
            if (isNaN(date.getTime())) return null;
            
            const obj = { date };
            Object.entries(row).forEach(([k, v]) => {
              if (k.toLowerCase().includes('date')) return;
              const num = parseFloat(v);
              obj[k.trim()] = Number.isFinite(num) && num > 0 ? num : null;
            });
            return obj;
          })
          .filter(Boolean)
          .sort((a, b) => b.date - a.date);
        
        setPriceData(processedPrices);
        
        console.log('Loaded price records:', processedPrices.length);
        console.log('Date range:', 
          processedPrices[processedPrices.length - 1]?.date.toDateString(), 
          'to', 
          processedPrices[0]?.date.toDateString()
        );
        console.log('Available tickers:', Object.keys(processedPrices[0] || {}).filter(k => k !== 'date'));
        
        setStatus("ready");
      } catch (e) {
        setErrorMsg(e.message);
        setStatus("error");
      }
    };

    fetchData();
  }, []);

  // Get peer companies in same sector
  const peerTickers = useMemo(() => {
    const base = stockList.find((s) => s.symbol === baseTicker);
    if (!base) return [];
    return stockList
      .filter((s) => s.sector === base.sector && s.symbol !== baseTicker)
      .map((s) => s.symbol)
      .slice(0, 3);
  }, [stockList, baseTicker]);

  // Get active tickers based on mode
  const activeTickers = useMemo(() => {
    const set = new Set([baseTicker]);
    if (mode === "peer") peerTickers.forEach((t) => set.add(t));
    if (mode === "custom") customTickers.forEach((t) => set.add(t));
    return Array.from(set).slice(0, 4);
  }, [baseTicker, peerTickers, customTickers, mode]);

  // Filter data by timeframe
  const filteredData = useMemo(() => {
    if (!priceData.length) return [];
    const latest = priceData[0].date;
    const start = new Date(latest);
    
    const monthMap = { "1M": 1, "3M": 3, "1Y": 12, "2Y": 24, "3Y": 36 };
    if (timeframe === "YTD") {
      start.setMonth(0, 1);
    } else if (monthMap[timeframe]) {
      start.setMonth(start.getMonth() - monthMap[timeframe]);
    }
    
    return priceData.filter((r) => r.date >= start);
  }, [priceData, timeframe]);

  // Prepare chart data (normalized to 100 at start)
  const chartData = useMemo(() => {
    if (!filteredData.length) return [];
    
    const firstRow = filteredData[filteredData.length - 1];
    const bases = {};
    [...activeTickers, "SEMDEX", "SEM-10"].forEach(
      (t) => (bases[t] = firstRow[t] || null)
    );

    return filteredData
      .slice()
      .reverse()
      .map((row) => {
        const point = { 
          date: row.date.toLocaleDateString(),
          dateObj: row.date 
        };
        
        [...activeTickers, "SEMDEX", "SEM-10"].forEach((t) => {
          const basePrice = bases[t];
          const currentPrice = row[t];
          if (basePrice && currentPrice) {
            point[t] = ((currentPrice / basePrice) * 100).toFixed(2);
          }
        });
        return point;
      });
  }, [filteredData, activeTickers]);

  // Calculate returns
  const returnsTable = useMemo(() => {
    if (!filteredData.length) return [];
    const first = filteredData[filteredData.length - 1];
    const last = filteredData[0];
    
    return [...activeTickers, "SEMDEX", "SEM-10"].map((t) => {
      const startPrice = first[t];
      const endPrice = last[t];
      const pct = startPrice && endPrice ? 
        (((endPrice - startPrice) / startPrice) * 100).toFixed(2) : "–";
      return { ticker: t, pct };
    });
  }, [filteredData, activeTickers]);

  const colors = ["#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#64748b", "#8b5cf6"];

  const handleCustomTickersChange = (value) => {
    setCustomTickerInput(value);
    const tickers = value
      .split(/[,;\s]+/)
      .map((v) => v.toUpperCase().trim())
      .filter(Boolean)
      .filter((v) => v !== baseTicker)
      .slice(0, 3);
    setCustomTickers(tickers);
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading stock data...</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center text-red-600 p-8">
          <h2 className="text-xl font-bold mb-2">Error Loading Data</h2>
          <p>{errorMsg}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-lg p-6 space-y-8">
          {/* Header */}
          <div className="text-center border-b pb-4">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              FinWise - SEM Stock Comparison
            </h1>
            <p className="text-gray-600">
              Compare performance of Mauritius Stock Exchange securities
            </p>
          </div>

          {/* Controls */}
          <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-5">
            {/* Primary Stock Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Primary Stock
              </label>
              <select
                value={baseTicker}
                onChange={(e) => setBaseTicker(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {stockList.map((stock) => (
                  <option key={stock.symbol} value={stock.symbol}>
                    {stock.symbol} - {stock.company}
                  </option>
                ))}
              </select>
            </div>

            {/* Timeframe */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Timeframe
              </label>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="1M">1 Month</option>
                <option value="3M">3 Months</option>
                <option value="1Y">1 Year</option>
                <option value="2Y">2 Years</option>
                <option value="3Y">3 Years</option>
                <option value="YTD">Year to Date</option>
              </select>
            </div>

            {/* Mode Selection */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Comparison Mode
              </label>
              <div className="flex gap-2">
                {[
                  { id: "single", label: "Single" },
                  { id: "peer", label: "Sector Peers" },
                  { id: "custom", label: "Custom" },
                ].map((btn) => (
                  <button
                    key={btn.id}
                    onClick={() => setMode(btn.id)}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      mode === btn.id
                        ? "bg-blue-500 text-white"
                        : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                    }`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Comparison Input */}
            {mode === "custom" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Compare With
                </label>
                <input
                  type="text"
                  placeholder="e.g. IBL, CIEL, MUA"
                  value={customTickerInput}
                  onChange={(e) => handleCustomTickersChange(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Comma-separated, max 3 stocks
                </p>
              </div>
            )}
          </div>

          {/* Chart */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h2 className="text-lg font-semibold mb-4">
              Performance Comparison ({timeframe})
            </h2>
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 12 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    label={{ value: 'Normalized Price (%)', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip 
                    formatter={(value, name) => [`${value}%`, name]}
                    labelFormatter={(label) => `Date: ${label}`}
                  />
                  <Legend />
                  
                  {/* Stock lines */}
                  {activeTickers.map((ticker, index) => (
                    <Line
                      key={ticker}
                      type="monotone"
                      dataKey={ticker}
                      stroke={colors[index]}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                  
                  {/* Index lines */}
                  <Line
                    type="monotone"
                    dataKey="SEMDEX"
                    stroke={colors[4]}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="SEM-10"
                    stroke={colors[5]}
                    strokeWidth={2}
                    strokeDasharray="3 3"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Returns Table */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h2 className="text-lg font-semibold mb-4">
              Returns Summary ({timeframe})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-4 font-medium">Symbol</th>
                    <th className="text-right py-2 px-4 font-medium">Return (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {returnsTable.map((row, index) => (
                    <tr key={row.ticker} className="border-b border-gray-200">
                      <td className="py-2 px-4 font-medium">{row.ticker}</td>
                      <td className={`text-right py-2 px-4 font-mono ${
                        row.pct !== "–" ? 
                          (parseFloat(row.pct) >= 0 ? "text-green-600" : "text-red-600")
                          : "text-gray-500"
                      }`}>
                        {row.pct !== "–" ? `${row.pct}%` : row.pct}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center text-sm text-gray-500 border-t pt-4">
            <p>
              Data sourced from SEM. This tool is for informational purposes only 
              and should not be considered as investment advice.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
