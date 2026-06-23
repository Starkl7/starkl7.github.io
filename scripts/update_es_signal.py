"""
update_es_signal.py — Daily ES calendar spread signal update.
Outputs: data/es_signal.json

TODO: Port spread computation and z-score gating from Futures_Roll_Over repo.
      The I/O contract below is complete; fill in the model logic.
"""

import json
import os
from datetime import datetime

import requests
import pandas as pd
import numpy as np


# Static OOS research results — these never change (from the paper)
OOS_SUMMARY = {
    "n": 670,
    "p_value": 0.0265,
    "sharpe": 3.88,
    "sharpe_ci_low": 1.38,
    "sharpe_ci_high": 6.63
}
SESSION_STATS = {
    "european": {"n": 170, "p_value": 0.0008, "avg_pnl": 4.9},
    "us":       {"n": 500, "p_value": 0.41,   "avg_pnl": 0.8}
}


def get_sofr_rate() -> float:
    """Fetch the current SOFR rate.

    TODO: Pull from FRED API (series SOFR) or use a saved rate.
          FRED endpoint: https://fred.stlouisfed.org/graph/fredgraph.csv?id=SOFR
    """
    raise NotImplementedError("Fetch SOFR rate from FRED API or saved source")


def get_es_front_back_prices() -> tuple[str, str, float, float]:
    """Return (front_contract, back_contract, front_price, back_price).

    TODO: Pull from Databento or CME data feed.
          Front = nearest quarterly expiry, back = next quarterly.
    """
    raise NotImplementedError("Fetch ES front and back contract prices from data source")


def compute_fair_value(spot: float, sofr: float, div_yield: float, t1: float, t2: float) -> float:
    """Fair value of calendar spread: FV = S * (e^{(r-q)*T2} - e^{(r-q)*T1})"""
    import math
    return spot * (math.exp((sofr - div_yield) * t2) - math.exp((sofr - div_yield) * t1))


def compute_zscore(observed: float, fair_value: float, history: list[float]) -> float:
    """Bias-corrected z-score.

    TODO: Port rolling bias and sigma estimates from Futures_Roll_Over repo.
    """
    raise NotImplementedError("Port z-score computation from Futures_Roll_Over repo")


def determine_signal(z: float, threshold: float = 3.0) -> str:
    if abs(z) < threshold:
        return "NEUTRAL"
    return "LONG" if z < -threshold else "SHORT"


def main():
    sofr                                    = get_sofr_rate()
    front_c, back_c, front_px, back_px     = get_es_front_back_prices()
    observed_spread                         = back_px - front_px

    # TODO: compute actual time-to-expiry for front and back contracts
    t1 = 0.0  # years to front expiry
    t2 = 0.25  # years to back expiry (~1 quarter)
    div_yield = 0.013  # approx S&P 500 dividend yield — update as needed

    fair_value = compute_fair_value(front_px, sofr, div_yield, t1, t2)

    # TODO: load rolling history for z-score computation
    history = []
    z_score = compute_zscore(observed_spread, fair_value, history)
    signal  = determine_signal(z_score)

    result = {
        "last_updated":     datetime.utcnow().isoformat() + 'Z',
        "front_contract":   front_c,
        "back_contract":    back_c,
        "fair_value_spread": round(fair_value, 4),
        "observed_spread":   round(observed_spread, 4),
        "z_score":           round(z_score, 4),
        "signal":            signal,
        "entry_threshold":   3.0,
        "session_stats":     SESSION_STATS,
        "oos_summary":       OOS_SUMMARY
    }

    out_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'es_signal.json')
    with open(out_path, 'w') as f:
        json.dump(result, f, indent=2)

    # Update meta
    meta_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'meta.json')
    try:
        with open(meta_path) as f:
            meta = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        meta = {}
    meta['es_last_updated'] = result['last_updated']
    with open(meta_path, 'w') as f:
        json.dump(meta, f, indent=2)

    print(f"ES signal updated: {result['last_updated']}")
    print(f"  Z-score: {z_score:.4f}  Signal: {signal}")
    print(f"  Fair Value: {fair_value:.2f}  Observed: {observed_spread:.2f}")


if __name__ == '__main__':
    main()
