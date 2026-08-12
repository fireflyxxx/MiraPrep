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

/**
 * T-120：Google Identity Services 要加载脚本、注入样式、开一个 iframe 并回连 Google。
 * 只在配了 client id 时才放开这四个来源，没接 Google 的部署仍是原来的紧策略。
 */
const gis = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  ? {
      script: " https://accounts.google.com/gsi/client",
      style: " https://accounts.google.com/gsi/style",
      frame: " https://accounts.google.com/gsi/",
      connect: " https://accounts.google.com/gsi/",
    }
  : { script: "", style: "", frame: "", connect: "" };

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
              `default-src 'self'; script-src 'self' 'unsafe-inline'${developmentScriptSource}${gis.script}; ` +
              `style-src 'self' 'unsafe-inline'${gis.style}; ` +
              // 第三方登录带回来的头像域名（Google / GitHub）。
              "img-src 'self' data: blob: https://lh3.googleusercontent.com " +
              "https://avatars.githubusercontent.com; font-src 'self' data:; " +
              `connect-src 'self' ${apiOrigin} ${aiOrigin} ${aiWebSocketOrigin}${developmentConnectSource}${gis.connect}; ` +
              `frame-src 'self'${gis.frame}; ` +
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
