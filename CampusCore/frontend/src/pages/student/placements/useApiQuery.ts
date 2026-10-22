import { useCallback, useEffect, useState } from 'react';
import { ApiClient, ApiError } from '../../../lib/api';
import { errorMessage } from '../../../lib/utils';

interface QueryState<T> {
  key: string | null;
  data: T | null;
  error: string | null;
  status?: number;
}

/**
 * GETs `path` whenever it changes (pass null to skip). The previous data is kept while a new
 * request is in flight so lists don't flash; `loading` is derived, so no state is set synchronously
 * inside the effect.
 */
export function useApiQuery<T>(path: string | null) {
  const [nonce, setNonce] = useState(0);
  const key = path === null ? null : `${nonce}|${path}`;
  const [state, setState] = useState<QueryState<T>>({ key: null, data: null, error: null });

  useEffect(() => {
    if (path === null) return;
    let alive = true;
    const k = `${nonce}|${path}`;
    ApiClient.get<T>(path).then(
      (data) => {
        if (alive) setState({ key: k, data, error: null });
      },
      (e: unknown) => {
        if (alive)
          setState((s) => ({
            key: k,
            data: s.data,
            error: errorMessage(e),
            status: e instanceof ApiError ? e.status : undefined,
          }));
      }
    );
    return () => {
      alive = false;
    };
  }, [path, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const setData = useCallback((fn: (d: T | null) => T | null) => setState((s) => ({ ...s, data: fn(s.data) })), []);
  const loading = key !== null && state.key !== key;

  return {
    data: state.data,
    loading,
    error: loading ? null : state.error,
    errorStatus: loading ? undefined : state.status,
    reload,
    setData,
  };
}
