import fs from "fs/promises";

console.log("🚀 Starting build process...");

await fs.rm("./dist", { recursive: true, force: true });
await fs.mkdir("./dist", { recursive: true });

try {
	const result = await Bun.build({
		entrypoints: ["./src/index.js"],
		outdir: "./dist",
		target: "browser",
		format: "esm",
		minify: true,
		sourcemap: "external",
	});

	if (!result.success) {
		console.error("❌ Build failed:", result.logs);
		process.exit(1);
	}

	const result2 = await Bun.build({
		entrypoints: ["./src/configurator.js"],
		outdir: "./dist",
		target: "browser",
		format: "esm",
		minify: false,
		sourcemap: "external",
	});

	if (!result2.success) {
		console.error("❌ Build failed:", result2.logs);
		process.exit(1);
	}

	await fs.cp("./src/index.html", "./dist/index.html");
	await fs.cp("./src/index.css", "./dist/index.css");
	await fs.cp("./src/configurator.html", "./dist/configurator.html");
	await fs.cp("./src/configurator.css", "./dist/configurator.css");
	await fs.cp("./src/_headers", "./dist/_headers");
	await fs.cp("./src/logo.svg", "./dist/logo.svg");
	await fs.cp("./src/sitemap.xml", "./dist/sitemap.xml");
	await fs.cp("./src/robots.txt", "./dist/robots.txt");

	console.log("🎉 Build complete! Output in ./dist");
} catch (error) {
	console.error("❌ Build error:", error);
	process.exit(1);
}
