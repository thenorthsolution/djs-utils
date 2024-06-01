// @ts-check
import { defineConfig } from 'tsup';

/**
 * 
 * @param {Partial<import('tsup').Options>} options 
 */
export default function createConfig({
    entry = ['src/index.ts'],
	external = [],
	noExternal = [],
	platform = 'node',
	format = ['esm', 'cjs'],
	target = 'es2022',
	skipNodeModulesBundle = true,
	clean = true,
	shims = format.includes('cjs'),
	cjsInterop = format.includes('cjs'),
	minify = false,
	terserOptions = {
		mangle: false,
		keep_classnames: true,
		keep_fnames: true,
	},
	splitting = false,
	keepNames = true,
	dts = true,
	sourcemap = true,
	esbuildPlugins = [],
	treeshake = false,
	outDir = 'dist',
} = {}) {
    return defineConfig({
		entry,
		external,
		noExternal,
		platform,
		format,
		skipNodeModulesBundle,
		target,
		clean,
		shims,
		cjsInterop,
		minify,
		terserOptions,
		splitting,
		keepNames,
		dts,
		sourcemap,
		esbuildPlugins,
		treeshake,
		outDir,
	});
}