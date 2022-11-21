const BUILD_PATH = "../static/build";
const DEPLOY_PATH = "../../Deploys/SvelteKit-Template/";
const CONFIGURED = false;


import fs from "fs/promises";
import path from "sandboxed-path";
path.changeSandboxScope.backOne();
path.changeSandboxScope.backOne();
import { clearDir, recursiveList } from "./src/helper.js";

const main = async _ => {
	if (! CONFIGURED) {
		const parentFolder = path.join(process.cwd(), "../../");
		const deployFolder = path.join(parentFolder, "Deploys");
		console.error(
`This tool makes it a little easier to deploy your static builds to GitHub Pages. It'll delete files in your deploy path but it won't unless you create a special file, it also won't commit or push your changes to GitHub.

You haven't configured this tool yet. Clone this repository again somewhere in the folder ${parentFolder} or in any child folders of that (I'd recommend ${deployFolder}), but switch its branch to "gh-pages" (if you haven't already, make that branch and delete everything, including hidden files, from it, *except* the .git folder).
		
Then set "DEPLOY_PATH" to the relative path of your deploy repository, do this by editing the file "tools/deployBuild.js". It should start with "../../" to take you to ${parentFolder}. e.g "const DEPLOY_PATH = "${deployFolder}";
	
Then set the variable below called "CONFIGURED" to true and create a file called ".oktoclear" in your deploy folder (making sure it hasn't got an extension like ".oktoclear.txt). This file should prevent you from accidentally replacing the wrong folder as the program will stop before clearing it if it's not there. You should also create another file called ".nojekyll", both of these files should just be empty.
	
Now run this file again.`
		);
		return;
	}

	const deployPath = path.accessLocal(DEPLOY_PATH);
	{
		let info;
		try {
			info = await fs.stat(deployPath);
		}
		catch {
			console.error(`The specified deploy path ${deployPath} doesn't exist. This could be because you've changed computers and haven't set it up on here. Maybe try setting "CONFIGURED" to false again to get the instructions again.`);
			return;
		}
		if (! info.isDirectory()) {
			console.error(`The specified deploy path ${deployPath} isn't a directory. Check and see if you can replace what's already there with a clone of the "gh-pages" branch, or try changing the "DEPLOY_PATH".`);
			return;
		}
	}
	{
		let info;
		let missing = false;
		try {
			info = await fs.stat(path.join(deployPath, ".oktoclear"));
		}
		catch {
			missing = true;
		}
		if (missing || (! info.isFile())) {
			console.error(`The specified deploy path ${deployPath} is missing a ".oktoclear" file. This could mean you accidentally set "DEPLOY_PATH" to the wrong folder, or you've just forgotten to make the file (also make sure it doesn't have a hidden extension like .txt).`);
			return;
		}
	}

	console.log("Deleting previous build...");
	await clearDir(DEPLOY_PATH);

	console.log("Copying files...");
	const buildFiles = await recursiveList(BUILD_PATH);
	const buildPath = path.accessLocal(BUILD_PATH);

	for (let fileInfo of buildFiles) {
		let newfilePath = path.sandboxPath(path.join(deployPath, fileInfo.path));
		let fileName = path.basename(newfilePath);
		if (fileName[0] == ".") continue;
		if (! fileInfo.isFolder) continue;

		await fs.mkdir(newfilePath);
	}

	let tasks = [];
	for (let fileInfo of buildFiles) {
		let newfilePath = path.sandboxPath(path.join(deployPath, fileInfo.path));
		let fileName = path.basename(newfilePath);
		if (fileName[0] == ".") continue;
		if (fileInfo.isFolder) continue;
		

		tasks.push((async _ => {
			let contents = await fs.readFile(path.join(buildPath, fileInfo.path));
			await fs.writeFile(newfilePath, contents);
		})());
	}
	await Promise.all(tasks);

	console.log(`Copied ${buildFiles.length} build files and folders. Now commit and push your changes to finish deploying.`);
};
main();
