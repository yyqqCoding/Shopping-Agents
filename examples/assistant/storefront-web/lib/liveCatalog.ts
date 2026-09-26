import type { ProductDetails } from "./types";

/** Server components only: the API as the web server reaches it (the browser uses the /api rewrite). */
const API_URL = process.env.API_INTERNAL_URL || "http://127.0.0.1:8004";

async function read<T>(path: string): Promise<{ status: number; body?: T }> {
  try {
    const response = await fetch(`${API_URL}/api${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    return response.ok ? { status: response.status, body: (await response.json()) as T } : { status: response.status };
  } catch {
    return { status: 0 };
  }
}

/**
 * The listed equipment with live price and stock, or null when the API cannot be
 * reached (the page then shows the authored catalog).
 */
export async function liveEquipment(): Promise<ProductDetails[] | null> {
  const page = await read<{ products: ProductDetails[] }>("/products?limit=100");
  return page.body?.products ?? null;
}

/** One record with live stock; null when the catalog has no such id, undefined when unreachable. */
export async function liveEquipmentById(id: string): Promise<ProductDetails | null | undefined> {
  const record = await read<ProductDetails>(`/products/${encodeURIComponent(id)}`);
  if (record.status === 404) return null;
  return record.body;
}
