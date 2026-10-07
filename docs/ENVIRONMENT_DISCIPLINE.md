# Environment Discipline — Standing Rules for Coding Agents

Read this before anything else on every session.

1. **One directive pass at a time.** Execute exactly the pass you were given; do not begin the next pass on your own initiative. Report at the end of each pass with: what was done, what was verified, and any deviations.
2. **Checkpoint before long-running steps.** Commit and push work-in-progress to a `wip/<pass-name>` branch after each completed unit of work and BEFORE every long-running step (test suites, builds). If a session dies, continue from the WIP branch; never restart from scratch. After final verified delivery, squash-merge to main and delete the branch.
3. **Chunked invocations.** Run test suites and builds in per-suite or small-batch invocations, never as one long silent run. Chunked is the default; a full-suite single run is the exception.
4. **Honest negatives.** Never invent data, rates, wording, or behaviour to fill a gap. Surface gaps as explicit notices in the report. An exclusion or deferral verdict is a first-class deliverable; never invent a feature to justify a pass.
5. **The specification prevails.** `docs/SPECIFICATION.md` is the authority of record for behaviour. Any contradiction between a directive and the specification is stopped and reported, never silently resolved.
6. **Privacy constraints are non-negotiable.** No network calls at runtime; no CDN fetches; no telemetry; no hardcoded column names or business terminology. The offline (airplane-mode) requirement applies to every delivery.
7. **Example data only.** Test fixtures come exclusively from `example-data/` and are generic and fictional. Never add real-world data, real organisation names, or domain-specific terminology to the repository.
8. **Versioning.** Bump the spec version on each delivered pass and record it in the changelog section of the specification.
9. **Formal register.** Write reports, commit messages, and documentation in a formal, precise register: no contractions, no slang, no emojis.
