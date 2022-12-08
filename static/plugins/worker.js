/*
Build inputs:

 * ROUTES
 * PRECACHE
 * LAZY_CACHE
 * STORAGE_PREFIX
 * VERSION
 * WORKER_FILE
 * VERSION_FILE
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


addEventListener("install", e => {
    e.waitUntil(
		(async _ => {
			const cache = await caches.open(currentStorageName);

			await cache.addAll(ROUTES);
			await cache.addAll(PRECACHE);
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
				const clients = await clients.matchAll();
				if (clients.length <= 1) {
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

/*
export function parseUpdatedList(contents) {
	contents = contents.split("\r\n").join("\n");

	const version = contents.slice(0, contents.indexOf("\n"));
	if (version != "1") throw new VersionedWorkerError(`Unknown format version ${JSON.stringify(version)} in the most recent version file (not version.txt, the ones containing the changed files).`);
};
*/