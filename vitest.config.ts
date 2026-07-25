import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import path from 'path';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode || 'test', process.cwd(), '');
    return {
        test: {
            globals: true,
            environment: 'node',
            // Suíte padrão: apenas testes unitários (sem rede/Supabase/servidor).
            // Para a suíte de integração: npm run test:integration
            include: ['__tests__/unit/**/*.test.ts', '__tests__/unit/**/*.test.tsx'],
            testTimeout: 30000,
            env,
        },
        resolve: {
            alias: {
                '@': path.resolve(__dirname, 'src'),
            },
        },
    };
});
