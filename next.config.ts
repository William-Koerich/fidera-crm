import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  async redirects() {
    // Ajustes used to group several subjects per page; old links land on the first of each.
    return [
      { source: "/settings/respostas", destination: "/settings/respostas-rapidas", permanent: false },
      { source: "/settings/atendimento", destination: "/settings/servicos", permanent: false },
    ];
  },
  partialPrefetching: true,
  async headers() {
    // The website chat is shown inside other sites' pages; everything else stays out of frames.
    return [
      { source: "/w/:path*", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }] },
      { source: "/((?!w/).*)", headers: [{ key: "X-Frame-Options", value: "DENY" }] },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
