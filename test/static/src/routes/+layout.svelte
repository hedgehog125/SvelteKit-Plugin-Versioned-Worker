<script>
	import { RegisterWorker } from "sveltekit-plugin-versioned-worker/components";
</script>

<style>
	::global(*) {
		font-family: sans-serif;
	}
	:global(button) {
		cursor: pointer;
	}
</style>

<RegisterWorker></RegisterWorker>
<slot></slot>