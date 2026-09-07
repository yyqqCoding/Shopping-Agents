import catalog from "../../data/catalog.json";
import type { ProductDetails } from "./types";

/** Public authored catalog, available before a visitor creates a conversation. */
export const equipment = catalog.products as unknown as ProductDetails[];
export const categories = [
  ...new Map(
    equipment.map((product) => [
      product.category!,
      product.attributes?.category_label ?? product.category!,
    ]),
  ).entries(),
];
export function equipmentById(id: string) {
  return equipment.find((product) => product.product_id === id);
}
