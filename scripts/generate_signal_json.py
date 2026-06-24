#!/usr/bin/env python3
"""
generate_signal_json.py — Populate data/es_signal.json for the portfolio website.

Reads from the sibling Futures_RollOver project (results/ subdirectory).
Only includes days that pass the volume-share gate (5% < back_share < 80%),
matching exactly which days the live strategy was active.

Run from anywhere:
    python scripts/generate_signal_json.py
"""

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

WEBSITE_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR     = WEBSITE_ROOT / 'data'
FUTURES_ROOT = WEBSITE_ROOT.parent / 'Futures_RollOver'
RESULTS_DIR  = FUTURES_ROOT / 'results'

THRESHOLD = 2.5

WINDOWS = [
    {'key': 'W1', 'front': 'ESU4', 'back': 'ESZ4',
     'result_dir': 'ESU4_ESZ4_20240912', 'gate': 'none', 'start': '2024-09-12'},
    {'key': 'W2', 'front': 'ESZ4', 'back': 'ESH5',
     'result_dir': 'ESZ4_ESH5_20241212', 'gate': 'none', 'start': '2024-12-12'},
    {'key': 'W3', 'front': 'ESH5', 'back': 'ESM5',
     'result_dir': 'ESH5_ESM5_20250313', 'gate': 'none', 'start': '2025-03-13'},
    {'key': 'W4', 'front': 'ESM5', 'back': 'ESU5',
     'result_dir': 'ESM5_ESU5_20250612', 'gate': 'none', 'start': '2025-06-12'},
]

SESSIONS = ['European', 'US_RTH', 'Post_close']

STATIC_STATS = {
    'session_stats': {
        # OOS European V1 (W3+W4): n=90, p=0.013, avg net/lot +$3.90
        'european': {'n': 90, 'p_value': 0.013, 'avg_pnl': 3.90},
    },
    # OOS V1 all sessions (W3+W4): n=299, p=0.006; Sharpe +3.88, 90% CI [1.38, 6.63]
    'oos_summary': {
        'n': 299, 'p_value': 0.006,
        'sharpe': 3.88, 'sharpe_ci_low': 1.38, 'sharpe_ci_high': 6.63,
        'avg_pnl_lot': 2.47,
    },
}

VOL_GATE_LOW  = 0.05
VOL_GATE_HIGH = 0.80


# ── Volume gate ───────────────────────────────────────────────────────────────

def load_valid_dates(w: dict) -> set | None:
    """
    Return the set of date strings that pass the volume-share gate for this window.
    Gate: 5% < back_share < 80%.  Returns None if no arc file found (no filtering).
    """
    arc_path = RESULTS_DIR / w['result_dir'] / w['gate'] / 'volume_arc.parquet'
    if not arc_path.exists():
        return None
    arc   = pd.read_parquet(arc_path)
    valid = arc[(arc['back_share'] > VOL_GATE_LOW) & (arc['back_share'] < VOL_GATE_HIGH)]
    return {str(d) for d in valid.index}


# ── Z-score series ────────────────────────────────────────────────────────────

def load_window(w: dict) -> pd.DataFrame:
    path = RESULTS_DIR / w['result_dir'] / w['gate'] / 'timeseries.parquet'
    if not path.exists():
        print(f"  WARNING: {path} not found — skipping {w['key']}", file=sys.stderr)
        return pd.DataFrame()
    ts = pd.read_parquet(path).dropna(subset=['zscore'])
    print(f"  {w['key']} ({w['front']}/{w['back']}): "
          f"{len(ts):,} bars  {ts.index[0].date()} → {ts.index[-1].date()}")
    return ts


def build_zscore_series(frames: list) -> list:
    zscore_series = []
    for w, ts in frames:
        valid = load_valid_dates(w)
        daily = ts.groupby(ts.index.date).last()
        for d, row in daily.iterrows():
            if valid is not None and str(d) not in valid:
                continue
            if not np.isnan(row['zscore']):
                zscore_series.append({'date': str(d), 'z': round(float(row['zscore']), 4)})
    zscore_series.sort(key=lambda x: x['date'])
    return zscore_series


# ── Spread vs Fair Value ──────────────────────────────────────────────────────

def build_spread_vs_fv(frames: list) -> dict:
    """
    Daily mean observed spread and fair value, restricted to volume-gated trading days.
    Null sentinels separate roll windows so Chart.js spanGaps=false draws visual breaks.
    """
    dates, spread_vals, fv_vals = [], [], []

    for i, (w, ts) in enumerate(frames):
        if i > 0:
            dates.append(None); spread_vals.append(None); fv_vals.append(None)

        valid        = load_valid_dates(w)
        daily_spread = ts.groupby(ts.index.date)['spread'].mean()
        daily_fv     = ts.groupby(ts.index.date)['fv'].mean()

        for d in sorted(daily_spread.index):
            if valid is not None and str(d) not in valid:
                continue
            dates.append(str(d))
            spread_vals.append(round(float(daily_spread[d]), 4))
            fv_vals.append(round(float(daily_fv[d]),     4))

    n_trading = len([d for d in dates if d is not None])
    n_gaps    = len([d for d in dates if d is None])
    print(f'  Spread vs FV    : {n_trading} gated trading days + {n_gaps} window gaps')

    return {
        'dates':         dates,
        'spread':        spread_vals,
        'fv':            fv_vals,
        'window_starts': {w['key']: w['start'] for w, _ in frames},
    }


# ── Equity curve ──────────────────────────────────────────────────────────────

def load_session_trades(variant_suffix: str) -> pd.DataFrame:
    frames = []
    for w in WINDOWS:
        for sess in SESSIONS:
            p = RESULTS_DIR / w['result_dir'] / f'{sess}_{variant_suffix}' / 'trades.parquet'
            if p.exists():
                df = pd.read_parquet(p)[['entry_time', 'net_Tight']]
                frames.append(df)
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames).sort_values('entry_time').reset_index(drop=True)


def to_daily_cum(df: pd.DataFrame) -> pd.Series:
    df = df.copy()
    df['cum']  = df['net_Tight'].cumsum() * 10
    df['date'] = pd.to_datetime(df['entry_time']).dt.date.astype(str)
    return df.groupby('date')['cum'].last()


def build_equity_curve() -> dict:
    print('\nBuilding equity curve from session trades...')
    v1_daily  = to_daily_cum(load_session_trades('V1'))
    ug_daily  = to_daily_cum(load_session_trades('Ungated'))

    trading_dates = sorted(set(v1_daily.index) | set(ug_daily.index))
    all_dates     = ['2024-09-11'] + trading_dates

    v1_vals, ug_vals = [], []
    last_v1, last_ug = 0.0, 0.0
    for d in all_dates:
        if d in v1_daily.index:  last_v1 = float(v1_daily[d])
        if d in ug_daily.index:  last_ug = float(ug_daily[d])
        v1_vals.append(round(last_v1, 2))
        ug_vals.append(round(last_ug, 2))

    print(f'  V1 final:      ${v1_vals[-1]:>+,.0f}')
    print(f'  Ungated final: ${ug_vals[-1]:>+,.0f}')
    print(f'  {len(all_dates)} date points  IS/OOS split at 2024-12-17')

    return {
        'dates':        all_dates,
        'v1':           v1_vals,
        'ungated':      ug_vals,
        'is_oos_split': '2024-12-17',
        'window_starts': {w['key']: w['start'] for w in WINDOWS},
    }


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    if not RESULTS_DIR.exists():
        print(f'ERROR: Futures_RollOver results not found at {RESULTS_DIR}', file=sys.stderr)
        sys.exit(1)

    print('Loading all window timeseries...')
    frames = []
    for w in WINDOWS:
        ts = load_window(w)
        if not ts.empty:
            frames.append((w, ts))

    if not frames:
        print('ERROR: no timeseries data found.', file=sys.stderr)
        sys.exit(1)

    print('\nBuilding series (volume-gated days only)...')
    zscore_series = build_zscore_series(frames)
    spread_vs_fv  = build_spread_vs_fv(frames)
    equity_curve  = build_equity_curve()

    latest_w, latest_ts = frames[-1]
    last      = latest_ts.iloc[-1]
    z         = float(last['zscore'])
    fv        = float(last['fv'])
    observed  = float(last['spread'])
    last_ts   = latest_ts.index[-1]

    signal = 'SHORT' if z > THRESHOLD else ('LONG' if z < -THRESHOLD else 'NEUTRAL')

    first_w = frames[0][0]
    research_window = (
        f"W1–W4 · {first_w['front']}/{first_w['back']} → "
        f"{latest_w['front']}/{latest_w['back']} · Sep 2024 – Jun 2025"
    )

    out = {
        'last_updated':      last_ts.isoformat(),
        'research_window':   research_window,
        'front_contract':    latest_w['front'],
        'back_contract':     latest_w['back'],
        'fair_value_spread': round(fv,       4),
        'observed_spread':   round(observed, 4),
        'z_score':           round(z,        4),
        'signal':            signal,
        'entry_threshold':   THRESHOLD,
        **STATIC_STATS,
        'zscore_series':     zscore_series,
        'spread_vs_fv':      spread_vs_fv,
        'equity_curve':      equity_curve,
    }

    out_path = DATA_DIR / 'es_signal.json'
    with open(out_path, 'w') as f:
        json.dump(out, f, indent=2)

    print(f'\nWrote → {out_path}')
    print(f'  Research window : {research_window}')
    print(f'  Signal (W4 last): z = {z:+.4f}  →  {signal}')
    print(f'  Daily z series  : {len(zscore_series)} gated days')
    print(f'  Equity curve    : {len(equity_curve["dates"])} points')


if __name__ == '__main__':
    main()
