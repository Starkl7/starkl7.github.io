#!/usr/bin/env python3
"""
generate_momentum_json.py — Build momentum_signal.json for the portfolio website.

Reads:
  data/Phase2_v3i7_final.json  — v2 Hybrid equity curve (LEAN export)
  data/Phase1_final_2025.json  — Phase 1 baseline (J-T 12-1 momentum) equity curve
  data/Phase2_v3i7_final_logs.txt — per-ticker Dec 2025 positions (POS| lines)

Baseline comparison is Phase 1 (pure Jegadeesh-Titman 12-1 momentum), not IWM.
This isolates the value added by the XGBoost reclassifier + hybrid overlays.

Outputs:
  data/momentum_signal.json

Usage:
    python scripts/generate_momentum_json.py
"""

import json
import re
from pathlib import Path

import numpy as np
import pandas as pd

DATA_DIR    = Path(__file__).resolve().parent.parent / 'data'
PHASE2_JSON = DATA_DIR / 'Phase2_v3i7_final.json'
PHASE1_JSON = DATA_DIR / 'Phase1_final_2025.json'
PHASE2_LOGS = DATA_DIR / 'Phase2_v3i7_final_logs.txt'
OUT_PATH    = DATA_DIR / 'momentum_signal.json'

LIVE_START = '2012-10'  # first live rebalance
TOP_N      = 15         # positions to show per side

# post_2020_note: shown as a yellow regime callout on the dashboard.
# Reflects the hybrid-specific behavior — not applicable to pure XGBoost.
POST_2020_NOTE = (
    "Hybrid overlays: GL persistence gate suppressed 36% of months, "
    "BW gate suppressed 35%. Vol scaling (Barroso-Santa Clara 2015) averages 1.04× — "
    "strategy levered 68% of months, de-risked 31%. "
    "Market state DOWN regime (IWM 12m < 0) halves exposure; "
    "weights shown are post-scaling. Mean net beta −0.191."
)


# ── Equity curve ──────────────────────────────────────────────────────────────

def _lean_series_to_monthly(json_path: Path, chart: str, series: str) -> pd.Series:
    with open(json_path) as f:
        d = json.load(f)
    vals = d['charts'][chart]['series'][series]['values']
    # LEAN exports OHLC as [unix_ts, open, high, low, close] for equity
    # and [unix_ts, price] for benchmark
    s = pd.Series(
        {pd.Timestamp(v[0], unit='s', tz='UTC'): float(v[-1]) for v in vals}
    )
    return s.resample('ME').last()


def build_equity_curve(phase2_json: Path, phase1_json: Path) -> list[dict]:
    strat    = _lean_series_to_monthly(phase2_json, 'Strategy Equity', 'Equity')
    baseline = _lean_series_to_monthly(phase1_json, 'Strategy Equity', 'Equity')

    # Trim both to the live trading window and normalize to 1.0 at first live month
    def trim_normalize(s: pd.Series) -> pd.Series:
        s = s[s.index.to_period('M').astype(str) >= LIVE_START]
        return s / s.iloc[0]

    strat    = trim_normalize(strat)
    baseline = trim_normalize(baseline)

    idx = strat.index.intersection(baseline.index)
    strat, baseline = strat.reindex(idx), baseline.reindex(idx)

    return [
        {
            'date':     str(dt.to_period('M')),
            'strategy': round(float(sv), 6),
            'baseline': round(float(bv), 6),
        }
        for dt, sv, bv in zip(idx, strat.values, baseline.values)
        if not (np.isnan(sv) or np.isnan(bv))
    ]


# ── Positions ─────────────────────────────────────────────────────────────────

def parse_positions(logs_path: Path, top_n: int) -> tuple[list, list]:
    """
    Parse POS lines from the final rebalance.
    Format: POS|YYYY-MM|TICKER|LONG/SHORT|QUADRANT|momentum_12_1|weight
    Weights are post-vol-scaling (hybrid model).
    Returns top_n longs and top_n shorts sorted by |momentum_12_1| descending.
    """
    pat = re.compile(
        r'POS\|(\d{4}-\d{2})\|(\w+)\|(LONG|SHORT)\|(\w+)\|([-\d.]+)\|([\d.]+)'
    )
    longs, shorts = [], []

    with open(logs_path) as f:
        for line in f:
            m = pat.search(line)
            if not m:
                continue
            _, ticker, direction, quadrant, mom, weight = m.groups()
            rec = {
                'ticker':        ticker,
                'quadrant':      quadrant,
                'momentum_12_1': round(float(mom), 4),
                'weight':        round(float(weight), 6),
            }
            (longs if direction == 'LONG' else shorts).append(rec)

    key = lambda x: abs(x['momentum_12_1'])
    longs  = sorted(longs,  key=key, reverse=True)[:top_n]
    shorts = sorted(shorts, key=key, reverse=True)[:top_n]
    return longs, shorts


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    print('Building equity curve (v2 Hybrid vs Phase 1 baseline)...')
    equity_curve = build_equity_curve(PHASE2_JSON, PHASE1_JSON)
    n = len(equity_curve)
    print(f'  {n} monthly points  '
          f'({equity_curve[0]["date"]} → {equity_curve[-1]["date"]})')
    print(f'  v2 Hybrid: {equity_curve[-1]["strategy"]:.4f}×   '
          f'Phase 1 baseline: {equity_curve[-1]["baseline"]:.4f}×')

    print('\nParsing Dec 2025 positions from logs...')
    long_positions, short_positions = parse_positions(PHASE2_LOGS, TOP_N)
    print(f'  Longs (top {TOP_N} by |mom|):  {len(long_positions)}')
    print(f'  Shorts (top {TOP_N} by |mom|): {len(short_positions)}')

    last_month = equity_curve[-1]['date']

    out = {
        'last_updated':    last_month + '-01T00:00:00Z',
        'rebalance_date':  last_month,
        'portfolio_size':  10_000_000,
        'long_positions':  long_positions,
        'short_positions': short_positions,
        'equity_curve':    equity_curve,
        'post_2020_note':  POST_2020_NOTE,
    }

    with open(OUT_PATH, 'w') as f:
        json.dump(out, f, indent=2)
    print(f'\nWrote → {OUT_PATH}')


if __name__ == '__main__':
    main()
