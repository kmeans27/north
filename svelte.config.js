import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** Self-hosted: the server serves the site at the root, so `base` is empty.
    Set BASE_PATH to deploy under a sub-path instead. */
const base = process.env.BASE_PATH ?? '';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ fallback: undefined }),
    // `relative: false` + BASE_PATH keeps /fonts and /_app absolute, so assets
    // resolve identically from / and from nested routes such as /week.
    paths: { base, relative: false },
    prerender: { entries: ['*'] }
  }
};

export default config;
