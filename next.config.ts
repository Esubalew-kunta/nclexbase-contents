import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev-mode route indicator overlaps exported slides (it's pinned to
  // the viewport corner, and our screenshots capture past viewport height),
  // so it has to stay off for the /print route's output to be clean.
  devIndicators: false,
  // Emits .next/standalone with a self-contained server plus only the
  // node_modules actually imported. The Docker image copies that instead of
  // the whole project, which keeps it small enough to build and run on a
  // 512 MB free instance.
  output: "standalone",
};

export default nextConfig;
