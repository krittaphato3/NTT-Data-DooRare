---
name: requirements-elicitation
description: Use when an ask is underspecified to extract the user's underlying intent
  through one-question-at-a-time interviewing until confidence passes ~95%. Feeds
  deep-planner (turns intent into an executable plan).
metadata:
  version: 1.0.0
  grade: G3
  domain: doctrine
  status: active
  last-reviewed: '2026-08-06'
  owned-by-agent: planner
---

# Requirements Elicitation

The discipline that turns an underspecified ask into a confirmed intent instead of a guess. Most costly rework does not come from bad code — it comes from confidently building the wrong thing. W3 is the one-question-at-a-time interviewing layer that fits in front of the planning phase: it extracts who, why, the success definition, and the hard constraints from the user, then hands deep-planner a confirmed intent statement to turn into an executable plan. The output is not a spec and not a plan — it is an explicit-yes confirmation of intent recorded only after the user affirms it in words, not nods.

## WHEN TO USE

- **Missing who or why** — the ask names an action but not who it serves or the reason it exists; intent is unknowable until those are surfaced.
- **Missing success definition** — no stated outcome or definition of done, only a described change to the system.
- **Missing or implicit constraints** — deadlines, teams, budgets, or platform ceilings are absent, and the user behaves as if they do not matter.
- **Conventional vs specific** — the request sounds like a well-known pattern but has the shape of an exception; assume the exception until the interview disproves it.
- **Temptation to assume** — you can picture the deliverable before asking a single question; that picture is a hypothesis, not a fact, so the interview is mandatory.
- **Values in tension** — the request carries two desires that cannot both hold (e.g., fastest-to-ship and highest-feature-count), and one must give.
- **Handoff to deep-planner** — any intention will be decomposed into a plan must first be confirmed with this skill, so the planner receives a stable definition of the goal.
- **Silent majority stakeholder** — a group affected by the decision (end-users, ops, downstream consumers) is absent from the ask; their success criteria must be surfaced before confirm.
- **Metaphor-heavy ask** — the user describes the outcome via analogy ("like the checkout flow but for claims") rather than concrete behavior; the analogy is a hypothesis to test, not a spec.
- **Budget-visible constraint** — a deadline or budget is named but its leverage ("if this slips, what gives?") is unknown; the constraint's trade-off is the missing intent.

## WHEN NOT TO USE

- **No interview budget** — the user has explicitly granted a fixed number of turns or questions ("ask me at most 2"); exceeding that budget violates an explicit limit and is interview overreach.
- **Clarification is itself the deliverable** — if the only question is a factual one ("which env, prod or staging?") with no deeper intent to uncover, answer it directly before this skill begins.
- **Unambiguous directly-executable asks** — the request names the exact solve, the actor, the success criterion, and has no obvious missing constraint; interviewing adds noise.
- **Explicit speed requests** — the user has already said "do this now, do not ask"; pausing to interview overrides an explicit operating constraint.
- **Pure information queries** — a question with a single factual answer (how, why, size); it is not a requirement, so it does not get an interview.
- **Confidence already ≥ 95%** — all elements (who/why/success/constraint) are present and mutually consistent; the gate is already passed, so skip.
- **Single known decision-maker with zero ambiguity** — one owner states every element unambiguously in the same message and no tension exists; there is nothing for a question-based interview to add beyond the explicit-yes confirm.

## DECISION TREE

1. **Hypothesize first** — before any question, state your best-guess intent as a one-line hypothesis plus a confidence 0-100 estimate. This is the anchor; every later question then measures off it. No hypothesis = no controlled interview.
2. **Ask exactly one question with a guess attached** — ask one thing at a time, and attach your own guess to each question so the "do not have to justify" signal is available to the user. If the user answers with a different "want", that override becomes the new hypothesis.
3. **Listen for "want" versus "should want"** — distinguish what the user states they want from what you suspect they need for their stated goal. If those diverge, do not assume the "need" wins; the user overturns the divergence unless you can prove it.
4. **Restate the intent** — after the question the interview yields a coherent picture, produce a 5-8 line restate of the intent covering Outcome, User, Why now, Success, Constraint, Out of scope.
5. **Confirm with an explicit yes** — ask "is the restate correct?" and require an explicit yes. "Whatever you think" or silence or a shrug is NOT a yes.
6. **Stop at 95%** — when you can predict with high certainty the user's next 3 reactions to the restated intent, the interview is done. Do not keep drilling once the hypotheses stop changing.

Every step above has a guard: no question without the prior hypothesis (step 1 guards step 2), no plan before the explicit yes (step 5 guards step 4), no further probing once prediction holds (step 6 closes). A step that cannot be reached because the prior one stays open is a controlled stall, not a skip.

## PATTERNS

- **Guess-attached questions** — every question carries a guess: "I think you want X; do you?". This lowers the cost of the answer and gives the user an easy rejection target; it also anchors the interview toward converging intent.
- **"If you did not have to justify, what would you want?"** — this disarm-the-justifier probe surfaces the genuine want that is otherwise hidden behind apparent constraints from teams or process.
- **Restate as Outcome / User / Why now / Success / Constraint / Out of scope** — the bounded restate frame that turns a conversation into a record. Success is a measurable criterion the user can affirm or deny, not a slogan.
- **Explicit-yes requirement** — a silent nod, a "fine", or a "you decide" carries no confirmation. Only a direct word of assent counts as a yes. Record nothing as confirmed from atmosphere.
- **Save intent only when confirmed** — an intent doc is written to the transcript only when the user has given an explicit yes to the full restate. The rule is strict: anything recorded before the yes is untested and may encode a wrong assumption.
- **Planned handoff** — the confirmed intent doc routes to deep-planner as the planner's goal input; the interview itself produces no plan, only the confirmed definition the planner consumes.
- **Restate to the margin** — every gap the user leaves ("the rest I will trust you on") is restated as an explicit out-of-scope or an open question, never silently absorbed into the record.
- **Record the tie-break** — when two wants conflict, the resolved priority is recorded with the reason, so deep-planner does not re-litigate a settled trade-off.

## FAILURE MODES & MITIGATIONS

Each entry is DETECT → FIX.

1. **Batching 3+ questions** — two or more questions in one turn. *DETECT:* the ending of the turn has multiple "?" or the user answers the last one first. *FIX:* hold the batch, force a single question per turn, each with a guess.
2. **Guessing without a hypothesis** — the guess sits in with no confidence anchor. *DETECT:* a guess is used without a stated intent + confidence. *FIX:* render the guess back as hypothesis-plus-confidence before steering.
3. **Accepting "whatever you think" as a yes** — a reluctant or silent reply recorded as confirmation. *DETECT:* the confirmation token is absent; the user relayed agency to you. *FIX:* re-ask after a declarative restate until the user gives an explicit yes.
4. **Planning before confirmation** — the intent jump to a plan while the who/why are still moving. *DETECT:* code plan artifacts appear before the explicit yes. *FIX:* block planning, complete the interview, and let deep-planner start after the confirmed intent.
5. **Probing best practice instead of wants** — the interview drifts into how (libraries, patterns) before what (the user's want). *DETECT:* questions start with "should we" or a system flavor rather than a want. *FIX:* redirect the interview to what and why; let the "how" surface after confirmation.
6. **Saving pre-confirmation** — intent recorded to a doc before the explicit yes. *DETECT:* a confirmed block exists with no explicit-yes timestamp. *FIX:* mark it provisional or delete it; write to the record only after the explicit yes.
7. **Answering for the user** — the gap the user left open is filled by the interviewer as settled. *DETECT:* a restate line the user never stated appears with no guess attached. *FIX:* convert every assumed gap into a single guess-attached question; the user, not the interviewer, closes it.
8. **Missed tension** — the interview stops while two stated wants still conflict. *DETECT:* the restate carries two objectives that cannot both hold, and no priority split was recorded. *FIX:* force the tie-break explicitly — ask which want yields when both cannot hold, and record the winner with its reason.

## QUANTITATIVE RULES

- **Stop threshold:** end the interview when you can predict the next 3 user reactions to the final restate. Fewer than 3 reactions and the estimate is still moving; more is over-interviewing.
- **Confidence bands**: under 70% confidence, append a textual reason to every recorded hypothesis so later stages see why it did not stick. 70-94% keeps interviewing; at 95% stop.
- **95% threshold**: treat a restate as ready only at or above ~95% confidence. Below it, continue single-question probing.
- **Restate size**: the restate is 5-8 lines — short enough to read once, dense enough to carry outcome, user, why-now, success, constraint, out-of-scope.
- **Single-question rule**: exactly one question is posed per turn; a turn with two+ questions is a violation and is rolled back (FAILURE MODE 1).
- **Per-question cost**: budget no more than 5-7 questions per interview session. Beyond that, either the hypothesis is not converging or the wrong questions are being asked; re-anchor on the hypothesis before continuing.
- **Guess hit-rate**: if the attached guesses are wrong on multiple consecutive questions, the hypothesis is off — re-anchor it before the next question rather than pushing the same wrong guess further.
- **Divergence action threshold**: when a want-vs-should divergence is detected, it is resolved within at most 2 additional single questions, never left open past that.
- **Interaction budget**: respect any explicit question-count or turn-count limit; each question past a stated budget is unilateral drift that breaks the without-overreach rule.
- **Lines budget**: stay in the 120-180 total body line range; density over padding, numbers over adjectives.

## VERIFICATION GATE

The interview is verified before it hands off. Every item must be true; a single false item returns to the step that caused it.

- **Hypothesis + confidence surfaced first** — the first turn records the hypothesis with a confidence percent, not a question in a vacuum.
- **One question at a time** — every turn asks at most one question, each with a rhythm guess.
- **Want-vs-should probed** — any divergence signal between "want" and "should want" was acted on within the interview.
- **Concrete restate delivered** — a 5-8 line Outcome/User/Why now/Success/Constraint/Out of scope restate was shown to the user.
- **Explicit yes present** — the user directly affirmed the restate; no silent or passive acceptance counts, and no "whatever" is recorded as a yes.
- **Tie-break resolved** — any values-in-tension were resolved to a recorded priority with its reason, not left holding two mutually exclusive wants as equal.
- **Out-of-scope stated** — the things the user delegated to trust ("rest I will trust you on") are either scoped or listed as open questions, none silently absorbed.
- **Predict the next 3** — before this gate passes, you can predict the next 3 user reactions and confidence is at or above ~95%.

Output shape — the confirmed intent renders as one record with no blank cell:

```text
HYPOTHESIS: {one-line intent} | confidence: {0-100}
RESTATE: Outcome | User | Why now | Success | Constraint | Out of scope
CONFIRMED: {explicit yes, timestamp}
```

A record lacking the explicit yes, or whose restate has a blank cell, does not pass the gate and never reaches deep-planner.

## REFERENCES

- addyosmani/agent-skills interview-me — the source one-question-at-a-time interviewing discipline and the guess-attached question pattern this skill adapts.
- deep-planner — the downstream consumer: the confirmed intent this skill produces is the exact input a planner turns into a task graph.
- superpowers brainstorming — the breadth-first intent exploration that complements the depth-first one-question narrowing of this skill.
- Coaching interview practice — active listening, single-question pacing, and the "want vs should want" trap that underpins the WHEN TO USE and FAILURE MODES of this skill.
- Socratic questioning — the discipline of posing one question at a time and patiently holding the single swap, the deep basis of the guess-attached single-question rule.
- Five Whys (root-cause questioning) — the depth-chaining technique that moves past the first stated want to the underlying driver, folded into the want-vs-should-want probe.
- MoSCoW / weighted scoring — the priority model that turns values-in-tension into a recorded must-have/should-have, backing the tie-break pattern and QUANTITATIVE RULES.
- The Mom Test — the interviewing canon that teaches a single question at a time and separates stated wants from defended opinions, the source of the "do not have to justify" probe.

Ownership: maintained by planner; requirements-elicitation is a doctrine-domain skill that captures and confirms intent before it is planned.