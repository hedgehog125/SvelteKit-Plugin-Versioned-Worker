const BUILD_PATH = "../static/build";
const GZIP_PATH = "../static/gzipBuild";

import fs from "fs/promises";
import path from "sandboxed-path";
path.changeSandboxScope.backOne();
import { clearDir, recursiveList } from "./src/helper.js";

import { gzip } from "node-gzip";

const main = async _ => {
	console.log("Deleting previous gzipped build...");
	await clearDir(GZIP_PATH);

	console.log("Gzipping build...");

	const buildFiles = await recursiveList(BUILD_PATH);
	const gzipPath = path.accessLocal(GZIP_PATH);
	const buildPath = path.accessLocal(BUILD_PATH);

	for (let fileInfo of buildFiles) {
		let newfilePath = path.sandboxPath(path.join(gzipPath, fileInfo.path));
		let fileName = path.basename(newfilePath);
		if (fileName[0] == ".") continue;
		if (! fileInfo.isFolder) continue;

		await fs.mkdir(newfilePath);
	}

	let tasks = [];
	for (let fileInfo of buildFiles) {
		let newfilePath = path.sandboxPath(path.join(gzipPath, fileInfo.path));
		let fileName = path.basename(newfilePath);
		if (fileName[0] == ".") continue;
		if (fileInfo.isFolder) continue;
		
		tasks.push((async _ => {
			let compressed = await gzip(await fs.readFile(path.join(buildPath, fileInfo.path)));
			await fs.writeFile(newfilePath + ".gz", compressed);
		})());
	}
	await Promise.all(tasks);

	console.log(`Compressed ${buildFiles.length} build files and folders.`);
};
main();