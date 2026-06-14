<script lang="ts">
	import { onMount } from 'svelte';
	import CameraObscuraScene from '$components/CameraObscuraScene.svelte';
	import ControlPanel from '$components/ControlPanel.svelte';
	import type { CameraParams, Preset, ImageResult, ValidationWarning } from '$lib/cameraObscura';
	import { DEFAULT_PARAMS, calculateImage, generateId, PRESET_COLORS, validateParams } from '$lib/cameraObscura';

	let params: CameraParams = { ...DEFAULT_PARAMS };
	let presets: Preset[] = [];
	let selectedPresetId: string | null = null;
	let comparePresetIds: Set<string> = new Set();
	let showRays = true;
	let isMobile = false;
	let showMobilePanel = false;

	$: imageResult = calculateImage(params);
	$: comparePresets = presets.filter((p) => comparePresetIds.has(p.id));
	$: paramWarnings = validateParams(params);

	function checkMobile() {
		if (typeof window !== 'undefined') {
			isMobile = window.innerWidth < 768;
		}
	}

	function savePreset() {
		const name = prompt('请输入方案名称:', `方案 ${presets.length + 1}`);
		if (!name) return;

		const newPreset: Preset = {
			id: generateId(),
			name,
			params: { ...params },
			createdAt: Date.now(),
			color: PRESET_COLORS[presets.length % PRESET_COLORS.length]
		};

		presets = [...presets, newPreset];
		selectedPresetId = newPreset.id;
		savePresetsToStorage();
	}

	function toggleCompare(presetId: string) {
		const newSet = new Set(comparePresetIds);
		if (newSet.has(presetId)) {
			newSet.delete(presetId);
		} else {
			newSet.add(presetId);
		}
		comparePresetIds = newSet;
	}

	function selectPreset(preset: Preset) {
		selectedPresetId = preset.id;
		params = { ...preset.params };
	}

	function deletePreset(id: string) {
		presets = presets.filter((p) => p.id !== id);
		if (selectedPresetId === id) {
			selectedPresetId = null;
		}
		const newSet = new Set(comparePresetIds);
		newSet.delete(id);
		comparePresetIds = newSet;
		savePresetsToStorage();
	}

	function savePresetsToStorage() {
		if (typeof localStorage === 'undefined') return;
		try {
			localStorage.setItem('cameraObscuraPresets', JSON.stringify(presets));
		} catch (e) {
			console.warn('无法保存到本地存储:', e);
		}
	}

	function loadPresetsFromStorage() {
		if (typeof localStorage === 'undefined') return;
		try {
			const saved = localStorage.getItem('cameraObscuraPresets');
			if (saved) {
				presets = JSON.parse(saved);
			}
		} catch (e) {
			console.warn('无法从本地存储加载:', e);
		}
	}

	onMount(() => {
		checkMobile();
		loadPresetsFromStorage();
		window.addEventListener('resize', checkMobile);

		return () => {
			window.removeEventListener('resize', checkMobile);
		};
	});
</script>

<div class="h-screen w-screen flex flex-col bg-surface-900 overflow-hidden">
	<header class="bg-surface-800 border-b border-surface-700 px-4 py-3 flex-shrink-0">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-3">
				<span class="text-2xl">📷</span>
				<div>
					<h1 class="text-xl font-bold text-surface-100">光学暗箱成像模拟器</h1>
					<p class="text-xs text-surface-400">Camera Obscura Simulator</p>
				</div>
			</div>

			{#if isMobile}
				<button
					on:click={() => (showMobilePanel = !showMobilePanel)}
					class="btn btn-primary px-4 py-2 rounded text-sm"
				>
					{showMobilePanel ? '关闭' : '参数'}
				</button>
			{/if}
		</div>
	</header>

	<div class="flex-1 flex overflow-hidden">
		<div class="flex-1 relative overflow-hidden">
			<CameraObscuraScene {params} {showRays} {comparePresets} />

			<div class="absolute top-4 left-4 bg-surface-800/80 backdrop-blur-sm rounded-lg p-3 text-sm text-surface-200 max-w-xs">
				<p class="font-semibold text-primary-400 mb-1">💡 使用提示</p>
				<ul class="text-xs space-y-1 text-surface-300">
					<li>• 拖动鼠标旋转视角</li>
					<li>• 滚轮缩放场景</li>
					<li>• 调整参数观察成像变化</li>
					<li>• 孔径越大像越亮但越模糊</li>
				</ul>
			</div>

			{#if !imageResult.isValid}
				<div class="absolute top-4 right-4 bg-error-600/90 backdrop-blur-sm rounded-lg p-3 text-sm text-white max-w-xs">
					<p class="font-semibold">⚠ 参数无效</p>
					<p class="text-xs mt-1">{imageResult.message}</p>
				</div>
			{:else if paramWarnings.warnings && paramWarnings.warnings.length > 0}
				<div class="absolute top-4 right-4 bg-warning-800/80 backdrop-blur-sm border border-warning-600/50 rounded-lg p-3 text-sm max-w-xs">
					<p class="font-semibold text-warning-300">⚠ 参数提示</p>
					{#each paramWarnings.warnings as warning}
						<p class="text-xs mt-1 text-warning-200">{warning.message}</p>
					{/each}
				</div>
			{/if}

			<div class="absolute bottom-4 left-4 bg-surface-800/80 backdrop-blur-sm rounded-lg p-3 text-xs text-surface-300">
				<div class="flex gap-4">
					<div>
						<span class="text-surface-400">放大:</span>
						<span class="font-mono ml-1 text-surface-100">{imageResult.magnification.toFixed(3)}x</span>
					</div>
					<div>
						<span class="text-surface-400">亮度:</span>
						<span class="font-mono ml-1 text-warning-400">{imageResult.brightness.toFixed(1)}%</span>
					</div>
					<div>
						<span class="text-surface-400">清晰度:</span>
						<span class="font-mono ml-1 text-primary-400">{imageResult.sharpness.toFixed(1)}%</span>
					</div>
				</div>
			</div>
		</div>

		{#if !isMobile}
			<aside class="w-80 bg-surface-800 border-l border-surface-700 flex-shrink-0 overflow-hidden">
				<ControlPanel
					bind:params
					bind:presets
					bind:showRays
					bind:selectedPresetId
					{imageResult}
					{comparePresetIds}
					onPresetSave={savePreset}
					onPresetSelect={selectPreset}
					onPresetDelete={deletePreset}
					onToggleCompare={toggleCompare}
				/>
			</aside>
		{/if}
	</div>

	{#if isMobile && showMobilePanel}
		<div
			role="button"
			tabindex="0"
			aria-label="关闭参数面板"
			class="fixed inset-0 bg-black/50 z-40 cursor-pointer"
			on:click={() => (showMobilePanel = false)}
			on:keydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					showMobilePanel = false;
				}
			}}
		/>
		<div class="fixed bottom-0 left-0 right-0 bg-surface-800 rounded-t-2xl z-50 max-h-[70vh] overflow-hidden flex flex-col">
			<div class="flex justify-center py-2 flex-shrink-0">
				<div class="w-12 h-1 bg-surface-600 rounded-full" />
			</div>
			<div class="overflow-y-auto flex-1">
				<ControlPanel
					bind:params
					bind:presets
					bind:showRays
					bind:selectedPresetId
					{imageResult}
					{comparePresetIds}
					onPresetSave={savePreset}
					onPresetSelect={selectPreset}
					onPresetDelete={deletePreset}
					onToggleCompare={toggleCompare}
				/>
			</div>
		</div>
	{/if}
</div>
