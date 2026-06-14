<script lang="ts">
	import type { CameraParams, Preset, SchemeSlot } from '$lib/cameraObscura';
	import {
		validateParams,
		PRESET_COLORS,
		calculateErrorAnalysis,
		detectInvalidDistance
	} from '$lib/cameraObscura';

	export let params: CameraParams;
	export let presets: Preset[];
	export let showRays: boolean;
	export let onPresetSelect: (preset: Preset) => void;
	export let onPresetSave: () => void;
	export let onPresetDelete: (id: string) => void;
	export let onPresetRename: (id: string, newName: string) => void;
	export let onToggleCompare: (id: string) => void;
	export let comparePresetIds: Set<string>;
	export let selectedPresetId: string | null;
	export let activeSchemeIndex: number = 0;
	export let schemes: SchemeSlot[];
	export let onSchemeUpdate: (index: number, params: CameraParams) => void;
	export let onSchemeRename: (index: number, name: string) => void;
	export let onAddScheme: () => void;
	export let onRemoveScheme: (index: number) => void;

	$: currentParams = schemes[activeSchemeIndex]?.params || params;
	$: errorAnalysis = calculateErrorAnalysis(currentParams);
	$: invalidResult = detectInvalidDistance(currentParams);
	$: validateParams(currentParams);

	let editingPresetId: string | null = null;
	let editingName: string = '';
	let editingSchemeIndex: number = -1;
	let editingSchemeName: string = '';

	function updateParam(key: keyof CameraParams, value: number) {
		onSchemeUpdate(activeSchemeIndex, { ...currentParams, [key]: value });
	}

	function handleInput(key: keyof CameraParams, e: Event) {
		const target = e.currentTarget as HTMLInputElement;
		updateParam(key, Number(target.value));
	}

	function formatNumber(num: number, decimals: number = 2): string {
		return num.toFixed(decimals);
	}

	function startRenamePreset(preset: Preset) {
		editingPresetId = preset.id;
		editingName = preset.name;
	}

	function confirmRenamePreset(id: string) {
		if (editingName.trim()) {
			onPresetRename(id, editingName.trim());
		}
		editingPresetId = null;
		editingName = '';
	}

	function cancelRenamePreset() {
		editingPresetId = null;
		editingName = '';
	}

	function startRenameScheme(idx: number) {
		editingSchemeIndex = idx;
		editingSchemeName = schemes[idx].name;
	}

	function confirmRenameScheme(idx: number) {
		if (editingSchemeName.trim()) {
			onSchemeRename(idx, editingSchemeName.trim());
		}
		editingSchemeIndex = -1;
		editingSchemeName = '';
	}

	function cancelRenameScheme() {
		editingSchemeIndex = -1;
		editingSchemeName = '';
	}

	function getErrorClass(error: number, thresholds: [number, number]): string {
		if (error > thresholds[1]) return 'text-error-400';
		if (error > thresholds[0]) return 'text-warning-400';
		return 'text-success-400';
	}
</script>

<div class="control-panel p-4 overflow-y-auto h-full">
	<div class="card p-4 mb-4 bg-surface-800 border-surface-700">
		<h3 class="text-lg font-bold mb-3 text-surface-100">方案分屏</h3>
		<div class="flex flex-wrap gap-2 mb-3">
			{#each schemes as scheme, idx}
				<button
					class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all {activeSchemeIndex ===
					idx
						? 'ring-2 ring-offset-1 ring-offset-surface-800'
						: 'opacity-70 hover:opacity-100'}"
					style="background: {scheme.color}22; color: {scheme.color}; {activeSchemeIndex ===
					idx
						? `ring-color: ${scheme.color}; border: 1px solid ${scheme.color}`
						: `border: 1px solid ${scheme.color}44`}"
					on:click={() => (activeSchemeIndex = idx)}
				>
					<span class="w-2 h-2 rounded-full" style="background: {scheme.color}"></span>
					{#if editingSchemeIndex === idx}
						<input
							type="text"
							class="w-20 bg-surface-700 text-surface-100 px-1 py-0.5 rounded text-xs"
							bind:value={editingSchemeName}
							on:keydown={(e) => {
								if (e.key === 'Enter') confirmRenameScheme(idx);
								if (e.key === 'Escape') cancelRenameScheme();
							}}
							on:blur={() => confirmRenameScheme(idx)}
						/>
					{:else}
						<span
							class="cursor-pointer hover:underline"
							role="button"
							tabindex="0"
							on:dblclick={() => startRenameScheme(idx)}
							title="双击重命名">{scheme.name}</span
						>
					{/if}
					{#if schemes.length > 1}
						<button
							class="ml-1 text-xs opacity-50 hover:opacity-100 hover:text-error-400"
							on:click|stopPropagation={() => onRemoveScheme(idx)}
							title="移除此方案">✕</button
						>
					{/if}
				</button>
			{/each}
			{#if schemes.length < 4}
				<button
					class="px-3 py-1.5 rounded-lg text-sm border border-dashed border-surface-600 text-surface-400 hover:border-primary-500 hover:text-primary-400 transition-colors"
					on:click={onAddScheme}
				>
					+ 添加方案
				</button>
			{/if}
		</div>
		<p class="text-xs text-surface-400">
			当前编辑：<span style="color: {schemes[activeSchemeIndex]?.color || '#fff'}"
				>{schemes[activeSchemeIndex]?.name || '方案 1'}</span
			>
		</p>
	</div>

	<div class="card p-4 mb-4 bg-surface-800 border-surface-700">
		<h3 class="text-lg font-bold mb-3 text-surface-100">参数控制</h3>

		<div class="mb-4">
			<div class="flex justify-between items-center mb-1">
				<label for="boxLength" class="text-sm text-surface-200">暗箱长度</label>
				<span class="text-sm font-mono text-primary-400"
					>{formatNumber(currentParams.boxLength)} 单位</span
				>
			</div>
			<input
				id="boxLength"
				type="range"
				min="1"
				max="15"
				step="0.1"
				value={currentParams.boxLength}
				on:input={(e) => handleInput('boxLength', e)}
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
				<span class="text-sm font-mono text-primary-400"
					>{formatNumber(currentParams.apertureSize, 2)}</span
				>
			</div>
			<input
				id="apertureSize"
				type="range"
				min="0.05"
				max="2"
				step="0.01"
				value={currentParams.apertureSize}
				on:input={(e) => handleInput('apertureSize', e)}
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
				<span class="text-sm font-mono text-primary-400"
					>{formatNumber(currentParams.objectDistance)} 单位</span
				>
			</div>
			<input
				id="objectDistance"
				type="range"
				min="2"
				max="30"
				step="0.1"
				value={currentParams.objectDistance}
				on:input={(e) => handleInput('objectDistance', e)}
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
				<span class="text-sm font-mono text-primary-400"
					>{formatNumber(currentParams.objectHeight)} 单位</span
				>
			</div>
			<input
				id="objectHeight"
				type="range"
				min="1"
				max="8"
				step="0.1"
				value={currentParams.objectHeight}
				on:input={(e) => handleInput('objectHeight', e)}
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
				<span class="text-sm font-mono text-primary-400"
					>{formatNumber(currentParams.lightIntensity, 1)}</span
				>
			</div>
			<input
				id="lightIntensity"
				type="range"
				min="0.1"
				max="3"
				step="0.1"
				value={currentParams.lightIntensity}
				on:input={(e) => handleInput('lightIntensity', e)}
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

	{#if invalidResult.isInvalid || invalidResult.reasons.length > 0}
		<div
			class="card p-4 mb-4 border {invalidResult.isInvalid
				? 'bg-error-900/30 border-error-700/50'
				: 'bg-warning-900/30 border-warning-700/50'}"
		>
			<h4
				class="text-sm font-bold {invalidResult.isInvalid
					? 'text-error-400'
					: 'text-warning-400'} mb-2"
			>
				{invalidResult.isInvalid ? '⛔ 无效距离判定' : '⚠ 参数提示'}
			</h4>
			{#each invalidResult.reasons as reason}
				<div class="flex items-start gap-2 mb-2 last:mb-0">
					<span
						class="{reason.level === 'error' || reason.level === 'invalid'
							? 'text-error-400'
							: 'text-warning-400'} text-xs mt-0.5">●</span
					>
					<div>
						<p
							class="text-xs {reason.level === 'error' || reason.level === 'invalid'
								? 'text-error-200'
								: 'text-warning-200'} leading-relaxed"
						>
							{reason.message}
						</p>
						<p class="text-xs text-surface-400 mt-0.5">→ {reason.suggestion}</p>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<div class="card p-4 mb-4 bg-surface-800 border-surface-700">
		<h3 class="text-lg font-bold mb-3 text-surface-100">理论 vs 模拟成像</h3>

		{#if !errorAnalysis.simulated.isValid}
			<div class="alert alert-error p-3 rounded text-sm">
				<p class="font-semibold">⚠ 参数无效</p>
				<p class="text-xs mt-1">{errorAnalysis.simulated.message}</p>
			</div>
		{:else}
			<div class="space-y-2">
				<div class="grid grid-cols-4 gap-1 text-xs text-center mb-1">
					<span class="text-surface-400">指标</span>
					<span class="text-primary-300">理论值</span>
					<span class="text-warning-300">模拟值</span>
					<span class="text-surface-400">误差</span>
				</div>

				<div
					class="grid grid-cols-4 gap-1 text-xs text-center items-center py-1 border-b border-surface-700"
				>
					<span class="text-surface-300">像高</span>
					<span class="font-mono text-primary-400"
						>{formatNumber(errorAnalysis.theoretical.imageHeight, 3)}</span
					>
					<span class="font-mono text-warning-400"
						>{formatNumber(errorAnalysis.simulated.imageHeight, 3)}</span
					>
					<span class="font-mono {getErrorClass(errorAnalysis.imageHeightError, [2, 5])}"
						>{formatNumber(errorAnalysis.imageHeightError, 1)}%</span
					>
				</div>

				<div
					class="grid grid-cols-4 gap-1 text-xs text-center items-center py-1 border-b border-surface-700"
				>
					<span class="text-surface-300">亮度</span>
					<span class="font-mono text-primary-400"
						>{formatNumber(errorAnalysis.theoretical.brightness, 1)}%</span
					>
					<span class="font-mono text-warning-400"
						>{formatNumber(errorAnalysis.simulated.brightness, 1)}%</span
					>
					<span class="font-mono {getErrorClass(errorAnalysis.brightnessError, [10, 20])}"
						>{formatNumber(errorAnalysis.brightnessError, 1)}%</span
					>
				</div>

				<div
					class="grid grid-cols-4 gap-1 text-xs text-center items-center py-1 border-b border-surface-700"
				>
					<span class="text-surface-300">清晰度</span>
					<span class="font-mono text-primary-400"
						>{formatNumber(errorAnalysis.theoretical.sharpness, 1)}%</span
					>
					<span class="font-mono text-warning-400"
						>{formatNumber(errorAnalysis.simulated.sharpness, 1)}%</span
					>
					<span class="font-mono {getErrorClass(errorAnalysis.sharpnessError, [15, 30])}"
						>{formatNumber(errorAnalysis.sharpnessError, 1)}%</span
					>
				</div>

				<div
					class="grid grid-cols-4 gap-1 text-xs text-center items-center py-1 border-b border-surface-700"
				>
					<span class="text-surface-300">模糊圈</span>
					<span class="font-mono text-primary-400">0</span>
					<span class="font-mono text-warning-400"
						>{formatNumber(errorAnalysis.blurCircleDiameter, 4)}</span
					>
					<span class="font-mono text-surface-400"
						>{formatNumber(errorAnalysis.blurCircleDiameter, 4)}</span
					>
				</div>

				<div class="grid grid-cols-4 gap-1 text-xs text-center items-center py-1">
					<span class="text-surface-300">倍率</span>
					<span class="font-mono text-primary-400"
						>{formatNumber(errorAnalysis.theoretical.magnification, 3)}x</span
					>
					<span class="font-mono text-warning-400"
						>{formatNumber(errorAnalysis.simulated.magnification, 3)}x</span
					>
					<span class="font-mono text-surface-400">-</span>
				</div>
			</div>

			<div class="mt-3 space-y-2">
				<div>
					<div class="flex justify-between text-xs mb-1">
						<span class="text-surface-300">亮度</span>
						<span class="text-warning-400"
							>{formatNumber(errorAnalysis.simulated.brightness, 1)}%</span
						>
					</div>
					<div class="w-full bg-surface-700 rounded-full h-1.5">
						<div
							class="bg-warning-500 h-1.5 rounded-full transition-all duration-300"
							style="width: {errorAnalysis.simulated.brightness}%"
						/>
					</div>
				</div>
				<div>
					<div class="flex justify-between text-xs mb-1">
						<span class="text-surface-300">清晰度</span>
						<span class="text-primary-400"
							>{formatNumber(errorAnalysis.simulated.sharpness, 1)}%</span
						>
					</div>
					<div class="w-full bg-surface-700 rounded-full h-1.5">
						<div
							class="bg-primary-500 h-1.5 rounded-full transition-all duration-300"
							style="width: {errorAnalysis.simulated.sharpness}%"
						/>
					</div>
				</div>
			</div>
		{/if}
	</div>

	<div class="card p-4 bg-surface-800 border-surface-700">
		<h3 class="text-lg font-bold mb-3 text-surface-100">参数方案库</h3>

		<button
			on:click={onPresetSave}
			class="btn btn-primary w-full mb-3 variant-filled-primary text-sm py-2"
		>
			💾 保存当前方案
		</button>

		<div class="space-y-2 max-h-52 overflow-y-auto">
			{#if presets.length === 0}
				<p class="text-sm text-surface-400 text-center py-4">暂无保存的方案</p>
			{/if}

			{#each presets as preset, idx (preset.id)}
				<div
					class={`p-2.5 rounded-lg transition-colors ${
						selectedPresetId === preset.id
							? 'bg-primary-600/30 border border-primary-500'
							: 'bg-surface-700 hover:bg-surface-600 border border-transparent'
					}`}
				>
					<div class="flex items-center gap-2 mb-1">
						<button
							type="button"
							class="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
							style={`background: ${comparePresetIds.has(preset.id) ? preset.color || PRESET_COLORS[idx % PRESET_COLORS.length] : 'transparent'}; border: 2px solid ${preset.color || PRESET_COLORS[idx % PRESET_COLORS.length]};`}
							on:click|stopPropagation={() => onToggleCompare(preset.id)}
							aria-label={comparePresetIds.has(preset.id) ? '取消对比' : '加入对比'}
							tabindex="0"
						>
							{#if comparePresetIds.has(preset.id)}
								<svg
									class="w-3 h-3 text-white"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="3"
										d="M5 13l4 4L19 7"
									/>
								</svg>
							{/if}
						</button>
						{#if editingPresetId === preset.id}
							<input
								type="text"
								class="flex-1 bg-surface-600 text-surface-100 px-2 py-1 rounded text-sm"
								bind:value={editingName}
								on:keydown={(e) => {
									if (e.key === 'Enter') confirmRenamePreset(preset.id);
									if (e.key === 'Escape') cancelRenamePreset();
								}}
								on:blur={() => confirmRenamePreset(preset.id)}
							/>
						{:else}
							<span
								class="text-sm font-medium truncate flex-1 cursor-pointer text-surface-100"
								on:click={() => onPresetSelect(preset)}
								on:dblclick={() => startRenamePreset(preset)}
								on:keydown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										onPresetSelect(preset);
									}
								}}
								role="button"
								tabindex="0"
								title="单击加载 / 双击重命名"
							>
								{preset.name}
							</span>
						{/if}
						<button
							on:click|stopPropagation={() => startRenamePreset(preset)}
							class="text-xs text-surface-400 hover:text-primary-400 flex-shrink-0"
							aria-label="重命名"
							title="重命名">✎</button
						>
						<button
							on:click|stopPropagation={() => onPresetDelete(preset.id)}
							class="text-xs text-surface-400 hover:text-error-400 flex-shrink-0"
							aria-label="删除方案"
							title="删除">✕</button
						>
					</div>
					<div class="text-xs opacity-60 mt-0.5 font-mono pl-7">
						孔:{preset.params.apertureSize.toFixed(2)} | 距:{preset.params.objectDistance.toFixed(
							1
						)} | 箱:{preset.params.boxLength.toFixed(1)}
					</div>
					{#if comparePresetIds.has(preset.id)}
						<div
							class="text-xs mt-1 pl-7 flex items-center gap-1"
							style={`color: ${preset.color || PRESET_COLORS[idx % PRESET_COLORS.length]}`}
						>
							<span
								class="inline-block w-2 h-2 rounded-full"
								style={`background: ${preset.color || PRESET_COLORS[idx % PRESET_COLORS.length]}`}
							></span>
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
