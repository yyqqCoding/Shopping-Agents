// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import { AgentApi } from "web-shared";
import type { CartPayload, Product, ProductDetails } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export const api = new AgentApi(API_URL, "/api", "outdoor-v1");

export const UNREACHABLE = "暂时无法连接户外助手，请稍后重试。";

export async function fetchProducts(): Promise<Product[] | null> {
  const products: Product[] = [];
  for (let offset = 0; ; offset += 100) {
    const data = await api.get<{ products: Product[]; has_more: boolean }>("/products", { limit: "100", offset: String(offset) });
    if (!data) return null;
    products.push(...data.products);
    if (!data.has_more) return products;
  }
}

export function fetchProduct(productId: string): Promise<ProductDetails | null> {
  return api.get<ProductDetails>(`/products/${encodeURIComponent(productId)}`);
}

export async function addToCart(productId: string, quantity = 1): Promise<CartPayload | null> {
  if (!api.session) return null;
  const key = `acme.cart-request:${api.session}:${productId}:${quantity}`;
  const requestId = sessionStorage.getItem(key) || crypto.randomUUID();
  sessionStorage.setItem(key, requestId);
  try {
    const data = await api.requestOrThrow<{ cart: CartPayload }>("/cart/add", {
      method: "POST", body: JSON.stringify({ product_id: productId, quantity, request_id: requestId }),
    });
    sessionStorage.removeItem(key);
    return data.cart;
  } catch { return null; }
}
