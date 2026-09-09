# Performance — 9 September 2026

## Method and caveats

Measured against the **production** Supabase project, read-only, through the
real repositories with the service role (a temporary script, since deleted).
The machine was in **low-performance power mode** for part of the day, which
makes absolute numbers unreliable; the before/after pairs below were taken in
the same conditions minutes apart, so the ratios are sound and the absolutes are
not an SLA.

Dataset: 11 active boards, ~7,200 column values, 1,240 stakeholder labels,
six departments, largest 265 requests.

## Portal, before and after today's work

| Operation | Before | After |
| --- | --- | --- |
| Departments tab (`portals.overview`) | 4,214 ms | **175 ms** (89 ms warm) |
| Portal board, biggest department | 6,167 ms | **1,429 ms** |
| One task detail | 5,115 ms | **1,907 ms** |

Four causes, three of them performance:

1. **N+1 reads.** `getById` per item was the whole response time for a few
   hundred tasks. Now batched.
2. **URL length.** One `in(...)` over 265 uuids built an 18 KB query string;
   PostgREST refused it outright (`UND_ERR_HEADERS_OVERFLOW`). Batched at 80
   ids ≈ 3 KB of filter.
3. **Reading far more than the answer needed.** The label scan walked every
   board in turn and read *every column value on each* — 7,224 rows to answer a
   question about 1,240. One targeted `listValuesByColumns` instead: 3,023 ms →
   153 ms.
4. **The request count on the Departments tab** scoped every department on every
   load. Removed at the product owner's instruction; that alone was the
   4,214 → 175 ms.

## The limit that was not a performance problem

`listValuesByColumns` returned exactly **1,000** rows where SQL counted
**1,240**. PostgREST's default `max-rows` truncates and reports nothing. Fixed
by paging with `range` until a short page returns (`unwrapAll`). Recorded here
because it was found while profiling, and because "exactly 1,000" is the tell.

## Known limits, measured rather than assumed

| Limit | Value | Where it bites |
| --- | --- | --- |
| PostgREST default row cap | 1,000 | Any unbounded select; now paged |
| Node request header limit | ~16 KB | `in(...)` filters over ~200+ uuids |
| Chunk size chosen | 80 ids | ~3 KB of filter, comfortably inside both |

## Not measured

- A 1,000-item board and >200 linked ids. **NOT RUN** — the machine in
  low-performance mode would produce numbers about the laptop, not the app.
- Initial load, board switch, memory and subscription growth over a session.
- Realtime event-to-visible latency. **BLOCKED** — needs a disposable Supabase
  project.
