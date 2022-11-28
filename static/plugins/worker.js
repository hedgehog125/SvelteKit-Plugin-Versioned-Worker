/*
Build inputs:

 * ROUTES
 * PRECACHE
 * LAZY_CACHE
 * STORAGE_PREFIX
 * VERSION
*/
const COMPLETE_CACHE_LIST = Object.assign(null, {});
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

		})()
	);
});
addEventListener("activate", e => {
	e.waitUntil(
		(async _ => {
			const currentStorageName = STORAGE_PREFIX + VERSION;

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
            let cache = await caches.open(STORAGE_PREFIX + VERSION);
            let cached = await cache.match(e.request);
            if (cached) return cached;
        
            let resource;
            try {
                resource = await fetch(e.request);
            }
            catch (error) {
                console.error(`Couldn't fetch or serve from cache: ${e.request.url}`);
                if (ROUTES.includes(e.request.url)) {
					return new Response("Something went wrong. Please connect to the internet and try again.");
				}
				else return null;
            }
            if (COMPLETE_CACHE_LIST[e.request.url]) {
                e.waitUntil(cache.put(e.request, resource.clone())); // Update it in the background
            }
            return resource;
        })()
    );
});