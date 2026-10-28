/** Share simultaneous reads only. Settled responses are never cached. */
export function createInflightReads() {
  const pending = new Map<string, Promise<unknown>>();
  return function read<T>(key: string, load: () => PromiseLike<T>): Promise<T> {
    const existing = pending.get(key);
    if (existing) return existing as Promise<T>;
    const request = Promise.resolve().then(load).finally(() => {
      if (pending.get(key) === request) pending.delete(key);
    });
    pending.set(key, request);
    return request;
  };
}

export const notificationReads = createInflightReads();