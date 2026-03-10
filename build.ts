import fs from "fs/promises";

console.log("Starting build process...");

await fs.rm("./dist", { recursive: true, force: true });
await fs.mkdir("./dist", { recursive: true });

try {
	const result = await Bun.build({
		entrypoints: ["./src/index.html", "./src/configurator.html", "./src/admin.html"],
		outdir: "./dist",
		target: "browser",
		format: "esm",
		minify: true,
		sourcemap: "linked",
		naming: { asset: "[name].[ext]" },
	});

	if (!result.success) {
		console.error("Build failed:", result.logs);
		process.exit(1);
	}

	await fs.cp("./src/_headers", "./dist/_headers");
	await fs.cp("./src/sitemap.xml", "./dist/sitemap.xml");
	await fs.cp("./src/robots.txt", "./dist/robots.txt");

	console.log("Build complete! Output in ./dist");
} catch (error) {
	console.error("Build error:", error);
	process.exit(1);
}
