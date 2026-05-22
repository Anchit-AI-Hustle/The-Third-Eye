/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone only for Docker; Vercel manages its own output
  ...(process.env.VERCEL ? {} : { output: "standalone" }),
  images: {
    domains: ["lh3.googleusercontent.com", "avatars.githubusercontent.com"],
  },
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: `${process.env.BACKEND_URL || "http://backend:8000"}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
