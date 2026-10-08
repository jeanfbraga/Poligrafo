/** @type {import('next').NextConfig} */
const nextConfig = {
    // 🛡️ Previne vazamento do código-fonte TypeScript no build de Produção
    productionBrowserSourceMaps: false,
    serverExternalPackages: ["playwright", "playwright-core"],
};

export default nextConfig;
