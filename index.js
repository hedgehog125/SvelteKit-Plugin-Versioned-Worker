/*
TODO

Output manifest in dev mode to prevent errors

Delay warnings until the end
Remove hashes from filenames or looking them up in the bundle when calling lazyCache or exclude
Add a background task function to the config. The promise could be provided to all the other functions
Provide the default exclusions to the exclude function
Maybe call with the name of the function? e.g lazyCache, exclude etc.

Implement MAX_VERSION_FILES, maybe keep one more than that on the server though. Also do the same for .versionedWorker.json. Should the build logic be updated to handle the different indexes or should it be populated with nulls on load?

Export the constants and import them in rather than inlining, that way they can be used by the hooks file. Use virtual modules for this and the importing of the hooks

Is the version.txt file needed? It's at least not needed in the worker right?
Network error handling in install
How are lazy loaded range requests handled? Particularly when updating, are they copied?

Updating the worker on refresh still doesn't work in firefox. Find a workaround or is it fine?
*/

import path from "path";
import { normalizePath } from "vite";
import fs from "fs/promises";

import degit from "degit";
import mime from "mime-types";
import { installPolyfills } from "@sveltejs/kit/node/polyfills";
installPolyfills();

import { rollup } from "rollup";
import esbuild from "rollup-plugin-esbuild";
import { nodeResolve } from "@rollup/plugin-node-resolve";


import {
	hash, recursiveList,
	stringifyPlus, newInitialInfo,
	VersionedWorkerError, importSvelteConfigModule
} from "./src/helper.js";

import { fileURLToPath } from "url";
const pluginDir = path.dirname(fileURLToPath(import.meta.url));

const DOWNLOAD_TMP = "tmp/downloadBuildTmp";
const WORKER_FILE = "sw.js";
const VERSION_FOLDER = "sw";
const VERSION_FILE = "version.txt";
const INFO_FILE = "versionedWorker.json";

const VERSION_FILE_BATCH_SIZE = 10;
const MAX_VERSION_FILES = 10;

const makeTemp = async _ => {
	const tmpPath = path.join(pluginDir, "tmp");

	let exists = true;
	try {
		await fs.stat(tmpPath);
	}
	catch {
		exists = false;
	}
	if (exists) {
		await fs.rm(tmpPath, {
			recursive: true
		});
	}

	await fs.mkdir(tmpPath);
};


export function versionedWorker(config) {
	if (config.lazyCache == null) config.lazyCache = _ => false;
	if (config.buildDir == null) config.buildDir = "build";
	if (config.handlerFile == null) config.handlerFile = "src/hooks.worker.js";
	if (config.manifestFile == null) config.manifestFile = "src/manifest.webmanifest";
	if (config.manifestOutName == null) config.manifestOutName = "manifest.webmanifest";
	if (config.generateManifest == null) config.generateManifest = processManifest;

	let viteConfig;
	let svelteConfig;
	let loadSvelteConfig;

	let isSSR;
	let baseURL;
	let backgroundTask;
	let bundle;
	let lastBuild;
	let workerBase;
	let storagePrefix;
	let handlerFileExists;


	const init = async (config, methods) => {
		const downloadPath = path.join(pluginDir, DOWNLOAD_TMP);

		await makeTemp();
		await fs.mkdir(downloadPath);
	
		await Promise.all([
			(async _ => {
				let output = await config.lastInfo(downloadPath, methods, {
					viteConfig,
					svelteConfig
				});
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
				lastBuild.hashes = new Map(Object.entries(lastBuild.hashes));

				if (! [1, 2].includes(lastBuild.formatVersion)) {
					throw new VersionedWorkerError(`Unsupported version ${lastBuild.formatVersion} in the info file from the last build.`);
				}

				if (lastBuild.formatVersion == 1) { // Upgrade
					// Upgrade all the version files to version 2, by approximating the missing information
					for (let versionFileID = 0; versionFileID < lastBuild.versions.length; versionFileID++) {
						const versionFile = lastBuild.versions[versionFileID];

						if (versionFile.formatVersion == 2) continue;
						if (versionFile.formatVersion != 1) {
							throw new VersionedWorkerError(`Unsupported version ${versionFile.formatVersion} for the version file with the ID ${versionFileID}, in the info file from the last build. I'm not sure how this could have happened, so you might need to just delete the info file and reset everything.`);
						}

						// For the previous versions, set the updated files in that version to the files updated in this batch so far
						const isLastFile = versionFileID == lastBuild.versions.length - 1;
						let repeatCount = isLastFile?
							(lastBuild.version % VERSION_FILE_BATCH_SIZE) + 1
							: VERSION_FILE_BATCH_SIZE
						; // Even if isLastFile is true, this can still be equal to VERSION_FILE_BATCH_SIZE because of the +1

						versionFile.updated = new Array(repeatCount).fill(versionFile.updated);
						versionFile.formatVersion = 2;
					}

					lastBuild.formatVersion = 2;
				}
			})(),
			(async _ => {
				if (handlerFileExists) {
					await fs.copyFile(path.join(viteConfig.root, config.handlerFile), path.join(pluginDir, "tmp/hooks.js"));
				}
				else {
					await fs.writeFile(path.join(pluginDir, "tmp/hooks.js"), ""); // Use an empty file if there isn't one
				}
			})(),
			(async _ => {
				workerBase = await fs.readFile(path.join(pluginDir, "src/worker.js"), { encoding: "utf-8" });
			})()
		]);
	};
	const checkIfHandlerFileExists = async _ => {
		try {
			await fs.stat(path.join(viteConfig.root, config.handlerFile));
		}
		catch {
			return false;
		}
		return true;
	};
	const generateManifest = async methods => {
		const manifestPath = path.join(viteConfig.root, config.manifestFile);
		try {
			await fs.stat(manifestPath);
		}
		catch {
			methods.warn(`Couldn't find your web app manifest file at ${config.manifestFile}. Check its filename or change this path in config.manifestFile.`);
			return null;
		}

		const fileData = await fs.readFile(manifestPath, { encoding: "utf-8" });
		let parsed;
		try {
			parsed = JSON.parse(fileData);
		}
		catch {
			throw new VersionedWorkerError(`Couldn't parse your web app manifest file at ${config.manifestFile}. Contents:\n${fileData}`);
		}

		let output = await config.generateManifest(parsed, baseURL);
		if (typeof output == "object") output = JSON.stringify(output);

		return output;
	};
	const cleanUp = async _ => {
		await fs.rm(path.join(pluginDir, "tmp"), {
			recursive: true
		});
	};

	const computeHashes = async buildFiles => {
		let reads = [];
		for (const fileInfo of buildFiles) {
			if (fileInfo.isFolder) continue;
			if (path.extname(fileInfo.path) == "html") continue; // Don't bother hashing routes since they always change

			const filePath = normalizePath(fileInfo.path);
			const bundleFileInfo = bundle[filePath];
			if (bundleFileInfo?.name) continue; // It's already got a hash in its filename

			reads.push([
				filePath,
				fs.readFile(path.join(viteConfig.root, config.buildDir, fileInfo.path))
			]);
		}

		let hashed = new Map();
		for (const [filePath, contents] of reads) {
			hashed.set(
				filePath,
				hash(await contents)
			);
		}
		return hashed;
	};
	const updateBuildInfo = (buildInfo, hashes) => {
		buildInfo.version++;

		const isNewBatch = buildInfo.version % VERSION_FILE_BATCH_SIZE == 0;
		const lastVersion = isNewBatch?
			null
			: buildInfo.versions[buildInfo.versions.length - 1]
		;
		let updated = new Set();
		for (const [fileName, hash] of buildInfo.hashes) {
			if (! hashes.has(fileName)) continue; // It's a new file

			if (hashes.get(fileName) != hash) {
				updated.add(fileName);
			}
		}

		buildInfo.versions[isNewBatch?
			buildInfo.versions.length
			: buildInfo.versions.length - 1
		] = {
			formatVersion: 2,
			updated: [ // The second isn't spread because this is a nested array
				...(lastVersion == null? [] : lastVersion.updated),
				Array.from(updated)
			]
		};
		buildInfo.hashes = hashes;
	};
	const getRoutes = buildFiles => {
		const routeFiles = buildFiles.filter(fileInfo => (! fileInfo.isFolder) && path.extname(fileInfo.path) == ".html"); // Also exclude the folders

		let routes = [];
		for (const fileInfo of routeFiles) { // These will all be index.html files
			const filePath = normalizePath(fileInfo.path);
			if (path.basename(filePath) != "index.html") {
				throw new VersionedWorkerError(`The file ${filePath} is an HTML in your build folder isn't called "index.html". Check your routes/+layout.js file and make sure "trailingSlash" is set to "always", as that's the only supported value in this plugin at the moment.`);
			}

			routes.push(baseURL + filePath.slice(0, -10)); // 10 is the length of "index.html", which they all end with
		}
		return [routes, routeFiles.map(fileInfo => fileInfo.path)];
	};
	const generateCacheList = async (buildFiles, routeFiles) => {
		let callbackOutputs = [];
		for (const fileInfo of buildFiles) {
			if (fileInfo.isFolder) continue;
			if (routeFiles.includes(fileInfo.path)) continue;

			const filePath = normalizePath(fileInfo.path).slice(0); // Remove the unnecessary starting dot
			if (filePath == WORKER_FILE) continue;

			const args = [
				filePath,
				mime.lookup(filePath),
				path.join(viteConfig.root, config.buildDir),
				{
					viteConfig,
					svelteConfig
				}
			];
			callbackOutputs.push([
				filePath,
				Promise.all([
					config.exclude(...args),
					config.lazyCache(...args)
				])
			]);
		}

		let precache = [];
		let lazyCache = [];
		for (const [filePath, output] of callbackOutputs) {
			const [exclude, lazy] = await output;
			if (exclude) continue;
			
			if (lazy) lazyCache.push(filePath);
			else precache.push(baseURL + filePath);
		}

		return [precache, lazyCache];
	};

	return {
		name: "versioned-worker",
		apply: "build",
		async configResolved(_viteConfig) {
			if (isSSR) return;

			loadSvelteConfig = await importSvelteConfigModule();

			viteConfig = _viteConfig;
			svelteConfig = await loadSvelteConfig(viteConfig.root);
			isSSR = viteConfig.build.ssr;
			baseURL = svelteConfig.kit.paths.base;
			if (baseURL == "") baseURL = "/";
			else if (! baseURL.endsWith("/")) baseURL += "/";

			storagePrefix = config.storagePrefix;
			if (storagePrefix == null) {
				storagePrefix = baseURL.slice(1); // Remove the starting /
				if (storagePrefix == "") {
					storagePrefix = "VersionedWorkerCache";
				}
				else {
					storagePrefix = storagePrefix.slice(0, -1); // Remove the ending slash
				}

			}
			storagePrefix += "-";

			if (config.exclude == null) config.exclude = fileList([
				svelteConfig.kit.appDir + "/version.json",
				viteConfig.build.manifest,
				"robots.txt"
			]);			
		},
		async buildStart() {
			if (isSSR) return;
			if (svelteConfig.kit.paths.assets) throw new VersionedWorkerError("svelteConfig.kit.paths.assets can't be used with this plugin.");
			if (svelteConfig.kit.adapter.name != "@sveltejs/adapter-static") {
				throw new VersionedWorkerError(`Your need to use the static SvelteKit adapter to use this plugin. You're using ${svelteConfig.kit.adapter.name}.`);
			}

			const methods = {
				warn: this.warn,
				info: this.info
			};

			handlerFileExists = await checkIfHandlerFileExists();
			const manifestContents = await generateManifest(methods);
			if (manifestContents != null) {
				this.emitFile({
					type: "asset",
					fileName: config.manifestOutName,
					source: manifestContents
				});
			}
			backgroundTask = init(config, methods);
		},

		generateBundle: {
			sequential: true,
			handler(_, _bundle) {
				if (isSSR) return;
	
				bundle = _bundle;
			}
		},
		closeBundle: {
			order: "post",
			enforce: "post",
			sequential: true,
			async handler() {
				if (isSSR) return; // I think the build doesn't actually get written in this hook, instead it gets written when ssr is false, but that happens later
				if (bundle == null) {
					this.warn("Not building because your app seems to have run into a build error.");
					return;
				}
				
				console.log("Versioned-Worker: Hashing build files...");
				await backgroundTask;

				let buildInfo = lastBuild;
				const buildFiles = await recursiveList(path.join(viteConfig.root, config.buildDir));

				const hashes = await computeHashes(buildFiles);
				updateBuildInfo(buildInfo, hashes);
				const [routes, routeFiles] = getRoutes(buildFiles);
				const [precache, lazyCache] = await generateCacheList(buildFiles, routeFiles);
				const version = buildInfo.version;

				console.log("Versioned-Worker: Building worker...");

				// Contains: routes, precache, lazyCache, storagePrefix, version, versionFolder, versionFileBatchSize, maxVersionFiles and baseURL
				const codeForConstants = `const [ROUTES, PRECACHE, LAZY_CACHE, STORAGE_PREFIX, VERSION, VERSION_FOLDER, VERSION_FILE_BATCH_SIZE, MAX_VERSION_FILES, BASE_URL] = ${JSON.stringify([routes, precache, lazyCache, storagePrefix, version, VERSION_FOLDER, VERSION_FILE_BATCH_SIZE, MAX_VERSION_FILES, baseURL])};`;

				try {
					await fs.stat(path.join(viteConfig.root, config.buildDir));
				}
				catch {
					throw new VersionedWorkerError(`Couldn't find your build folder ${JSON.stringify(config.buildDir)}, make sure the "buildDir" property of this plugin's config matches the output directory in your SvelteKit static adapter config.`);
				}

				await fs.writeFile(path.join(pluginDir, "tmp/entry.js"), codeForConstants + workerBase);

				const workerBundle = await rollup({
					input: path.join(pluginDir, "tmp/entry.js"),
					plugins: [
						nodeResolve({
							browser: true
						}),
						esbuild({ minify: true })
					],

					onwarn(warning, warn) {
						if (warning.code == "MISSING_EXPORT" && warning.exporter == path.join(pluginDir, "tmp/hooks.js")) return; // There's a null check so missing exports are fine
						warn(warning);
					}
				});

				await workerBundle.write({
					file: path.join(viteConfig.root, config.buildDir, WORKER_FILE),
					format: "iife"
				});
				await workerBundle.close();

				await Promise.all([
					(async _ => { // Version files
						const versionPath = path.join(viteConfig.root, config.buildDir, VERSION_FOLDER);
						await fs.mkdir(versionPath);

						let writes = [];
						for (let fileID in buildInfo.versions) {
							const versionBatch = buildInfo.versions[fileID];

							const mainContents = versionBatch.updated
								.map(updatedInVersion => updatedInVersion.join("\n"))
								.join("\n\n")
							;
							const contents = `${versionBatch.formatVersion}\n${mainContents}`;
							writes.push(
								fs.writeFile(path.join(versionPath, fileID + ".txt"), contents)
							);
						}

						writes.push(fs.writeFile(
							path.join(viteConfig.root, config.buildDir, VERSION_FOLDER, VERSION_FILE),
							version.toString()
						));

						await Promise.all(writes);
					})(),
					fs.writeFile(
						path.join(viteConfig.root, config.buildDir, INFO_FILE),
						stringifyPlus(buildInfo)
					),
					cleanUp()
				]);

				console.log("Versioned-Worker: Done");
			}
		}
	};
};

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

export function fileList(files = []) {
	return filePath => files.includes(filePath);
};

export function processManifest(parsed, baseURL) {
	const addBase = href => {
		if (href.startsWith("/") || href.includes("://")) return href;
		
		return baseURL + href;
	};
	parsed.scope = baseURL;
	if (parsed.start_url == null) parsed.start_url = baseURL;
	else {
		parsed.start_url = addBase(parsed.start_url);
		if (! parsed.start_url.endsWith("/")) parsed.start_url += "/";
	}

	if (parsed.icons) {
		for (const icon of parsed.icons) {
			icon.src = addBase(icon.src);
		}
	}
	if (parsed.protocol_handlers) {
		for (const handler of parsed.protocol_handlers) {
			handler.url = addBase(handler.url);
		}
	}
	if (parsed.screenshots) {
		for (const screenshot of parsed.screenshots) {
			screenshot.src = addBase(screenshot.src);
		}
	}
	if (parsed.share_target) {
		for (const shareTarget of parsed.share_target) {
			shareTarget.action = addBase(shareTarget.action);
		}
	}
	if (parsed.shortcuts) {
		for (const shortcut of parsed.shortcuts) {
			shortcut.url = addBase(shortcut.url);
		}
	}

	return parsed;
};