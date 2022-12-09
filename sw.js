const ROUTES=["/SvelteKit-Plugin-Versioned-Worker/","/SvelteKit-Plugin-Versioned-Worker/linkDemo/"];const PRECACHE=["/SvelteKit-Plugin-Versioned-Worker/app/immutable/start-fad19aab.js","/SvelteKit-Plugin-Versioned-Worker/app/immutable/components/pages/_layout.svelte-8df6663d.js","/SvelteKit-Plugin-Versioned-Worker/app/immutable/components/error.svelte-ff5cb705.js","/SvelteKit-Plugin-Versioned-Worker/app/immutable/components/pages/_page.svelte-6eeaa027.js","/SvelteKit-Plugin-Versioned-Worker/app/immutable/components/pages/linkDemo/_page.svelte-2f0d92f1.js","/SvelteKit-Plugin-Versioned-Worker/app/immutable/modules/pages/_layout.js-6a08c268.js","/SvelteKit-Plugin-Versioned-Worker/app/immutable/chunks/singletons-72a59adb.js","/SvelteKit-Plugin-Versioned-Worker/app/immutable/chunks/paths-598ab0bd.js","/SvelteKit-Plugin-Versioned-Worker/app/immutable/chunks/LinkPage-e5dea8b7.js","/SvelteKit-Plugin-Versioned-Worker/app/immutable/chunks/_layout-04d04af2.js","/SvelteKit-Plugin-Versioned-Worker/app/immutable/chunks/0-4079a121.js","/SvelteKit-Plugin-Versioned-Worker/app/immutable/chunks/1-ddcda609.js","/SvelteKit-Plugin-Versioned-Worker/app/immutable/chunks/2-21baf73c.js","/SvelteKit-Plugin-Versioned-Worker/app/immutable/chunks/3-efa04331.js","/SvelteKit-Plugin-Versioned-Worker/app/immutable/assets/_layout-1fdb24be.css","/SvelteKit-Plugin-Versioned-Worker/app/immutable/assets/_page-d116e0d4.css","/SvelteKit-Plugin-Versioned-Worker/vite-manifest.json","appIcon.png","appIcon.svg","favicon.png","favicon.svg","manifest.json","maskableAppIcon.png","robots.txt"];const LAZY_CACHE=[];const STORAGE_PREFIX="velteKit-Plugin-Versioned-Worker-";const VERSION=1;const VERSION_FOLDER="sw";const VERSION_FILE_BATCH_SIZE=10;const MAX_VERSION_FILES=10;/*
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