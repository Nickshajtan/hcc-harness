# Documentation map

Canonical guidance describes main `b562cbf86a884c98325b855dfc9dd02f4ac6a727`.
Implementation references are repository-relative so they follow this documentation
branch. Validation reports describe their own revisions, not a new acceptance run
of this baseline. Start with the [root README](../README.md).

| Document                                      | Purpose                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------- |
| [Architecture](architecture.md)               | Single component overview, execution sequence and delegation boundaries         |
| [Capabilities](capabilities.md)               | Implemented versus verified guarantees and their limits                         |
| [Usage](usage.md)                             | Installation, routing activation, configuration and recovery                    |
| [Compatibility](compatibility.md)             | Platforms, filesystems, provider and terminal limitations                       |
| [Provider policy](provider-policy.md)         | Typed API, required policies, deadlines and mock adapter                        |
| [Testing](testing.md)                         | Reproduction commands, prerequisites and CI interpretation                      |
| [Runtime portability](runtime-portability.md) | Current stable installation/runtime contract with retained B1/B2 design history |
| [Decisions](decisions/README.md)              | Settled boundaries, alternatives and extension constraints                      |
| [Validation index](validation/README.md)      | All original reports, revisions, verdicts and later qualifications              |
| [Engineering standards](standards/README.md)  | Normative development rules and quality gates                                   |
| [Documentation audit](documentation-audit.md) | Baseline verification, preservation mapping and remaining discrepancies         |

## Historical implementation and investigation records

These are chronological evidence, not competing current architecture overviews.
Their original failures, dates and scope remain relevant; later acceptance is linked
from the [validation index](validation/README.md).

- [FS-1 Node publication investigation](fs-1-publication.md): blocked Node-only design.
- [FS-1.0a setup publication](fs-1.0a-setup-publication.md): staged per-file publication.
- [FS-1.2 native publication](fs-1.2-native-publication.md): Windows helper and setup authority.
- [F1-F5 stabilization](stabilization-f1-f5.md): implementation, blocked review,
  controlled Avast comparison and test-only handle-release correction.
- [Measured quality baseline](standards/quality-baseline.md) and
  [complexity inventory](standards/complexity-inventory.json): revision-scoped quality
  measurements and unresolved incidents; numerical results are not current-main reruns.

No files were moved or renamed in this consolidation. Stable report paths preserve
external references and original evidence; maintained indexes provide classification.
