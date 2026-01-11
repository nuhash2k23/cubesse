/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  webpack: (config) => {
    config.devtool = false;
    return config;
  },
}

export default nextConfig;