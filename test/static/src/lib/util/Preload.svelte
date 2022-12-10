<script>
    export let assetsToPreload;
</script>

<main>
    {#each Object.entries(assetsToPreload) as [type, toPreload]}
        {#each toPreload as href}
            <link rel="preload" as={type} {href}>
        {/each}
    {/each}
</main>