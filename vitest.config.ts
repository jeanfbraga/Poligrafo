import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import path from 'path';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode || 'test', process.cwd(), '');
    return {
        test: {
            globals: true,
            environment: 'node',
            include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx'],
            testTimeout: 30000,
            env,
        },
        resolve: {
            alias: {
                '@': path.resolve(__dirname, '.'),
            },
        },
    };
});
