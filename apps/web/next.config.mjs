/** @type {import('next').NextConfig} */
const nextConfig = {
  // Internal packages serve TypeScript from src directly (no build step).
  transpilePackages: ['@ai-shop/shared', '@ai-shop/db'],
  reactStrictMode: true,
  webpack: (config) => {
    // The internal packages use NodeNext-style `.js` import specifiers that
    // actually point at `.ts` sources. Teach webpack to resolve `.js` -> `.ts`
    // so transpilePackages can bundle them without a build step.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
      ...config.resolve.extensionAlias,
    };
    return config;
  },
};

export default nextConfig;
