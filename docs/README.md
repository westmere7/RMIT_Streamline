# docs/

Design notes written while features were being built. Each one is dated and
describes the code **as it was then**; none is kept in step with later changes.
For how things work now, read [`KNOWLEDGE_BASE.md`](../KNOWLEDGE_BASE.md) (the
technical reference) and the in-app guide (Settings → Guide, from
`src/features/workspace/documentation/guide-content.ts`).

| Note | Written | What it records | Superseded by |
| --- | --- | --- | --- |
| [`dashboard-revision-note.md`](dashboard-revision-note.md) | 9 Sep 2026 | What the dashboard could honestly report, before its revision | KB §13b (one scrolling report, effort, thin-data states, public link) |
| [`dashboard-revision-report.md`](dashboard-revision-report.md) | 9 Sep 2026 | The revision as delivered: kept, cut and added panels | KB §13b |
| [`mobile-rebuild.md`](mobile-rebuild.md) | 9 Sep 2026 | The phone shell: one boundary at 768 px, one shell mounted, Browse and More | KB §13d and `Test_prompts/audits/2026-09-26-full-e2e/MOBILE_AUDIT.md` |
| [`stakeholder-portal-plan.md`](stakeholder-portal-plan.md) | 9 Sep 2026 | The first portal model: departments with durable ids, one link per department | KB §13c (one link per workspace since 11 Sep; per-link settings; booking by department name) |

Audits live in [`Test_prompts/audits/`](../Test_prompts/audits/); the latest is
[`2026-09-26-full-e2e`](../Test_prompts/audits/2026-09-26-full-e2e/README.md).
