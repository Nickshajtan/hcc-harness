# Provider policy dispatch: vertical slice 1

Process middleware still uses `register(api)`, `ExecutionContext`, hookable phases
`preflight -> prepareLaunch -> native -> finalize`, and execution-local cleanup.
Only `prepareLaunch` permits environment changes. None of those runtime paths changed.

Provider policy middleware optionally implements `ArchMiddleware.registerPolicy(api)`.
Its API has typed `on('agent.beforeSpawn', handler)` and `cleanup(handler)` methods,
with no execution context, environment mutation, process phases or EventBus.
A module may implement both registration methods; dispatch invokes only the relevant
one. The separate registration method avoids inventing an execution context for a
native provider hook and leaves existing modules source compatible.

```ts
const policy: ArchMiddleware = {
  id: 'delegation-policy',
  register: () => undefined,
  registerPolicy(api) {
    api.on('agent.beforeSpawn', (request) => {
      if ('premium' === request.requestedModel) {
        return { action: 'deny', reason: 'Premium subagent requires approval' };
      }
      return { action: 'allow' };
    });
  },
};
```

`premium` and `economy` are fictional example model labels, not engine rules.
Unknown model information stays absent. This demonstration policy is not production
FinOps and is never enabled in generated configuration or the default registry.

## Engine contract

`dispatchPolicy(input, configuration, registry, options?)` in `src/policy.ts` accepts unknown
input, an explicit configured middleware list, and the existing factory registry.
An adapter can pass an already parsed `Configuration` without project initialization.
The engine itself performs no discovery, filesystem writes, native resolution or
launches. Disabled entries do not instantiate; enabled entries instantiate in
configuration order. Process-only modules contribute no policy handlers.
Without `requiredPolicies`, no handlers means allow for a valid, supported event
within the deadline. This preserves optional/advisory behavior; it is not a security
guarantee. Mandatory enforcement requires explicit trusted requirements:

```ts
const result = await dispatchPolicy(request, configuration, registry, {
  requiredPolicies: ['delegation-budget'],
  timeoutMs: 5000,
  cleanupGraceMs: 100,
});
```

Requirements come from local configuration/adapter code, never request fields or
correlation IDs. Every required ID must be configured, enabled, present in the
factory registry, instantiated with the correct ID, synchronously registered, and
contribute at least one `agent.beforeSpawn` handler. An absent/disabled policy or a
process-only/no-handler module produces `policy-error` with `configuration-error`;
no handlers execute. Duplicate requirements or middleware entries are configuration
errors too. There is no dependency graph or global requirement registry.
At most 64 distinct requirements are accepted; IDs follow the existing lowercase
middleware ID syntax. The engine snapshots entries/requirements per request.

For example, an empty configuration plus `requiredPolicies: ['delegation-budget']`
fails closed with that ID at stage `configuration`, rather than authorizing an
economy or premium delegation. All required handler presence checks finish before
the first policy handler starts.

The flat request requires `type: 'agent.beforeSpawn'`, `requestId`, and `provider`.
Optional strings are `executionId`, `agentId`, `parentAgentId`, `requestedModel`,
and `agentType`. Strings must be nonempty, at most 256 UTF-16 code units and contain
no ASCII control characters. Unknown keys, unknown event types, nulls and nonstrings
are rejected. Validation copies and freezes the payload before registration.

`requestId` correlates one dispatch response; it is not a durable deduplication key.
Repeated requests dispatch independently. Execution IDs, agent IDs, parent IDs and
provider names are all untrusted correlation/description, not authenticated identity
or authorization. No identifiers or model names are generated. A native subagent
inside a provider process does not create an Arch execution: the provider owns its
agent spawning, models and orchestration. Arch still supervises only its routed
native process. There is no universal agent tree or persisted accounting model.

Policy registration is strictly synchronous and must return `undefined`. Async work
belongs inside handlers. Every other return, including Promises and thenables, is
a `registration-contract` failure. Genuine returned Promises receive rejection
observers (using the intrinsic Promise method); arbitrary thenables are never
inspected or invoked. Their `then` getters cannot suspend registration. The engine
does not await invalid async registration. Partially registered cleanup still runs;
handlers never run after registration failure. The per-module registration window
closes immediately when its registration call returns or throws.

```ts
// Invalid: produces policy-error/registration-contract, never allow.
registerPolicy: async (api) => {
  await loadPolicyState();
  api.on('agent.beforeSpawn', () => ({ action: 'allow' }));
};
// Correct: registration is synchronous; asynchronous work is inside the handler.
registerPolicy: (api) => {
  api.on('agent.beforeSpawn', async (request) => {
    const state = await loadPolicyState(request, api.signal);
    return evaluate(state, request);
  });
};
```

Handlers run sequentially in registration order. Every explicit denial is retained
with its middleware ID and reason in that order; later allows cannot erase it.
Decisions are exactly allow or deny with a bounded reason. Invalid returns and thrown
values produce `policy-error` and stop subsequent handlers. Registration failures
also fail closed. Cleanup runs once in reverse registration order on every allocated
dispatch, including partial registration. Cleanup errors block an allow and append
after the primary error without discarding prior denials or exception identity.
The single returned result distinguishes `invalid-request`, `allow`, `deny`, and
`policy-error`. Each failure has `stage`, `code`, middleware ID and a local raw
`cause`. Failure metadata, arrays and the final result are frozen; raw cause objects
are retained by identity, not recursively frozen or serialized.

Lifecycle state and cleanup lists belong to one dispatch; concurrent requests share
neither. Handlers may register cleanup before timeout, but cleanup cannot append
more cleanup. Closed or cancelled dispatches reject late handler/cleanup registration.

## Deadlines, cancellation and failure precedence

One monotonic deadline covers registration, all handlers and cleanup. The default
is 5000 ms; `timeoutMs` must be an integer in 1–60000. `cleanupGraceMs` defaults to
100 ms and must be an integer in 1–1000. Nulls, nonnumbers, fractions and out-of-range
values are configuration errors. No handler receives a fresh full timeout budget.
The mock executable supplies its own required demo policy and these default limits.

The additive optional `PolicyAPI.signal` is supplied by this dispatcher. It aborts
when the overall deadline expires, including during cleanup. Middleware should
cooperate with the signal and check `signal.aborted` before registering abort
listeners. A handler that never settles produces `policy-error`, failure code
`timeout`, stage `handler`, and the current middleware ID. Later handlers do not
start; prior denials remain in the result. Catching cancellation and returning allow
does not recover from timeout. Late fulfillments/rejections cannot change the result
and have rejection continuations attached to avoid unhandled rejections.

```ts
registerPolicy(api) {
  api.on('agent.beforeSpawn', () => new Promise(() => undefined));
}
// With timeoutMs: 20, this handler yields a timeout refusal, not an indefinite await.
```

Cleanup is attempted once in reverse registration order. It shares the original
budget plus one overall cleanup grace interval, not a new interval per callback.
If cleanup crosses the original deadline, the result fails closed even if cleanup
finishes during grace. After handler timeout, cooperative cleanup may finish during
grace without erasing the primary timeout. Rejections and cleanup timeouts append
as secondary failures. When grace is exhausted, remaining callbacks are still
attempted once with an aborted signal, but their promises are no longer awaited;
late rejections are observed without modifying returned diagnostics. Cleanup that
ignores cancellation may outlive the decision; resource release is not guaranteed.

At a responsive event loop, the policy wait budget is at most `timeoutMs +
cleanupGraceMs` (5100 ms by default), subject to timer scheduling and bounded
synchronous callback work. Timers cannot preempt CPU-bound JavaScript, native
blocking calls or an infinite microtask loop. No handler is forcibly stopped.
Noncooperative code may also retain active Node handles after a refusal; neither
process exit latency nor arbitrary JavaScript isolation is guaranteed. Stdin framing
and stdout transport are outside the policy execution budget. No workers, subprocess
isolation, daemons or orchestration were introduced. Existing process middleware
receives no new deadline or policy signal, and Core/ExecutionSession are unchanged.

Precedence is explicit:

- Malformed input is `invalid-request`; trusted configuration/requirement failures
  are `policy-error/configuration-error` before handler execution.
- Registration contract/exception failures stop registration and all handlers.
- Handler exception, invalid decision or timeout stops later handlers. The first
  observed failure stays primary; cleanup failures append after it.
- Any failure makes the outcome `policy-error`, retaining all earlier denials.
  With no failures, deny overrides allow; an optional empty pipeline allows.
- Unsupported adapter capability refuses before policy instantiation. Adapter output
  failure takes transport precedence over any result it could not reliably deliver.

Codes are `configuration-error`, `registration-contract`, `exception`,
`invalid-decision` and `timeout`. Stages are `configuration`, `registration`,
`handler`, and `cleanup`. Empty middleware ID means options/configuration failure
before a module could be attributed; provider identities are never used instead.

## Decision channel versus observational events

The existing EventBus remains an awaited observational channel with contained
subscriber/reporter failures. Policy dispatch does not publish through or subscribe
to it. Logging and analytics cannot turn a denial or policy error into permission.
Policy decisions must never be inferred from observer exceptions or successful
telemetry delivery. Future adapters call the engine directly, translate the result
into their native hook protocol, and block on every non-allow outcome.

## Local mock hook

Build with `npm run build`, then invoke `node dist/mock-provider-cli.js`, supplying
one UTF-8 JSON document on stdin and closing stdin. The executable is a dedicated
demo harness, not a new command in the public `arch` CLI:

```json
{
  "type": "agent.beforeSpawn",
  "requestId": "delegation-1",
  "provider": "mock",
  "parentAgentId": "economy-main",
  "requestedModel": "premium"
}
```

This yields `outcome: "deny"`, `permitted: false`, a denial reason, and exit 1.
Changing `requestedModel` to `economy` yields `outcome: "allow"`, `permitted: true`
and exit 0. `permitted` is the mock's authorization gate; no agent is actually spawned.
No provider executable, SDK, inference call, global hook, configuration discovery,
project initialization or filesystem mutation is involved.

The exported `runMockHook(options)` accepts explicit streams, configuration,
registry and a trusted adapter capability binding. `mockProviderCapabilities`
declares that this local mock can gate `agent.beforeSpawn`. An adapter lacking that
capability returns `unsupported` before policy factories run. Requests cannot declare
capabilities, requirements or deadlines: such fields are rejected. Trusted library
callers may pass `policyOptions`; omitting requirements retains optional behavior.
This binding describes implementation behavior;
it is not proof that a remote caller really enforces the result.

The transport accepts at most 16 KiB and emits one JSON response on stdout.
Diagnostics contain outcome codes on stderr, with no raw exception or input dump.
Policy reasons are trusted module output and must not include sensitive request data.
Exit statuses are 0 allow, 1 intentional deny, 2 invalid JSON/request/oversize,
3 policy/registration/cleanup error, 4 unsupported enforcement, 5 transport failure,
6 primary policy timeout, 7 primary configuration/requirement failure. Every
policy-error response has `permitted: false` and sanitized failure codes/stages/IDs.
Secondary cleanup timeouts do not overwrite an earlier primary exception's exit 3.
Input stream failures are distinct from invalid JSON. Output/serialization failure
returns 5 after engine cleanup; a failed output cannot guarantee delivery of JSON.
If stderr also fails, the executable still exits 5. EOF is the framing boundary;
callers must close stdin. A request is not replayed or retried after transport failure.
Callers must require exit 0, complete valid JSON, `outcome: "allow"`, `permitted: true`
and the matching request ID before proceeding. Partial output or a nonzero status
must block even if some allow-response bytes have already arrived.

The mock only demonstrates the local protocol and refusal decision. Compatibility
and enforcement with Claude, Codex or Gemini have **not** been validated. Real adapters
must independently establish a blocking native-hook contract and supply trusted
configuration. Unsupported hooks must never be presented as enforced decisions.

## Focused validation

```sh
npm run build
npx vitest run tests/unit/policy.test.ts tests/unit/policy-hardening.test.ts tests/unit/mock-provider.test.ts tests/integration/mock-provider.test.ts tests/unit/core.test.ts tests/unit/execution-policy.test.ts tests/unit/environment.test.ts tests/unit/events.test.ts --exclude '**/.test-state/**'
npx vitest run --config vitest.policy.config.ts --coverage
npx stryker run stryker.policy.config.json
```

The focused coverage configuration gates the engine, deadline helper and adapter at
95% lines / 90% branches per file; existing repository gates remain unchanged.
The separate mutation pilot measures complete modules with no source exclusions
or timeout credit. It does not replace established Core middleware regression gates.
See [the executed validation record](validation/provider-policy-v1.md) for results,
survivor review and platform limits.
