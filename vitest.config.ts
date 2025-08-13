import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["src/**/*.spec.ts"],
		globals: true,
		restoreMocks: true,
		coverage: {
			provider: "v8",
			reporter: ["text", "html", "lcov"],
			reportsDirectory: "./coverage",
			all: true,
			include: ["src/**"],
			exclude: ["src/examples/**", "src/**/README.md", "**/*.d.ts"],
		},
	},
});
