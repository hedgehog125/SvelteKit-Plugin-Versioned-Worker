/*
TODO

Call bundle.close
Get SvelteKit config file path via plugins in buildStart
*/

import mime from "mime-types";
import degit from "degit";
import fs from "fs/promises";

const init = async (config, methods) => {
	await makeTemp();
	await fs.mkdir("tmp/downloadBuildTmp");

	let output = config.lastBuild("tmp/lastBuild", "tmp/downloadBuildTmp", methods);
	if (output instanceof Promise) output = await output;
};
const cleanUp = async _ => {
	await fs.rm("tmp", {
		recursive: true
	});
};

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

export function plugin(config) {
	let shouldIgnore;
	let backgroundTask;

	return {
		name: "versioned-worker",
		buildStart: {
			handler(options) {
				shouldIgnore = ! options.input.hasOwnProperty("index"); // The whole plugin will be run multiple times, but we're only interested in the last build step
				// ^ This probably isn't a great way of detecting it since this could change in the future, but I can't see a better way
				if (shouldIgnore) return;

				backgroundTask = init(config, {
					warn: this.warn,
					info: this.info
				});
			}
		},
		buildEnd: {
			order: "post",
			sequential: true,
			async handler() {
				if (shouldIgnore) return;

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
		
			let downloadFailed = false;
			try {
				await emitter.clone(dest);
			}
			catch (error) {
				methods.warn("Couldn't download the last build. Assuming this is the first version. If it isn't, don't deploy this build!");
				downloadFailed = true;
			}
		};
	}
};