/*
Build inputs:

 * ROUTES
 * PRECACHE
 * LAZY_CACHE
 * STORAGE_PREFIX
 * VERSION
 * VERSION_FOLDER
 * VERSION_FILE_BATCH_SIZE
 * MAX_VERSION_FILES
*/
import * as hooks from "./hooks.js";

const currentStorageName = STORAGE_PREFIX + VERSION;
const COMPLETE_CACHE_LIST = Object.create(null, {});
const addToCacheList = hrefs => {
	for (const href of hrefs) {
		COMPLETE_CACHE_LIST[href] = true;
	}
};
addToCacheList(ROUTES);
addToCacheList(PRECACHE);
addToCacheList(LAZY_CACHE);

const parseUpdatedList = contents => {
	contents = contents.split("\r\n").join("\n");

	const splitPoint = contents.indexOf("\n");
	const version = contents.slice(0, splitPoint);
	if (version != "1") throw new Error(`Unknown format version ${JSON.stringify(version)} in the most recent version file (not version.txt, the ones containing the changed files).`);
	
	return {
		formatVersion: 1,
		updated: contents.slice(splitPoint + 1).split("\n")
	};
};


addEventListener("install", e => {
    e.waitUntil(
		(async _ => {
			let installedVersions = [];
			let updated = new Set();
			let doCleanInstall = false;
			{
				const cacheNames = await caches.keys();
				for (const cacheName of cacheNames) {
					if (! cacheName.startsWith(STORAGE_PREFIX)) continue;
					if (cacheName == currentStorageName) continue;
	
					installedVersions.push(
						parseInt(cacheName.slice(STORAGE_PREFIX.length))
					);
				}
				installedVersions = installedVersions.sort((n1, n2) => n2 - n1); // Newest (highest) first
				const newestInstalled = Math.max(...installedVersions);
	
				// Fetch all the version files between the versions
				let versionFiles = [];
				for (let version = newestInstalled; version <= VERSION; version += VERSION_FILE_BATCH_SIZE) {
					versionFiles.push(fetch(`${VERSION_FOLDER}/${Math.floor(version / VERSION_FILE_BATCH_SIZE)}.txt`));

					if (versionFiles.length > MAX_VERSION_FILES) {
						doCleanInstall = true;
						break;
					}
				}
	
				if (! doCleanInstall) {
					versionFiles = await Promise.all(versionFiles);
					versionFiles = await Promise.all(versionFiles.map(res => res.text()));
					versionFiles = versionFiles.map(parseUpdatedList);

					for (const versionFile of versionFiles) {
						for (const href of versionFile.updated) {
							updated.add(href);
						}
					}
				}
			}

			const toDownload = new Set([
				...ROUTES,
				...PRECACHE
			]);
			const toCopy = [];
			if (! doCleanInstall) { // A clean install just means that old caches aren't reused
				const cacheNames = await caches.keys();
				for (const cacheName of cacheNames) {
					if (! cacheName.startsWith(STORAGE_PREFIX)) continue;
					if (cacheName == currentStorageName) continue;
					
					const cache = await caches.open(cacheName);
					const existsList = await Promise.all([...toDownload].map(href => {
						return (async _ => {
							return [href, (await cache.match(href)) !== undefined];
						})();
					}));

					for (const [href, exists] of existsList) {
						if (exists && (! (updated.has(href) || ROUTES.includes(href)))) {
							toCopy.push([href, cache]);
							toDownload.delete(href);

							console.log(`Reused: ${href}`);
						}
					}
				}
			}

			const cache = await caches.open(currentStorageName);
			await Promise.all([
				cache.addAll(toDownload),
				...toCopy.map(([href, oldCache]) => {
					return (async _ => {
						await cache.put(href, await oldCache.match(href));
					})();
				})
			]);
		})()
	);
});
addEventListener("activate", e => {
	e.waitUntil(
		(async _ => {
			await clients.claim();
			// Clean up
			const cacheNames = await caches.keys();
			for (const cacheName of cacheNames) {
				if (! cacheName.startsWith(STORAGE_PREFIX)) continue;
				if (cacheName == currentStorageName) continue;

				await caches.delete(cacheName); // There'll probably only be 1 anyway so it's not worth doing in parallel
			}
		})()
	);
});
addEventListener("fetch", e => {
    e.respondWith(
        (async _ => {
			if (hooks.handle) hooks.handle();

			const isPage = e.request.mode == "navigate" && e.request.method == "GET";
			if (isPage && registration.waiting) { // Based on https://redfin.engineering/how-to-fix-the-refresh-button-when-using-service-workers-a8e27af6df68
				const activeClients = await clients.matchAll();
				if (activeClients.length <= 1) {
					registration.waiting.postMessage("skipWaiting");
					return new Response("", {headers: {Refresh: "0"}}); // Send an empty response but with a refresh header so it reloads instantly
				}
			}

			const path = new URL(e.request.url).pathname;
			let cache = await caches.open(currentStorageName);
			let cached = await cache.match(e.request);
			if (cached) return cached;
		
			let resource;
			try {
				resource = await fetch(e.request);
			}
			catch {
				if (ROUTES.includes(path) && isPage) {
					return new Response("Something went wrong. Please connect to the internet and try again.");
				}
				else {
					if (COMPLETE_CACHE_LIST[path]) {
						console.error(`Couldn't fetch or serve file from cache: ${path}`);
					}
					return Response.error();
				}
			}
			if (COMPLETE_CACHE_LIST[path] && e.request.method == "GET") {
				e.waitUntil(cache.put(e.request, resource.clone())); // Update it in the background
			}
			return resource;
        })()
    );
});
addEventListener("message", ({ data }) => {
	if (data == "skipWaiting") skipWaiting();
});