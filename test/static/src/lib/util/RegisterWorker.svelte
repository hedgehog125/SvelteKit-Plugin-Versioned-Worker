<script>
	import linkPage from "$util/LinkPage.js";
	import { onMount } from "svelte";

	onMount(_ => {
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