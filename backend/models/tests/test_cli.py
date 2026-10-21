"""CLI contract: an unknown granularity is rejected by argparse, not by a traceback."""

from __future__ import annotations

import pytest

from f1_forecast import cli


def test_unknown_granularity_is_rejected_cleanly(capsys) -> None:
    """A bad ``--granularity`` must exit through argparse (code 2) with a usage message."""
    with pytest.raises(SystemExit) as excinfo:
        cli.main(["backtest", "--granularity", "YEAR"])

    captured = capsys.readouterr()
    assert excinfo.value.code == 2
    assert "invalid choice" in captured.err
    assert "Traceback" not in captured.err
