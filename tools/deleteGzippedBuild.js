const GZIP_PATH = "../static/gzipBuild";

import path from "sandboxed-path";
path.changeSandboxScope.backOne();
import { clearDir } from "./src/helper.js";

const main = async _ => {
	console.log("Deleting gzipped build...");
	clearDir(GZIP_PATH);
	console.log("Done");
};
main();