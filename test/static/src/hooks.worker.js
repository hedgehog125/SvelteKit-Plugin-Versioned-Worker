export function handle(path, isPage) {
	if (isPage && path == "hidden-page") {
		return new Response("Shh. I'm a secret page.");
	}
};