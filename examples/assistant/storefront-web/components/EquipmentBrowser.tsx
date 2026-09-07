"use client";
import { useEffect, useMemo, useState } from "react";
import { fetchProducts } from "@/lib/api";
import type { Product } from "@/lib/types";
import EquipmentCard from "./EquipmentCard";

export default function EquipmentBrowser({
  initialProducts,
  categories,
}: {
  initialProducts: Product[];
  categories: string[][];
}) {
  const [products, setProducts] = useState(initialProducts);
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("featured");
  const [available, setAvailable] = useState(false);
  const [limit, setLimit] = useState(24);
  const [catalogOnly, setCatalogOnly] = useState(true);
  const [refreshing, setRefreshing] = useState(true);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    setRefreshing(true);
    void fetchProducts()
      .then((result) => {
        if (live && result) {
          setProducts(result);
          setCatalogOnly(false);
        }
      })
      .catch(() => {
        /* The public authored catalog stays available. */
      })
      .finally(() => {
        if (live) setRefreshing(false);
      });
    return () => {
      live = false;
    };
  }, [reload]);
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return products
      .filter(
        (p) =>
          (!category || p.category === category) &&
          (!available || p.in_stock !== false) &&
          (!term ||
            `${p.title} ${p.short_description ?? ""} ${Object.values(p.attributes ?? {}).join(" ")}`
              .toLocaleLowerCase()
              .includes(term)),
      )
      .sort((a, b) =>
        sort === "price-up"
          ? a.price - b.price
          : sort === "price-down"
            ? b.price - a.price
            : Number(b.in_stock !== false) - Number(a.in_stock !== false),
      );
  }, [products, category, query, sort, available]);
  function reset() {
    setCategory("");
    setQuery("");
    setAvailable(false);
    setSort("featured");
    setLimit(24);
  }
  return (
    <div className="catalog-browser">
      <div className="catalog-toolbar">
        <label className="catalog-search">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="10.5"
              cy="10.5"
              r="6.5"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path d="m16 16 5 5" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(24);
            }}
            placeholder="搜索帐篷、背包、头灯…"
            aria-label="搜索装备"
          />
        </label>
        <label className="catalog-sort">
          排序
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="featured">默认顺序</option>
            <option value="price-up">价格从低到高</option>
            <option value="price-down">价格从高到低</option>
          </select>
        </label>
      </div>
      <div className="catalog-categories" aria-label="装备分类">
        {[["", "全部装备"], ...categories].map(([id, label]) => (
          <button
            type="button"
            key={id}
            aria-pressed={category === id}
            onClick={() => {
              setCategory(id);
              setLimit(24);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="catalog-results-line">
        <p role="status">找到 {filtered.length} 款装备</p>
        <label>
          <input
            type="checkbox"
            checked={available}
            onChange={(e) => {
              setAvailable(e.target.checked);
              setLimit(24);
            }}
          />
          仅看有货
        </label>
      </div>
      {catalogOnly && (
        <p className="catalog-notice">
          {refreshing ? (
            "正在同步商品信息，先看看装备目录。"
          ) : (
            <>
              当前展示目录数据，库存以助手确认为准。
              <button type="button" onClick={() => setReload((n) => n + 1)}>
                重新同步
              </button>
            </>
          )}
        </p>
      )}
      <div className="catalog-grid">
        {filtered.slice(0, limit).map((product) => (
          <EquipmentCard key={product.product_id} product={product} />
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="catalog-empty">
          <h2>换个词，再找找。</h2>
          <p>试试装备名称，或清除分类与库存筛选。</p>
          <button className="field-button" onClick={reset}>
            清除筛选
          </button>
        </div>
      )}
      {filtered.length > limit && (
        <div className="catalog-more">
          <button
            className="field-button"
            onClick={() => setLimit((n) => n + 24)}
          >
            再看一些装备 <span>{Math.min(24, filtered.length - limit)} 款</span>
          </button>
        </div>
      )}
    </div>
  );
}
