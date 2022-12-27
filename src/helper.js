import path from "path";
import { findUp } from "find-up";
import { pathToFileURL } from "url";
import fs from "fs/promises";

import crypto from "crypto";

export class VersionedWorkerError extends Error {
	constructor(message) {
		super("VersionedWorkerError: " + message);
	}
};

export function deepClone(ob) {
	if (typeof ob != "object") return ob; // Primative
	else {
		if (Array.isArray(ob)) return ob.map(item => deepClone(item));
		else {
			let newOb = {};
			for (const [key, value] of Object.entries(ob)) {
				newOb[key] = deepClone(value);
			}
			return newOb;
		}
	}
};
export function stringifyPlus(ob) {
	return JSON.stringify(ob, (_, subValue) => {
		if (subValue instanceof Map) {
			return Object.fromEntries(subValue);
		}
		return subValue;
	});
};

export function hash(data) {
	const hasher = crypto.createHash("md5");
	hasher.update(data);
	return hasher.digest("hex");
};

export async function recursiveList(folder) {
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

export function newInitialInfo() {
	return {
		formatVersion: 2,
		version: -1,
		versions: [],
		hashes: {}
	};
};

export async function importSvelteConfigModule() {
	// Kind of hacky, but I guess slightly less than importing and adding defaults in myself

	const notFoundError = _ => { 
		throw new VersionedWorkerError("Couldn't find SvelteKit's load_config function. You might be using an incompatible version.");
	};

	let modulePath;
	try {
		modulePath = await findUp("node_modules/@sveltejs/kit/src/core/config/index.js");
	}
	catch {
		notFoundError();
	}
	const module = await import(pathToFileURL(modulePath));
	const loadConfig = module.load_config;
	if (loadConfig == null) notFoundError();

	return loadConfig;
};