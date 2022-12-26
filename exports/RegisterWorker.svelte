<script>
	import { onMount } from "svelte";
	import { dev } from "$app/environment";
	import { base } from "$app/paths";

	const linkPage = href => {
    	if (href.endsWith("/")) href = href.slice(0, -1);

	    return base + "/" + href;
	};

	onMount(_ => {
		if (dev) return;
		if (! "serviceWorker" in navigator) return;

		navigator.serviceWorker.register(linkPage("sw.js"));
		/*
		const registration = await navigator.serviceWorker.register(linkPage("sw.js"));
		if (registration.installing) {
			registration.installing.addEventListener("statechange", _ => {
				console.log(registration.installing.state, this)
			});
		}
		*/
	});
</script>