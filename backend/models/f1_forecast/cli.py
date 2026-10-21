"""Command line entry point: ``python -m f1_forecast.cli <command> [-c CONFIG]``.

Commands implemented so far (Phase 0 to Phase 7a):
    config    print the resolved configuration and flag any missing input file
    validate  run the data-quality checks and write reports/data_quality.{json} + _summary.md
    features  rebuild the weekly matrix, build the monthly matrix, verify both
    backtest  run the baseline walk-forward backtest and write reports/baseline_*
    train     select + fit the weekly quantile models (test is never read)
    evaluate  score a saved model on one split (call test once, after selection)
    report    build the Phase 6a slices/diagnostics report from saved predictions
    diagnose  Phase 6b series-level diagnostics (A1-A4) on the frozen predictions
    calibrate Phase 6b split-conformal calibration decision (valid only, test once if enabled)
    predict   Phase 7a inference: latest features -> frozen model -> calibration -> JSON contract
    parity    prove the predict path reproduces the saved valid predictions

Phase 7b (Node endpoints) consumes the JSON written by ``predict``; it is not implemented here.
"""

from __future__ import annotations

import argparse
import json
import sys

from f1_forecast.config import DEFAULT_CONFIG_PATH, load_config


def cmd_config(args: argparse.Namespace) -> int:
    """Print the resolved configuration as JSON; exit 1 when a configured input path is missing."""
    cfg = load_config(args.config)
    payload = cfg.as_dict()
    missing = cfg.missing_paths()
    payload["missing_paths"] = missing
    print(json.dumps(payload, indent=2, default=str))
    if missing:
        print(f"ERROR: {len(missing)} configured input path(s) missing", file=sys.stderr)
        for entry in missing:
            print(f"  - {entry}", file=sys.stderr)
        return 1
    return 0


def cmd_validate(args: argparse.Namespace) -> int:
    """Run the Phase 1 validation suite; exit 1 when any check fails."""
    from f1_forecast.validate_data import run_validation

    cfg = load_config(args.config)
    report = run_validation(cfg, write_report=not args.no_report, sample_size=args.sample_size)
    print(report["summary_text"])
    return 1 if report["failed"] else 0


def cmd_features(args: argparse.Namespace) -> int:
    """Rebuild the weekly matrix, build the monthly matrix and verify the build."""
    from f1_forecast.features import build_all

    cfg = load_config(args.config)
    report = build_all(cfg, write=not args.no_report)
    print(report["summary_text"])
    for name, path in report.get("paths", {}).items():
        print(f"  wrote {name}: {path}")
    return 0 if report["all_passed"] else 1


def cmd_backtest(args: argparse.Namespace) -> int:
    """Run the baseline walk-forward backtest for one granularity (or both)."""
    from f1_forecast.backtest import run_backtest

    cfg = load_config(args.config)
    requested = ["WEEK", "MONTH"] if args.granularity == "BOTH" else [args.granularity]
    status = 0
    for granularity in requested:
        report = run_backtest(cfg, granularity=granularity, save_predictions=args.save_predictions,
                              write_report=not args.no_report)
        print(report["summary_text"])
        print()
    return status
    for label in ("paths",):
        if label in report:
            for name, path in report[label].items():
                print(f"  wrote {name}: {path}")
    if "predictions_path" in report:
        print(f"  wrote predictions: {report['predictions_path']}")
    return 0


def cmd_train(args: argparse.Namespace) -> int:
    """Select hyper-parameters/variant on valid, fit the final models, write the artifact."""
    from f1_forecast.model import train

    cfg = load_config(args.config)
    report = train(cfg, granularity=args.granularity, write=not args.no_report)
    print(report["summary_text"])
    if "artifact" in report:
        print(f"  artifact: {report['artifact']}")
    for name, path in report.get("paths", {}).items():
        print(f"  wrote {name}: {path}")
    return 0


def cmd_report(args: argparse.Namespace) -> int:
    """Build the Phase 6a evaluation report from saved row-level predictions."""
    from f1_forecast.evaluation import build_report

    cfg = load_config(args.config)
    report = build_report(cfg, granularity=args.granularity)
    print(f"evaluation report: {report['paths']['markdown']}")
    for name, path in report["paths"].items():
        print(f"  wrote {name}: {path}")
    for key, block in report["granularities"].items():
        print(f"  {key}: gate valid={block['gate']['valid']['passed']} test={block['gate']['test']['passed']}")
    return 0


def cmd_diagnose(args: argparse.Namespace) -> int:
    """Part A: series-level diagnostics on the frozen predictions (no re-score)."""
    from f1_forecast.diagnostics import build_diagnostics, write_diagnostics

    cfg = load_config(args.config)
    report = build_diagnostics(cfg, granularity=args.granularity)
    if not args.no_report:
        for name, path in write_diagnostics(cfg, report).items():
            print(f"  wrote {name}: {path}")
    for key, block in report["granularities"].items():
        for split, data in block["splits"].items():
            print(f"  {key}/{split}: {data['rows']:,} rows, {data['series']} series")
    return 0


def cmd_predict(args: argparse.Namespace) -> int:
    """Phase 7a: build the forecast payload for one granularity and write the JSON contract."""
    from f1_forecast.predict import PredictError, run_predict

    cfg = load_config(args.config)
    try:
        payload = run_predict(cfg, granularity=args.granularity, as_of=args.as_of,
                              write=not args.no_write, write_csv=False if args.no_csv else None)
    except PredictError as error:
        print(json.dumps(error.to_dict(), indent=2), file=sys.stderr)
        return error.exit_code
    summary = {key: payload[key] for key in ("modelVersion", "granularity", "asOf", "originUsed",
                                             "dataEnd", "calibration", "counts")}
    print(json.dumps(summary, indent=2))
    for name, path in payload.get("paths", {}).items():
        print(f"  wrote {name}: {path}")
    return 0


def cmd_parity(args: argparse.Namespace) -> int:
    """Reproduce the saved valid predictions through the predict path (valid origins only)."""
    from f1_forecast.predict import PredictError, parity_check, write_parity

    cfg = load_config(args.config)
    requested = ["WEEK", "MONTH"] if args.granularity == "BOTH" else [args.granularity]
    report: dict = {}
    try:
        for granularity in requested:
            report[granularity] = parity_check(cfg, granularity, origins=args.origins)
    except PredictError as error:
        print(json.dumps(error.to_dict(), indent=2), file=sys.stderr)
        return error.exit_code
    for granularity, entry in report.items():
        print(f"  {granularity}: {entry['rows']} rows, uncalibrated max abs diff {entry['uncalibrated_max']:.3g}"
              + (f", calibrated max abs diff {entry['calibrated']['max']:.3g}"
                 if entry.get("calibrated") else ", calibration off"))
    path = write_parity(cfg, report)
    print(f"  wrote parity: {path}")
    return 0


def cmd_calibrate(args: argparse.Namespace) -> int:
    """Part B: fit conformal offsets on valid, decide, and score test once if enabled."""
    from f1_forecast.diagnostics import build_calibration, write_calibration

    cfg = load_config(args.config)
    report = build_calibration(cfg, granularity=args.granularity)
    if not args.no_report:
        for name, path in write_calibration(cfg, report).items():
            print(f"  wrote {name}: {path}")
    for key, study in report["studies"].items():
        decision = study["decision"]
        print(f"  {key}: enabled={decision['enabled']} variant={decision['variant']}")
    return 0


def cmd_evaluate(args: argparse.Namespace) -> int:
    """Score a saved model on one split; label repeated test runs explicitly."""
    from f1_forecast.model import evaluate

    cfg = load_config(args.config)
    report = evaluate(cfg, split=args.split, artifact=args.artifact, write=not args.no_report,
                      evaluation_number=args.evaluation_number, granularity=args.granularity)
    print(report["summary_text"])
    for name, path in report.get("paths", {}).items():
        print(f"  wrote {name}: {path}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    """Build the argument parser (one sub-parser per command)."""
    parser = argparse.ArgumentParser(
        prog="f1_forecast",
        description="F1 quantile demand-forecasting module for DooRare (WEEK + MONTH granularities).",
    )
    parser.add_argument("-c", "--config", default=None,
                        help=f"path to the YAML config (default: {DEFAULT_CONFIG_PATH})")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("config", help="print the resolved configuration and check that inputs exist")

    validate = sub.add_parser("validate", help="run the data-quality checks (Phase 1 gate)")
    validate.add_argument("--no-report", action="store_true", help="do not write reports/ files")
    validate.add_argument("--sample-size", type=int, default=300,
                          help="rows used by the weekly target spot-reconciliation (default: 300)")

    features = sub.add_parser("features", help="rebuild weekly + build monthly feature matrices (Phase 3)")
    features.add_argument("--no-report", action="store_true", help="do not write matrices or reports")

    backtest = sub.add_parser("backtest", help="run the baseline walk-forward backtest")
    backtest.add_argument("--granularity", choices=["WEEK", "MONTH", "BOTH"], default="WEEK",
                          help="forecast granularity; BOTH runs weekly then monthly")
    backtest.add_argument("--no-report", action="store_true", help="do not write reports/ files")
    backtest.add_argument("--no-predictions", action="store_false", dest="save_predictions", default=None,
                          help="do not write data/baseline_predictions_<granularity>.parquet")

    train = sub.add_parser("train", help="select + fit the quantile models (Phase 4 WEEK / Phase 5 MONTH)")
    train.add_argument("--granularity", choices=["WEEK", "MONTH"], default="WEEK",
                       help="granularity to train")
    train.add_argument("--no-report", action="store_true",
                       help="do not write the artifact or the training report")

    evaluate = sub.add_parser("evaluate", help="score a saved model on one split and save predictions")
    evaluate.add_argument("--granularity", choices=["WEEK", "MONTH"], default="WEEK", help="granularity")
    evaluate.add_argument("--split", choices=["valid", "test"], default="test",
                          help="split to score (choices must be frozen first)")
    evaluate.add_argument("--artifact", default=None, help="artifact directory (default: latest WEEK)")
    evaluate.add_argument("--evaluation-number", type=int, default=None,
                          help="label this run (e.g. 2 for a repeated test evaluation)")
    evaluate.add_argument("--no-report", action="store_true",
                          help="do not write the report or the predictions parquet")

    report = sub.add_parser("report", help="build reports/evaluation.* from saved predictions (Phase 6a)")
    report.add_argument("--granularity", choices=["WEEK", "MONTH", "BOTH"], default="BOTH",
                        help="granularities to include")

    diagnose = sub.add_parser("diagnose", help="series-level diagnostics on frozen predictions (Phase 6b A)")
    diagnose.add_argument("--granularity", choices=["WEEK", "MONTH", "BOTH"], default="BOTH",
                          help="granularities to include")
    diagnose.add_argument("--no-report", action="store_true", help="do not write reports/ files")

    calibrate = sub.add_parser("calibrate", help="split-conformal decision on valid (Phase 6b B)")
    calibrate.add_argument("--granularity", choices=["WEEK", "MONTH", "BOTH"], default="BOTH",
                           help="granularities to include")
    calibrate.add_argument("--no-report", action="store_true", help="do not write reports/ files")

    predict = sub.add_parser("predict", help="inference: frozen model + calibration -> JSON (Phase 7a)")
    predict.add_argument("--granularity", choices=["WEEK", "MONTH"], default="WEEK",
                         help="granularity to serve")
    predict.add_argument("--as-of", default=None,
                         help="origin date (default: latest complete origin in the data)")
    predict.add_argument("--no-write", action="store_true", help="print the payload summary only")
    predict.add_argument("--no-csv", action="store_true", help="force no CSV even if the config asks")

    parity = sub.add_parser("parity", help="check the predict path against saved valid predictions")
    parity.add_argument("--granularity", choices=["WEEK", "MONTH", "BOTH"], default="BOTH")
    parity.add_argument("--origins", type=int, default=2, help="number of trailing valid origins (default 2)")

    return parser


def main(argv: list[str] | None = None) -> int:
    """Dispatch to the requested command and return its exit code."""
    parser = build_parser()
    args = parser.parse_args(argv)
    handlers = {"config": cmd_config, "validate": cmd_validate, "features": cmd_features,
                "backtest": cmd_backtest, "train": cmd_train, "evaluate": cmd_evaluate,
                "report": cmd_report, "diagnose": cmd_diagnose, "calibrate": cmd_calibrate,
                "predict": cmd_predict, "parity": cmd_parity}
    return handlers[args.command](args)


if __name__ == "__main__":
    raise SystemExit(main())
