// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

/** These have their own renderers. */
const STAMPED_ATTRIBUTES = new Set(["delivery", "low_stock"]);

export function attributeChips(product: { attributes?: Record<string, string> }): string[] {
  const highlights = [product.attributes?.highlight_1, product.attributes?.highlight_2].filter((value): value is string => Boolean(value));
  if (highlights.length) return highlights;
  return Object.entries(product.attributes ?? {})
    .filter(([key]) => !STAMPED_ATTRIBUTES.has(key))
    .map(([key, value]) => {
      if (/^(yes|true)$/i.test(value)) return key.replaceAll("_", " ");
      if (/^(no|false)$/i.test(value)) return null;
      return value;
    })
    .filter((chip): chip is string => Boolean(chip))
    .slice(0, 3);
}
