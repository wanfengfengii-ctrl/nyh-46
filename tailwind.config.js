import { skeleton } from '@skeletonlabs/tw-plugin';
import path from 'path';

/** @type {import('tailwindcss').Config} */
export default {
	darkMode: 'class',
	content: [
		'./src/**/*.{html,js,svelte,ts}',
		path.join(path.resolve('@skeletonlabs/skeleton'), '../**/*.{html,js,svelte,ts}')
	],
	theme: {
		extend: {
			colors: {
				primary: {
					50: 'var(--color-primary-50)',
					100: 'var(--color-primary-100)',
					200: 'var(--color-primary-200)',
					300: 'var(--color-primary-300)',
					400: 'var(--color-primary-400)',
					500: 'var(--color-primary-500)',
					600: 'var(--color-primary-600)',
					700: 'var(--color-primary-700)',
					800: 'var(--color-primary-800)',
					900: 'var(--color-primary-900)',
					950: 'var(--color-primary-950)'
				},
				secondary: {
					50: 'var(--color-secondary-50)',
					100: 'var(--color-secondary-100)',
					200: 'var(--color-secondary-200)',
					300: 'var(--color-secondary-300)',
					400: 'var(--color-secondary-400)',
					500: 'var(--color-secondary-500)',
					600: 'var(--color-secondary-600)',
					700: 'var(--color-secondary-700)',
					800: 'var(--color-secondary-800)',
					900: 'var(--color-secondary-900)',
					950: 'var(--color-secondary-950)'
				},
				surface: {
					50: 'var(--color-surface-50)',
					100: 'var(--color-surface-100)',
					200: 'var(--color-surface-200)',
					300: 'var(--color-surface-300)',
					400: 'var(--color-surface-400)',
					500: 'var(--color-surface-500)',
					600: 'var(--color-surface-600)',
					700: 'var(--color-surface-700)',
					800: 'var(--color-surface-800)',
					900: 'var(--color-surface-900)',
					950: 'var(--color-surface-950)'
				},
				success: {
					50: 'var(--color-success-50)',
					100: 'var(--color-success-100)',
					200: 'var(--color-success-200)',
					300: 'var(--color-success-300)',
					400: 'var(--color-success-400)',
					500: 'var(--color-success-500)',
					600: 'var(--color-success-600)',
					700: 'var(--color-success-700)',
					800: 'var(--color-success-800)',
					900: 'var(--color-success-900)',
					950: 'var(--color-success-950)'
				},
				warning: {
					50: 'var(--color-warning-50)',
					100: 'var(--color-warning-100)',
					200: 'var(--color-warning-200)',
					300: 'var(--color-warning-300)',
					400: 'var(--color-warning-400)',
					500: 'var(--color-warning-500)',
					600: 'var(--color-warning-600)',
					700: 'var(--color-warning-700)',
					800: 'var(--color-warning-800)',
					900: 'var(--color-warning-900)',
					950: 'var(--color-warning-950)'
				},
				error: {
					50: 'var(--color-error-50)',
					100: 'var(--color-error-100)',
					200: 'var(--color-error-200)',
					300: 'var(--color-error-300)',
					400: 'var(--color-error-400)',
					500: 'var(--color-error-500)',
					600: 'var(--color-error-600)',
					700: 'var(--color-error-700)',
					800: 'var(--color-error-800)',
					900: 'var(--color-error-900)',
					950: 'var(--color-error-950)'
				}
			}
		}
	},
	plugins: [
		skeleton({
			themes: {
				custom: [
					{
						name: 'camera-obscura',
						properties: {
							'--color-primary-50': '#fef7ed',
							'--color-primary-100': '#fdedd5',
							'--color-primary-200': '#fad8aa',
							'--color-primary-300': '#f6bc74',
							'--color-primary-400': '#f1953d',
							'--color-primary-500': '#ee7718',
							'--color-primary-600': '#df5d0e',
							'--color-primary-700': '#b9450e',
							'--color-primary-800': '#933714',
							'--color-primary-900': '#773014',
							'--color-primary-950': '#401608',
							'--color-secondary-50': '#f8f6f4',
							'--color-secondary-100': '#efebe6',
							'--color-secondary-200': '#dfd5cc',
							'--color-secondary-300': '#c9baaa',
							'--color-secondary-400': '#b19a85',
							'--color-secondary-500': '#9f826a',
							'--color-secondary-600': '#92715b',
							'--color-secondary-700': '#7a5c4c',
							'--color-secondary-800': '#654d42',
							'--color-secondary-900': '#544138',
							'--color-secondary-950': '#2e211c',
							'--color-surface-50': '#f8f6f4',
							'--color-surface-100': '#ebe7e2',
							'--color-surface-200': '#d6cec4',
							'--color-surface-300': '#bbae9e',
							'--color-surface-400': '#a08e7b',
							'--color-surface-500': '#8a7662',
							'--color-surface-600': '#766353',
							'--color-surface-700': '#605044',
							'--color-surface-800': '#50433a',
							'--color-surface-900': '#443932',
							'--color-surface-950': '#261f1a'
						}
					}
				]
			}
		})
	]
};
