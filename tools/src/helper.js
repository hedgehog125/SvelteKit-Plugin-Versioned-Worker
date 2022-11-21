import fs from "fs/promises";
import path from "sandboxed-path";

export const clearDir = async relativePath => {
	const folder = path.accessLocal(relativePath);

	let folderInfo;
	try {
		folderInfo = await fs.stat(folder);
	}
	catch (error) {
		await fs.mkdir(folder);
		folderInfo = await fs.stat(folder);
	}


	if (! folderInfo.isDirectory()) {
		throw new Error(`The build folder with the relative path \"${relativePath}\" has been taken by a file.`);
	}
	let toDelete = (await fs.readdir(folder)).filter(filePath => ! filePath.startsWith("."));

	for (let fileName of toDelete) {
		let filePath = path.sandboxPath(path.join(folder, fileName));

		await fs.rm(filePath, {
			recursive: true
		});
	}
};
export const recursiveList = async (folder, allowOutside=false) => {
	let found = [];
	await recursiveListSub(folder, found, allowOutside, "");
	return found;
};
const recursiveListSub = async (folder, found, allowOutside, previousPath) => {
	let files = await fs.readdir(allowOutside? path.accessOutsideLocal(folder) : path.accessLocal(folder));

	for (let fileName of files) {
		let relativePath = path.join(folder, fileName);
		let filePath = allowOutside? path.accessOutsideLocal(relativePath) : path.accessLocal(relativePath);
		let newPath = path.join(previousPath, fileName);

		let info = await fs.stat(filePath);
		if (info.isDirectory()) {
			found.push({
				path: newPath,
				isFolder: true
			});

			await recursiveListSub(relativePath, found, allowOutside, newPath + "/");
		}
		else if (info.isFile()) {
			found.push({
				path: newPath,
				isFolder: false
			});
		}
	}
};