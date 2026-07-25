import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import path from 'path';

// Suíte de integração — NÃO roda no `npm test` padrão.
// Pré-requisitos: servidor Next rodando em localhost:3000 (`npm run dev`),
// Supabase real populado e acesso à rede (alguns testes usam Playwright
// e scraping ao vivo). Inclui os testes colocalizados em src/, que em sua
// maioria dependem de serviços externos.
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode || 'test', process.cwd(), '');
    return {
        test: {
            globals: true,
            environment: 'node',
            include: [
                '__tests__/integration/**/*.test.ts',
                '__tests__/integration/**/*.test.tsx',
                '__tests__/estados/**/*.test.ts',
                'src/**/*.test.ts',
                'src/**/*.test.tsx',
            ],
            testTimeout: 120000,
            env,
        },
        resolve: {
            alias: {
                '@': path.resolve(__dirname, 'src'),
            },
        },
    };
});
