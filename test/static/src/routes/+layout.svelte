<script>
	import RegisterWorker from "$util/RegisterWorker.svelte";
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