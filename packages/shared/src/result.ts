/**
 * Typed result.
 *
 * Domain rules return errors; they do not throw. A financial invariant that fails
 * must be a value the caller is forced by the type system to handle, not an
 * exception that can be swallowed somewhere up the stack.
 */

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export const isOk = <T, E>(r: Result<T, E>): r is Ok<T> => r.ok;
export const isErr = <T, E>(r: Result<T, E>): r is Err<E> => !r.ok;

/** Unwrap for tests and trusted call sites. Throws on Err by design. */
export const unwrap = <T, E>(r: Result<T, E>): T => {
  if (r.ok) return r.value;
  throw new Error(`unwrap called on Err: ${JSON.stringify(r.error)}`);
};

export const mapOk = <T, U, E>(r: Result<T, E>, f: (v: T) => U): Result<U, E> =>
  r.ok ? ok(f(r.value)) : r;
