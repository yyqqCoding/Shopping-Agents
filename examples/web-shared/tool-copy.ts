const TOOL_COPY: Record<string, string> = {
  search_products: "正在查找商品…", get_product_details: "正在查看商品详情…",
  search_policies: "正在核对相关规则…", get_orders: "正在查看订单…", get_order_status: "正在查询订单状态…",
  get_fulfillment_options: "正在查看配送与自提选项…", get_cart: "正在查看购物车…",
  add_to_cart: "正在加入购物车…", update_cart_item: "正在调整数量…", remove_from_cart: "正在移除商品…",
  checkout: "正在整理结算摘要…", load_skill: "正在整理需求…", web_search: "正在检索资料…",
};
export function describeToolCall(tool: string, input: Record<string, unknown> = {}): string {
  const copy = TOOL_COPY[tool] ?? (tool.startsWith("present_") ? "正在整理推荐…" : "正在处理…");
  const query = typeof input.query === "string" ? input.query.trim() : "";
  return query && /[\u3400-\u9fff]/.test(query) ? `${copy} · ${query}` : copy;
}
