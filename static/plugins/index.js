/*
TODO

Have a .versionedWorker.json file which contains info about the last build. e.g the app directory. Also store hashes in it
Call bundle.close
Have a way to provide the sveltekit config for the previous version, in case the app directory changed
Make recursiveList parrelel?
*/

import path from "path";
import fs from "fs/promises";

import mime from "mime-types";
import crypto from "crypto";
import degit from "degit";


const LAST_BUILD = "tmp/lastBuild";
const DOWNLOAD_TMP = "tmp/downloadBuildTmp";
const WORKER_FOLDER = "sw";
const VERSION_FILE = "version.txt";
const INFO_FILE = ".versionedWorker.json";

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

export function plugin(config) {
	let shouldIgnore;
	let backgroundTask;
	let lastBuild = {
		filesAndFolders: null,
		staticHashes: null,
		version: null
	};
	let svelteConfig;


	const init = async (config, methods) => {
		await makeTemp();
		await fs.mkdir(DOWNLOAD_TMP);
	
		let output = config.lastBuild(LAST_BUILD, DOWNLOAD_TMP, methods);
		if (output instanceof Promise) output = await output;
	
		lastBuild.filesAndFolders = (await recursiveList(LAST_BUILD)).filter(info => ! path.basename(info.path).startsWith("."));
		if (lastBuild.filesAndFolders.length != 0) {
			if (! lastBuild.filesAndFolders.includes(
				path.join(svelteConfig.kit.appDir, WORKER_FOLDER, VERSION_FILE)
			)) {
				throw new VersionedWorkerError(`A previous build was found, but it's missing a ${VERSION_FILE} file. This could be because you provided something that isn't a build, or because you changed some configuration or versions in this new version, without properly specifying it in the plugin config.`);
			}

			const stringVersion = await fs.readFile(path.join(
				LAST_BUILD,
				svelteConfig.kit.appDir,
				WORKER_FOLDER,
				VERSION_FILE
			)).trim();
			lastBuild.version = parseInt(stringVersion);
			if (isNaN(lastBuild.version)) {
				throw new Error(`Couldn't parse the ${VERSION_FILE} file in the last build. Its trimmed contents is:\n${stringVersion}`);
			}

			debugger
		}

		const staticFiles = lastBuild.filesAndFolders
			.filter(info => ! info.isFolder)
			.map(info => info.path)
			.filter(path => ! path.startsWith(svelteConfig.kit.appDir))
		;
		lastBuild.staticHashes = Object.create(null, {});
		for (const fileName of staticFiles) {
			const contents = await fs.readFile(path.join(LAST_BUILD, fileName));

			lastBuild.staticHashes[fileName] = hash(contents);
		}
	};
	const cleanUp = async _ => {
		await fs.rm("tmp", {
			recursive: true
		});
	};

	return {
		name: "versioned-worker",
		buildStart: {
			handler(options) {
				shouldIgnore = ! options.input.hasOwnProperty("index"); // The whole plugin will be run multiple times, but we're only interested in the last build step
				// ^ This probably isn't a great way of detecting it since this could change in the future, but I can't see a better way
				if (shouldIgnore) return;

				svelteConfig = options.plugins.find(plugin => plugin.name == "vite-plugin-svelte");
				if (svelteConfig == null) throw new VersionedWorkerError("Couldn't find SvelteKit plugin.");
				svelteConfig = svelteConfig.api.options;


				backgroundTask = init(config, {
					warn: this.warn,
					info: this.info
				});
			}
		},
		generateBundle: {
			order: "post",
			sequential: true,
			async handler(options, bundle, isWrite) {
				if (shouldIgnore) return;
				console.log(bundle, isWrite);
				debugger;

				await backgroundTask;

				await cleanUp();
			}
		}
	};
}
export const downloadLastBuild = {
	degit: source => {
		return async (dest, _, methods) => {
			const emitter = degit(source);
		
			try {
				await emitter.clone(dest);
			}
			catch (error) {
				methods.warn(`Couldn't download the last build. Assuming this is the first version. If it isn't, don't deploy this build! Error:\n${error}`);

				await fs.mkdir(dest);
			}
		};
	}
};