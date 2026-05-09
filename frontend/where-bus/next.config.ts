import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        // Whenever the frontend asks for /api/transit/...
        source: '/api/transit/:path*',
        // Silently proxy the request to the Spring Boot server
        destination: 'http://localhost:8080/api/transit/:path*',
      },
    ];
  },
};

export default nextConfig;
