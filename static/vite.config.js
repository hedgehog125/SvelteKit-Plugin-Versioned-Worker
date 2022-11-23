import { sveltekit } from "@sveltejs/kit/vite";
import * as versionedWorker from "./plugins/index.js";

const config = {
	plugins: [
		sveltekit(),
		versionedWorker.plugin({
			lastInfo: versionedWorker.downloadLastInfo.fetch("https://hedgehog125.github.io/SvelteKit-Plugin-Versioned-Worker/.versionedWorker.json")
		})
	]
};

export default config;