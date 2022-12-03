/*
TODO

Call bundle.close
Make recursiveList parrelel?
*/

import path from "path";
import fs from "fs/promises";

import crypto from "crypto";
import degit from "degit";
import { installPolyfills } from "@sveltejs/kit/node/polyfills";
installPolyfills();


const DOWNLOAD_TMP = "tmp/downloadBuildTmp";
const STAGE_SHARED_DATA = "tmp/stageSharedData.json";
const WORKER_FILE = "sw.js";
const WORKER_FOLDER = "sw";
const VERSION_FILE = "version.txt";
const INFO_FILE = ".versionedWorker.json";
const DEFAULT_STATIC_FOLDER = "static";


const generateInitialInfo = svelteConfig => ({
	formatVersion: 1,
	filesAndFolders: [],
	staticHashes: {},
	svelteConfig
});
const makeTemp = async _ => {
	let exists = true;
	try {
		await fs.stat("tmp");
	}
	catch {
		exists = false;
	}
	if (exists) {
		await fs.rm("tmp", {
			recursive: true
		});
	}

	await fs.mkdir("tmp");
};
const hash = data => {
	const hasher = crypto.createHash("md5");
	hasher.update(data);
	return hasher.digest("hex");
};
export const recursiveList = async folder => {
	let found = [];
	await recursiveListSub(folder, found, "");
	return found;
};
const recursiveListSub = async (folder, found, relativeFolderPath) => {
	let files = await fs.readdir(folder);

	for (let fileName of files) {
		const filePath = path.join(folder, fileName);
		const relativePath = path.join(relativeFolderPath, fileName);

		let info = await fs.stat(filePath);
		if (info.isDirectory()) {
			found.push({
				path: relativePath,
				isFolder: true
			});

			await recursiveListSub(filePath, found, relativePath);
		}
		else if (info.isFile()) {
			found.push({
				path: relativePath,
				isFolder: false
			});
		}
	}
};
class VersionedWorkerError extends Error {};

export function versionedWorker(config) {
	if (config.lazyCache == null) config.lazyCache = _ => false; 

	const dev = process.env.NODE_ENV != "production";
	if (dev) return null;

	let viteConfig;
	let svelteConfig;

	let isSSR;
	let backgroundTask;
	let lastBuild;
	let staticHashes;


	const init = async (config, methods) => {
		await makeTemp();
		await fs.mkdir(DOWNLOAD_TMP);
	
		{
			let output = config.lastInfo(DOWNLOAD_TMP, methods);
			if (output instanceof Promise) output = await output;
			if (output == null) output = generateInitialInfo(svelteConfig);
			else {
				try {
					output = JSON.parse(output);
				}
				catch {
					throw new VersionedWorkerError(`Couldn't parse the info file from the last build. Contents:\n${output}`);
				}
			}
			lastBuild = output;
		}

		// Since the static files aren't changed during the build, we can start hashing them now
		{
			staticHashes = Object.create(null, {});
			const staticFolder = path.join(svelteConfig.root, svelteConfig.kit.files.assets);
			const staticFiles = await recursiveList(staticFolder);
			for (const fileInfo of staticFiles) {
				if (fileInfo.isFolder) continue;

				const contents = await fs.readFile(path.join(staticFolder, fileInfo.path));
				staticHashes[fileInfo.path] = hash(contents);
			}
		}
	};
	const cleanUp = async _ => {
		await fs.rm("tmp", {
			recursive: true
		});
	};

	return {
		name: "versioned-worker",
		configResolved(config) {
			viteConfig = config;
			isSSR = viteConfig.build.ssr;
		},
		async buildStart(options) {
			if (isSSR) return;

			svelteConfig = options.plugins.find(plugin => plugin.name == "vite-plugin-svelte");
			if (svelteConfig == null) throw new VersionedWorkerError("Couldn't find SvelteKit plugin.");
			svelteConfig = svelteConfig.api.options;

			// For some reason this doesn't have the defaults which is cringe
			if (svelteConfig.kit.files == null) svelteConfig.kit.files = {};
			if (svelteConfig.kit.files.assets == null) svelteConfig.kit.files.assets = DEFAULT_STATIC_FOLDER;


			backgroundTask = init(config, {
				warn: this.warn,
				info: this.info
			});

			this.emitFile({
				type: "asset",
				fileName: WORKER_FILE, // Used instead of filename so there's no hash
				source: await fs.readFile("plugins/worker.js")
			});
		},

		generateBundle: {
			order: "post",
			sequential: true,
			async handler(_, bundle, isWrite) {
				if (isSSR) return;

				await backgroundTask;

				const simplifiedBundle = Object.create(null, {});
				for (const [filePath, item] of Object.entries(bundle)) {
					simplifiedBundle[filePath] = ;
				}
				await fs.writeFile(STAGE_SHARED_DATA, JSON.stringify({
					lastBuild,
					bundle: simplifiedBundle
				}));
				debugger;
			}
		},
		closeBundle: {
			order: "post",
			sequential: true,
			async handler() {
				if (! isSSR) return;

				await cleanUp();
			}
		}
	};
}
export function degitLast(source) {
	return async (tmpDir, methods) => {
		const emitter = degit(source);
	
		let downloaded = true;
		try {
			await emitter.clone(tmpDir);
		}
		catch (error) {
			methods.warn(`Couldn't download the last build, so assuming this is the first version. If it isn't, don't deploy this build! Error:\n${error}`);

			downloaded = false;
		}

		if (downloaded) {
			const infoFile = path.join(tmpDir, INFO_FILE);
			let exists = true;
			try {
				await fs.stat(infoFile);
			}
			catch {
				exists = false;
			}

			if (exists) return await fs.readFile(infoFile);
			else return null;
		}
		else return null;
	};
};
export function fetchLast(url) {
	return async (_, methods) => {
		let response;
		try {
			response = await fetch(url);
		}
		catch {
			methods.warn("Couldn't download the last build info file due a network error, So assuming this is the first build so this build can finish. You probably don't want to deploy this.");
			return null;
		}

		if (response.ok) return await response.text();
		else {
			if (response.status == 404) {
				methods.warn("Assuming this is the first version as downloading the last build info file resulted in a 404.");
				return null;
			}
			else {
				throw new VersionedWorkerError(`Got a ${response.status} HTTP error while trying to download the last build info.`);
			}
		}
	};
};