// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

"use client";

import { useEffect, useState } from "react";

type Loader<P> = () => Promise<P[] | null>;

const indexes = new WeakMap<object, Promise<Record<string, unknown> | null>>();

/** Share successful loads; retry a temporary outage without caching an empty catalog. */
export function useCatalogIndex<P extends { product_id: string }>(
  load: Loader<P>,
): Record<string, P> {
  const [index, setIndex] = useState<Record<string, P>>({});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let promise = indexes.get(load) as Promise<Record<string, P> | null> | undefined;
    if (!promise) {
      promise = load().then((products) => {
        if (products === null) { indexes.delete(load); return null; }
        return Object.fromEntries(products.map((product) => [product.product_id, product]));
      }).catch(() => { indexes.delete(load); return null; });
      indexes.set(load, promise);
    }
    let mounted = true;
    let retry: number | undefined;
    void promise.then((value) => {
      if (!mounted) return;
      if (value !== null) setIndex(value);
      else retry = window.setTimeout(() => setAttempt((n) => n + 1), 5000);
    });
    return () => {
      mounted = false;
      window.clearTimeout(retry);
    };
  }, [load, attempt]);
  return index;
}
