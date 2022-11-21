import { sveltekit } from "@sveltejs/kit/vite";
import * as versionedWorker from "./plugins/index.js";

const config = {
	plugins: [
		sveltekit(),
		versionedWorker.plugin({
			lastBuild: versionedWorker.downloadLastBuild.degit("hedgehog125/SvelteKit-Plugin-Versioned-Worker")
		})
	]
};

export default config;