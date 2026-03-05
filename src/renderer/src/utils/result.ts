import { ok, err, type Result } from 'neverthrow'

/**
 * Convert a roam-generated discriminated union into a neverthrow Result.
 *
 * Roam codegen emits: `{ ok: true; value: T } | { ok: false; error: E }`
 * This bridges it to neverthrow's `Result<T, E>`.
 */
export function fromRoamResult<T, E>(
  res: { ok: true; value: T } | { ok: false; error: E },
): Result<T, E> {
  return res.ok ? ok(res.value) : err(res.error)
}
