"""F1 quantile demand-forecasting module (DooRare).

Forecasts dispensed drug usage (demand) per hospital x drug for two granularities -- WEEK and MONTH --
as quantiles P05/P10/P25/P50/P75/P90/P95, so downstream code can derive Total Target (F-06),
daily usage ``u`` (F-08) and lead-time quantities (ASM-43).

Layout:
    config.py        typed loader for config/forecast.yaml
    schema.py        column/key/value contracts of every input file
    data_loader.py   readers + series identity resolution (gp_id fallback)
    clean.py         series scope, cold-start detection, censoring stats, monthly aggregation
    validate_data.py Phase 1 data-quality suite + reports
    cli.py           `python -m f1_forecast.cli {config,validate}`

The module is CPU-only, reads the mock pack read-only from ``data/`` and writes derived tables to
``backend/models/data`` and models to ``backend/models/artifacts`` (both gitignored).
"""
