// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0

import type { NextConfig } from "next";
import path from "node:path";

// Product photos are static files under public/products, served by this app directly.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: process.env.SHOPPING_STANDALONE === "1" ? "standalone" : undefined,
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["web-shared"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${process.env.API_INTERNAL_URL || "http://127.0.0.1:8004"}/api/:path*` }];
  },
};

export default nextConfig;
