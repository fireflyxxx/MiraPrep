import type { NextConfig } from "next";

function originOf(value: string | undefined, fallback: string) {
  try {
    return new URL(value ?? fallback).origin;
  } catch {
    return fallback;
  }
}

const apiOrigin = originOf(
  process.env.NEXT_PUBLIC_API_BASE_URL,
  "http://localhost:8080",
);
const aiOrigin = originOf(
  process.env.NEXT_PUBLIC_AI_STREAM_URL,
  "http://localhost:8000",
);
const aiWebSocketOrigin = aiOrigin.replace(/^http/, "ws");
const developmentScriptSource =
  process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
const developmentConnectSource =
  process.env.NODE_ENV === "development" ? " ws:" : "";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    viewTransition: true,
    optimizeCss: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              `default-src 'self'; script-src 'self' 'unsafe-inline'${developmentScriptSource}; ` +
              "style-src 'self' 'unsafe-inline'; " +
              "img-src 'self' data: blob:; font-src 'self' data:; " +
              `connect-src 'self' ${apiOrigin} ${aiOrigin} ${aiWebSocketOrigin}${developmentConnectSource}; ` +
              "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
