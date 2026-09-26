import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native / binary packages must stay outside the server bundle.
  serverExternalPackages: ["sharp", "ffmpeg-static"],
  experimental: {
    serverActions: { bodySizeLimit: "200mb" },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
