(function(){"use strict";function v(e,o){if(o&&e=="hidden-page")return new Response("Shh. I'm a secret page.")}const h=["/SvelteKit-Plugin-Versioned-Worker/","/SvelteKit-Plugin-Versioned-Worker/linkDemo/"],w=["/SvelteKit-Plugin-Versioned-Worker/app/immutable/start-04d884a8.js","/SvelteKit-Plugin-Versioned-Worker/app/immutable/components/pages/_layout.svelte-8df6663d.js","/SvelteKit-Plugin-Versioned-Worker/app/immutable/components/error.svelte-a111bac7.js","/SvelteKit-Plugin-Versioned-Worker/app/immutable/components/pages/_page.svelte-6eeaa027.js","/SvelteKit-Plugin-Versioned-Worker/app/immutable/components/pages/linkDemo/_page.svelte-2f0d92f1.js","/SvelteKit-Plugin-Versioned-Worker/app/immutable/modules/pages/_layout.js-6a08c268.js","/SvelteKit-Plugin-Versioned-Worker/app/immutable/chunks/singletons-fae66430.js","/SvelteKit-Plugin-Versioned-Worker/app/immutable/chunks/paths-598ab0bd.js","/SvelteKit-Plugin-Versioned-Worker/app/immutable/chunks/LinkPage-e5dea8b7.js","/SvelteKit-Plugin-Versioned-Worker/app/immutable/chunks/_layout-04d04af2.js","/SvelteKit-Plugin-Versioned-Worker/app/immutable/chunks/0-4079a121.js","/SvelteKit-Plugin-Versioned-Worker/app/immutable/chunks/1-aca06cac.js","/SvelteKit-Plugin-Versioned-Worker/app/immutable/chunks/2-21baf73c.js","/SvelteKit-Plugin-Versioned-Worker/app/immutable/chunks/3-efa04331.js","/SvelteKit-Plugin-Versioned-Worker/app/immutable/assets/_layout-1fdb24be.css","/SvelteKit-Plugin-Versioned-Worker/app/immutable/assets/_page-d116e0d4.css","/SvelteKit-Plugin-Versioned-Worker/vite-manifest.json","appIcon.png","appIcon.svg","favicon.png","favicon.svg","manifest.json","maskableAppIcon.png","robots.txt"],S=[],d="SvelteKit-Plugin-Versioned-Worker-",b=3,V="sw",P=10,K=10,j="/SvelteKit-Plugin-Versioned-Worker/",g=d+b,f=Object.create(null,{}),k=e=>{for(const o of e)f[o]=!0};k(h),k(w),k(S);const y=e=>{e=e.split(`\r
`).join(`
`);const o=e.indexOf(`
`),n=e.slice(0,o);if(n!="1")throw new Error(`Unknown format version ${JSON.stringify(n)} in the most recent version file (not version.txt, the ones containing the changed files).`);return{formatVersion:1,updated:e.slice(o+1).split(`
`)}};addEventListener("install",e=>{e.waitUntil((async o=>{let n=[],s=new Set,l=!1;{const m=await caches.keys();for(const t of m)!t.startsWith(d)||t!=g&&n.push(parseInt(t.slice(d.length)));n=n.sort((t,a)=>a-t);const r=Math.max(...n);let i=[];for(let t=r;t<=b;t+=P)if(i.push(fetch(`${V}/${Math.floor(t/P)}.txt`)),i.length>K){l=!0;break}if(!l){i=await Promise.all(i),i=await Promise.all(i.map(t=>t.text())),i=i.map(y);for(const t of i)for(const a of t.updated)s.add(a)}}const c=new Set([...h,...w]),p=[];if(!l){const m=await caches.keys();for(const r of m){if(!r.startsWith(d)||r==g)continue;const i=await caches.open(r),t=await Promise.all([...c].map(a=>(async W=>[a,await i.match(a)!==void 0])()));for(const[a,W]of t)W&&!(s.has(a)||h.includes(a))&&(p.push([a,i]),c.delete(a))}}const u=await caches.open(g);await Promise.all([u.addAll(c),...p.map(([m,r])=>(async i=>{await u.put(m,await r.match(m))})())])})())}),addEventListener("activate",e=>{e.waitUntil((async o=>{await clients.claim();const n=await caches.keys();for(const s of n)!s.startsWith(d)||s!=g&&await caches.delete(s)})())}),addEventListener("fetch",e=>{e.respondWith((async o=>{const n=e.request.mode=="navigate"&&e.request.method=="GET",s=new URL(e.request.url).pathname;if(v){const u=v(s.slice(j.length),n);if(u!=null)return u}if(n&&registration.waiting&&(await clients.matchAll()).length<=1)return registration.waiting.postMessage("skipWaiting"),new Response("",{headers:{Refresh:"0"}});let l=await caches.open(g),c=await l.match(e.request);if(c)return c;let p;try{p=await fetch(e.request)}catch{return h.includes(s)&&n?new Response("Something went wrong. Please connect to the internet and try again."):(f[s]&&console.error(`Couldn't fetch or serve file from cache: ${s}`),Response.error())}return f[s]&&e.request.method=="GET"&&e.waitUntil(l.put(e.request,p.clone())),p})())}),addEventListener("message",({data:e})=>{e=="skipWaiting"&&skipWaiting()})})();
