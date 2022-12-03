import { sveltekit } from "@sveltejs/kit/vite";
import { versionedWorker, fetchLast } from "./plugins/index.js";

const config = {
	plugins: [
		sveltekit(),
		versionedWorker({
			lastInfo: fetchLast("https://hedgehog125.github.io/SvelteKit-Plugin-Versioned-Worker/.versionedWorker.json")
		})
	]
};

export default config;