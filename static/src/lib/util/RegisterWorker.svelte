<script>
	import linkPage from "$util/LinkPage.js";
	import { onMount } from "svelte";

	onMount(_ => {
		if (! "serviceWorker" in navigator) return;

		navigator.serviceWorker.register(linkPage("sw.js"));
	});
</script>