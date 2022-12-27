import { sveltekit } from "@sveltejs/kit/vite";
import { versionedWorker, fetchLast, readLast } from "sveltekit-plugin-versioned-worker";

export default {
	plugins: [
		sveltekit(),
		versionedWorker({
			lastInfo: process.env.DISABLE_BASE_URL === "true"?
				readLast("build/versionedWorker.json")
				: fetchLast("https://hedgehog125.github.io/SvelteKit-Plugin-Versioned-Worker/versionedWorker.json")
		})
	]
};