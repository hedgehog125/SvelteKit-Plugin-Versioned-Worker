<script>
	import { linkPage } from "$util/Tools.js";

	const escapedText = "<base>";
</script>

<main>
	<p>
		That link wasn't very exciting. But the fact that it adapts to the base URL on build is somewhat interesting. That was by setting the anchor's href using the function "linkPage" from "$util/Tools.js". In that example, "linkDemo" was what was parsed to the function, which results in "/linkDemo" if there's no base URL, or "/{escapedText}/linkDemo" if there is. And the one below just uses an empty string.
	</p>
	<a href={linkPage("")}>Back</a>
</main>