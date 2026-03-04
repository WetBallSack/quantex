// src/App.jsx — QUANTEX v3.1 Dashboard
import { useState, useEffect, useRef, useCallback } from "react";

// ── CONFIG — fill these in after Supabase setup ───────────────
const SUPABASE_URL = "https://shhudtchfylknhenxowu.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNoaHVkdGNoZnlsa25oZW54b3d1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MTM2NDUsImV4cCI6MjA4ODE4OTY0NX0._sFwlNHAWRnnDwXqOHmWMqGGeMyq1g-LYqoxN7haoUg";
const BOT_ID = "00000000-0000-0000-0000-000000000001";
const PAIRS = ["BTCUSDC", "ETHUSDC", "SOLUSDC", "BNBUSDC"];
const PAIR_LABELS = { BTCUSDC: "BTC", ETHUSDC: "ETH", SOLUSDC: "SOL", BNBUSDC: "BNB" };

// src/App.jsx — QUANTEX v3.1 Dashboard


// ── HELPERS ───────────────────────────────────────────────────
const fmt = (n, d = 2) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtPct = (n) => `${Number(n) >= 0 ? "+" : ""}${fmt(n, 2)}%`;
const fmtTime = (t) => t ? new Date(t).toLocaleTimeString() : "—";
const api = async (body) => {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/fetch-prices`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return res.json();
};

const REGIME_COLOR = { TREND: "#ffd700", REVERT: "#7dd3fc", CHOP: "#6b7280" };
const REGIME_BG = { TREND: "rgba(255,215,0,0.08)", REVERT: "rgba(125,211,252,0.08)", CHOP: "rgba(107,114,128,0.08)" };
const DIR_COLOR = { LONG: "#00e5a0", SHORT: "#ff4d6d", HOLD: "#6b7280" };

// ── MINI SPARK ────────────────────────────────────────────────
function Spark({ prices, color, w = 90, h = 32 }) {
  if (!prices || prices.length < 2) return <svg width={w} height={h} />;
  const min = Math.min(...prices), max = Math.max(...prices), range = max - min || 1;
  const pts = prices.map((p, i) => `${(i / (prices.length - 1)) * w},${h - ((p - min) / range) * (h - 4) - 2}`).join(" ");
  return (
    <svg width={w} height={h} style={{ overflow: "visible" }}>
      <defs><linearGradient id={`sg${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.25" />
        <stop offset="100%" stopColor={color} stopOpacity="0" />
      </linearGradient></defs>
      <polygon points={`0,${h} ${pts} ${w},${h}`} fill={`url(#sg${color.replace("#","")})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ── CANDLE CHART with Kalman + TP/SL ─────────────────────────
function CandleChart({ candles, signal, position }) {
  const W = 640, H = 210;
  const slice = (candles || []).slice(-40);
  if (!slice.length) return (
    <div style={{ height: H, display: "flex", alignItems: "center", justifyContent: "center", color: "#1e3a5f", fontSize: "11px" }}>
      No candle data — run a tick or wait for history
    </div>
  );

  const all_prices = slice.flatMap(c => [Number(c.high), Number(c.low)]);
  if (signal?.kalman_value) all_prices.push(Number(signal.kalman_value));
  const minP = Math.min(...all_prices), maxP = Math.max(...all_prices), range = maxP - minP || 1;
  const cw = W / slice.length;
  const py = (p) => H - ((Number(p) - minP) / range) * (H - 14) - 7;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      {/* Grid lines */}
      {[0.25, 0.5, 0.75].map(f => (
        <line key={f} x1={0} y1={H * f} x2={W} y2={H * f} stroke="#1a2640" strokeWidth="0.5" strokeDasharray="4,4" />
      ))}

      {/* TP/SL lines */}
      {position && (
        <>
          <line x1={0} y1={py(position.tp_price)} x2={W} y2={py(position.tp_price)} stroke="#00e5a0" strokeWidth="1" strokeDasharray="6,3" opacity="0.8" />
          <line x1={0} y1={py(position.sl_price)} x2={W} y2={py(position.sl_price)} stroke="#ff4d6d" strokeWidth="1" strokeDasharray="6,3" opacity="0.8" />
          {position.trailing_sl_price && (
            <line x1={0} y1={py(position.trailing_sl_price)} x2={W} y2={py(position.trailing_sl_price)} stroke="#ffd700" strokeWidth="1" strokeDasharray="3,3" opacity="0.7" />
          )}
          <text x={W - 4} y={py(position.tp_price) - 3} textAnchor="end" fill="#00e5a0" fontSize="8">TP</text>
          <text x={W - 4} y={py(position.sl_price) - 3} textAnchor="end" fill="#ff4d6d" fontSize="8">SL</text>
        </>
      )}

      {/* Kalman fair value line */}
      {signal?.kalman_value && (
        <>
          <line x1={0} y1={py(signal.kalman_value)} x2={W} y2={py(signal.kalman_value)} stroke="#a78bfa" strokeWidth="1" opacity="0.6" strokeDasharray="8,4" />
          <text x={4} y={py(signal.kalman_value) - 3} fill="#a78bfa" fontSize="8">Kalman FV</text>
        </>
      )}

      {/* Candles */}
      {slice.map((c, i) => {
        const x = i * cw + cw / 2;
        const green = Number(c.close) >= Number(c.open);
        const col = green ? "#00e5a0" : "#ff4d6d";
        const top = py(Math.max(Number(c.open), Number(c.close)));
        const bodyH = Math.max(Math.abs(py(Number(c.open)) - py(Number(c.close))), 1.5);
        return (
          <g key={i}>
            <line x1={x} y1={py(c.high)} x2={x} y2={py(c.low)} stroke={col} strokeWidth="1" opacity="0.55" />
            <rect x={x - cw * 0.38} y={top} width={cw * 0.76} height={bodyH} fill={col} opacity="0.9" />
          </g>
        );
      })}
    </svg>
  );
}

// ── EQUITY CURVE ──────────────────────────────────────────────
function EquityCurve({ snapshots }) {
  const W = 260, H = 72;
  const data = [...(snapshots || [])].reverse();
  if (data.length < 2) return <div style={{ height: H, color: "#1e3a5f", fontSize: "9px", textAlign: "center", paddingTop: "28px" }}>No history</div>;
  const vals = data.map(s => Number(s.equity));
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * W},${H - ((v - min) / range) * (H - 8) - 4}`).join(" ");
  const isUp = vals[vals.length - 1] >= vals[0];
  const color = isUp ? "#00e5a0" : "#ff4d6d";
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      <defs><linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.3" />
        <stop offset="100%" stopColor={color} stopOpacity="0" />
      </linearGradient></defs>
      <polygon points={`0,${H} ${pts} ${W},${H}`} fill="url(#eq)" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ── CONFIDENCE BAR ────────────────────────────────────────────
function ConfBar({ label, value, color }) {
  return (
    <div style={{ marginBottom: "6px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
        <span style={{ fontSize: "9px", color: "#4a6f8a" }}>{label}</span>
        <span style={{ fontSize: "9px", color, fontWeight: 600 }}>{(value * 100).toFixed(1)}%</span>
      </div>
      <div style={{ background: "#0a0f1a", height: "3px", borderRadius: "2px", overflow: "hidden" }}>
        <div style={{ width: `${Math.min(value * 100, 100)}%`, height: "100%", background: color, borderRadius: "2px", transition: "width 0.4s ease" }} />
      </div>
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────
export default function App() {
  const [activePair, setActivePair] = useState("BTCUSDC");
  const [bot, setBot] = useState(null);
  const [riskState, setRiskState] = useState(null);
  const [candles, setCandles] = useState({});
  const [signals, setSignals] = useState({});
  const [positions, setPositions] = useState([]);
  const [trades, setTrades] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [modelMeta, setModelMeta] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [prices, setPrices] = useState({});  // live per-second prices from price_ticks
  const [countdown, setCountdown] = useState(60);
  const [activeTab, setActiveTab] = useState("chart");
  const [training, setTraining] = useState(false);
  const [ticking, setTicking] = useState(false);
  const wsRef = useRef(null);
  const countdownRef = useRef(null);

  // ── Load data ────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/fetch-prices`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
      });
      const data = await res.json();
      if (data.bot) setBot(data.bot);
      if (data.riskState) setRiskState(data.riskState);
      setPositions(data.positions || []);
      setTrades(data.trades || []);
      setSnapshots(data.snapshots || []);
      setModelMeta(data.modelMeta || []);

      // Organise candles by symbol
      const cMap = {};
      for (const c of (data.candles || [])) {
        if (!cMap[c.symbol]) cMap[c.symbol] = [];
        cMap[c.symbol].push(c);
      }
      for (const k of Object.keys(cMap)) cMap[k].sort((a, b) => new Date(a.open_time) - new Date(b.open_time));
      setCandles(prev => ({ ...prev, ...cMap }));

      const sMap = {};
      for (const s of (data.signals || [])) { if (!sMap[s.symbol]) sMap[s.symbol] = s; }
      setSignals(sMap);

      setLoading(false);
    } catch (err) { console.error("loadData:", err); setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Supabase Realtime via WebSocket ──────────────────────
  useEffect(() => {
    const wsUrl = SUPABASE_URL.replace("https://", "wss://") + "/realtime/v1/websocket?apikey=" + SUPABASE_ANON_KEY;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      const tables = ["candles", "signals", "trades", "positions", "bots", "price_ticks"];
      tables.forEach(table => {
        ws.send(JSON.stringify({
          topic: `realtime:public:${table}`, event: "phx_join",
          payload: { config: { broadcast: { self: false }, presence: { key: "" } } }, ref: table
        }));
      });
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        const payload = msg.payload;
        if (!payload?.data) return;
        const { table, type, record } = payload.data;
        if (table === "candles" && type === "INSERT") {
          setCandles(prev => {
            const arr = [...(prev[record.symbol] || []), record].slice(-100);
            arr.sort((a, b) => new Date(a.open_time) - new Date(b.open_time));
            return { ...prev, [record.symbol]: arr };
          });
        }
        if (table === "signals" && type === "INSERT") setSignals(prev => ({ ...prev, [record.symbol]: record }));
        if (table === "trades" && type === "INSERT") setTrades(prev => [record, ...prev].slice(0, 100));
        if (table === "bots" && type === "UPDATE") setBot(record);
        if (table === "positions") loadData();
        if (table === "price_ticks" && type === "INSERT") {
          setPrices(prev => ({ ...prev, [record.symbol]: parseFloat(record.price) }));
        }
      } catch {}
    };

    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    return () => ws.close();
  }, [loadData]);

  // ── Countdown ────────────────────────────────────────────
  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (bot?.status === "running") {
      countdownRef.current = setInterval(() => setCountdown(c => c <= 1 ? 60 : c - 1), 1000);
    }
    return () => clearInterval(countdownRef.current);
  }, [bot?.status]);

  // ── Polling fallback — refresh full data every 15s ───────
  // Catches any updates missed by the WebSocket
  useEffect(() => {
    const poll = setInterval(() => loadData(), 15000);
    return () => clearInterval(poll);
  }, [loadData]);

  // ── Actions ──────────────────────────────────────────────
  const toggleBot = async () => {
    const status = bot?.status === "running" ? "stopped" : "running";
    await api({ action: "set-status", status });
    if (status === "running") setCountdown(60);
    setTimeout(loadData, 300);
  };

  const manualTick = async () => {
    setTicking(true);
    await api({ action: "manual-tick" });
    setTimeout(() => { loadData(); setTicking(false); }, 1500);
  };

  const trainModels = async () => {
    setTraining(true);
    await api({ action: "train" });
    setTimeout(() => { loadData(); setTraining(false); }, 3000);
  };

  const resetBot = async () => {
    if (!confirm("Reset bot? Closes all positions, restores $10,000.")) return;
    await api({ action: "reset" });
    setTimeout(loadData, 500);
  };

  // ── Derived ──────────────────────────────────────────────
  const cash = Number(bot?.cash_balance || 10000);
  const posValue = positions.reduce((sum, p) => {
    const c = candles[p.symbol];
    const lp = Number(c?.[c.length - 1]?.close || p.entry_price);
    return sum + Number(p.quantity) * lp;
  }, 0);
  const equity = cash + posValue;
  const totalPnl = equity - 10000;
  const sellTrades = trades.filter(t => t.action?.startsWith("CLOSE"));
  const winTrades = sellTrades.filter(t => Number(t.pnl || 0) > 0);
  const winRate = sellTrades.length ? ((winTrades.length / sellTrades.length) * 100).toFixed(0) : "—";

  const activeCandles = candles[activePair] || [];
  const activeSignal = signals[activePair] || {};
  const activePrice = Number(activeCandles[activeCandles.length - 1]?.close || 0);
  const prevPrice = Number(activeCandles[activeCandles.length - 2]?.close || activePrice);
  const priceChange = prevPrice ? ((activePrice - prevPrice) / prevPrice) * 100 : 0;
  const activePosition = positions.find(p => p.symbol === activePair);

  const drawdown = Number(riskState?.current_drawdown_pct || 0);
  const regime = activeSignal?.regime || "—";

  if (loading) return (
    <div style={{ height: "100vh", background: "#080c14", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'JetBrains Mono', monospace", color: "#4a6f8a", gap: "12px" }}>
      <div style={{ fontSize: "32px" }}>⚡</div>
      <div style={{ fontSize: "11px", letterSpacing: "0.2em" }}>CONNECTING TO SUPABASE...</div>
      <div style={{ fontSize: "9px", color: "#1e3a5f" }}>Make sure you've set SUPABASE_URL and SUPABASE_ANON_KEY in App.jsx</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#080c14", color: "#e2e8f0", fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: "12px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #0a0f1a; } ::-webkit-scrollbar-thumb { background: #1e3a5f; }
        .btn { border: none; cursor: pointer; font-family: inherit; font-size: 10px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; padding: 7px 13px; border-radius: 4px; transition: all 0.15s; }
        .btn:hover:not(:disabled) { filter: brightness(1.2); transform: translateY(-1px); }
        .btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .card { background: #0d1421; border: 1px solid #1a2640; border-radius: 8px; }
        .tab { border: none; cursor: pointer; font-family: inherit; font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; padding: 6px 10px; background: transparent; color: #4a6f8a; border-bottom: 2px solid transparent; transition: all 0.15s; }
        .tab.active { color: #00e5a0; border-bottom-color: #00e5a0; }
        .tab:hover:not(.active) { color: #7dd3fc; }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:.35} }
        @keyframes slideIn { from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none} }
        @keyframes ticker { from{transform:translateX(0)}to{transform:translateX(-50%)} }
        .ticker { animation: ticker 28s linear infinite; }
        .new-row { animation: slideIn 0.3s ease; }
      `}</style>

      {/* ── HEADER ── */}
      <div style={{ background: "#060a10", borderBottom: "1px solid #1a2640", padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", height: "52px", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "30px", height: "30px", background: "linear-gradient(135deg, #00e5a0, #0ea5e9)", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "15px" }}>⚡</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: "13px", color: "#fff", letterSpacing: "0.05em" }}>QUANTEX <span style={{ color: "#00e5a0", fontSize: "10px" }}>v3.1</span></div>
            <div style={{ fontSize: "8px", color: "#1e3a5f", letterSpacing: "0.15em" }}>LR+LSTM · KALMAN · HMM · ATR TP/SL · USDC MAKER</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          {/* Connection */}
          <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "9px", color: connected ? "#00e5a0" : "#ff4d6d" }}>
            <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: connected ? "#00e5a0" : "#ff4d6d", animation: connected ? "pulse 2s infinite" : "none" }} />
            {connected ? "LIVE" : "OFFLINE"}
          </div>

          {/* Metrics */}
          {[
            { l: "EQUITY", v: `$${fmt(equity)}`, c: equity >= 10000 ? "#00e5a0" : "#ff4d6d" },
            { l: "P&L", v: `${totalPnl >= 0 ? "+" : ""}$${fmt(totalPnl)}`, c: totalPnl >= 0 ? "#00e5a0" : "#ff4d6d" },
            { l: "WIN RATE", v: `${winRate}%`, c: "#7dd3fc" },
            { l: "DRAWDOWN", v: `${(drawdown * 100).toFixed(1)}%`, c: drawdown > 0.03 ? "#ff4d6d" : "#4a6f8a" },
          ].map(({ l, v, c }) => (
            <div key={l} style={{ textAlign: "right" }}>
              <div style={{ fontSize: "8px", color: "#1e3a5f", letterSpacing: "0.1em" }}>{l}</div>
              <div style={{ fontSize: "12px", fontWeight: 700, color: c }}>{v}</div>
            </div>
          ))}

          {/* Controls */}
          <div style={{ display: "flex", gap: "5px" }}>
            <button className="btn" onClick={manualTick} disabled={ticking}
              style={{ background: "#1a2640", color: "#7dd3fc", border: "1px solid #1e3a5f" }}>
              {ticking ? "..." : "⚡ TICK"}
            </button>
            <button className="btn" onClick={trainModels} disabled={training}
              style={{ background: "#1a2640", color: "#a78bfa", border: "1px solid #2a1a5f" }}>
              {training ? "TRAINING..." : "🧠 TRAIN"}
            </button>
            <button className="btn" onClick={toggleBot}
              style={{ background: bot?.status === "running" ? "#ff4d6d" : "#00e5a0", color: bot?.status === "running" ? "#fff" : "#000" }}>
              {bot?.status === "running" ? "⏹ STOP" : "▶ START"}
            </button>
            <button className="btn" onClick={resetBot}
              style={{ background: "transparent", color: "#4a6f8a", border: "1px solid #1a2640" }} title="Reset bot">↺</button>
          </div>
        </div>
      </div>

      {/* ── TICKER BAR ── */}
      <div style={{ background: "#040810", borderBottom: "1px solid #0f1a2e", height: "26px", overflow: "hidden", display: "flex", alignItems: "center" }}>
        <div className="ticker" style={{ display: "flex", whiteSpace: "nowrap" }}>
          {[...PAIRS, ...PAIRS].map((pair, i) => {
            const c = candles[pair]; const lp = Number(c?.[c?.length-1]?.close||0);
            const pp = Number(c?.[c?.length-2]?.close||lp); const ch = pp ? ((lp-pp)/pp)*100 : 0;
            const sig = signals[pair];
            return (
              <span key={i} style={{ padding: "0 16px", borderRight: "1px solid #0f1a2e", fontSize: "9px", display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ color: "#4a6f8a" }}>{PAIR_LABELS[pair]}/USDC</span>
                <span style={{ color: "#e2e8f0" }}>{lp > 0 ? `$${fmt(lp, lp > 100 ? 0 : 2)}` : "—"}</span>
                <span style={{ color: ch >= 0 ? "#00e5a0" : "#ff4d6d", fontSize: "8px" }}>{lp > 0 ? fmtPct(ch) : ""}</span>
                {sig?.regime && sig.regime !== "—" && <span style={{ color: REGIME_COLOR[sig.regime], fontSize: "8px" }}>{sig.regime}</span>}
                {sig?.action && sig.action !== "HOLD" && <span style={{ color: DIR_COLOR[sig.action], fontSize: "8px", fontWeight: 700 }}>{sig.action}</span>}
              </span>
            );
          })}
        </div>
      </div>

      {/* ── MAIN GRID ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 296px", height: "calc(100vh - 78px)", overflow: "hidden" }}>

        {/* ── LEFT PANEL ── */}
        <div style={{ overflow: "auto", padding: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>

          {/* Pair tabs */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
            <div style={{ display: "flex", gap: "4px" }}>
              {PAIRS.map(pair => {
                const sig = signals[pair]; const active = activePair === pair;
                const col = DIR_COLOR[sig?.action] || "#4a6f8a";
                return (
                  <button key={pair} onClick={() => setActivePair(pair)}
                    style={{ border: `1px solid ${active ? col : "#1a2640"}`, cursor: "pointer", padding: "5px 12px", borderRadius: "4px", fontFamily: "inherit", fontSize: "10px", background: active ? `${col}15` : "transparent", color: active ? col : "#4a6f8a", transition: "all 0.15s" }}>
                    {PAIR_LABELS[pair]}
                    {sig?.action && sig.action !== "HOLD" && <span style={{ marginLeft: "4px", fontSize: "8px" }}>{sig.action === "LONG" ? "↑" : "↓"}</span>}
                  </button>
                );
              })}
            </div>
            {bot?.status === "running" && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "9px", color: "#4a6f8a" }}>
                <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#00e5a0", animation: "pulse 2s infinite" }} />
                NEXT TICK {countdown}s
              </div>
            )}
          </div>

          {/* Price + Signal Hero */}
          <div className="card" style={{ padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
            <div>
              <div style={{ fontSize: "8px", color: "#4a6f8a", letterSpacing: "0.15em", marginBottom: "5px" }}>{PAIR_LABELS[activePair]}/USDC · 1M</div>
              <div style={{ fontSize: "30px", fontWeight: 700, color: "#fff", letterSpacing: "-0.02em" }}>
                ${activePrice > 100 ? fmt(activePrice, 0) : fmt(activePrice, 4)}
              </div>
              <div style={{ fontSize: "10px", color: priceChange >= 0 ? "#00e5a0" : "#ff4d6d", marginTop: "4px" }}>
                {fmtPct(priceChange)} last tick
                {activeSignal.kalman_value && (
                  <span style={{ color: "#a78bfa", marginLeft: "10px" }}>
                    FV ${fmt(activeSignal.kalman_value, activePrice > 100 ? 0 : 4)}
                  </span>
                )}
              </div>
            </div>
            <Spark prices={activeCandles.slice(-30).map(c => Number(c.close))} color={priceChange >= 0 ? "#00e5a0" : "#ff4d6d"} w={100} h={36} />

            {/* Regime badge */}
            <div style={{ background: REGIME_BG[regime] || "rgba(107,114,128,0.08)", border: `1px solid ${REGIME_COLOR[regime] || "#6b7280"}40`, borderRadius: "6px", padding: "8px 14px", textAlign: "center" }}>
              <div style={{ fontSize: "8px", color: "#4a6f8a", letterSpacing: "0.12em", marginBottom: "3px" }}>REGIME</div>
              <div style={{ fontSize: "15px", fontWeight: 700, color: REGIME_COLOR[regime] || "#6b7280" }}>{regime}</div>
              <div style={{ fontSize: "8px", color: "#4a6f8a", marginTop: "2px" }}>15m HMM</div>
            </div>

            {/* Signal badge */}
            {activeSignal.action && (
              <div style={{ background: `${DIR_COLOR[activeSignal.action]}12`, border: `1px solid ${DIR_COLOR[activeSignal.action]}40`, borderRadius: "6px", padding: "8px 18px", textAlign: "center", boxShadow: `0 0 20px ${DIR_COLOR[activeSignal.action]}18` }}>
                <div style={{ fontSize: "8px", color: "#4a6f8a", letterSpacing: "0.12em", marginBottom: "3px" }}>SIGNAL</div>
                <div style={{ fontSize: "22px", fontWeight: 700, color: DIR_COLOR[activeSignal.action] }}>{activeSignal.action}</div>
                <div style={{ fontSize: "8px", color: DIR_COLOR[activeSignal.action], marginTop: "2px" }}>{(Number(activeSignal.confidence || 0) * 100).toFixed(1)}%</div>
              </div>
            )}
          </div>

          {/* Chart + tabs */}
          <div className="card" style={{ overflow: "hidden" }}>
            <div style={{ display: "flex", borderBottom: "1px solid #1a2640", padding: "0 10px" }}>
              {["chart", "ml", "indicators", "all-pairs", "models"].map(t => (
                <button key={t} className={`tab ${activeTab === t ? "active" : ""}`} onClick={() => setActiveTab(t)}>
                  {t === "chart" ? "📈 Chart" : t === "ml" ? "🧠 ML" : t === "indicators" ? "📊 Indicators" : t === "all-pairs" ? "🌐 Pairs" : "⚙️ Models"}
                </button>
              ))}
            </div>
            <div style={{ padding: "10px 10px 8px" }}>
              {activeTab === "chart" && (
                <>
                  <div style={{ fontSize: "8px", color: "#1e3a5f", marginBottom: "6px", display: "flex", gap: "14px" }}>
                    <span>1M · {activeCandles.length} bars</span>
                    <span style={{ color: "#a78bfa66" }}>─ Kalman FV</span>
                    <span style={{ color: "#00e5a066" }}>─ TP</span>
                    <span style={{ color: "#ff4d6d66" }}>─ SL</span>
                    <span style={{ color: "#ffd70066" }}>─ Trail</span>
                  </div>
                  <CandleChart candles={activeCandles} signal={activeSignal} position={activePosition} />
                </>
              )}

              {activeTab === "ml" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <div style={{ background: "#090d18", borderRadius: "6px", padding: "10px" }}>
                      <div style={{ fontSize: "8px", color: "#4a6f8a", marginBottom: "6px", letterSpacing: "0.1em" }}>LR (40% weight)</div>
                      <ConfBar label="LONG" value={Number(activeSignal.lr_confidence || 0)} color="#00e5a0" />
                      <ConfBar label="SHORT" value={1 - Number(activeSignal.lr_confidence || 0.5) - 0.1} color="#ff4d6d" />
                    </div>
                    <div style={{ background: "#090d18", borderRadius: "6px", padding: "10px" }}>
                      <div style={{ fontSize: "8px", color: "#4a6f8a", marginBottom: "6px", letterSpacing: "0.1em" }}>LSTM (60% weight)</div>
                      <ConfBar label="LONG" value={Number(activeSignal.lstm_confidence || 0)} color="#00e5a0" />
                      <ConfBar label="SHORT" value={1 - Number(activeSignal.lstm_confidence || 0.5) - 0.1} color="#ff4d6d" />
                    </div>
                  </div>
                  <div style={{ background: "#090d18", borderRadius: "6px", padding: "10px" }}>
                    <div style={{ fontSize: "8px", color: "#4a6f8a", marginBottom: "6px", letterSpacing: "0.1em" }}>ENSEMBLE (Platt-calibrated)</div>
                    <ConfBar label="LONG confidence" value={activeSignal.action === "LONG" ? Number(activeSignal.confidence || 0) : 0.1} color="#00e5a0" />
                    <ConfBar label="SHORT confidence" value={activeSignal.action === "SHORT" ? Number(activeSignal.confidence || 0) : 0.1} color="#ff4d6d" />
                    <div style={{ marginTop: "6px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
                      {(activeSignal.regime_probs || [0.33, 0.33, 0.34]).map((p, i) => (
                        <div key={i} style={{ textAlign: "center" }}>
                          <div style={{ fontSize: "8px", color: ["#ffd700","#7dd3fc","#6b7280"][i], marginBottom: "2px" }}>
                            {["TREND","REVERT","CHOP"][i]}
                          </div>
                          <div style={{ fontSize: "11px", fontWeight: 600, color: ["#ffd700","#7dd3fc","#6b7280"][i] }}>
                            {(p * 100).toFixed(0)}%
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ background: "#090d18", borderRadius: "6px", padding: "10px" }}>
                    <div style={{ fontSize: "8px", color: "#4a6f8a", marginBottom: "6px", letterSpacing: "0.1em" }}>KALMAN FILTER</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                      {[
                        { l: "Fair Value", v: activeSignal.kalman_value ? `$${fmt(activeSignal.kalman_value, 2)}` : "—", c: "#a78bfa" },
                        { l: "Deviation (σ)", v: activeSignal.kalman_deviation ? Number(activeSignal.kalman_deviation).toFixed(3) : "—", c: Math.abs(Number(activeSignal.kalman_deviation)) > 2 ? "#ff4d6d" : "#7dd3fc" },
                      ].map(({ l, v, c }) => (
                        <div key={l} style={{ background: "#0a0f1a", borderRadius: "4px", padding: "6px 8px" }}>
                          <div style={{ fontSize: "8px", color: "#2a4060", marginBottom: "2px" }}>{l}</div>
                          <div style={{ fontSize: "12px", fontWeight: 600, color: c }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "indicators" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px" }}>
                  {activeSignal.features && Object.entries(activeSignal.features).map(([key, val]) => (
                    <div key={key} style={{ background: "#090d18", borderRadius: "5px", padding: "7px 9px" }}>
                      <div style={{ fontSize: "7px", color: "#2a4060", marginBottom: "3px", letterSpacing: "0.08em" }}>{key.toUpperCase()}</div>
                      <div style={{ fontSize: "11px", fontWeight: 500, color: "#7dd3fc" }}>{typeof val === "number" ? val.toFixed(4) : String(val)}</div>
                    </div>
                  ))}
                  {!activeSignal.features && <div style={{ color: "#1e3a5f", gridColumn: "span 3", textAlign: "center", padding: "20px", fontSize: "10px" }}>Run a tick to see features</div>}
                </div>
              )}

              {activeTab === "all-pairs" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px" }}>
                  {PAIRS.map(pair => {
                    const c = candles[pair] || []; const sig = signals[pair] || {};
                    const lp = Number(c[c.length-1]?.close || 0); const pp = Number(c[c.length-2]?.close || lp);
                    const ch = pp ? ((lp-pp)/pp)*100 : 0; const hasPos = positions.find(p => p.symbol === pair);
                    return (
                      <div key={pair} onClick={() => { setActivePair(pair); setActiveTab("chart"); }}
                        style={{ background: "#090d18", border: `1px solid ${activePair === pair ? "#1e3a5f" : "#0f1a2e"}`, borderRadius: "7px", padding: "10px", cursor: "pointer" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                          <span style={{ color: "#7dd3fc", fontWeight: 600, fontSize: "10px" }}>{PAIR_LABELS[pair]}/USDC</span>
                          <div style={{ display: "flex", gap: "5px" }}>
                            {hasPos && <span style={{ fontSize: "7px", color: DIR_COLOR[hasPos.direction], background: `${DIR_COLOR[hasPos.direction]}18`, padding: "1px 5px", borderRadius: "3px" }}>{hasPos.direction}</span>}
                            {sig.regime && <span style={{ fontSize: "7px", color: REGIME_COLOR[sig.regime], background: `${REGIME_COLOR[sig.regime]}18`, padding: "1px 5px", borderRadius: "3px" }}>{sig.regime}</span>}
                          </div>
                        </div>
                        <div style={{ fontSize: "13px", fontWeight: 700, color: "#e2e8f0", marginBottom: "5px" }}>
                          ${lp > 100 ? fmt(lp, 0) : fmt(lp, 4)}
                        </div>
                        <Spark prices={c.slice(-25).map(c => Number(c.close))} color={DIR_COLOR[sig.action] || "#4a6f8a"} w={100} h={28} />
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "5px" }}>
                          <span style={{ fontSize: "8px", color: ch >= 0 ? "#00e5a0" : "#ff4d6d" }}>{fmtPct(ch)}</span>
                          <span style={{ fontSize: "8px", color: DIR_COLOR[sig.action] || "#4a6f8a", fontWeight: 600 }}>
                            {sig.action || "—"} {sig.confidence ? `${(Number(sig.confidence)*100).toFixed(0)}%` : ""}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {activeTab === "models" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {modelMeta.length === 0 && (
                    <div style={{ color: "#1e3a5f", textAlign: "center", padding: "20px", fontSize: "10px" }}>
                      No models trained yet. Click 🧠 TRAIN to begin.
                    </div>
                  )}
                  {PAIRS.map(pair => {
                    const pairModels = modelMeta.filter(m => m.symbol === pair);
                    if (!pairModels.length) return null;
                    return (
                      <div key={pair} style={{ background: "#090d18", borderRadius: "6px", padding: "10px", border: "1px solid #0f1a2e" }}>
                        <div style={{ color: "#7dd3fc", fontWeight: 600, fontSize: "10px", marginBottom: "7px" }}>{PAIR_LABELS[pair]}/USDC</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "5px" }}>
                          {["LR","LSTM","HMM","PLATT"].map(mt => {
                            const m = pairModels.find(x => x.model_type === mt);
                            return (
                              <div key={mt} style={{ background: "#0a0f1a", borderRadius: "4px", padding: "6px 7px" }}>
                                <div style={{ fontSize: "8px", color: m ? "#00e5a0" : "#1e3a5f", marginBottom: "2px" }}>{mt} {m ? "✓" : "—"}</div>
                                {m && <div style={{ fontSize: "8px", color: "#4a6f8a" }}>
                                  {m.accuracy ? `acc ${(m.accuracy*100).toFixed(0)}%` : ""}
                                </div>}
                                {m && <div style={{ fontSize: "7px", color: "#1e3a5f" }}>{m.trained_at ? new Date(m.trained_at).toLocaleDateString() : ""}</div>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT SIDEBAR ── */}
        <div style={{ borderLeft: "1px solid #1a2640", display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Portfolio */}
          <div style={{ padding: "14px", borderBottom: "1px solid #1a2640", flexShrink: 0 }}>
            <div style={{ fontSize: "8px", color: "#4a6f8a", letterSpacing: "0.12em", marginBottom: "8px" }}>PORTFOLIO</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px", marginBottom: "8px" }}>
              {[
                { l: "CASH", v: `$${fmt(cash)}`, c: "#7dd3fc" },
                { l: "EQUITY", v: `$${fmt(equity)}`, c: equity >= 10000 ? "#00e5a0" : "#ff4d6d" },
                { l: "P&L", v: `${totalPnl>=0?"+":""}$${fmt(totalPnl)}`, c: totalPnl>=0?"#00e5a0":"#ff4d6d" },
                { l: "WIN RATE", v: `${winRate}%`, c: "#e2e8f0" },
              ].map(({ l, v, c }) => (
                <div key={l} style={{ background: "#090d18", borderRadius: "5px", padding: "7px 9px", border: "1px solid #0f1a2e" }}>
                  <div style={{ fontSize: "7px", color: "#1e3a5f", marginBottom: "2px" }}>{l}</div>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: c }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Daily drawdown meter */}
            <div style={{ background: "#090d18", borderRadius: "5px", padding: "7px 9px", border: "1px solid #0f1a2e", marginBottom: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <span style={{ fontSize: "7px", color: "#4a6f8a", letterSpacing: "0.1em" }}>DAILY DRAWDOWN LIMIT (5%)</span>
                <span style={{ fontSize: "8px", color: drawdown > 0.03 ? "#ff4d6d" : "#4a6f8a", fontWeight: 600 }}>{(drawdown * 100).toFixed(2)}%</span>
              </div>
              <div style={{ background: "#0a0f1a", height: "3px", borderRadius: "2px", overflow: "hidden" }}>
                <div style={{ width: `${Math.min(drawdown / 0.05 * 100, 100)}%`, height: "100%", background: drawdown > 0.03 ? "#ff4d6d" : drawdown > 0.02 ? "#ffd700" : "#00e5a0", borderRadius: "2px", transition: "width 0.5s" }} />
              </div>
            </div>

            {/* Equity curve */}
            <div style={{ background: "#090d18", borderRadius: "5px", padding: "7px", border: "1px solid #0f1a2e" }}>
              <div style={{ fontSize: "7px", color: "#1e3a5f", marginBottom: "4px", letterSpacing: "0.1em" }}>EQUITY CURVE</div>
              <EquityCurve snapshots={snapshots} />
            </div>
          </div>

          {/* Open Positions */}
          <div style={{ padding: "10px 14px", borderBottom: "1px solid #1a2640", flexShrink: 0 }}>
            <div style={{ fontSize: "8px", color: "#4a6f8a", letterSpacing: "0.12em", marginBottom: "7px" }}>
              POSITIONS <span style={{ color: "#1e3a5f" }}>({positions.length}/2)</span>
            </div>
            {positions.length === 0 ? (
              <div style={{ color: "#1e3a5f", fontSize: "9px", textAlign: "center", padding: "4px" }}>No open positions</div>
            ) : positions.map(pos => {
              const c = candles[pos.symbol]; const lp = Number(c?.[c.length-1]?.close || pos.entry_price);
              const isLong = pos.direction === "LONG";
              const pnlPct = isLong ? ((lp - Number(pos.entry_price)) / Number(pos.entry_price)) * 100
                                    : ((Number(pos.entry_price) - lp) / Number(pos.entry_price)) * 100;
              return (
                <div key={pos.id} style={{ background: "#090d18", borderRadius: "5px", padding: "7px 9px", marginBottom: "5px", borderLeft: `2px solid ${DIR_COLOR[pos.direction]}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                    <span style={{ color: DIR_COLOR[pos.direction], fontWeight: 600, fontSize: "10px" }}>{pos.direction} {PAIR_LABELS[pos.symbol]}</span>
                    <span style={{ color: pnlPct >= 0 ? "#00e5a0" : "#ff4d6d", fontSize: "10px", fontWeight: 600 }}>{fmtPct(pnlPct)}</span>
                  </div>
                  <div style={{ color: "#2a4060", fontSize: "8px", marginBottom: "3px" }}>
                    entry ${fmt(pos.entry_price, 2)} · {Number(pos.quantity).toFixed(5)} {PAIR_LABELS[pos.symbol]}
                  </div>
                  <div style={{ display: "flex", gap: "8px", fontSize: "8px" }}>
                    <span style={{ color: "#00e5a060" }}>TP ${fmt(pos.tp_price, 2)}</span>
                    <span style={{ color: "#ff4d6d60" }}>SL ${fmt(pos.sl_price, 2)}</span>
                    {pos.trailing_activated && <span style={{ color: "#ffd70060" }}>TRAIL ✓</span>}
                    <span style={{ color: "#1e3a5f" }}>{pos.regime_at_entry}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Trade log */}
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "8px 14px 5px", fontSize: "8px", color: "#4a6f8a", letterSpacing: "0.12em", borderBottom: "1px solid #1a2640", display: "flex", justifyContent: "space-between", flexShrink: 0 }}>
              <span>TRADE LOG</span>
              <span style={{ color: "#1e3a5f" }}>{trades.length}</span>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "6px" }}>
              {trades.length === 0 ? (
                <div style={{ color: "#1e3a5f", textAlign: "center", padding: "16px 0", fontSize: "9px" }}>
                  {bot?.status === "running" ? "Awaiting signals..." : "Start bot to trade"}
                </div>
              ) : trades.map((t, i) => {
                const isOpen = t.action?.startsWith("OPEN");
                const isLong = t.action?.includes("LONG");
                const col = isLong ? "#00e5a0" : "#ff4d6d";
                return (
                  <div key={t.id || i} className={i === 0 ? "new-row" : ""}
                    style={{ background: "#090d18", borderRadius: "4px", padding: "6px 8px", marginBottom: "3px", borderLeft: `2px solid ${col}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1px" }}>
                      <span style={{ color: col, fontWeight: 600, fontSize: "9px" }}>{t.action}</span>
                      <span style={{ color: "#1e3a5f", fontSize: "8px" }}>{fmtTime(t.executed_at)}</span>
                    </div>
                    <div style={{ color: "#7dd3fc", fontSize: "9px" }}>{PAIR_LABELS[t.symbol] || t.symbol} @ ${fmt(t.price, t.price > 100 ? 0 : 4)}</div>
                    {!isOpen && t.pnl != null && (
                      <div style={{ fontSize: "8px", color: Number(t.pnl) >= 0 ? "#00e5a0" : "#ff4d6d", fontWeight: 600 }}>
                        {Number(t.pnl) >= 0 ? "+" : ""}${fmt(t.pnl)} ({fmtPct(t.pnl_pct)}) · {t.close_reason}
                      </div>
                    )}
                    {t.order_id?.startsWith("PAPER") && <span style={{ fontSize: "7px", color: "#ffd70060" }}>PAPER</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Strategy quick ref */}
          <div style={{ padding: "8px 14px", borderTop: "1px solid #1a2640", background: "#060a10", flexShrink: 0 }}>
            <div style={{ fontSize: "7px", color: "#1e3a5f", letterSpacing: "0.12em", marginBottom: "5px" }}>STRATEGY v3.1</div>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "1px 10px" }}>
              {[
                ["Signal", "LR(40%)+LSTM(60%) >65% conf"],
                ["Regime", "HMM 3-state on 15m"],
                ["TP/SL", "ATR×3/1.5 trend, ×1/0.5 revert"],
                ["Size", "Half-Kelly · $10–$500"],
                ["Exit", "TP·SL·Trail·ProfitPull"],
                ["Mode", "Binance USDC maker (GTX)"],
              ].map(([k, v]) => (
                <>
                  <span key={k} style={{ color: "#4a6f8a", fontSize: "8px" }}>{k}</span>
                  <span key={k+v} style={{ color: "#1e3a5f", fontSize: "8px" }}>{v}</span>
                </>
              ))}
            </div>
            <div style={{ marginTop: "5px", fontSize: "7px", color: "#0d1e35" }}>
              Status: <span style={{ color: bot?.status === "running" ? "#00e5a0" : "#4a6f8a" }}>{bot?.status?.toUpperCase()}</span>
              {bot?.status === "paused" && riskState?.paused_reason && <span style={{ color: "#ff4d6d", marginLeft: "6px" }}>{riskState.paused_reason}</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
