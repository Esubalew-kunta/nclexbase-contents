import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev-mode route indicator overlaps exported slides (it's pinned to
  // the viewport corner, and our screenshots capture past viewport height),
  // so it has to stay off for the /print route's output to be clean.
  devIndicators: false,
};

export default nextConfig;
