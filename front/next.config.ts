import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: ['three'],
  reactStrictMode: false, // 기본값은 true입니다. false로 변경하세요.
};

export default nextConfig;
