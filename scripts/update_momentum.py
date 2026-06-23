"""
update_momentum.py — Monthly momentum signal update for DeepMomentum dashboard.
Outputs: data/momentum_signal.json

TODO: Port XGBoost model inference from DeepMomentum repo.
      The I/O contract below is complete; fill in the model logic.
"""

import json
import os
from datetime import datetime, date

import pandas as pd
import numpy as np
import yfinance as yf


def get_russell_2000_universe() -> list[str]:
    """Return Russell 2000 constituent tickers.

    TODO: Load from a saved CSV or iShares IWM holdings file.
          Download from: https://www.ishares.com/us/products/239710/ishares-russell-2000-etf
    """
    # tickers = pd.read_csv('scripts/russell2000_tickers.csv')['ticker'].tolist()
    raise NotImplementedError("Load Russell 2000 constituents from scripts/russell2000_tickers.csv")


def compute_momentum(prices_df: pd.DataFrame) -> pd.Series:
    """12-1 momentum: 12-month return excluding last month."""
    returns_12 = prices_df.pct_change(252)
    returns_1  = prices_df.pct_change(21)
    return returns_12 - returns_1


def compute_features(prices_df: pd.DataFrame) -> pd.DataFrame:
    """Build the 19 cross-sectionally ranked features used in the model.

    TODO: Port feature construction from DeepMomentum repo.
    """
    raise NotImplementedError("Port feature construction from DeepMomentum repo")


def classify_quadrant(features_df: pd.DataFrame) -> pd.Series:
    """Run XGBoost ensemble to classify each stock into GL / GW / LL / LW.

    TODO: Load the trained XGBoost model from DeepMomentum repo and run inference.
          Model expects 19 cross-sectionally ranked features.
    """
    raise NotImplementedError("Load XGBoost model from DeepMomentum repo and run inference")


def build_equity_curve(signal_history_path: str) -> list[dict]:
    """Load historical strategy vs benchmark equity curve for the dashboard chart.

    TODO: Load walk-forward backtest results from DeepMomentum repo.
          Expected format: list of {"date": "YYYY-MM", "strategy": float, "baseline": float}
    """
    return []


def main():
    tickers    = get_russell_2000_universe()
    end        = date.today()
    start      = pd.Timestamp(end) - pd.DateOffset(years=4)
    prices_df  = yf.download(tickers, start=str(start), end=str(end), auto_adjust=True)['Close']

    features   = compute_features(prices_df)
    quadrants  = classify_quadrant(features)

    # Split into long (GL) and short (GW) positions
    gl_stocks  = features[quadrants == 'GL']
    gw_stocks  = features[quadrants == 'GW']

    def to_positions(stocks, weight_sign=1.0) -> list[dict]:
        n = len(stocks)
        return [
            {
                "ticker":        ticker,
                "quadrant":      quadrants[ticker],
                "momentum_12_1": float(compute_momentum(prices_df[[ticker]]).iloc[-1]),
                "weight":        round(weight_sign / n, 4) if n > 0 else 0.0
            }
            for ticker in stocks.index
        ]

    signal = {
        "last_updated":     datetime.utcnow().isoformat() + 'Z',
        "rebalance_date":   end.isoformat(),
        "portfolio_size":   10_000_000,
        "long_positions":   to_positions(gl_stocks, weight_sign=1.0),
        "short_positions":  to_positions(gw_stocks, weight_sign=-1.0),
        "equity_curve":     build_equity_curve('scripts/backtest_results.csv'),
        "regime_flag":      "normal",
        "sharpe_rolling_12m": None,
        "post_2020_note":   "Rate-hike beta drag identified. L/S spread intact post-2020."
    }

    out_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'momentum_signal.json')
    with open(out_path, 'w') as f:
        json.dump(signal, f, indent=2)

    # Update meta
    meta_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'meta.json')
    try:
        with open(meta_path) as f:
            meta = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        meta = {}
    meta['momentum_last_updated'] = signal['last_updated']
    with open(meta_path, 'w') as f:
        json.dump(meta, f, indent=2)

    print(f"Momentum signal updated: {signal['last_updated']}")
    print(f"  Longs:  {len(signal['long_positions'])}")
    print(f"  Shorts: {len(signal['short_positions'])}")


if __name__ == '__main__':
    main()
