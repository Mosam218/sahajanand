import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Run an async loader and track its state.
 * Re-runs when `deps` change; ignores results that arrive after a newer run.
 *
 * @param {() => Promise<any>} loader
 * @param {Array} deps
 * @param {{enabled?: boolean}} [options]
 * @returns {{data: any, loading: boolean, error: Error|null, reload: () => void, setData: Function}}
 */
export function useAsync(loader, deps, { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, loading: enabled, error: null });
  const [tick, setTick] = useState(0);
  const run = useRef(0);
  const fn = useRef(loader);
  fn.current = loader;

  useEffect(() => {
    if (!enabled) { setState({ data: null, loading: false, error: null }); return undefined; }
    const id = ++run.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn.current()
      .then((data) => { if (run.current === id) setState({ data, loading: false, error: null }); })
      .catch((error) => { if (run.current === id) setState((s) => ({ data: s.data, loading: false, error })); });
    return () => { run.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback((data) => setState((s) => ({ ...s, data: typeof data === 'function' ? data(s.data) : data })), []);
  return { ...state, reload, setData };
}
