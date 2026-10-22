import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../../lib/utils';

interface ApiState<T> {
  fetcher: unknown;
  nonce: number;
  data: T | null;
  error: string | null;
}

/**
 * Runs `fetcher` whenever its identity changes (wrap it in useCallback) or `reload()` is called.
 * State is only written from the async callbacks, so effects never set state synchronously.
 * Pass `null` to skip fetching. The previous data is kept while a new request is in flight.
 */
export function useApi<T>(fetcher: (() => Promise<T>) | null) {
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<ApiState<T>>({ fetcher: null, nonce: -1, data: null, error: null });

  useEffect(() => {
    if (!fetcher) return;
    let active = true;
    fetcher().then(
      (data) => {
        if (active) setState({ fetcher, nonce, data, error: null });
      },
      (e) => {
        if (active) setState((prev) => ({ fetcher, nonce, data: prev.data, error: errorMessage(e) }));
      }
    );
    return () => {
      active = false;
    };
  }, [fetcher, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const settled = state.fetcher === fetcher && state.nonce === nonce;
  return {
    data: state.data,
    error: settled ? state.error : null,
    loading: !!fetcher && !settled,
    /** True when `data` belongs to the current request (not a previous one). */
    fresh: settled,
    reload,
  };
}
