# 028 — Add max worker limit to WorkerPool

Status: open

## Problem

`WorkerPool` in `eerie-daemon/src/pool.rs` has no maximum limit on spawned
subprocesses. A bug or rapid concurrent requests could spawn unbounded workers,
exhausting system resources.

## Proposed fix

Add a `max_workers: usize` parameter (default to `num_cpus::get()` or a reasonable
constant like 4). When the limit is reached, `circuit().await` should wait for an
idle worker to become available rather than spawning a new one.

Use a `tokio::sync::Semaphore` to enforce the limit.

## Acceptance criteria

- [ ] `WorkerPool::spawn()` accepts a max workers parameter
- [ ] Exceeding the limit blocks until a worker is returned, not spawning new ones
- [ ] Existing tests pass
