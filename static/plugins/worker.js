/*
Build inputs:

 * ROUTES
 * PRECACHE
 * LAZY_CACHE
 * STORAGE_PREFIX
 * VERSION
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
			const path = new URL(e.request.url).pathname;
			console.log(e.request.url, path);
            let cache = await caches.open(currentStorageName);
            let cached = await cache.match(e.request);
            if (cached) return cached;
        
            let resource;
            try {
                resource = await fetch(e.request);
            }
            catch (error) {
				if (ROUTES.includes(path)) {
					return new Response("Something went wrong. Please connect to the internet and try again.");
				}
				else {
					console.error(`Couldn't fetch or serve file from cache: ${path}`);
					return Response.error();
				}
            }
            if (COMPLETE_CACHE_LIST[path]) {
                e.waitUntil(cache.put(e.request, resource.clone())); // Update it in the background
            }
            return resource;
        })()
    );
});