import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // The greeting's voice note is converted with ffmpeg on the server: keep the package's own path
  // to its binary, and ship the binary with the page whose actions convert.
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/settings/respostas-automaticas": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/settings/campanhas": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
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
