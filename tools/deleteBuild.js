const BUILD_PATH = "../static/build";

import path from "sandboxed-path";
path.changeSandboxScope.backOne();
import { clearDir } from "./src/helper.js";

const main = async _ => {
	console.log("Deleting build...");
	clearDir(BUILD_PATH);
	console.log("Done");
};
main();