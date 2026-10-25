# Value of Reducing Under-Stock and Over-Stock — Forecasting Model Summary

> **WARNING — SYNTHETIC MOCK DATA:** Every figure in this report is computed from the synthetic
> DooRare data pack (`db/mock/generate.py` / `data/DooRare-F1-Monthly-Pack/`). These numbers reflect
> how the quantile LightGBM models and baselines interact with the synthetic generator and simulated
> hospital reorder rules. **Never cite these figures as real-world clinical or financial savings.**

---

## 1. Executive Summary & Robustness Verdict

- **Conclusion robust to parameter choice (`holding_rate ∈ {15%, 20%, 25%}` × `shortage_weight ∈ {0.5, 1.0, 2.0}`): YES**
  - Across all **9 parameter cells** (`3 holding rates × 3 shortage weights`), **zero cells change sign** (`sign_changed_vs_base = False` for every granularity, split, model variant, and baseline) and **zero cells change baseline ranking** (`ranking_changed_vs_base = False` everywhere).
  - Why is the sign invariant across the grid? Because period-adjusted holding cost savings (`ΔOver THB × rate / 52` or `rate / 12`) are on the order of **-2.81 THB to -230.96 THB** per split, whereas shortage reductions (`shortage_weight × ΔUnder THB`) are on the order of **±620 THB to ±500,141 THB**. Thus the sign of Net Value is governed almost entirely by whether the model reduces `Under THB` relative to the baseline.
- **Does the model uniformly beat the baselines on value? NO.**
  - **Where the model WINS on Net Value (positive Net Value across all 9 grid cells):**
    1. **WEEK / test (`all_rows`, uncalibrated `lgbm_quantile_wk`):** Beats all 3 baselines — **+40,066.14 THB** vs. `seasonal_naive` (primary baseline), **+59,750.77 THB** vs. `ma_es_residual_quantile`, and **+138,104.96 THB** vs. `empirical_quantile` at base assumptions (`rate = 20%`, `shortage_weight = 1.0`).
    2. **WEEK / test (`all_rows`, calibrated `lgbm_quantile_wk_calibrated`):** Global split-conformal calibration raises Total Target slightly (`+0.011387` at P90, `+0.010951` at P95 on `log1p`), cutting `Under THB` by a further **22,227.20 THB** and slightly trimming `Over THB` by **1,178.02 THB**, improving Net Value to **+62,297.87 THB** vs. `seasonal_naive`, **+81,982.50 THB** vs. `ma_es_residual_quantile`, and **+160,336.69 THB** vs. `empirical_quantile`.
    3. **MONTH / test (`all_rows`, uncalibrated `lgbm_quantile_mo`):** Beats `ma_es_residual_quantile` (**+1,109.59 THB** at base; **+456.73 THB** at `w=0.5, r=25%`) and strongly beats `empirical_quantile` (**+250,064.87 THB** at base).
    4. **MONTH / valid (`all_rows`, uncalibrated `lgbm_quantile_mo`):** Beats `ma_es_residual_quantile` (**+178,101.75 THB** at base) and `empirical_quantile` (**+231,542.73 THB** at base).
  - **Where the model LOSES on Net Value (negative Net Value across all 9 grid cells):**
    1. **MONTH / test vs. `seasonal_naive` (primary baseline):** Model loses by **-122,082.67 THB** at base (`Under THB` is **239,425.34 THB** vs. `seasonal_naive` **117,431.09 THB**, an increase of **+121,994.25 THB / +103.89%** in under-stock exposure, plus **+5,305.17 THB / +27.65%** higher `Over THB`).
    2. **MONTH / valid vs. `seasonal_naive` (primary baseline):** Model loses by **-20,294.05 THB** at base (`Under THB` is **173,104.42 THB** vs. **152,955.72 THB**, and `Over THB` is **60,795.77 THB** vs. **52,074.98 THB**).
    3. **WEEK / valid vs. ALL 3 baselines:** Model loses vs. `seasonal_naive` (**-104,303.91 THB**), vs. `ma_es_residual_quantile` (**-21,712.36 THB**), and vs. `empirical_quantile` (**-4,444.57 THB**) at base because the model's narrower bands on the selection split yield higher `Under THB` (**172,389.73 THB**) and higher `Over THB` (**237,113.77 THB**) than all three baselines.
    4. **Over-stock exposure (`Over THB`) and Overstock Rate (`origin_stock > 2 × TT`) in EVERY split and granularity:** Because the LightGBM quantile model produces **narrower prediction intervals** (lower `TT`) than `seasonal_naive` and `ma_es_residual_quantile`, existing hospital stock (`origin_stock`) sits further above `TT`. Consequently, under the F-24 formula `Over THB = mean(max(0, stock - TT)) * mean(price)`, the model has **higher `Over THB` (negative over-stock reduction)** against **every baseline in every split**.

---

## 2. Service Levels, Assumptions & Formulas

### 2.1 Fixed Service Levels & Total Target (`F-06`, `F-24`)
- **Quantiles trained:** `[0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95]` on `log1p(y_target)`, inverted via `expm1`, clipped at `0`, and monotone-fixed per row (`backend/models/config/forecast.yaml:L35`, `backend/models/f1_forecast/metrics.py:L102-L119`).
- **Total Target (`TT`):** `P95` for `VED = V`, `P90` for `VED = E`, undefined (`NaN`, excluded from TT metrics) for `VED = D`, floored at `P50` (`TT = max(TT, P50)`). Citations: `backend/models/reports/evaluation.md:L9`, `backend/models/config/forecast.yaml:L191`.
- **Stock-out Rate:** `mean(y > TT)` over rows with a valid `TT` (`V` and `E` rows). Citation: `backend/models/reports/evaluation.md:L10`.
- **Overstock Rate:** `mean(origin_stock > 2 × TT)` over rows with a valid `TT`. Citation: `backend/models/reports/evaluation.md:L11`.
- **Under THB:** `sum(max(0, y - TT) × unit_price_thb)` over all `TT` rows in the split. Citation: `backend/models/reports/evaluation.md:L12`, `backend/models/f1_forecast/metrics.py:L143`.
- **Over THB:** `mean(max(0, origin_stock - TT)) × mean(unit_price_thb)` over all `TT` rows in the split. Citation: `backend/models/reports/evaluation.md:L13`, `backend/models/f1_forecast/metrics.py:L144`.

### 2.2 Economic Value Assumptions & Formulas
- **Primary baseline ("current practice"):** `seasonal_naive` (same week 52 weeks ago for `WEEK`, same month 12 months ago for `MONTH`, with its own 1-step-ahead residual quantiles). Comparisons against `ma_es_residual_quantile` (`F-03`/`F-04`) and `empirical_quantile` are also reported in full.
- **Under-stock reduction (`ΔUnder THB` and `%ΔUnder`):**
  $$\Delta\text{Under THB} = \text{Under THB}_{\text{baseline}} - \text{Under THB}_{\text{model}}, \qquad \%\Delta\text{Under} = \frac{\text{Under THB}_{\text{baseline}} - \text{Under THB}_{\text{model}}}{\text{Under THB}_{\text{baseline}}} \times 100\%$$
- **Over-stock reduction (`ΔOver THB` and `%ΔOver`):**
  $$\Delta\text{Over THB} = \text{Over THB}_{\text{baseline}} - \text{Over THB}_{\text{model}}, \qquad \%\Delta\text{Over} = \frac{\text{Over THB}_{\text{baseline}} - \text{Over THB}_{\text{model}}}{\text{Over THB}_{\text{baseline}}} \times 100\%$$
- **Period-adjusted Holding Cost Saving (`Holding Saving THB`):**
  - Annual holding rate $r \in \{15\%, 20\%, 25\%\}$ (base $r = 20\%$) is converted to the forecast period via $P = 52$ (`WEEK`) or $P = 12$ (`MONTH`):
  $$\text{Holding Cost}_{\text{method}} = \text{Over THB}_{\text{method}} \times \frac{r}{P}, \qquad \text{Holding Saving THB} = \Delta\text{Over THB} \times \frac{r}{P}$$
- **Rate Changes (percentage points, `pp`):**
  $$\Delta\text{Stock-out Rate (pp)} = (\text{stockout\_rate}_{\text{model}} - \text{stockout\_rate}_{\text{baseline}}) \times 100$$
  $$\Delta\text{Overstock Rate (pp)} = (\text{overstock\_rate}_{\text{model}} - \text{overstock\_rate}_{\text{baseline}}) \times 100$$
- **Net Value (`THB`):**
  $$\text{Net Value (THB)} = \left(\text{shortage\_weight} \times \Delta\text{Under THB}\right) + \text{Holding Saving THB}$$
  where $\text{shortage\_weight} \in \{0.5, 1.0, 2.0\}$ (base $= 1.0$).
- **Break-even `shortage_weight` ($w^*$):**
  $$w^* = -\frac{\text{Holding Saving THB}}{\Delta\text{Under THB}} = \frac{(r / P) \times (\text{Over THB}_{\text{model}} - \text{Over THB}_{\text{baseline}})}{\text{Under THB}_{\text{baseline}} - \text{Under THB}_{\text{model}}}$$
  *(Note: When $\Delta\text{Under THB} < 0$ and $\text{Holding Saving THB} < 0$, the algebraic ratio $w^*$ is negative, meaning the model is strictly dominated on both terms and **no positive `shortage_weight > 0` can yield a positive Net Value**.)*

### 2.3 Citation of Repo's Existing Holding-Cost Definition (`F-31` / `ASM-40`) & Scaling Flag
1. **Repo specification (`specification/04-rules-formulas.md:L525-L532` F-31 & `specification/01-foundation.md:L217` ASM-40):**
   - Defines `overstock_reduction = (baseline_avg_excess_value - current_avg_excess_value) × holding_cost_rate (default 0.10/yr, pro-rated)`.
   - **Difference #1 (Rate):** `ASM-40` / `F-31` uses a default annual holding cost rate of **10%/yr** (`0.10`), whereas this analysis uses the requested sensitivity grid **15%, 20% (base), 25%/yr** pro-rated by `/52` (weekly) and `/12` (monthly).
   - **Difference #2 (`Over THB` vs `Under THB` aggregation scale in `f1_forecast/metrics.py:L143-L144`):**
     - `Under THB = sum(max(0, y - TT) * unit_price)` sums across **all `TT` rows** in the evaluation split (`4,368` series-weeks in `WEEK` = `156 V/E series × 28 weeks`; `1,872` series-months in `MONTH` = `156 V/E series × 12 months`).
     - `Over THB = mean(max(0, stock - TT)) * mean(price)` is a **per-row mean** (the unweighted average excess units per series-period multiplied by the unweighted average unit price across rows), **not** summed across the `156` series or `28`/`12` periods, and **not** the mean of row-level products `mean(max(0, stock - TT) * price)`. Per the task rules, we use `Over THB` and `Under THB` **unchanged** from `reports/evaluation.md` and `reports/calibration.md`, and report the exact row-level `sum(max(0, stock - TT) * price)` in Section 3.1 so the scaling difference is transparent.

---

## 3. Input Data & Source Citations (`MOCK DATA`)

| Granularity | Split | Row Filter | Method / Variant | Rows | TT Rows | Stock-out Rate | Overstock Rate | Under THB | Over THB | Source Citation |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---|
| WEEK | test | `all_rows` | `lgbm_quantile_wk` | 4,648 | 4,368 | 0.0884 | 0.7434 | 232,464.83 | 250,714.55 | `reports/evaluation.md:L297 (reports/evaluation.json)` |
| WEEK | test | `all_rows` | `lgbm_quantile_wk_calibrated` | 4,648 | 4,368 | 0.0760 | 0.7390 | 210,237.63 | 249,536.53 | `reports/calibration.md:L40-L45 (reports/calibration.json:L238-L249)` |
| WEEK | test | `all_rows` | `seasonal_naive` | 4,648 | 4,368 | 0.0497 | 0.6451 | 272,610.96 | 229,916.13 | `reports/evaluation.md:L298 (reports/evaluation.json)` |
| WEEK | test | `all_rows` | `ma_es_residual_quantile` | 4,648 | 4,368 | 0.0673 | 0.7099 | 292,246.51 | 242,678.76 | `reports/evaluation.md:L299 (reports/evaluation.json)` |
| WEEK | test | `all_rows` | `empirical_quantile` | 4,648 | 4,368 | 0.0968 | 0.7395 | 370,578.06 | 248,563.75 | `reports/evaluation.md:L300 (reports/evaluation.json)` |
| WEEK | valid | `all_rows` | `lgbm_quantile_wk` | 4,648 | 4,368 | 0.0856 | 0.7438 | 172,389.73 | 237,113.77 | `reports/evaluation.md:L151 (reports/evaluation.json)` |
| WEEK | valid | `all_rows` | `seasonal_naive` | 4,648 | 4,368 | 0.0408 | 0.6355 | 68,188.43 | 210,433.96 | `reports/evaluation.md:L152 (reports/evaluation.json)` |
| WEEK | valid | `all_rows` | `ma_es_residual_quantile` | 4,648 | 4,368 | 0.0739 | 0.7177 | 150,704.53 | 230,052.92 | `reports/evaluation.md:L153 (reports/evaluation.json)` |
| WEEK | valid | `all_rows` | `empirical_quantile` | 4,648 | 4,368 | 0.0755 | 0.7250 | 167,967.72 | 231,249.43 | `reports/evaluation.md:L154 (reports/evaluation.json)` |
| MONTH | test | `all_rows` | `lgbm_quantile_mo` | 1,992 | 1,872 | 0.0897 | 0.1501 | 239,425.34 | 24,490.22 | `reports/evaluation.md:L645 (reports/evaluation.json)` |
| MONTH | test | `all_rows` | `seasonal_naive` | 1,992 | 1,872 | 0.0443 | 0.1373 | 117,431.09 | 19,185.05 | `reports/evaluation.md:L646 (reports/evaluation.json)` |
| MONTH | test | `all_rows` | `ma_es_residual_quantile` | 1,992 | 1,872 | 0.0716 | 0.1277 | 240,665.69 | 16,644.69 | `reports/evaluation.md:L647 (reports/evaluation.json)` |
| MONTH | test | `all_rows` | `empirical_quantile` | 1,992 | 1,872 | 0.1325 | 0.1448 | 489,495.84 | 24,152.21 | `reports/evaluation.md:L648 (reports/evaluation.json)` |
| MONTH | valid | `all_rows` | `lgbm_quantile_mo` | 1,992 | 1,872 | 0.0780 | 0.1571 | 173,104.42 | 60,795.77 | `reports/evaluation.md:L499 (reports/evaluation.json)` |
| MONTH | valid | `all_rows` | `seasonal_naive` | 1,992 | 1,872 | 0.0438 | 0.1528 | 152,955.72 | 52,074.98 | `reports/evaluation.md:L500 (reports/evaluation.json)` |
| MONTH | valid | `all_rows` | `ma_es_residual_quantile` | 1,992 | 1,872 | 0.0710 | 0.1362 | 351,390.94 | 49,709.82 | `reports/evaluation.md:L501 (reports/evaluation.json)` |
| MONTH | valid | `all_rows` | `empirical_quantile` | 1,992 | 1,872 | 0.0956 | 0.1522 | 404,765.61 | 53,688.06 | `reports/evaluation.md:L502 (reports/evaluation.json)` |
| WEEK | test | `no_stockout_rows` | `lgbm_quantile_wk` | 4,557 | 4,280 | 0.0883 | 0.7575 | 222,383.92 | 253,018.30 | `reports/evaluation.md:L301 (reports/evaluation.json)` |
| WEEK | test | `no_stockout_rows` | `seasonal_naive` | 4,557 | 4,280 | 0.0474 | 0.6565 | 229,337.24 | 232,019.55 | `reports/evaluation.md:L302 (reports/evaluation.json)` |
| WEEK | test | `no_stockout_rows` | `ma_es_residual_quantile` | 4,557 | 4,280 | 0.0654 | 0.7234 | 266,442.09 | 244,912.59 | `reports/evaluation.md:L303 (reports/evaluation.json)` |
| WEEK | test | `no_stockout_rows` | `empirical_quantile` | 4,557 | 4,280 | 0.0970 | 0.7533 | 360,279.78 | 250,849.45 | `reports/evaluation.md:L304 (reports/evaluation.json)` |
| WEEK | valid | `no_stockout_rows` | `lgbm_quantile_wk` | 4,604 | 4,327 | 0.0860 | 0.7506 | 171,153.94 | 238,467.95 | `reports/evaluation.md:L155 (reports/evaluation.json)` |
| WEEK | valid | `no_stockout_rows` | `seasonal_naive` | 4,604 | 4,327 | 0.0404 | 0.6413 | 67,768.67 | 211,635.74 | `reports/evaluation.md:L156 (reports/evaluation.json)` |
| WEEK | valid | `no_stockout_rows` | `ma_es_residual_quantile` | 4,604 | 4,327 | 0.0740 | 0.7243 | 150,227.98 | 231,366.12 | `reports/evaluation.md:L157 (reports/evaluation.json)` |
| WEEK | valid | `no_stockout_rows` | `empirical_quantile` | 4,604 | 4,327 | 0.0756 | 0.7317 | 166,495.76 | 232,569.05 | `reports/evaluation.md:L158 (reports/evaluation.json)` |
| MONTH | test | `no_stockout_rows` | `lgbm_quantile_mo` | 1,898 | 1,783 | 0.0875 | 0.1548 | 188,228.13 | 22,342.44 | `reports/evaluation.md:L649 (reports/evaluation.json)` |
| MONTH | test | `no_stockout_rows` | `seasonal_naive` | 1,898 | 1,783 | 0.0443 | 0.1413 | 77,024.75 | 16,940.78 | `reports/evaluation.md:L650 (reports/evaluation.json)` |
| MONTH | test | `no_stockout_rows` | `ma_es_residual_quantile` | 1,898 | 1,783 | 0.0684 | 0.1324 | 130,530.74 | 14,537.32 | `reports/evaluation.md:L651 (reports/evaluation.json)` |
| MONTH | test | `no_stockout_rows` | `empirical_quantile` | 1,898 | 1,783 | 0.1312 | 0.1492 | 438,762.05 | 22,063.48 | `reports/evaluation.md:L652 (reports/evaluation.json)` |
| MONTH | valid | `no_stockout_rows` | `lgbm_quantile_mo` | 1,875 | 1,765 | 0.0731 | 0.1649 | 103,191.60 | 63,560.73 | `reports/evaluation.md:L503 (reports/evaluation.json)` |
| MONTH | valid | `no_stockout_rows` | `seasonal_naive` | 1,875 | 1,765 | 0.0408 | 0.1598 | 93,469.15 | 55,135.63 | `reports/evaluation.md:L504 (reports/evaluation.json)` |
| MONTH | valid | `no_stockout_rows` | `ma_es_residual_quantile` | 1,875 | 1,765 | 0.0674 | 0.1428 | 152,496.04 | 51,537.65 | `reports/evaluation.md:L505 (reports/evaluation.json)` |
| MONTH | valid | `no_stockout_rows` | `empirical_quantile` | 1,875 | 1,765 | 0.0941 | 0.1598 | 355,028.25 | 56,306.37 | `reports/evaluation.md:L506 (reports/evaluation.json)` |

### 3.1 Verification of Saved Row-Level Parquets vs. Frozen Reports

| Granularity | Split | Method | Reported Under THB | Recomputed Under THB | Reported Over THB (`mean×mean`) | Recomputed Over THB (`mean×mean`) | Exact Row Mean `mean(excess×price)` | Exact Row Sum `sum(excess×price)` | Max Diff | Matches |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| WEEK | test | `lgbm_quantile_wk` | 232,464.83 | 232,464.83 | 250,714.55 | 250,714.55 | 13,174.65 | 57,546,876.74 | 0.000000 | **True** |
| WEEK | test | `lgbm_quantile_wk_calibrated` | 210,237.63 | 210,237.63 | 249,536.53 | 249,536.53 | 13,121.19 | 57,313,372.34 | 0.000000 | **True** |
| WEEK | valid | `lgbm_quantile_wk` | 172,389.73 | 172,389.73 | 237,113.77 | 237,113.77 | 14,452.27 | 63,127,496.23 | 0.000000 | **True** |
| MONTH | test | `lgbm_quantile_mo` | 239,425.34 | 239,425.34 | 24,490.22 | 24,490.22 | 4,986.41 | 9,334,558.17 | 0.000000 | **True** |
| MONTH | valid | `lgbm_quantile_mo` | 173,104.42 | 173,104.42 | 60,795.77 | 60,795.77 | 6,057.83 | 11,340,265.70 | 0.000000 | **True** |

---

## 4. Base-Case Value Summary (`holding_rate = 20%/yr`, `shortage_weight = 1.0`, `MOCK DATA`)

Formulas:
- `ΔUnder THB = Baseline Under THB - Model Under THB` (`+` = model reduces shortage exposure)
- `ΔOver THB = Baseline Over THB - Model Over THB` (`+` = model reduces over-holding exposure; `-` = model increases over-holding exposure)
- `Holding Saving THB = ΔOver THB × (0.20 / 52)` for `WEEK`, `ΔOver THB × (0.20 / 12)` for `MONTH`
- `Net Value THB = (1.0 × ΔUnder THB) + Holding Saving THB`

### 4.1 Primary Split (`test`, `all_rows`) and Secondary Split (`valid`, `all_rows`)

| Granularity | Split | Model Variant | Baseline (`*` = Primary) | ΔUnder THB | %ΔUnder | ΔOver THB | %ΔOver | Holding Saving (THB) | ΔStock-out (pp) | ΔOverstock (pp) | Net Value (THB) | Model Wins? |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| WEEK | test | `lgbm_quantile_wk` | `seasonal_naive`* | +40,146.13 | +14.73% | -20,798.42 | -9.05% | -79.99 | +3.87 pp | +9.83 pp | **+40,066.14** | **YES** |
| WEEK | test | `lgbm_quantile_wk` | `ma_es_residual_quantile` | +59,781.68 | +20.46% | -8,035.79 | -3.31% | -30.91 | +2.11 pp | +3.35 pp | **+59,750.77** | **YES** |
| WEEK | test | `lgbm_quantile_wk` | `empirical_quantile` | +138,113.23 | +37.27% | -2,150.80 | -0.87% | -8.27 | -0.84 pp | +0.39 pp | **+138,104.96** | **YES** |
| WEEK | test | `lgbm_quantile_wk_calibrated` | `seasonal_naive`* | +62,373.33 | +22.88% | -19,620.40 | -8.53% | -75.46 | +2.63 pp | +9.39 pp | **+62,297.87** | **YES** |
| WEEK | test | `lgbm_quantile_wk_calibrated` | `ma_es_residual_quantile` | +82,008.88 | +28.06% | -6,857.77 | -2.83% | -26.38 | +0.87 pp | +2.91 pp | **+81,982.50** | **YES** |
| WEEK | test | `lgbm_quantile_wk_calibrated` | `empirical_quantile` | +160,340.43 | +43.27% | -972.78 | -0.39% | -3.74 | -2.08 pp | -0.05 pp | **+160,336.69** | **YES** |
| WEEK | valid | `lgbm_quantile_wk` | `seasonal_naive`* | -104,201.30 | -152.81% | -26,679.81 | -12.68% | -102.61 | +4.48 pp | +10.83 pp | **-104,303.91** | **NO** |
| WEEK | valid | `lgbm_quantile_wk` | `ma_es_residual_quantile` | -21,685.20 | -14.39% | -7,060.85 | -3.07% | -27.16 | +1.17 pp | +2.61 pp | **-21,712.36** | **NO** |
| WEEK | valid | `lgbm_quantile_wk` | `empirical_quantile` | -4,422.01 | -2.63% | -5,864.34 | -2.54% | -22.56 | +1.01 pp | +1.88 pp | **-4,444.57** | **NO** |
| MONTH | test | `lgbm_quantile_mo` | `seasonal_naive`* | -121,994.25 | -103.89% | -5,305.17 | -27.65% | -88.42 | +4.54 pp | +1.28 pp | **-122,082.67** | **NO** |
| MONTH | test | `lgbm_quantile_mo` | `ma_es_residual_quantile` | +1,240.35 | +0.52% | -7,845.53 | -47.14% | -130.76 | +1.81 pp | +2.24 pp | **+1,109.59** | **YES** |
| MONTH | test | `lgbm_quantile_mo` | `empirical_quantile` | +250,070.50 | +51.09% | -338.01 | -1.40% | -5.63 | -4.28 pp | +0.53 pp | **+250,064.87** | **YES** |
| MONTH | valid | `lgbm_quantile_mo` | `seasonal_naive`* | -20,148.70 | -13.17% | -8,720.79 | -16.75% | -145.35 | +3.42 pp | +0.43 pp | **-20,294.05** | **NO** |
| MONTH | valid | `lgbm_quantile_mo` | `ma_es_residual_quantile` | +178,286.52 | +50.74% | -11,085.95 | -22.30% | -184.77 | +0.70 pp | +2.09 pp | **+178,101.75** | **YES** |
| MONTH | valid | `lgbm_quantile_mo` | `empirical_quantile` | +231,661.19 | +57.23% | -7,107.71 | -13.24% | -118.46 | -1.76 pp | +0.49 pp | **+231,542.73** | **YES** |

### 4.2 Uncensored Filter Check (`no_stockout_rows`, Base Scenario `holding_rate = 20%/yr`, `shortage_weight = 1.0`)

| Granularity | Split | Model Variant | Baseline (`*` = Primary) | ΔUnder THB | %ΔUnder | ΔOver THB | %ΔOver | Holding Saving (THB) | ΔStock-out (pp) | ΔOverstock (pp) | Net Value (THB) | Model Wins? |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| WEEK | test | `lgbm_quantile_wk` | `seasonal_naive`* | +6,953.32 | +3.03% | -20,998.75 | -9.05% | -80.76 | +4.09 pp | +10.10 pp | **+6,872.56** | **YES** |
| WEEK | test | `lgbm_quantile_wk` | `ma_es_residual_quantile` | +44,058.17 | +16.54% | -8,105.71 | -3.31% | -31.18 | +2.29 pp | +3.41 pp | **+44,026.99** | **YES** |
| WEEK | test | `lgbm_quantile_wk` | `empirical_quantile` | +137,895.86 | +38.27% | -2,168.85 | -0.86% | -8.34 | -0.87 pp | +0.42 pp | **+137,887.52** | **YES** |
| WEEK | valid | `lgbm_quantile_wk` | `seasonal_naive`* | -103,385.27 | -152.56% | -26,832.21 | -12.68% | -103.20 | +4.56 pp | +10.93 pp | **-103,488.47** | **NO** |
| WEEK | valid | `lgbm_quantile_wk` | `ma_es_residual_quantile` | -20,925.96 | -13.93% | -7,101.83 | -3.07% | -27.31 | +1.20 pp | +2.63 pp | **-20,953.27** | **NO** |
| WEEK | valid | `lgbm_quantile_wk` | `empirical_quantile` | -4,658.18 | -2.80% | -5,898.90 | -2.54% | -22.69 | +1.04 pp | +1.89 pp | **-4,680.87** | **NO** |
| MONTH | test | `lgbm_quantile_mo` | `seasonal_naive`* | -111,203.38 | -144.37% | -5,401.66 | -31.89% | -90.03 | +4.32 pp | +1.35 pp | **-111,293.41** | **NO** |
| MONTH | test | `lgbm_quantile_mo` | `ma_es_residual_quantile` | -57,697.39 | -44.20% | -7,805.12 | -53.69% | -130.09 | +1.91 pp | +2.24 pp | **-57,827.48** | **NO** |
| MONTH | test | `lgbm_quantile_mo` | `empirical_quantile` | +250,533.92 | +57.10% | -278.96 | -1.26% | -4.65 | -4.37 pp | +0.56 pp | **+250,529.27** | **YES** |
| MONTH | valid | `lgbm_quantile_mo` | `seasonal_naive`* | -9,722.45 | -10.40% | -8,425.10 | -15.28% | -140.42 | +3.23 pp | +0.51 pp | **-9,862.87** | **NO** |
| MONTH | valid | `lgbm_quantile_mo` | `ma_es_residual_quantile` | +49,304.44 | +32.33% | -12,023.08 | -23.33% | -200.38 | +0.57 pp | +2.21 pp | **+49,104.06** | **YES** |
| MONTH | valid | `lgbm_quantile_mo` | `empirical_quantile` | +251,836.65 | +70.93% | -7,254.36 | -12.88% | -120.91 | -2.10 pp | +0.51 pp | **+251,715.74** | **YES** |

*Note on `MONTH / test` (`no_stockout_rows`): When stock-out-censored target months are excluded (leaving 1,898 common rows, 1,783 TT rows), `lgbm_quantile_mo` also loses to `ma_es_residual_quantile` (`Under THB` 188,228.13 vs. 130,530.74, `Net Value = -57,827.48 THB`), whereas on `all_rows` (1,992 rows) `lgbm_quantile_mo` edges out `ma_es_residual_quantile` by `+1,109.59 THB`.*

---

## 5. Sensitivity Analysis Grid (`holding_rate ∈ {15%, 20%, 25%}` × `shortage_weight ∈ {0.5, 1.0, 2.0}`, `all_rows`, `MOCK DATA`)

| Granularity | Split | Model Variant | Holding Rate (Annual -> Period) | Shortage Weight | Net Value vs `seasonal_naive`* (THB) | Net Value vs `ma_es_residual_quantile` (THB) | Net Value vs `empirical_quantile` (THB) | Sign Changed vs Base? | Ranking Changed vs Base? |
|---|---|---|---|---:|---:|---:|---:|---|---|
| WEEK | test | `lgbm_quantile_wk` | 15% (0.2885%/wk) | 0.5 | +20,013.07 | +29,867.66 | +69,050.41 | No | No |
| WEEK | test | `lgbm_quantile_wk` | 15% (0.2885%/wk) | 1.0 | +40,086.13 | +59,758.50 | +138,107.03 | No | No |
| WEEK | test | `lgbm_quantile_wk` | 15% (0.2885%/wk) | 2.0 | +80,232.26 | +119,540.18 | +276,220.26 | No | No |
| WEEK | test | `lgbm_quantile_wk` | 20% (0.3846%/wk) | 0.5 | +19,993.07 | +29,859.93 | +69,048.34 | No | No |
| WEEK | test | `lgbm_quantile_wk` | 20% (0.3846%/wk) **[BASE]** | 1.0 | +40,066.14 | +59,750.77 | +138,104.96 | No | No |
| WEEK | test | `lgbm_quantile_wk` | 20% (0.3846%/wk) | 2.0 | +80,212.27 | +119,532.45 | +276,218.19 | No | No |
| WEEK | test | `lgbm_quantile_wk` | 25% (0.4808%/wk) | 0.5 | +19,973.07 | +29,852.21 | +69,046.27 | No | No |
| WEEK | test | `lgbm_quantile_wk` | 25% (0.4808%/wk) | 1.0 | +40,046.14 | +59,743.05 | +138,102.89 | No | No |
| WEEK | test | `lgbm_quantile_wk` | 25% (0.4808%/wk) | 2.0 | +80,192.27 | +119,524.73 | +276,216.12 | No | No |
| WEEK | test | `lgbm_quantile_wk_calibrated` | 15% (0.2885%/wk) | 0.5 | +31,130.07 | +40,984.66 | +80,167.41 | No | No |
| WEEK | test | `lgbm_quantile_wk_calibrated` | 15% (0.2885%/wk) | 1.0 | +62,316.73 | +81,989.10 | +160,337.62 | No | No |
| WEEK | test | `lgbm_quantile_wk_calibrated` | 15% (0.2885%/wk) | 2.0 | +124,690.06 | +163,997.98 | +320,678.05 | No | No |
| WEEK | test | `lgbm_quantile_wk_calibrated` | 20% (0.3846%/wk) | 0.5 | +31,111.20 | +40,978.06 | +80,166.47 | No | No |
| WEEK | test | `lgbm_quantile_wk_calibrated` | 20% (0.3846%/wk) **[BASE]** | 1.0 | +62,297.87 | +81,982.50 | +160,336.69 | No | No |
| WEEK | test | `lgbm_quantile_wk_calibrated` | 20% (0.3846%/wk) | 2.0 | +124,671.20 | +163,991.38 | +320,677.12 | No | No |
| WEEK | test | `lgbm_quantile_wk_calibrated` | 25% (0.4808%/wk) | 0.5 | +31,092.34 | +40,971.47 | +80,165.54 | No | No |
| WEEK | test | `lgbm_quantile_wk_calibrated` | 25% (0.4808%/wk) | 1.0 | +62,279.00 | +81,975.91 | +160,335.75 | No | No |
| WEEK | test | `lgbm_quantile_wk_calibrated` | 25% (0.4808%/wk) | 2.0 | +124,652.33 | +163,984.79 | +320,676.18 | No | No |
| WEEK | valid | `lgbm_quantile_wk` | 15% (0.2885%/wk) | 0.5 | -52,177.61 | -10,862.97 | -2,227.92 | No | No |
| WEEK | valid | `lgbm_quantile_wk` | 15% (0.2885%/wk) | 1.0 | -104,278.26 | -21,705.57 | -4,438.93 | No | No |
| WEEK | valid | `lgbm_quantile_wk` | 15% (0.2885%/wk) | 2.0 | -208,479.56 | -43,390.77 | -8,860.94 | No | No |
| WEEK | valid | `lgbm_quantile_wk` | 20% (0.3846%/wk) | 0.5 | -52,203.26 | -10,869.76 | -2,233.56 | No | No |
| WEEK | valid | `lgbm_quantile_wk` | 20% (0.3846%/wk) **[BASE]** | 1.0 | -104,303.91 | -21,712.36 | -4,444.57 | No | No |
| WEEK | valid | `lgbm_quantile_wk` | 20% (0.3846%/wk) | 2.0 | -208,505.21 | -43,397.56 | -8,866.58 | No | No |
| WEEK | valid | `lgbm_quantile_wk` | 25% (0.4808%/wk) | 0.5 | -52,228.92 | -10,876.55 | -2,239.20 | No | No |
| WEEK | valid | `lgbm_quantile_wk` | 25% (0.4808%/wk) | 1.0 | -104,329.57 | -21,719.15 | -4,450.20 | No | No |
| WEEK | valid | `lgbm_quantile_wk` | 25% (0.4808%/wk) | 2.0 | -208,530.87 | -43,404.35 | -8,872.21 | No | No |
| MONTH | test | `lgbm_quantile_mo` | 15% (1.2500%/mo) | 0.5 | -61,063.44 | +522.11 | +125,031.02 | No | No |
| MONTH | test | `lgbm_quantile_mo` | 15% (1.2500%/mo) | 1.0 | -122,060.56 | +1,142.28 | +250,066.27 | No | No |
| MONTH | test | `lgbm_quantile_mo` | 15% (1.2500%/mo) | 2.0 | -244,054.81 | +2,382.63 | +500,136.77 | No | No |
| MONTH | test | `lgbm_quantile_mo` | 20% (1.6667%/mo) | 0.5 | -61,085.54 | +489.42 | +125,029.62 | No | No |
| MONTH | test | `lgbm_quantile_mo` | 20% (1.6667%/mo) **[BASE]** | 1.0 | -122,082.67 | +1,109.59 | +250,064.87 | No | No |
| MONTH | test | `lgbm_quantile_mo` | 20% (1.6667%/mo) | 2.0 | -244,076.92 | +2,349.94 | +500,135.37 | No | No |
| MONTH | test | `lgbm_quantile_mo` | 25% (2.0833%/mo) | 0.5 | -61,107.65 | +456.73 | +125,028.21 | No | No |
| MONTH | test | `lgbm_quantile_mo` | 25% (2.0833%/mo) | 1.0 | -122,104.77 | +1,076.90 | +250,063.46 | No | No |
| MONTH | test | `lgbm_quantile_mo` | 25% (2.0833%/mo) | 2.0 | -244,099.02 | +2,317.25 | +500,133.96 | No | No |
| MONTH | valid | `lgbm_quantile_mo` | 15% (1.2500%/mo) | 0.5 | -10,183.36 | +89,004.69 | +115,741.75 | No | No |
| MONTH | valid | `lgbm_quantile_mo` | 15% (1.2500%/mo) | 1.0 | -20,257.71 | +178,147.95 | +231,572.34 | No | No |
| MONTH | valid | `lgbm_quantile_mo` | 15% (1.2500%/mo) | 2.0 | -40,406.41 | +356,434.47 | +463,233.53 | No | No |
| MONTH | valid | `lgbm_quantile_mo` | 20% (1.6667%/mo) | 0.5 | -10,219.70 | +88,958.49 | +115,712.13 | No | No |
| MONTH | valid | `lgbm_quantile_mo` | 20% (1.6667%/mo) **[BASE]** | 1.0 | -20,294.05 | +178,101.75 | +231,542.73 | No | No |
| MONTH | valid | `lgbm_quantile_mo` | 20% (1.6667%/mo) | 2.0 | -40,442.75 | +356,388.27 | +463,203.92 | No | No |
| MONTH | valid | `lgbm_quantile_mo` | 25% (2.0833%/mo) | 0.5 | -10,256.03 | +88,912.30 | +115,682.52 | No | No |
| MONTH | valid | `lgbm_quantile_mo` | 25% (2.0833%/mo) | 1.0 | -20,330.38 | +178,055.56 | +231,513.11 | No | No |
| MONTH | valid | `lgbm_quantile_mo` | 25% (2.0833%/mo) | 2.0 | -40,479.08 | +356,342.08 | +463,174.30 | No | No |

---

## 6. Break-Even `shortage_weight` Table (`Net Value = 0`, `all_rows`, `MOCK DATA`)

Formula: $w^* = \frac{(\text{holding\_rate} / P) \times (\text{Over THB}_{\text{model}} - \text{Over THB}_{\text{baseline}})}{\text{Under THB}_{\text{baseline}} - \text{Under THB}_{\text{model}}}$

| Granularity | Split | Model Variant | Baseline (`*` = Primary) | ΔUnder THB | ΔOver THB | Algebraic $w^*$ (`r=15%`) | Algebraic $w^*$ (`r=20%` Base) | Algebraic $w^*$ (`r=25%`) | Operational Interpretation |
|---|---|---|---|---:|---:|---:|---:|---:|---|
| WEEK | test | `lgbm_quantile_wk` | `seasonal_naive`* | +40,146.13 | -20,798.42 | +0.001494 | **+0.001993** | +0.002491 | Model wins for any `shortage_weight > 0.0020` (at base r=20%) |
| WEEK | test | `lgbm_quantile_wk` | `ma_es_residual_quantile` | +59,781.68 | -8,035.79 | +0.000388 | **+0.000517** | +0.000646 | Model wins for any `shortage_weight > 0.0005` (at base r=20%) |
| WEEK | test | `lgbm_quantile_wk` | `empirical_quantile` | +138,113.23 | -2,150.80 | +0.000045 | **+0.000060** | +0.000075 | Model wins for any `shortage_weight > 0.0001` (at base r=20%) |
| WEEK | test | `lgbm_quantile_wk_calibrated` | `seasonal_naive`* | +62,373.33 | -19,620.40 | +0.000907 | **+0.001210** | +0.001512 | Model wins for any `shortage_weight > 0.0012` (at base r=20%) |
| WEEK | test | `lgbm_quantile_wk_calibrated` | `ma_es_residual_quantile` | +82,008.88 | -6,857.77 | +0.000241 | **+0.000322** | +0.000402 | Model wins for any `shortage_weight > 0.0003` (at base r=20%) |
| WEEK | test | `lgbm_quantile_wk_calibrated` | `empirical_quantile` | +160,340.43 | -972.78 | +0.000018 | **+0.000023** | +0.000029 | Model wins for any `shortage_weight > 0.0000` (at base r=20%) |
| WEEK | valid | `lgbm_quantile_wk` | `seasonal_naive`* | -104,201.30 | -26,679.81 | -0.000739 | **-0.000985** | -0.001231 | **DOMINATED:** Model has higher Under THB AND higher Over THB; loses for all `w > 0` |
| WEEK | valid | `lgbm_quantile_wk` | `ma_es_residual_quantile` | -21,685.20 | -7,060.85 | -0.000939 | **-0.001252** | -0.001565 | **DOMINATED:** Model has higher Under THB AND higher Over THB; loses for all `w > 0` |
| WEEK | valid | `lgbm_quantile_wk` | `empirical_quantile` | -4,422.01 | -5,864.34 | -0.003825 | **-0.005101** | -0.006376 | **DOMINATED:** Model has higher Under THB AND higher Over THB; loses for all `w > 0` |
| MONTH | test | `lgbm_quantile_mo` | `seasonal_naive`* | -121,994.25 | -5,305.17 | -0.000544 | **-0.000725** | -0.000906 | **DOMINATED:** Model has higher Under THB AND higher Over THB; loses for all `w > 0` |
| MONTH | test | `lgbm_quantile_mo` | `ma_es_residual_quantile` | +1,240.35 | -7,845.53 | +0.079066 | **+0.105421** | +0.131776 | Model wins for any `shortage_weight > 0.1054` (at base r=20%) |
| MONTH | test | `lgbm_quantile_mo` | `empirical_quantile` | +250,070.50 | -338.01 | +0.000017 | **+0.000023** | +0.000028 | Model wins for any `shortage_weight > 0.0000` (at base r=20%) |
| MONTH | valid | `lgbm_quantile_mo` | `seasonal_naive`* | -20,148.70 | -8,720.79 | -0.005410 | **-0.007214** | -0.009017 | **DOMINATED:** Model has higher Under THB AND higher Over THB; loses for all `w > 0` |
| MONTH | valid | `lgbm_quantile_mo` | `ma_es_residual_quantile` | +178,286.52 | -11,085.95 | +0.000777 | **+0.001036** | +0.001295 | Model wins for any `shortage_weight > 0.0010` (at base r=20%) |
| MONTH | valid | `lgbm_quantile_mo` | `empirical_quantile` | +231,661.19 | -7,107.71 | +0.000384 | **+0.000511** | +0.000639 | Model wins for any `shortage_weight > 0.0005` (at base r=20%) |

---

## 7. Newsvendor Critical-Fractile Consistency Check (`τ = Cu / (Cu + Co)`)

Under the classical single-period newsvendor model per 1 THB of unit price:
- Underage penalty per THB: $C_u = \text{shortage\_weight}$
- Period holding cost per THB: $C_o = \text{holding\_rate} / P$, where $P = 52$ (`WEEK`) or $P = 12$ (`MONTH`)
- Implied critical fractile: $\tau_{\text{implied}} = \frac{C_u}{C_u + C_o}$
- Configured Total Target service levels (`config/forecast.yaml:L191`): **V = 0.9500**, **E = 0.9000** (row-weighted nominal $= 0.9256$).

| Granularity | Holding Rate (Annual) | Period $C_o = r / P$ | Shortage Weight $C_u$ | Implied $\tau = C_u / (C_u + C_o)$ | Configured $\tau_V = 0.95$ Mismatch ($\tau_{\text{implied}} - 0.95$) | Configured $\tau_E = 0.90$ Mismatch ($\tau_{\text{implied}} - 0.90$) | $C_u$ Required to Match $\tau_V=0.95$ ($19 C_o$) | $C_u$ Required to Match $\tau_E=0.90$ ($9 C_o$) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| WEEK | 15% | 0.002885 | 0.5 | **0.9943** | +0.0443 | +0.0943 | 0.0548 | 0.0260 |
| WEEK | 15% | 0.002885 | 1.0 | **0.9971** | +0.0471 | +0.0971 | 0.0548 | 0.0260 |
| WEEK | 15% | 0.002885 | 2.0 | **0.9986** | +0.0486 | +0.0986 | 0.0548 | 0.0260 |
| WEEK | 20% | 0.003846 | 0.5 | **0.9924** | +0.0424 | +0.0924 | 0.0731 | 0.0346 |
| WEEK | 20% | 0.003846 | 1.0 | **0.9962** | +0.0462 | +0.0962 | 0.0731 | 0.0346 |
| WEEK | 20% | 0.003846 | 2.0 | **0.9981** | +0.0481 | +0.0981 | 0.0731 | 0.0346 |
| WEEK | 25% | 0.004808 | 0.5 | **0.9905** | +0.0405 | +0.0905 | 0.0913 | 0.0433 |
| WEEK | 25% | 0.004808 | 1.0 | **0.9952** | +0.0452 | +0.0952 | 0.0913 | 0.0433 |
| WEEK | 25% | 0.004808 | 2.0 | **0.9976** | +0.0476 | +0.0976 | 0.0913 | 0.0433 |
| MONTH | 15% | 0.012500 | 0.5 | **0.9756** | +0.0256 | +0.0756 | 0.2375 | 0.1125 |
| MONTH | 15% | 0.012500 | 1.0 | **0.9877** | +0.0377 | +0.0877 | 0.2375 | 0.1125 |
| MONTH | 15% | 0.012500 | 2.0 | **0.9938** | +0.0438 | +0.0938 | 0.2375 | 0.1125 |
| MONTH | 20% | 0.016667 | 0.5 | **0.9677** | +0.0177 | +0.0677 | 0.3167 | 0.1500 |
| MONTH | 20% | 0.016667 | 1.0 | **0.9836** | +0.0336 | +0.0836 | 0.3167 | 0.1500 |
| MONTH | 20% | 0.016667 | 2.0 | **0.9917** | +0.0417 | +0.0917 | 0.3167 | 0.1500 |
| MONTH | 25% | 0.020833 | 0.5 | **0.9600** | +0.0100 | +0.0600 | 0.3958 | 0.1875 |
| MONTH | 25% | 0.020833 | 1.0 | **0.9796** | +0.0296 | +0.0796 | 0.3958 | 0.1875 |
| MONTH | 25% | 0.020833 | 2.0 | **0.9897** | +0.0397 | +0.0897 | 0.3958 | 0.1875 |

**Mismatch Flag:**
- Across all 9 grid cells, $\tau_{\text{implied}}$ ranges from **0.9905 to 0.9986** for `WEEK` and **0.9600 to 0.9938** for `MONTH` — substantially higher than the configured service levels **V = 0.95** and **E = 0.90**.
- Equivalently, at base `holding_rate = 20%/yr`, the configured service levels $\tau_V = 0.95$ ($C_u / C_o = 19$) and $\tau_E = 0.90$ ($C_u / C_o = 9$) correspond to an implicit `shortage_weight` of **$C_u = 0.0731$ (V) / $0.0346$ (E)** for `WEEK` and **$C_u = 0.3167$ (V) / $0.1500$ (E)** for `MONTH`.
- Per the task constraints, **service levels are kept fixed at V = P95 and E = P90**; this mismatch is reported to explain why `shortage_weight ∈ {0.5, 1.0, 2.0}` heavily penalizes any method with higher `Under THB`.

---

## 8. Breakdown by VED Class (`V`, `E`, `D`) and Price Tier (`LOW`, `MID`, `HIGH`)

Computed directly from the saved row-level parquet files (`data/model_predictions_{week,month}_{valid,test}.parquet` and `data/baseline_predictions_{week,month}.parquet`) on the common row set (`all_rows`) under the base scenario (`holding_rate = 20%/yr`, `shortage_weight = 1.0`).

- **Note on `VED = D`:** By specification (`F-06`, `evaluation.md:L9`), `D` items have **no Total Target (`TT = NaN`, `TT rows = 0`)**. Therefore `Under THB`, `Over THB`, `stock-out rate`, and `overstock rate` are undefined (`N/A`) on `D` rows.
- **Note on Additivity Across Slices:** `Under THB = sum(max(0, y - TT) × price)` is **exact and additive** across slices (`Under THB(V) + Under THB(E) = Under THB(All)`). By contrast, `Over THB = mean(max(0, stock - TT)) × mean(price)` is **non-additive** across slices because it multiplies the slice mean excess units by the slice mean unit price.

### 8.1 Breakdown by VED Class (`test` split primary, `valid` split secondary)

| Granularity | Split | Model Variant | VED | Rows | TT Rows | Baseline (`*`=Primary) | Baseline Under THB | Model Under THB | ΔUnder THB | Baseline Over THB | Model Over THB | Holding Saving (THB) | ΔStock-out (pp) | ΔOverstock (pp) | Net Value (THB) |
|---|---|---|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| WEEK | test | `lgbm_quantile_wk` | **V** | 2,240 | 2,240 | `seasonal_naive`* | 54,808.65 | 68,257.86 | -13,449.21 | 120,579.08 | 138,335.57 | -68.29 | +2.05 pp | +8.57 pp | **-13,517.50** |
| WEEK | test | `lgbm_quantile_wk` | **V** | 2,240 | 2,240 | `ma_es_residual_quantile` | 53,186.87 | 68,257.86 | -15,070.99 | 132,236.51 | 138,335.57 | -23.46 | +1.11 pp | +2.64 pp | **-15,094.45** |
| WEEK | test | `lgbm_quantile_wk` | **V** | 2,240 | 2,240 | `empirical_quantile` | 101,733.55 | 68,257.86 | +33,475.69 | 136,933.00 | 138,335.57 | -5.39 | -0.72 pp | -1.07 pp | **+33,470.30** |
| WEEK | test | `lgbm_quantile_wk` | **E** | 2,128 | 2,128 | `seasonal_naive`* | 217,802.31 | 164,206.97 | +53,595.34 | 199,853.19 | 215,361.49 | -59.65 | +5.78 pp | +11.14 pp | **+53,535.69** |
| WEEK | test | `lgbm_quantile_wk` | **E** | 2,128 | 2,128 | `ma_es_residual_quantile` | 239,059.64 | 164,206.97 | +74,852.67 | 209,083.83 | 215,361.49 | -24.14 | +3.15 pp | +4.09 pp | **+74,828.53** |
| WEEK | test | `lgbm_quantile_wk` | **E** | 2,128 | 2,128 | `empirical_quantile` | 268,844.50 | 164,206.97 | +104,637.53 | 213,594.98 | 215,361.49 | -6.79 | -0.98 pp | +1.93 pp | **+104,630.74** |
| WEEK | test | `lgbm_quantile_wk` | **D** | 280 | 0 | *(all baselines)* | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | **N/A (no TT for D)** |
| WEEK | test | `lgbm_quantile_wk_calibrated` | **V** | 2,240 | 2,240 | `seasonal_naive`* | 54,808.65 | 62,808.62 | -7,999.97 | 120,579.08 | 137,640.50 | -65.62 | +1.38 pp | +8.39 pp | **-8,065.59** |
| WEEK | test | `lgbm_quantile_wk_calibrated` | **V** | 2,240 | 2,240 | `ma_es_residual_quantile` | 53,186.87 | 62,808.62 | -9,621.75 | 132,236.51 | 137,640.50 | -20.78 | +0.44 pp | +2.46 pp | **-9,642.53** |
| WEEK | test | `lgbm_quantile_wk_calibrated` | **V** | 2,240 | 2,240 | `empirical_quantile` | 101,733.55 | 62,808.62 | +38,924.93 | 136,933.00 | 137,640.50 | -2.72 | -1.39 pp | -1.25 pp | **+38,922.21** |
| WEEK | test | `lgbm_quantile_wk_calibrated` | **E** | 2,128 | 2,128 | `seasonal_naive`* | 217,802.31 | 147,429.01 | +70,373.30 | 199,853.19 | 214,366.50 | -55.82 | +3.94 pp | +10.44 pp | **+70,317.48** |
| WEEK | test | `lgbm_quantile_wk_calibrated` | **E** | 2,128 | 2,128 | `ma_es_residual_quantile` | 239,059.64 | 147,429.01 | +91,630.63 | 209,083.83 | 214,366.50 | -20.32 | +1.31 pp | +3.39 pp | **+91,610.31** |
| WEEK | test | `lgbm_quantile_wk_calibrated` | **E** | 2,128 | 2,128 | `empirical_quantile` | 268,844.50 | 147,429.01 | +121,415.49 | 213,594.98 | 214,366.50 | -2.97 | -2.82 pp | +1.23 pp | **+121,412.52** |
| WEEK | test | `lgbm_quantile_wk_calibrated` | **D** | 280 | 0 | *(all baselines)* | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | **N/A (no TT for D)** |
| WEEK | valid | `lgbm_quantile_wk` | **V** | 2,240 | 2,240 | `seasonal_naive`* | 22,709.59 | 56,254.75 | -33,545.16 | 106,416.39 | 127,323.77 | -80.41 | +2.33 pp | +10.09 pp | **-33,625.57** |
| WEEK | valid | `lgbm_quantile_wk` | **V** | 2,240 | 2,240 | `ma_es_residual_quantile` | 40,154.34 | 56,254.75 | -16,100.41 | 121,689.88 | 127,323.77 | -21.67 | +0.45 pp | +3.57 pp | **-16,122.08** |
| WEEK | valid | `lgbm_quantile_wk` | **V** | 2,240 | 2,240 | `empirical_quantile` | 53,797.95 | 56,254.75 | -2,456.80 | 123,195.78 | 127,323.77 | -15.88 | -0.26 pp | +0.49 pp | **-2,472.68** |
| WEEK | valid | `lgbm_quantile_wk` | **E** | 2,128 | 2,128 | `seasonal_naive`* | 45,478.84 | 116,134.98 | -70,656.14 | 184,399.26 | 204,994.99 | -79.21 | +6.77 pp | +11.61 pp | **-70,735.35** |
| WEEK | valid | `lgbm_quantile_wk` | **E** | 2,128 | 2,128 | `ma_es_residual_quantile` | 110,550.19 | 116,134.98 | -5,584.79 | 199,582.10 | 204,994.99 | -20.82 | +1.93 pp | +1.60 pp | **-5,605.61** |
| WEEK | valid | `lgbm_quantile_wk` | **E** | 2,128 | 2,128 | `empirical_quantile` | 114,169.77 | 116,134.98 | -1,965.21 | 200,292.47 | 204,994.99 | -18.09 | +2.35 pp | +3.34 pp | **-1,983.30** |
| WEEK | valid | `lgbm_quantile_wk` | **D** | 280 | 0 | *(all baselines)* | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | **N/A (no TT for D)** |
| MONTH | test | `lgbm_quantile_mo` | **V** | 960 | 960 | `seasonal_naive`* | 25,371.65 | 24,831.87 | +539.78 | 9,391.15 | 16,293.29 | -115.04 | +2.61 pp | +1.46 pp | **+424.74** |
| MONTH | test | `lgbm_quantile_mo` | **V** | 960 | 960 | `ma_es_residual_quantile` | 38,179.88 | 24,831.87 | +13,348.01 | 9,267.53 | 16,293.29 | -117.10 | +0.73 pp | +1.25 pp | **+13,230.91** |
| MONTH | test | `lgbm_quantile_mo` | **V** | 960 | 960 | `empirical_quantile` | 115,353.91 | 24,831.87 | +90,522.04 | 16,740.59 | 16,293.29 | +7.45 | -5.62 pp | -1.67 pp | **+90,529.50** |
| MONTH | test | `lgbm_quantile_mo` | **E** | 912 | 912 | `seasonal_naive`* | 92,059.44 | 214,593.47 | -122,534.03 | 16,928.12 | 19,993.28 | -51.09 | +6.58 pp | +1.10 pp | **-122,585.12** |
| MONTH | test | `lgbm_quantile_mo` | **E** | 912 | 912 | `ma_es_residual_quantile` | 202,485.82 | 214,593.47 | -12,107.65 | 14,266.27 | 19,993.28 | -95.45 | +2.96 pp | +3.29 pp | **-12,203.10** |
| MONTH | test | `lgbm_quantile_mo` | **E** | 912 | 912 | `empirical_quantile` | 374,141.93 | 214,593.47 | +159,548.46 | 19,465.03 | 19,993.28 | -8.80 | -2.85 pp | +2.85 pp | **+159,539.66** |
| MONTH | test | `lgbm_quantile_mo` | **D** | 120 | 0 | *(all baselines)* | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | **N/A (no TT for D)** |
| MONTH | valid | `lgbm_quantile_mo` | **V** | 960 | 960 | `seasonal_naive`* | 34,159.96 | 27,509.66 | +6,650.30 | 9,629.43 | 12,052.79 | -40.39 | +2.18 pp | +0.20 pp | **+6,609.91** |
| MONTH | valid | `lgbm_quantile_mo` | **V** | 960 | 960 | `ma_es_residual_quantile` | 51,084.14 | 27,509.66 | +23,574.48 | 9,534.57 | 12,052.79 | -41.97 | +1.14 pp | +0.62 pp | **+23,532.51** |
| MONTH | valid | `lgbm_quantile_mo` | **V** | 960 | 960 | `empirical_quantile` | 111,370.00 | 27,509.66 | +83,860.34 | 13,476.84 | 12,052.79 | +23.73 | -2.50 pp | -2.71 pp | **+83,884.07** |
| MONTH | valid | `lgbm_quantile_mo` | **E** | 912 | 912 | `seasonal_naive`* | 118,795.76 | 145,594.76 | -26,799.00 | 51,902.25 | 60,289.81 | -139.79 | +4.72 pp | +0.65 pp | **-26,938.79** |
| MONTH | valid | `lgbm_quantile_mo` | **E** | 912 | 912 | `ma_es_residual_quantile` | 300,306.80 | 145,594.76 | +154,712.04 | 49,416.38 | 60,289.81 | -181.22 | +0.22 pp | +3.61 pp | **+154,530.82** |
| MONTH | valid | `lgbm_quantile_mo` | **E** | 912 | 912 | `empirical_quantile` | 293,395.61 | 145,594.76 | +147,800.85 | 52,177.87 | 60,289.81 | -135.20 | -0.99 pp | +3.83 pp | **+147,665.65** |
| MONTH | valid | `lgbm_quantile_mo` | **D** | 120 | 0 | *(all baselines)* | N/A | N/A | N/A | N/A | N/A | N/A | N/A | N/A | **N/A (no TT for D)** |

### 8.2 Breakdown by Price Tier (`LOW <= 50 THB`, `MID 50..1000 THB`, `HIGH >= 1000 THB`)

| Granularity | Split | Model Variant | Price Tier | Rows | TT Rows | Baseline (`*`=Primary) | Baseline Under THB | Model Under THB | ΔUnder THB | Baseline Over THB | Model Over THB | Holding Saving (THB) | ΔStock-out (pp) | ΔOverstock (pp) | Net Value (THB) |
|---|---|---|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| WEEK | test | `lgbm_quantile_wk` | **LOW** | 2,996 | 2,996 | `seasonal_naive`* | 24,127.11 | 58,999.27 | -34,872.16 | 30,857.42 | 33,649.29 | -10.74 | +4.57 pp | +9.68 pp | **-34,882.90** |
| WEEK | test | `lgbm_quantile_wk` | **LOW** | 2,996 | 2,996 | `ma_es_residual_quantile` | 35,682.41 | 58,999.27 | -23,316.86 | 32,594.00 | 33,649.29 | -4.06 | +2.83 pp | +2.84 pp | **-23,320.92** |
| WEEK | test | `lgbm_quantile_wk` | **LOW** | 2,996 | 2,996 | `empirical_quantile` | 72,083.66 | 58,999.27 | +13,084.39 | 33,375.97 | 33,649.29 | -1.05 | -0.47 pp | +0.47 pp | **+13,083.34** |
| WEEK | test | `lgbm_quantile_wk` | **MID** | 1,456 | 1,176 | `seasonal_naive`* | 220,024.20 | 149,741.18 | +70,283.02 | 21,244.63 | 23,160.31 | -7.37 | +2.55 pp | +8.93 pp | **+70,275.65** |
| WEEK | test | `lgbm_quantile_wk` | **MID** | 1,456 | 1,176 | `ma_es_residual_quantile` | 226,408.68 | 149,741.18 | +76,667.50 | 21,593.27 | 23,160.31 | -6.03 | +0.43 pp | +3.74 pp | **+76,661.47** |
| WEEK | test | `lgbm_quantile_wk` | **MID** | 1,456 | 1,176 | `empirical_quantile` | 252,715.57 | 149,741.18 | +102,974.39 | 22,374.08 | 23,160.31 | -3.02 | -1.78 pp | +0.68 pp | **+102,971.37** |
| WEEK | test | `lgbm_quantile_wk` | **HIGH** | 196 | 196 | `seasonal_naive`* | 28,459.65 | 23,724.38 | +4,735.27 | 48,601.96 | 52,367.38 | -14.48 | +1.02 pp | +17.35 pp | **+4,720.79** |
| WEEK | test | `lgbm_quantile_wk` | **HIGH** | 196 | 196 | `ma_es_residual_quantile` | 30,155.42 | 23,724.38 | +6,431.04 | 51,262.16 | 52,367.38 | -4.25 | +1.02 pp | +8.68 pp | **+6,426.79** |
| WEEK | test | `lgbm_quantile_wk` | **HIGH** | 196 | 196 | `empirical_quantile` | 45,778.82 | 23,724.38 | +22,054.44 | 54,875.64 | 52,367.38 | +9.65 | -1.02 pp | -2.55 pp | **+22,064.09** |
| WEEK | test | `lgbm_quantile_wk_calibrated` | **LOW** | 2,996 | 2,996 | `seasonal_naive`* | 24,127.11 | 49,139.76 | -25,012.65 | 30,857.42 | 33,491.13 | -10.13 | +3.07 pp | +9.28 pp | **-25,022.78** |
| WEEK | test | `lgbm_quantile_wk_calibrated` | **LOW** | 2,996 | 2,996 | `ma_es_residual_quantile` | 35,682.41 | 49,139.76 | -13,457.35 | 32,594.00 | 33,491.13 | -3.45 | +1.33 pp | +2.44 pp | **-13,460.80** |
| WEEK | test | `lgbm_quantile_wk_calibrated` | **LOW** | 2,996 | 2,996 | `empirical_quantile` | 72,083.66 | 49,139.76 | +22,943.90 | 33,375.97 | 33,491.13 | -0.44 | -1.97 pp | +0.07 pp | **+22,943.46** |
| WEEK | test | `lgbm_quantile_wk_calibrated` | **MID** | 1,456 | 1,176 | `seasonal_naive`* | 220,024.20 | 137,835.00 | +82,189.20 | 21,244.63 | 23,050.70 | -6.95 | +1.78 pp | +8.33 pp | **+82,182.25** |
| WEEK | test | `lgbm_quantile_wk_calibrated` | **MID** | 1,456 | 1,176 | `ma_es_residual_quantile` | 226,408.68 | 137,835.00 | +88,573.68 | 21,593.27 | 23,050.70 | -5.61 | -0.34 pp | +3.14 pp | **+88,568.07** |
| WEEK | test | `lgbm_quantile_wk_calibrated` | **MID** | 1,456 | 1,176 | `empirical_quantile` | 252,715.57 | 137,835.00 | +114,880.57 | 22,374.08 | 23,050.70 | -2.60 | -2.55 pp | +0.08 pp | **+114,877.97** |
| WEEK | test | `lgbm_quantile_wk_calibrated` | **HIGH** | 196 | 196 | `seasonal_naive`* | 28,459.65 | 23,262.87 | +5,196.78 | 48,601.96 | 52,280.73 | -14.15 | +1.02 pp | +17.35 pp | **+5,182.63** |
| WEEK | test | `lgbm_quantile_wk_calibrated` | **HIGH** | 196 | 196 | `ma_es_residual_quantile` | 30,155.42 | 23,262.87 | +6,892.55 | 51,262.16 | 52,280.73 | -3.92 | +1.02 pp | +8.68 pp | **+6,888.63** |
| WEEK | test | `lgbm_quantile_wk_calibrated` | **HIGH** | 196 | 196 | `empirical_quantile` | 45,778.82 | 23,262.87 | +22,515.95 | 54,875.64 | 52,280.73 | +9.98 | -1.02 pp | -2.55 pp | **+22,525.93** |
| WEEK | valid | `lgbm_quantile_wk` | **LOW** | 2,996 | 2,996 | `seasonal_naive`* | 22,911.51 | 65,456.50 | -42,544.99 | 28,082.44 | 31,661.13 | -13.76 | +4.31 pp | +10.91 pp | **-42,558.75** |
| WEEK | valid | `lgbm_quantile_wk` | **LOW** | 2,996 | 2,996 | `ma_es_residual_quantile` | 55,372.79 | 65,456.50 | -10,083.71 | 30,708.60 | 31,661.13 | -3.66 | +1.14 pp | +2.20 pp | **-10,087.37** |
| WEEK | valid | `lgbm_quantile_wk` | **LOW** | 2,996 | 2,996 | `empirical_quantile` | 57,593.59 | 65,456.50 | -7,862.91 | 30,947.72 | 31,661.13 | -2.74 | +1.14 pp | +0.97 pp | **-7,865.65** |
| WEEK | valid | `lgbm_quantile_wk` | **MID** | 1,456 | 1,176 | `seasonal_naive`* | 18,193.16 | 64,596.21 | -46,403.05 | 24,770.19 | 27,325.74 | -9.83 | +5.36 pp | +9.35 pp | **-46,412.88** |
| WEEK | valid | `lgbm_quantile_wk` | **MID** | 1,456 | 1,176 | `ma_es_residual_quantile` | 60,842.49 | 64,596.21 | -3,753.72 | 26,850.75 | 27,325.74 | -1.83 | +1.28 pp | +1.96 pp | **-3,755.55** |
| WEEK | valid | `lgbm_quantile_wk` | **MID** | 1,456 | 1,176 | `empirical_quantile` | 64,749.91 | 64,596.21 | +153.70 | 24,161.82 | 27,325.74 | -12.17 | +1.02 pp | +4.59 pp | **+141.53** |
| WEEK | valid | `lgbm_quantile_wk` | **HIGH** | 196 | 196 | `seasonal_naive`* | 27,083.76 | 42,337.02 | -15,253.26 | 62,590.86 | 67,140.81 | -17.50 | +2.04 pp | +18.37 pp | **-15,270.76** |
| WEEK | valid | `lgbm_quantile_wk` | **HIGH** | 196 | 196 | `ma_es_residual_quantile` | 34,489.24 | 42,337.02 | -7,847.78 | 65,270.43 | 67,140.81 | -7.19 | +1.02 pp | +12.76 pp | **-7,854.97** |
| WEEK | valid | `lgbm_quantile_wk` | **HIGH** | 196 | 196 | `empirical_quantile` | 45,624.22 | 42,337.02 | +3,287.20 | 68,139.06 | 67,140.81 | +3.84 | -1.02 pp | -0.51 pp | **+3,291.04** |
| MONTH | test | `lgbm_quantile_mo` | **LOW** | 1,284 | 1,284 | `seasonal_naive`* | 18,067.90 | 66,027.26 | -47,959.36 | 2,412.89 | 3,097.36 | -11.41 | +5.06 pp | +1.48 pp | **-47,970.77** |
| MONTH | test | `lgbm_quantile_mo` | **LOW** | 1,284 | 1,284 | `ma_es_residual_quantile` | 49,546.92 | 66,027.26 | -16,480.34 | 2,129.36 | 3,097.36 | -16.13 | +2.18 pp | +0.78 pp | **-16,496.47** |
| MONTH | test | `lgbm_quantile_mo` | **LOW** | 1,284 | 1,284 | `empirical_quantile` | 108,881.52 | 66,027.26 | +42,854.26 | 3,125.11 | 3,097.36 | +0.46 | -3.66 pp | +0.08 pp | **+42,854.72** |
| MONTH | test | `lgbm_quantile_mo` | **MID** | 624 | 504 | `seasonal_naive`* | 95,718.05 | 167,222.00 | -71,503.95 | 6,799.12 | 8,235.09 | -23.93 | +3.97 pp | -0.20 pp | **-71,527.88** |
| MONTH | test | `lgbm_quantile_mo` | **MID** | 624 | 504 | `ma_es_residual_quantile` | 184,243.56 | 167,222.00 | +17,021.56 | 4,505.15 | 8,235.09 | -62.17 | +1.39 pp | +5.75 pp | **+16,959.39** |
| MONTH | test | `lgbm_quantile_mo` | **MID** | 624 | 504 | `empirical_quantile` | 341,322.32 | 167,222.00 | +174,100.32 | 5,517.31 | 8,235.09 | -45.30 | -4.96 pp | +2.78 pp | **+174,055.02** |
| MONTH | test | `lgbm_quantile_mo` | **HIGH** | 84 | 84 | `seasonal_naive`* | 3,645.14 | 6,176.09 | -2,530.95 | 43,987.17 | 46,392.05 | -40.08 | +0.00 pp | +7.15 pp | **-2,571.03** |
| MONTH | test | `lgbm_quantile_mo` | **HIGH** | 84 | 84 | `ma_es_residual_quantile` | 6,875.21 | 6,176.09 | +699.12 | 46,130.69 | 46,392.05 | -4.36 | -1.19 pp | +3.57 pp | **+694.76** |
| MONTH | test | `lgbm_quantile_mo` | **HIGH** | 84 | 84 | `empirical_quantile` | 39,292.00 | 6,176.09 | +33,115.91 | 53,629.79 | 46,392.05 | +120.63 | -9.52 pp | -5.95 pp | **+33,236.54** |
| MONTH | valid | `lgbm_quantile_mo` | **LOW** | 1,284 | 1,284 | `seasonal_naive`* | 12,227.56 | 49,051.22 | -36,823.66 | 6,884.60 | 8,046.31 | -19.36 | +3.97 pp | +1.48 pp | **-36,843.02** |
| MONTH | valid | `lgbm_quantile_mo` | **LOW** | 1,284 | 1,284 | `ma_es_residual_quantile` | 45,902.69 | 49,051.22 | -3,148.53 | 6,640.50 | 8,046.31 | -23.43 | +0.47 pp | +0.86 pp | **-3,171.96** |
| MONTH | valid | `lgbm_quantile_mo` | **LOW** | 1,284 | 1,284 | `empirical_quantile` | 63,200.13 | 49,051.22 | +14,148.91 | 7,217.48 | 8,046.31 | -13.81 | -0.94 pp | -0.23 pp | **+14,135.10** |
| MONTH | valid | `lgbm_quantile_mo` | **MID** | 624 | 504 | `seasonal_naive`* | 89,053.20 | 87,013.06 | +2,040.14 | 7,726.13 | 8,853.30 | -18.79 | +2.78 pp | -1.78 pp | **+2,021.35** |
| MONTH | valid | `lgbm_quantile_mo` | **MID** | 624 | 504 | `ma_es_residual_quantile` | 264,327.84 | 87,013.06 | +177,314.78 | 4,926.52 | 8,853.30 | -65.45 | +1.59 pp | +5.56 pp | **+177,249.33** |
| MONTH | valid | `lgbm_quantile_mo` | **MID** | 624 | 504 | `empirical_quantile` | 256,826.15 | 87,013.06 | +169,813.09 | 3,666.88 | 8,853.30 | -86.44 | -2.78 pp | +3.57 pp | **+169,726.65** |
| MONTH | valid | `lgbm_quantile_mo` | **HIGH** | 84 | 84 | `seasonal_naive`* | 51,674.96 | 37,040.14 | +14,634.82 | 56,640.77 | 57,571.95 | -15.52 | -1.19 pp | -2.38 pp | **+14,619.30** |
| MONTH | valid | `lgbm_quantile_mo` | **HIGH** | 84 | 84 | `ma_es_residual_quantile` | 41,160.41 | 37,040.14 | +4,120.27 | 56,605.66 | 57,571.95 | -16.10 | -1.19 pp | +0.00 pp | **+4,104.17** |
| MONTH | valid | `lgbm_quantile_mo` | **HIGH** | 84 | 84 | `empirical_quantile` | 84,739.32 | 37,040.14 | +47,699.18 | 64,497.23 | 57,571.95 | +115.42 | -8.34 pp | -7.14 pp | **+47,814.60** |

---

## 9. Where the Model Does NOT Beat the Baseline (Unfavorable Results)

1. **Over-stock Exposure (`Over THB`) and Overstock Rate (`origin_stock > 2 × TT`) — Worse in 100% of pooled comparisons:**
   - Across **every granularity (`WEEK`, `MONTH`), every split (`test`, `valid`), every row filter (`all_rows`, `no_stockout_rows`), and every baseline (`seasonal_naive`, `ma_es_residual_quantile`, `empirical_quantile`)**, both uncalibrated and calibrated LightGBM models have **higher `Over THB`** (negative `ΔOver THB` and negative holding cost saving) and **higher overstock rate** (`+0.39 pp` to `+10.83 pp` weekly uncalibrated; `+0.53 pp` to `+2.24 pp` monthly; only calibrated `WEEK / test` vs. `empirical_quantile` is `-0.05 pp` on overstock rate while still `-972.78 THB` worse on `Over THB`).
   - Cause: The baselines (especially `seasonal_naive` and `ma_es_residual_quantile`) have wider residual intervals (higher P90/P95 and therefore higher `TT`). Because `Over THB = mean(max(0, origin_stock - TT)) × mean(price)` measures existing `origin_stock` against `TT`, a tighter/lower `TT` mechanically labels more existing hospital stock as "over Target".
2. **`MONTH / test` vs. `seasonal_naive` (Primary Baseline) — Worse on EVERY Total-Target metric:**
   - `Under THB`: Model is **239,425.34 THB** vs. `seasonal_naive` **117,431.09 THB** (**+121,994.25 THB / +103.89% worse**).
   - `Over THB`: Model is **24,490.22 THB** vs. `seasonal_naive` **19,185.05 THB** (**+5,305.17 THB / +27.65% worse**).
   - `Stock-out rate`: Model is **8.97%** vs. `seasonal_naive` **4.43%** (**+4.54 pp worse**; also overshoots the 7.44% nominal target).
   - `Overstock rate`: Model is **15.01%** vs. `seasonal_naive` **13.73%** (**+1.28 pp worse**).
   - `Net Value`: **-122,082.67 THB** at base (`rate = 20%`, `shortage_weight = 1.0`), and negative across all 9 sensitivity grid cells (ranging from **-61,063.44 THB** to **-244,099.02 THB**).
3. **`MONTH / test` (`no_stockout_rows`) vs. `ma_es_residual_quantile`:**
   - While `lgbm_quantile_mo` barely beats `ma_es_residual_quantile` on `all_rows` (`+1,109.59 THB`), on uncensored rows (`no_stockout_rows`) `lgbm_quantile_mo` has **higher `Under THB`** (`188,228.13 THB` vs. `130,530.74 THB`) and loses by **-57,827.48 THB**.
4. **`MONTH / valid` vs. `seasonal_naive` (Primary Baseline) — Worse on EVERY Total-Target metric:**
   - `Under THB`: **173,104.42 THB** vs. **152,955.72 THB** (**+20,148.70 THB / +13.17% worse**).
   - `Over THB`: **60,795.77 THB** vs. **52,074.98 THB** (**+8,720.79 THB / +16.75% worse**).
   - `Stock-out rate`: **7.80%** vs. **4.38%** (**+3.42 pp worse**). `Overstock rate`: **15.71%** vs. **15.28%** (**+0.43 pp worse**).
   - `Net Value`: **-20,294.05 THB** at base.
5. **`WEEK / valid` vs. ALL 3 Baselines (`seasonal_naive`, `ma_es_residual_quantile`, `empirical_quantile`) — Worse on EVERY Total-Target metric:**
   - Model `Under THB` (**172,389.73 THB**) is higher than `seasonal_naive` (**68,188.43 THB**, Net Value **-104,303.91 THB**), `ma_es_residual_quantile` (**150,704.53 THB**, Net Value **-21,712.36 THB**), and `empirical_quantile` (**167,967.72 THB**, Net Value **-4,444.57 THB**).
   - Model `stock-out rate` (**8.56%**) is higher than all 3 baselines (`4.08%`, `7.39%`, `7.55%`).
6. **`WEEK / test` Stock-out Rate vs. `seasonal_naive` and `ma_es_residual_quantile`:**
   - Even on `WEEK / test` where the model reduces `Under THB` against all 3 baselines, its `stock-out rate` (**8.84%** uncalibrated, **7.60%** calibrated) remains higher than `seasonal_naive` (**4.97%**, `+3.87 pp` / `+2.63 pp`) and `ma_es_residual_quantile` (**6.73%**, `+2.11 pp` / `+0.87 pp`).
7. **Slice-Level Losses by VED Class and Price Tier (Base Scenario):**
   - **`WEEK / test` on `VED = V` (Vital items, P95 target):** Both uncalibrated `lgbm_quantile_wk` (`Under THB = 68,257.86 THB`) and calibrated `lgbm_quantile_wk_calibrated` (`Under THB = 62,808.62 THB`) lose to `seasonal_naive` (`54,808.65 THB`; Net Value **-13,517.50 THB** uncalibrated, **-8,065.59 THB** calibrated) and to `ma_es_residual_quantile` (`53,186.87 THB`; Net Value **-15,094.45 THB** uncalibrated, **-9,642.53 THB** calibrated). The weekly model's overall test win comes entirely from `VED = E` (`+53,535.69 THB` uncalibrated / `+70,317.48 THB` calibrated vs. `seasonal_naive`).
   - **`WEEK / test` on `price_tier = LOW` (`<= 50 THB`):** Both uncalibrated and calibrated weekly models lose to `seasonal_naive` (Net Value **-34,882.90 THB** uncalibrated, **-25,022.78 THB** calibrated) and to `ma_es_residual_quantile` (**-23,320.92 THB** uncalibrated, **-13,460.80 THB** calibrated); the weekly test win is driven by `MID` (`+70,275.65 THB` / `+82,182.25 THB`) and `HIGH` (`+4,720.79 THB` / `+5,182.63 THB`).
   - **`MONTH / test` on `VED = E`:** Loses heavily to `seasonal_naive` (**-122,585.12 THB**) and `ma_es_residual_quantile` (**-12,203.10 THB**).
   - **`MONTH / test` across Price Tiers vs. `seasonal_naive`:** Loses in **every** price tier against `seasonal_naive` — `LOW` (**-47,970.77 THB**), `MID` (**-71,527.88 THB**), and `HIGH` (**-2,571.03 THB**), and also loses in `LOW` against `ma_es_residual_quantile` (**-16,496.47 THB**).

---

## 10. Caveats & Limitations

1. **Synthetic Data (`MOCK DATA`):** All series, usage patterns, prices, and stock snapshots come from the synthetic generator (`db/mock/generate.py`). The LightGBM models and baselines are evaluated on synthetic demand and simulated min/max stock trajectories (`reports/evaluation.md:L5`, `README.md:L603-L605`).
2. **Exposure Metrics vs. Operational Cash Savings:** `Under THB` and `Over THB` in `reports/evaluation.md` are **retrospective forecast-vs-actual / stock-vs-target exposure metrics**, not realized hospital P&L cash flows. In particular, `origin_stock` is historical observed stock under the synthetic hospital's existing reorder policy — the evaluation does **not** simulate counterfactual inventory trajectories where orders were placed using the model's `TT` (`README.md:L608-L609`).
3. **Pooled Aggregation & Scale Dominance (`README.md:L391`):** Pooled totals are heavily dominated by the top-10 high-volume series (which carry **62.8% / 63.2%** of `WEEK` pinball and **75.0% / 67.4%** of `MONTH` pinball on `valid` / `test`). Per-series win rates (`reports/diagnostics.md`) are near 40%–51%.
4. **Asymmetric Definition of `Under THB` (Sum) vs. `Over THB` (Mean × Mean) (`f1_forecast/metrics.py:L143-L144`):** As flagged in Section 2.3 and verified in Section 3.1, `Under THB` sums over all `4,368` (`WEEK`) or `1,872` (`MONTH`) `TT` rows, whereas `Over THB = mean(max(0, stock - TT)) × mean(price)` is a single per-row average figure (and uses product-of-means rather than mean-of-products). Dividing `Over THB` by 52 or 12 therefore yields a per-row period holding cost of a few dozen THB, which is orders of magnitude smaller than cumulative `Under THB`.
5. **Censored Demand (`qty_used`):** Historical demand is dispensed usage, censored on stock-out days (`3.57%` of item-days; `README.md:L606`). Both `all_rows` and `no_stockout_rows` are reported above.
6. **Evaluation Periods & Common Row Set:**
   - `WEEK` (`f1-WEEK-2026-09-14-f455e37770dc`): `valid` = 28 weeks (`2025-08-18` to `2026-02-23`, 4,648 common rows, 4,368 TT rows across 166 series); `test` = 28 weeks (4,648 common rows, 4,368 TT rows; 43 rows from 7 cold-start series are excluded from the common row set because `seasonal_naive` has no 52-week lag).
   - `MONTH` (`f1-MONTH-2026-08-01-8f70f4a87d1e-r2`): `valid` = 12 months (`2024-08` to `2025-07`, 1,992 common rows, 1,872 TT rows); `test` = 12 months (`2025-09` to `2026-08`, 1,992 common rows, 1,872 TT rows; 1 cold-start row excluded). Every monthly series has only 12 periods per split (`LOW_N`), and conformal calibration is disabled (`calibration.md:L72`).
