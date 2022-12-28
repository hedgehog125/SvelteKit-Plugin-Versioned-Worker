# SvelteKit-Plugin-Versioned-Worker
A minimal plugin for SvelteKit PWAs using the static adapter

[Simple demo](https://hedgehog125.github.io/SvelteKit-Plugin-Versioned-Worker)

---

Something I noticed while researching Workbox was that it doesn't seem to have much of an update mechanism. Instead it seems to rely on periodically redownloading assets when there's an internet connection, depending on the strategies you've chosen and the HTTP cache headers (which you can't always control). I thought this seemed like an unnecessary thing to have to worry about and also a bit wasteful, so I made my own service worker plugin that uses the same strategy that I used for Bagel.js: where the client fetches metadata files which tell it which files to download. I also wanted to make it specifically for SvelteKit, both to simplify use with it and to simplify its development.

# Features
 * An efficient update mechanism which doesn't require any upfront decisions
 * An easy-to-use hooks system that allows you to handle requests yourself
 * A few quality of life features for the web app manifest
 * Small worker bundle (typically around 5KB)
 * Minimal configuration needed
 
# Getting Started
Install it as a dev dependency like any other Node.js build tool:
```bash
npm i sveltekit-plugin-versioned-worker -D
```

Then import it and add it as a plugin in your vite.config.js file like this:
```js
import { sveltekit } from "@sveltejs/kit/vite";
import { versionedWorker } from "sveltekit-plugin-versioned-worker";

export default {
  plugins: [
    sveltekit(),
    versionedWorker()
  ]
};
```

But before you can use the plugin, you need to tell it where its info file will go so it can check what's changed. Since this file doesn't have anything sensitive in it (unless you **really** want to hide the source structure), it's easiest just to download it over HTTP(S) from where you'll be hosting this website. For example:
```js
// ...
import { versionedWorker, fetchLast } from "sveltekit-plugin-versioned-worker";

// ...
    versionedWorker({
      lastInfo: fetchLast("https://hedgehog125.github.io/SvelteKit-Plugin-Versioned-Worker/versionedWorker.json")
    })
// ...
```

You can also get the last info from the file system, which is useful if you want to test the updating locally:
```js
import { versionedWorker, readLast } from "sveltekit-plugin-versioned-worker";

// ...
    versionedWorker({
      lastInfo: readLast("build/versionedWorker.json")
    })
// ...
```

I'd suggest having your code do both though, depending on if it's a test build or not. It's up to you or your template to decide exactly how you want to do that, but I do it like this in [my template](https://github.com/hedgehog125/SvelteKit-Template):
```js
import { sveltekit } from "@sveltejs/kit/vite";
import { versionedWorker, fetchLast, readLast } from "sveltekit-plugin-versioned-worker";

export default {
  plugins: [
    sveltekit(),
    versionedWorker({
      lastInfo: process.env.DISABLE_BASE_URL === "true"?
        readLast("build/versionedWorker.json") // <-- Test build
        : fetchLast("https://hedgehog125.github.io/SvelteKit-Plugin-Versioned-Worker/versionedWorker.json")
    })
  ]
};
```

And then just put the RegisterWorker component in your **"src/routes/+layout.svelte"** file so it gets included on every route, like this:
```html
<script>
  // ...
  import { RegisterWorker } from "sveltekit-plugin-versioned-worker/components";
</script>

<!-- ... -->

<RegisterWorker></RegisterWorker>
<slot></slot>
```

Your web app should now work offline, but you'll probably want to add a manifest as well. By default, it should be put in **"src/manifest.webmanifest"**, but you can change this with the `manifestFile` option. The file name that it's outputted as is set by `manifestOutFile`, which defaults to **"manifest.webmanifest"**. You'll then need to include this file yourself, which you can do in your **"src/app.html"** file like this:
```html
<!-- ... -->
<head>
  <!-- ... -->
  <link rel="manifest" href="%sveltekit.assets%/manifest.webmanifest"/>
</head>
<!-- ... -->
```

Your inputted manifest will be processed slightly by default. Paths will have the base URL added to their starts, and the start_url and scope attributes are added automatically. Whitespace will also be removed.

You should now just be able to build and deploy, but there're a few other options you might want to know about...

# Options
**Note**: for the callbacks, you can also return values synchronously instead of returning a promise for the value. 

 * **Required**: **`lastInfo`**: function returning Promise&lt;string?&gt;
 
   Normally you can import and use fetchLast or readLast, but read on if you want to make a custom one. This function should return a promise that resolves to the last Versioned Worker info file (unparsed). If the file doesn't exist, the promise should resolve to null, and should ouput a warning itself if there's a chance that it's because of a misconfiguration (e.g inputting the wrong URL in the built in fetchLast. readLast also does this).
   
   Typically you'll write a function that returns a function. And that will then be called with these arguments:
     1. A path to a folder where you can store your own temporary files
     2. An object containing a warn and an info method
     3. An object containing the Vite (viteConfig) and SvelteKit (svelteConfig) config objects
     
   This function will be called in the buildStart hook, and needs to be able to run in the background. It should finish before the build finishes for a faster build time, but it will be awaited for if it hasn't resolved before then.
   
 * **`lazyCache`**: function returning Promise&lt;Boolean&gt; (default: **function that returns false**)
 
   If all you want to do is lazyCache some specific static files, you can just import and use fileList like this:
   ```js
   // ...
   lazyCache: fileList(["bigVideo.mp4"])
   // ...
   ```
 
   But otherwise, this function determines if file of the build should be lazy cached or not, do this by returning a boolean promise (true means it should, false means it shouldn't by lazy cached). It runs at build time, rather than when the client is downloading files. A lazy cached file isn't downloaded ahead of time, so your PWA should be able to handle it not being there. It gets downloaded when it's requested, unless it can't because the device is offline.
   
   The function is called with the normalised relative path to the file (relative to the build directory). e.g it's "_app/immutable/chunks/foo.js" instead of an absolute or a Windows style one. The second argument is its mime type, which can be false if it's unknown since it's provided by mime-types. The 3rd is the system specific absolute path to the file, and the 4th is an object containing viteConfig and svelteConfig.
   
   Try to avoid doing anything that takes too long in here, as although these all run in parallel, along with the exclude calls, this will be the only thing happening in the build until they're done.
   
  * **`exclude`**: function returning Promise&lt;Boolean&gt; (default: **function that excludes a few unnecessary files**)

    Works in the same way as `lazyCache` and is called with the same arguments. Resolve to true to exclude, resolve to false to include. Note that `lazyCache` doesn't wait for the result of this function, although it will run synchronously first. `lazyCache` will still be called even if this function synchronously excludes that file though, but its output will be ignored.
    
  * **`generateManifest`**: function returning Promise&lt;object&gt; or Promise&lt;string&gt; (default: **function that makes some slight tweaks to how it works**)
    
    By default, the scope and start URL are made optional. The scope is always set to the base URL in svelteConfig.kit.paths.base, and all the paths have the base added to the start unless they start with a slash or are absolute URLs (including the start URL).
    
    But you can replace this behaviour by providing a function, which is called with the parsed manifest file contents as its 1st argument, and the base URL as its second. The resolved promise returned by the function is what gets written to the output manifest file, this will be stringified if it's an object.
    
  * **`buildDir`**: string (default: **"build"**)

    Where the static SvelteKit adapter is set to output to. You'll need to make sure these values match. The path is relative to the root of your SvelteKit project.
    
  * **`handlerFile`**: string (default: **"src/hooks.worker.js"**)
    
    Where the plugin should look for your handler file (relative to the root of your SvelteKit project). This file doesn't have to exist. More information about it in the next section.
    
  * **`manifestFile`**: string (default: **"src/manifest.webmanifest"**)
    
    The relative path to your manifest file. It's contents are provided as an input to the `generateManifest` function.
    
  * **`manifestOutName`**: string (default: **"manifest.webmanifest"**)
  
    The filename for the web app manifest to be outputted as.
    
  * **`storagePrefix`**: string (default: **the base URL or "VersionedWorkerCache" if there isn't one**)
  
    The prefix for the cache storage. The full cache name will be the prefix, a dash and then the version number.
    
# Worker Hooks
**Note**: again, for the callbacks, you can also return values synchronously instead of returning a promise for the value. 

You can hook into and override the default behaviour of the worker at runtime. You do this by exporting functions from your `handlerFile`, which is looked for at **"src/hooks.worker.js"** by default. Currently, there's only 1 hook that's supported:

  * **`handle`**: function returning Promise&lt;Response?&gt;
  
    The function is called with the path without the base URL or starting slash, if it's a page or not, the fetch event and the full path. If the promise resolves to a Response object, it'll be sent as the response, but if null, the default behaviour will happen instead.
    
    It's generally best to use the first path instead of the full path as it means it'll still work if the base URL changes.
    
    **Example**:
    ```js
    export function handle(path, isPage) {
      if (isPage && path == "hidden-page") {
        return new Response("Shh. I'm a secret page.");
      }
    };
    ```


**Note**: while this plugin seems to be working for basic situations, I haven't fully tested it yet, so expect some bugs. Please submit an issue or pull request if you find any.
