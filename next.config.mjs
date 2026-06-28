/** @type {import('next').NextConfig} */
const nextConfig = {
    // 🛡️ Previne vazamento do código-fonte TypeScript no build de Produção
    productionBrowserSourceMaps: false,
};

export default nextConfig;
