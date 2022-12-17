<script>
	import RegisterWorker from "sveltekit-plugin-versioned-worker/register-worker";
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