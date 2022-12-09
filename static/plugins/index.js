/*
TODO

Hash and compare everything, but still exclude routes as they're assumed to have changed. Or maybe just do it for files that have file names instead of names. Particularly important because of files like the vite manifest. Maybe also scan for any unmentioned files in the final output and hash and compare those


Implement MAX_VERSION_FILES, maybe keep one more than that on the server though. ALso do the same for .versionedWorker.json
Is the version.txt file needed? It's at least not needed in the worker right?
Network error handling in install
Is the worker cached when using a base URL? It shouldn't be
Call bundle.close
Handle non static assers that don't have hashed filenames. e.g SvelteKit service workers
Export things like the version folder name to import into components. Particularly the cache storage name
Make recursiveList parrelel?

Updating the worker on refresh still doesn't work in firefox. Find a workaround or is it fine?
*/

import path from "path";
import { normalizePath } from "vite";
import fs from "fs/promises";

import degit from "degit";
import mime from "mime-types";
import { installPolyfills } from "@sveltejs/kit/node/polyfills";
installPolyfills();

import {
	deepClone,hash, recursiveList,
	stringifyPlus, newInitialInfo,
	VersionedWorkerError
} from "./helper";


const DOWNLOAD_TMP = "tmp/downloadBuildTmp";
const STAGE_SHARED_DATA = "tmp/stageSharedData.json";
const WORKER_FILE = "sw.js";
const VERSION_FOLDER = "sw";
const VERSION_FILE = "version.txt";
const INFO_FILE = ".versionedWorker.json";
const DEFAULT_STATIC_FOLDER = "static";
const SVELTEKIT_PRERENDER_FOLDER = ".svelte-kit/output/prerendered/pages";

const VERSION_FILE_BATCH_SIZE = 10;
const MAX_VERSION_FILES = 10;

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

export function versionedWorker(config) {
	if (config.lazyCache == null) config.lazyCache = _ => false; 
	if (config.buildDir == null) config.buildDir = "build";

	let viteConfig;
	let svelteConfig;

	let isSSR;
	let backgroundTask;
	let lastBuild;
	let staticHashes;
	let workerBase;
	let storagePrefix;
	let secondStageData;


	const init = async (config, methods) => {
		await makeTemp();
		await fs.mkdir(DOWNLOAD_TMP);
	
		await Promise.all([
			(async _ => {
				let output = config.lastInfo(DOWNLOAD_TMP, methods, {
					viteConfig,
					svelteConfig
				});
				if (output instanceof Promise) output = await output;
				if (output == null) output = newInitialInfo(svelteConfig);
				else {
					try {
						output = JSON.parse(output);
					}
					catch {
						throw new VersionedWorkerError(`Couldn't parse the info file from the last build. Contents:\n${output}`);
					}
				}
				lastBuild = output;
			})(),
			(async _ => {
				// Since the static files aren't changed during the build, we can start hashing them now
				staticHashes = new Map();
				const staticFolder = path.join(svelteConfig.root, svelteConfig.kit.files.assets);
				const staticFiles = await recursiveList(staticFolder);
				for (const fileInfo of staticFiles) {
					if (fileInfo.isFolder) continue;

					const contents = await fs.readFile(path.join(staticFolder, fileInfo.path));
					staticHashes.set(fileInfo.path, hash(contents));
				}
			})()
		]);
	};
	const secondInit = async _ => {
		secondStageData = JSON.parse(await fs.readFile(STAGE_SHARED_DATA, { encoding: "utf-8" }));

		secondStageData.staticHashes = new Map(Object.entries(secondStageData.staticHashes)); // New hashes
		secondStageData.lastBuild.staticHashes = new Map(Object.entries(secondStageData.lastBuild.staticHashes)); // Old hashes
	};
	const cleanUp = async _ => {
		await fs.rm("tmp", {
			recursive: true
		});
	};

	return {
		name: "versioned-worker",
		apply: "build",
		configResolved(config) {
			viteConfig = config;
			isSSR = viteConfig.build.ssr;

			storagePrefix = config.storagePrefix;
			if (storagePrefix == null) {
				storagePrefix = viteConfig.base.slice(2); // It always starts with a "./"
				if (storagePrefix == "") {
					storagePrefix = "VersionedWorkerCache";
				}
				else {
					if (storagePrefix.startsWith("/")) storagePrefix = storagePrefix.slice(1);
					if (storagePrefix.endsWith("/")) storagePrefix = storagePrefix.slice(-1);
				}

			}
			storagePrefix += "-";
		},
		async buildStart(options) {
			svelteConfig = options.plugins.find(plugin => plugin.name == "vite-plugin-svelte");
			if (svelteConfig == null) throw new VersionedWorkerError("Couldn't find SvelteKit plugin.");
			svelteConfig = deepClone(svelteConfig.api.options);

			// For some reason this doesn't have the defaults which is cringe
			if (svelteConfig.kit.files == null) svelteConfig.kit.files = {};
			if (svelteConfig.kit.files.assets == null) svelteConfig.kit.files.assets = DEFAULT_STATIC_FOLDER;

			if (svelteConfig.kit.trailingSlash == null) throw new VersionedWorkerError("svelteConfig.kit.trailingSlash must be set to \"always\".");


			if (isSSR) {
				backgroundTask = secondInit();
			}
			else {
				backgroundTask = init(config, {
					warn: this.warn,
					info: this.info
				});
			}


			workerBase = await fs.readFile("plugins/worker.js", {
				encoding: "utf-8"
			});
		},

		generateBundle: {
			order: "post",
			sequential: true,
			async handler(_, bundle) {
				if (isSSR) return;

				await backgroundTask;

				// Remove the deprecated and unnecessary properties to prevent warnings and speed things up by reducing the file size
				const simplifiedBundle = Object.create(null, {});
				for (const [filePath, item] of Object.entries(bundle)) {
					const { type, name, fileName } = item;
					simplifiedBundle[filePath] = {
						type,
						name,
						fileName
					};
				}

				await fs.writeFile(STAGE_SHARED_DATA, stringifyPlus({
					lastBuild,
					bundle: simplifiedBundle,
					staticHashes
				}));
			}
		},
		closeBundle: {
			order: "post",
			enforce: "post",
			sequential: true,
			async handler() {
				if (! isSSR) return;
				await backgroundTask;
				
				const { lastBuild: buildInfo, bundle, staticHashes } = secondStageData;
				{
					buildInfo.version++;

					const isNewBatch = buildInfo.version % VERSION_FILE_BATCH_SIZE == 0;
					let updated = isNewBatch?
						new Set()
						: new Set(buildInfo.versions[buildInfo.versions.length - 1].updated)
					;
					for (const [fileName, hash] of buildInfo.staticHashes) {
						if (! staticHashes.has(fileName)) continue; // It's a new file

						if (staticHashes.get(fileName) != hash) {
							updated.add(fileName);
						}
					}

					buildInfo.versions[isNewBatch?
						buildInfo.versions.length
						: buildInfo.versions.length - 1
					] = {
						formatVersion: 1,
						updated: Array.from(updated)
					};
					buildInfo.staticHashes = staticHashes;
				}

				
				const routeFiles = await recursiveList(SVELTEKIT_PRERENDER_FOLDER);
				let routes = [];
				for (const fileInfo of routeFiles) { // These will all be index.html files
					if (fileInfo.isFolder) continue;

					const filePath = normalizePath(fileInfo.path);
					routes.push(viteConfig.base + filePath.slice(0, -10)); // 10 is the length of "index.html", which they all end with
				}

				let precache = [];
				let lazyCache = [];
				for (const [filePath, fileInfo] of Object.entries(bundle)) {
					if (filePath == WORKER_FILE) continue;

					const output = config.lazyCache(mime.lookup(filePath), fileInfo, filePath, true);
					if (output) lazyCache.push(filePath);
					else precache.push(filePath);
				}
				for (const [filePath, hash] of staticHashes) {
					const output = config.lazyCache(mime.lookup(filePath), hash, filePath, false);
					if (output) lazyCache.push(filePath);
					else precache.push(filePath);
				}

				const version = buildInfo.version;

				// Contains: routes, precache, lazyCache, storagePrefix and version
				const codeForConstants = `const ROUTES=${JSON.stringify(routes)};const PRECACHE=${JSON.stringify(precache)};const LAZY_CACHE=${JSON.stringify(lazyCache)};const STORAGE_PREFIX=${JSON.stringify(storagePrefix)};const VERSION=${version};const WORKER_FILE=${JSON.stringify(WORKER_FILE)};const VERSION_FILE=${JSON.stringify(`${VERSION_FILE}`)};const VERSION_FOLDER=${JSON.stringify(VERSION_FOLDER)};const VERSION_FILE_BATCH_SIZE=${VERSION_FILE_BATCH_SIZE};const MAX_VERSION_FILES=${MAX_VERSION_FILES};`;

				await new Promise(resolve => setTimeout(_ => { resolve() }, 500)); // Just give SvelteKit half a second to finish, although it should all be done by the time this runs
				try {
					await fs.stat(path.join(viteConfig.root, config.buildDir)); // I think node sometimes doesn't realise the build folder exists without this
				}
				catch {
					throw new VersionedWorkerError(`Couldn't find your build folder ${JSON.stringify(config.buildDir)}, make sure the "buildDir" property of this plugin's config matches the output directory in your SvelteKit adapter static config.`);
				}

				await Promise.all([
					fs.writeFile(
						path.join(viteConfig.root, config.buildDir, WORKER_FILE),
						codeForConstants + workerBase
					),
					(async _ => { // Version files
						const versionPath = path.join(viteConfig.root, config.buildDir, VERSION_FOLDER);
						await fs.mkdir(versionPath);

						let writes = [];
						for (let fileID in buildInfo.versions) {
							const versionBatch = buildInfo.versions[fileID];

							const contents = `${versionBatch.formatVersion}\n${versionBatch.updated.join("\n")}`;
							writes.push(
								fs.writeFile(path.join(versionPath, fileID + ".txt"), contents)
							);
						}

						await Promise.all(writes);
					})(),
					fs.writeFile(
						path.join(viteConfig.root, config.buildDir, VERSION_FOLDER, VERSION_FILE),
						version.toString()
					),
					fs.writeFile(
						path.join(viteConfig.root, config.buildDir, INFO_FILE),
						stringifyPlus(buildInfo)
					),
					cleanUp()
				]);
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
			methods.warn(`\nCouldn't download the last build, so assuming this is the first version. If it isn't, don't deploy this build! Error:\n${error}`);

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

			if (exists) return await fs.readFile(infoFile, { encoding: "utf-8" });
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
			methods.warn("\nCouldn't download the last build info file due a network error, So assuming this is the first build so this build can finish. You probably don't want to deploy this.");
			return null;
		}

		if (response.ok) return await response.text();
		else {
			if (response.status == 404) {
				methods.warn("\nAssuming this is the first version as downloading the last build info file resulted in a 404.");
				return null;
			}
			else {
				throw new VersionedWorkerError(`Got a ${response.status} HTTP error while trying to download the last build info.`);
			}
		}
	};
};
export function readLast(filePath) {
	return async (_, methods, { viteConfig }) => {
		if (! path.isAbsolute(filePath)) filePath = path.join(viteConfig.root, filePath);

		let contents;
		try {
			contents = await fs.readFile(filePath);
		}
		catch {
			methods.warn("\nAssuming this is the first version as the last build info file doesn't exist at that path.");
			return null;
		}

		return contents;
	};
};