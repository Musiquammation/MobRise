import { defineConfig } from "vite";

export default defineConfig({
	// Relative URLs in the built index.html: the same build works at "/" and under "/MobRise/".
	base: "./",
	server: { port: 5173 },
	build: { outDir: "dist", emptyOutDir: true },
});
