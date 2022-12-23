import path from "path";
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
		formatVersion: 1,
		version: -1,
		versions: [],
		hashes: {}
	};
};