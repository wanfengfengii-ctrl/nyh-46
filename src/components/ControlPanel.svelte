<script lang="ts">
	import type { CameraParams, ImageResult, Preset, ValidationWarning } from '$lib/cameraObscura';
	import { calculateImage, validateParams, generateId, PRESET_COLORS } from '$lib/cameraObscura';

	export let params: CameraParams;
	export let presets: Preset[];
	export let showRays: boolean;
	export let onPresetSelect: (preset: Preset) => void;
	export let onPresetSave: () => void;
	export let onPresetDelete: (id: string) => void;
	export let onToggleCompare: (id: string) => void;
	export let comparePresetIds: Set<string>;
	export let selectedPresetId: string | null;

	export let imageResult: ImageResult;

	$: imageResult = calculateImage(params);
	$: validation = validateParams(params);

	function updateParam(key: keyof CameraParams, value: number) {
		params = { ...params, [key]: value };
	}

	function formatNumber(num: number, decimals: number = 2): string {
		return num.toFixed(decimals);
	}
</script>

<div class="control-panel p-4 overflow-y-auto h-full">
	<div class="card p-4 mb-4 bg-surface-800 border-surface-700">
		<h3 class="text-lg font-bold mb-3 text-surface-100">参数控制</h3>

		<div class="mb-4">
			<div class="flex justify-between items-center mb-1">
				<label for="boxLength" class="text-sm text-surface-200">暗箱长度</label>
				<span class="text-sm font-mono text-primary-400">{formatNumber(params.boxLength)} 单位</span>
			</div>
			<input
				id="boxLength"
				type="range"
				min="1"
				max="15"
				step="0.1"
				bind:value={params.boxLength}
				on:input={() => updateParam('boxLength', Number(params.boxLength))}
				class="range-slider range-md w-full accent-primary-500"
			/>
			<div class="flex justify-between text-xs text-surface-400 mt-1">
				<span>1</span>
				<span>15</span>
			</div>
		</div>

		<div class="mb-4">
			<div class="flex justify-between items-center mb-1">
				<label for="apertureSize" class="text-sm text-surface-200">孔径大小</label>
				<span class="text-sm font-mono text-primary-400">{formatNumber(params.apertureSize, 2)}</span>
			</div>
			<input
				id="apertureSize"
				type="range"
				min="0.05"
				max="2"
				step="0.01"
				bind:value={params.apertureSize}
				on:input={() => updateParam('apertureSize', Number(params.apertureSize))}
				class="range-slider range-md w-full accent-primary-500"
			/>
			<div class="flex justify-between text-xs text-surface-400 mt-1">
				<span>0.05</span>
				<span>2.0</span>
			</div>
		</div>

		<div class="mb-4">
			<div class="flex justify-between items-center mb-1">
				<label for="objectDistance" class="text-sm text-surface-200">物体距离</label>
				<span class="text-sm font-mono text-primary-400">{formatNumber(params.objectDistance)} 单位</span>
			</div>
			<input
				id="objectDistance"
				type="range"
				min="2"
				max="30"
				step="0.1"
				bind:value={params.objectDistance}
				on:input={() => updateParam('objectDistance', Number(params.objectDistance))}
				class="range-slider range-md w-full accent-primary-500"
			/>
			<div class="flex justify-between text-xs text-surface-400 mt-1">
				<span>2</span>
				<span>30</span>
			</div>
		</div>

		<div class="mb-4">
			<div class="flex justify-between items-center mb-1">
				<label for="objectHeight" class="text-sm text-surface-200">物体高度</label>
				<span class="text-sm font-mono text-primary-400">{formatNumber(params.objectHeight)} 单位</span>
			</div>
			<input
				id="objectHeight"
				type="range"
				min="1"
				max="8"
				step="0.1"
				bind:value={params.objectHeight}
				on:input={() => updateParam('objectHeight', Number(params.objectHeight))}
				class="range-slider range-md w-full accent-primary-500"
			/>
			<div class="flex justify-between text-xs text-surface-400 mt-1">
				<span>1</span>
				<span>8</span>
			</div>
		</div>

		<div class="mb-4">
			<div class="flex justify-between items-center mb-1">
				<label for="lightIntensity" class="text-sm text-surface-200">光线强度</label>
				<span class="text-sm font-mono text-primary-400">{formatNumber(params.lightIntensity, 1)}</span>
			</div>
			<input
				id="lightIntensity"
				type="range"
				min="0.1"
				max="3"
				step="0.1"
				bind:value={params.lightIntensity}
				on:input={() => updateParam('lightIntensity', Number(params.lightIntensity))}
				class="range-slider range-md w-full accent-primary-500"
			/>
			<div class="flex justify-between text-xs text-surface-400 mt-1">
				<span>0.1</span>
				<span>3.0</span>
			</div>
		</div>

		<label for="showRays" class="flex items-center gap-2 cursor-pointer">
			<input
				id="showRays"
				type="checkbox"
				bind:checked={showRays}
				class="checkbox checkbox-md accent-primary-500"
			/>
			<span class="text-sm text-surface-200">显示光线</span>
		</label>
	</div>

	{#if validation.warnings && validation.warnings.length > 0}
		<div class="card p-4 mb-4 bg-warning-900/30 border border-warning-700/50">
			<h4 class="text-sm font-bold text-warning-400 mb-2">⚠ 参数提示</h4>
			{#each validation.warnings as warning}
				<div class="flex items-start gap-2 mb-2 last:mb-0">
					<span class="text-warning-400 text-xs mt-0.5">●</span>
					<p class="text-xs text-warning-200 leading-relaxed">{warning.message}</p>
				</div>
			{/each}
		</div>
	{/if}

	<div class="card p-4 mb-4 bg-surface-800 border-surface-700">
		<h3 class="text-lg font-bold mb-3 text-surface-100">成像结果</h3>

		{#if !imageResult.isValid}
			<div class="alert alert-error p-3 rounded text-sm">
				<p class="font-semibold">⚠ 参数无效</p>
				<p class="text-xs mt-1">{imageResult.message}</p>
			</div>
		{:else}
			<div class="space-y-3">
				<div class="flex justify-between items-center">
					<span class="text-sm text-surface-300">成像大小</span>
					<span class="text-sm font-mono font-bold text-success-400">
						{formatNumber(imageResult.imageHeight, 3)}
					</span>
				</div>
				<div class="w-full bg-surface-700 rounded-full h-2">
					<div
						class="bg-success-500 h-2 rounded-full transition-all duration-300"
						style="width: {Math.min(100, imageResult.imageHeight * 15)}%"
					/>
				</div>

				<div class="flex justify-between items-center">
					<span class="text-sm text-surface-300">成像亮度</span>
					<span class="text-sm font-mono font-bold text-warning-400">
						{formatNumber(imageResult.brightness, 1)}%
					</span>
				</div>
				<div class="w-full bg-surface-700 rounded-full h-2">
					<div
						class="bg-warning-500 h-2 rounded-full transition-all duration-300"
						style="width: {imageResult.brightness}%"
					/>
				</div>

				<div class="flex justify-between items-center">
					<span class="text-sm text-surface-300">成像清晰度</span>
					<span class="text-sm font-mono font-bold text-primary-400">
						{formatNumber(imageResult.sharpness, 1)}%
					</span>
				</div>
				<div class="w-full bg-surface-700 rounded-full h-2">
					<div
						class="bg-primary-500 h-2 rounded-full transition-all duration-300"
						style="width: {imageResult.sharpness}%"
					/>
				</div>

				<div class="flex justify-between items-center pt-2 border-t border-surface-700">
					<span class="text-sm text-surface-300">放大倍率</span>
					<span class="text-sm font-mono font-bold text-surface-100">
						{formatNumber(imageResult.magnification, 3)}x
					</span>
				</div>
			</div>
		{/if}
	</div>

	<div class="card p-4 bg-surface-800 border-surface-700">
		<h3 class="text-lg font-bold mb-3 text-surface-100">参数方案</h3>

		<button
			on:click={onPresetSave}
			class="btn btn-primary w-full mb-3 variant-filled-primary"
		>
			💾 保存当前方案
		</button>

		<div class="space-y-2 max-h-64 overflow-y-auto">
			{#if presets.length === 0}
				<p class="text-sm text-surface-400 text-center py-4">暂无保存的方案</p>
			{/if}

			{#each presets as preset, idx (preset.id)}
				<div
					class={`p-3 rounded-lg transition-colors ${
						selectedPresetId === preset.id
							? 'bg-primary-600/30 border border-primary-500'
							: 'bg-surface-700 hover:bg-surface-600 border border-transparent'
					}`}
				>
					<div class="flex items-center gap-2 mb-1">
						<button
							type="button"
							class="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
							style={`background: ${comparePresetIds.has(preset.id) ? (preset.color || PRESET_COLORS[idx % PRESET_COLORS.length]) : 'transparent'}; border: 2px solid ${preset.color || PRESET_COLORS[idx % PRESET_COLORS.length]};`}
							on:click|stopPropagation={() => onToggleCompare(preset.id)}
							aria-label={comparePresetIds.has(preset.id) ? '取消对比' : '加入对比'}
							tabindex="0"
						>
							{#if comparePresetIds.has(preset.id)}
								<svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
								</svg>
							{/if}
						</button>
						<span
							class="text-sm font-medium truncate flex-1 cursor-pointer text-surface-100"
							on:click={() => onPresetSelect(preset)}
							on:keydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									onPresetSelect(preset);
								}
							}}
							role="button"
							tabindex="0"
						>
							{preset.name}
						</span>
						<button
							on:click|stopPropagation={() => onPresetDelete(preset.id)}
							class="btn btn-icon btn-sm variant-ghost-error flex-shrink-0"
							aria-label="删除方案"
							tabindex="0"
						>
							✕
						</button>
					</div>
					<div class="text-xs opacity-60 mt-0.5 font-mono pl-7">
						孔:{preset.params.apertureSize.toFixed(2)} | 距:{preset.params.objectDistance.toFixed(1)} | 箱:{preset.params.boxLength.toFixed(1)}
					</div>
					{#if comparePresetIds.has(preset.id)}
						<div class="text-xs mt-1 pl-7 flex items-center gap-1" style={`color: ${preset.color || PRESET_COLORS[idx % PRESET_COLORS.length]}`}>
							<span class="inline-block w-2 h-2 rounded-full" style={`background: ${preset.color || PRESET_COLORS[idx % PRESET_COLORS.length]}`}></span>
							对比中
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>
</div>

<style>
	.control-panel {
		scrollbar-width: thin;
		scrollbar-color: #555 #222;
	}

	.control-panel::-webkit-scrollbar {
		width: 6px;
	}

	.control-panel::-webkit-scrollbar-track {
		background: #1f2937;
	}

	.control-panel::-webkit-scrollbar-thumb {
		background: #4b5563;
		border-radius: 3px;
	}

	input[type='range']::-webkit-slider-thumb {
		appearance: none;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: #3b82f6;
		cursor: pointer;
	}

	input[type='range']::-moz-range-thumb {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: #3b82f6;
		cursor: pointer;
		border: none;
	}
</style>
