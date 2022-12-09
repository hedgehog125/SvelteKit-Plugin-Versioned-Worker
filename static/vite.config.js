import { sveltekit } from "@sveltejs/kit/vite";
import { versionedWorker, fetchLast, readLast } from "./plugins/index.js";

const config = {
	plugins: [
		sveltekit(),
		versionedWorker({
			lastInfo: process.env.DISABLE_BASE_URL?
				readLast("build/.versionedWorker.json")
				: fetchLast("https://hedgehog125.github.io/SvelteKit-Plugin-Versioned-Worker/.versionedWorker.json")
		})
	]
};

export default config;