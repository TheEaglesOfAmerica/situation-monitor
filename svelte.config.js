import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		// Node adapter for server-side API routes and continuous data fetching
		adapter: adapter({
			out: 'build',
			precompress: false,
			envPrefix: ''
		}),
		paths: {
			base: process.env.BASE_PATH || ''
		},
		alias: {
			$lib: 'src/lib',
			$components: 'src/lib/components',
			$stores: 'src/lib/stores',
			$services: 'src/lib/services',
			$config: 'src/lib/config',
			$types: 'src/lib/types'
		}
	}
};

export default config;
