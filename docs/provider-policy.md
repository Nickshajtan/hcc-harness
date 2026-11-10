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

`dispatchPolicy(input, configuration, registry)` in `src/policy.ts` accepts unknown
input, an explicit configured middleware list, and the existing factory registry.
An adapter can pass an already parsed `Configuration` without project initialization.
The engine itself performs no discovery, filesystem writes, native resolution or
launches. Disabled entries do not instantiate; enabled entries instantiate in
configuration order. Process-only modules contribute no policy handlers.
No handlers means allow for a valid, supported event. Deployments requiring a policy
must explicitly configure it; correlation fields never select a privileged policy set.

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

Handlers run sequentially in registration order. Every explicit denial is retained
with its middleware ID and reason in that order; later allows cannot erase it.
Decisions are exactly allow or deny with a bounded reason. Invalid returns and thrown
values produce `policy-error` and stop subsequent handlers. Registration failures
also fail closed. Cleanup runs once in reverse registration order on every allocated
dispatch, including partial registration. Cleanup errors block an allow and append
after the primary error without discarding prior denials or exception identity.
The single returned result distinguishes `invalid-request`, `allow`, `deny`, and
`policy-error`. Raw causes are local diagnostics, never adapter JSON.

Lifecycle state and cleanup lists belong to one dispatch; concurrent requests share
neither. Registration closes before handlers run; handlers may register cleanup,
but cleanup cannot append more cleanup. Modules are trusted local code, as in the
existing middleware system. They must settle their promises and release resources
promptly. This slice bounds request size and lifecycle ownership, not execution time;
it does not sandbox middleware or safely cancel arbitrary JavaScript callbacks.

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
capabilities: such fields are rejected. This binding describes implementation behavior;
it is not proof that a remote caller really enforces the result.

The transport accepts at most 16 KiB and emits one JSON response on stdout.
Diagnostics contain outcome codes on stderr, with no raw exception or input dump.
Policy reasons are trusted module output and must not include sensitive request data.
Exit statuses are 0 allow, 1 intentional deny, 2 invalid JSON/request/oversize,
3 policy or cleanup error, 4 unsupported enforcement, 5 transport failure.
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
npx vitest run tests/unit/policy.test.ts tests/unit/mock-provider.test.ts tests/integration/mock-provider.test.ts tests/unit/core.test.ts tests/unit/execution-policy.test.ts tests/unit/environment.test.ts tests/unit/events.test.ts
npx vitest run --config vitest.policy.config.ts --coverage
npx stryker run stryker.policy.config.json
```

The focused coverage configuration gates the two new implementation modules at
95% lines / 90% branches per file; existing repository gates remain unchanged.
The separate mutation pilot measures complete modules with no source exclusions
or timeout credit. It does not replace established Core middleware regression gates.
See [the executed validation record](validation/provider-policy-v1.md) for results,
survivor review and platform limits.
