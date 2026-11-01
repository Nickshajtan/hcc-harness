# Determinism and failure transparency

Use the [policy levels](README.md) and [testing standard](testing.md).

Critical operations MUST expose understandable state transitions, ownership of
mutable state, failure stages, error precedence and cleanup guarantees. Decisions
MUST be deterministic given the same controlled inputs. Tests MUST cover relevant
concurrency, interruption and cleanup boundaries.

External scheduling, filesystem sharing and process delivery are not deterministic
inputs. Acknowledge these limits; do not promise absolute OS scheduling determinism.
SHOULD use explicit synchronization barriers, controlled process events, isolated
fixtures and bounded fault injection. Stress tests supplement deterministic
regressions; record their platform, concurrency and bounded operation count.

MUST NOT silently retry unsafe operations, swallow unexpected errors, turn an
infrastructure failure into success, or conceal a race behind mocks. Do not add
sleeps when deterministic synchronization is feasible. A retry requires a documented
retryable contract and must preserve ownership and failure evidence.

An observed failure remains a failure even if a rerun passes. Preserve operation,
stage, original error/cause/code, process exit/signal, stderr, relevant resource
paths, checkpoint presence and cleanup outcome where available. Do not dump full
environments or secrets. Retain failing fixtures when cleanup would destroy the
evidence; make that retention and its location visible.

Classify incident investigations as **RESOLVED**, **EXTERNAL / CONTAINED** or
**UNRESOLVED**. Resolution requires an evidenced mechanism, a narrow correction and
a regression that exercises the original condition. External classification needs
a specific external cause plus a verified safe containment/recovery strategy.
An environmental correlation without causal evidence remains UNRESOLVED.
Passing repetitions or correlation alone
do not establish either. Unknown causes MUST remain explicit, and unexplained
critical instability blocks a stability/readiness recommendation.

Test fixtures MUST await every owned preparation operation before failed setup
removes their shared directory. A rejected Promise.all is not proof that sibling
effects have settled. Preserve primary and secondary teardown errors separately.
Captured direct children MUST reach close before fixture deletion; test-owned
teardown has a finite budget and must report failure to close. Parent exit does
not prove unknown descendants or external filesystem handles have been released.

Setup's approved compound failure contract is AggregateError([original, cleanup])
with the original failure as cause. Reverse rollback order and stopping at the
first failed unlink remain unchanged. This preserves failure evidence, not an
automatic recovery or retry authorization.
