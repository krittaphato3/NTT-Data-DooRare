---
name: performance-profiler
description: Generic CPU/memory/IO profiling ONLY — latency, throughput, profilers,
  flame graphs. Use when a named non-DB performance problem is measured or must
  be proven with before/after evidence. SQL slowness routes to query-performance-engineer;
  SLO/burn dashboards to observability-sre; active SEV to incident-response-engineer.
metadata:
  version: 0.2.0
  grade: G2
  domain: production
  status: active
  last-reviewed: '2026-08-06'
  owned-by-agent: performance-engineer
---

# PERFORMANCE PROFILER

Profile, benchmark, and optimize code across all languages. Read the DECISION TREE before touching any code — the single highest-leverage act is measuring the right resource on the right path first.

## WHEN TO USE

- A production service or hot path is slow: latency, throughput, tail-latency, or CPU/memory/IO consumption is materially above an SLO or a prior baseline.
- You can already name a concrete symptom and a measurement unit (p50/p99 latency, requests/sec, RSS growth, GC pauses, lock wait time): "the endpoint takes 800 ms" is a use case; "the app feels slow" is not yet.
- Code runs repeatedly or at scale — a hot loop, a request handler, a batch job that processes enough data that one optimization pays back the profiling time.
- You must defend a speed-up claim to a reviewer or a budget owner and need before/after numbers plus profiler evidence.
- A memory or CPU regression appeared after a deploy and you need to locate the introducing call site rather than guess.

## WHEN NOT TO USE

- **Not before measuring.** If you have not profiled or benchmarked the current state, this skill is the wrong first step — measure, then return here to interpret and optimize.
- **One-off scripts with trivial wall-time.** A script that runs once in seconds needs neither profiling nor optimization; spend the effort elsewhere.
- **Obvious algorithmic blowups already proven.** If the profiler or a prior analysis already isolated an N+1 or an accidental O(n²), fixing that specific defect is the task, not a fresh profiling campaign.
- **Latency dominated by something you cannot change** (an external API and the SLO is the provider's SLA): optimizing your client cannot move the measured tail.
- **Premature optimization of cold paths.** Unmeasured micro-optimization of code nobody calls violates the measurement rule. Optimize only what profiling ranks as a top bottleneck.

## DECISION TREE

Trace left to right and commit to the first leaf that matches. Run the loop: **symptom → hypothesis → profile → optimize → re-verify**, and stop when the re-measured evidence confirms the win.

1. **Capture the symptom.** Name the violated number (p99 latency, throughput, RSS, CPU%) and the environment (load, data shape, host). Without a symptom against a number you have nothing to optimize.
2. **Form one testable hypothesis per pass.** Example: "this endpoint allocates a large intermediate per request." Do not optimize to a vague goal.
3. **Profile first — never guess the bottleneck.** Run a sampler/flame graph, not a stopwatch of the whole process. Let the profiler decide the left side.
4. **Classify the resource before choosing a profiler.** The fix and the tool differ by dominant resource:
   - **CPU-bound**: async-profiler / `perf` CPU mode, `go test -cpuprofile`, `cProfile -s cumtime`, `node --prof`. Look for the widest self-time frame and its callers.
   - **Memory-bound**: allocation flame graph (`async-profiler ... -e alloc`, `-memprofile`, `py-spy` won't see allocs — use tracemalloc/cProfile), heap dump, promoted/retained bytes. Look for the top allocation site and retained vs shallow divergence.
   - **I/O-bound**: flame graph shows mostly `syscall`/`read`/`write`/network stacks; measure I/O queue depth, thread sleep/await timespans, and per-request round trips.
   - **Lock contention**: flame graph shows `synchronized`, mutex, `park`, `blocked` stacks dominating wall time despite low CPU. Look at the lock under contention; widening the lock is the last resort, narrowing or removing it first.
5. **optimize the top Pareto unit only.** Fix the largest single bottleneck at a time; after each change run the re-measure phase. Do not fix the second bottleneck until the first is proven in profile and re-measured.
6. **Re-measure and confirm.** Rerun the same protocol (below). Accept only if the Pareto top-3 regressed in the direction you intended with no collateral regression on a second metric.

## RULES
1. Measure first — never guess at bottlenecks
2. Data-driven — every recommendation backed by profiling
3. Pareto principle — fix top 3 bottlenecks (80% of slowdown)
4. Before/after — always provide benchmark comparison

## TOOLS BY LANGUAGE

### Python
```bash
py-spy top --pid <PID>                    # live view
py-spy record -o profile.svg --pid <PID>  # flame graph
python -m cProfile -s cumtime script.py    # built-in
```

### Node.js
```bash
npx clinic flame -- node app.js    # flame graph
npx 0x node app.js                 # flame graph
node --prof app.js                 # V8 profiler
```

### Go
```bash
go test -cpuprofile cpu.prof -bench .    # CPU
go test -memprofile mem.prof -bench .   # memory
```

### Java
```bash
-agentlib:asyncProfiler=start,file=profile.html  # async-profiler
```

### Rust/C++
```bash
cargo flamegraph          # flame graph
perf record -g ./binary   # Linux perf (CPU, off-CPU via -a + schedule)
perf stat ./binary        # quick CPI + IPC summary
```

## BOTTLENECK PATTERNS
- **N+1 queries**: Database calls in loops
- **Blocking I/O**: Synchronous network calls
- **Unbounded loops**: Missing break conditions
- **Memory allocation**: Excessive object creation in hot paths
- **Lock contention**: Too much time waiting

## OPTIMIZATION STRATEGIES
- Algorithmic: Reduce Big-O complexity
- Caching: memoization, Redis, query cache
- Lazy loading: Defer non-critical work
- Batching: Combine multiple operations
- Streaming: Process data as it arrives
- Parallelism: Concurrent/async execution

## OUTPUT
```text
[PERFORMANCE]
Target: {file|service}
Profiler: {tool}
Bottlenecks:
1. {issue} — Impact: {HIGH|MEDIUM|LOW}
Optimization:
- {change}: {before} → {after}
Benchmark:
- Before: {metric} = {value}
- After: {metric} = {value}
- Improvement: {percentage}
```

## FAILURE MODES & MITIGATIONS
Each entry is DETECT + FIX.

1. **Optimizing an unmeasured path.** DETECT: a change justified by intuition with no profiler attached; the response budget is spent on code the sampler never flagged. FIX: gate every optimization on a profiling artifact that names the frame; if the flame graph does not feature the code you changed, revert and re-aim at the real left-tallest frame.
2. **Microbenchmark lies — JIT warmup and inlining.** DETECT: an artifact benchmark claims a huge win but production regresses; the harness ran few warmup iterations, so the JIT tiered up mid-measurement or the JIT inlined/ eliminated dead code the real path cannot. FIX: run enough warmup to reach steady state (classic JMH holds 3·10 forks / 5–10 s warmup per fork), prevent dead-code elimination on the result, report median not a lucky run, and confirm the same change on a realistic workload, not the microbench.
3. **Sampling bias.** DETECT: flame graphs from a single short window or a single request skew to one code path; wall-clock time is spent where the sampler was idle. FIX: sample across representative load and enough time (async-profiler `-d` to tens of seconds), sample wall/off-CPU as well as CPU, and corroborate the top frame on a second sample of different requests.
4. **Profiling in staging vs production.** DETECT: an optimization that is neutral or harmful in prod though a win in staging; the staging box had a different CPU, different data cardinality, or no real concurrency/tenant mix. FIX: profile under near-production data shape and concurrency; if prod sampling is allowed, use a sampler with low overhead (async-profiler frame mode; `perf` on a canary; `py-spy --nonblocking`) and compare the top-frame ranking across both envs before shipping an optimization.
5. **Benchmark noise → false signal.** DETECT: before/after numbers differ by less than the run-to-run spread, so the "win" is indistinguishable from noise; or a single best-run is quoted as the After figure. FIX: pin the environment (CPU governor, batch/compiler affinity, co-tenants, code/data/power), run **≥5** repetitions, report the **median and p90** (never the max or a single run), and accept a change only when the medians differ beyond the interquartile spread with overlapping distributions ruled out.

## VERIFICATION GATE
Run before claiming "optimized". Attach the artifacts to the change.

1. **Same environment pinned.** Lock CPU/cgroup/batch, co-tenancy, input distribution, and code/compilation the same for Before and After. Any environmental delta invalidates the comparison — record it.
2. **≥5 runs each way.** Run the unchanged and changed code ≥5 times each under the now-identical setup. Discard compile/fn and measurement ramp outliers consistently.
3. **Report median + p90.** State both the central tendency and the tail. If p90 does not improve while the median does, call out tail regression explicitly — do not hide it behind the median.
4. **Profiler evidence on the change.** Before and After must both be backed by an attached profiler artifact (flame graph, allocation profile, or latency scan) naming the exact bottleneck changed. A numeric delta with no profiler proof is rejected.
5. **Pareto top-3 rule.** The change must target one (or more) of the top-3 bottlenecks by self-time/shared wait. If the code you changed is not in the Pareto top-3, the task is not done — re-profile.
6. **Accept / regress record.** State the measured delta, the collateral check (no regression in a second metric), and either ACCEPT or REVERT. Confirm the change under a load other than the one that found it.

## REFERENCES

- Brendan Gregg's Methodologies — USE method and latency analysis: `https://www.brendangregg.com/methodology.html` and `https://www.brendangregg.com/usemethod.html`.
- `perf` tutorial and flame graphs — `https://www.brendangregg.com/perf.html`; `https://github.com/brendangregg/FlameGraph`.
- async-profiler docs — `https://github.com/async-profiler/async-profiler` (CPU/allocation/wall-clock modes).
- py-spy — `https://github.com/benfred/py-spy`.
- JMH (Java microbenchmark harness) — `https://github.com/openjdk/jmh` (warmup/forks/steady-state guidance).
- Go benchmark docs — `https://pkg.go.dev/testing` and `go test -benchmem` notes.
- Making latency measurement useful — Gil Tene "How NOT to measure latency": `https://www.youtube.com/watch?v=lJ8ydIuPFeU` and the latency-measurement guidance in the Google/SRE monitoring chapter at `https://sre.google/sre-book/monitoring-distributed-systems/`.