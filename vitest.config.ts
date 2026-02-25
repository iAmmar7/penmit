import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts', // entry point - side effects on import, no logic
        'src/types.ts', // TypeScript type declarations only, no runtime code
      ],
    },
  },
});
