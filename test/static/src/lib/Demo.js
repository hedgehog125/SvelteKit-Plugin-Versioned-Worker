// This is only in this folder so it's easier for you to delete

export const textboxes = {
    preload: 
`<script>
import Preload from "$util/Preload.svelte";
import downloadIcon from "$img/download.svg";
const assetsToPreload = {
	image: [
		downloadIcon
	]
};
</script>
<svelte:head>
	<Preload {assetsToPreload}></Preload>
</svelte:head>`,
    link:
`<script>
	import { linkPage } from "$util/Tools.js";
</script>

<main>
	<a href={linkPage("hmm")}>Look, this works! :0</a>
</main>`
};