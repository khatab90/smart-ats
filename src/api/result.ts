import { errorMessage } from "../lib/errors";

/**
 * Outcome of an API call. Errors are already mapped to a user-facing Arabic
 * message, so callers only decide where to show it.
 */
export type Result<T> = { data: T; error: null } | { data: null; error: string };

export const ok = <T>(data: T): Result<T> => ({ data, error: null });
export const fail = <T = never>(err: unknown): Result<T> => ({ data: null, error: errorMessage(err) });

/**
 * Runs a Supabase request and maps its `{ data, error }` into a Result.
 * `map` converts the raw row(s) at the API boundary — the only place where
 * JSON columns are asserted into their protocol shapes.
 */
/** Data type of the success branch of a Supabase response. */
type Success<P> = P extends { error: null; data: infer D } ? D : never;

export async function run<P extends { data: unknown; error: unknown }, T = Success<P>>(
  request: PromiseLike<P>,
  map?: (data: Success<P>) => T,
): Promise<Result<T>> {
  try {
    const res = await request;
    if (res.error) return fail(res.error);
    const data = res.data as Success<P>;
    return ok(map ? map(data) : (data as unknown as T));
  } catch (e) {
    return fail(e);
  }
}

/** Asserts a database row (with JSON columns) into its domain type. */
export const asRow = <T>(row: unknown) => row as T;
