<script lang="ts">
	import { onMount } from 'svelte';
	import CameraObscuraScene from '$components/CameraObscuraScene.svelte';
	import ControlPanel from '$components/ControlPanel.svelte';
	import type {
		CameraParams,
		Preset,
		SchemeSlot,
		ErrorAnalysis,
		InvalidDistanceResult
	} from '$lib/cameraObscura';
	import {
		DEFAULT_PARAMS,
		calculateErrorAnalysis,
		detectInvalidDistance,
		generateId,
		PRESET_COLORS,
		generateReport,
		downloadFile,
		createDefaultScheme
	} from '$lib/cameraObscura';

	let schemes: SchemeSlot[] = [createDefaultScheme(0)];
	let presets: Preset[] = [];
	let selectedPresetId: string | null = null;
	let comparePresetIds: Set<string> = new Set();
	let showRays = true;
	let isMobile = false;
	let showMobilePanel = false;
	let activeSchemeIndex: number = 0;
	let viewModes: Record<number, 'simulated' | 'theoretical' | 'split'> = {};
	let showTileDetails: Record<number, boolean> = {};

	let masterCameraPosition: { x: number; y: number; z: number } | null = null;
	let masterCameraTarget: { x: number; y: number; z: number } | null = null;
	let activeSceneId: number = -1;

	let sceneRefs: Record<number, CameraObscuraScene> = {};
	let splitSceneRefs: Record<string, CameraObscuraScene> = {};

	$: currentParams = schemes[activeSchemeIndex]?.params || DEFAULT_PARAMS;

	function getSchemeErrorAnalysis(idx: number): ErrorAnalysis {
		return calculateErrorAnalysis(schemes[idx]?.params || DEFAULT_PARAMS);
	}

	function getSchemeInvalidResult(idx: number): InvalidDistanceResult {
		return detectInvalidDistance(schemes[idx]?.params || DEFAULT_PARAMS);
	}

	function checkMobile() {
		if (typeof window !== 'undefined') {
			isMobile = window.innerWidth < 768;
		}
	}

	function getViewMode(idx: number): 'simulated' | 'theoretical' | 'split' {
		return viewModes[idx] || 'simulated';
	}

	function toggleViewMode(idx: number) {
		const modes: Array<'simulated' | 'theoretical' | 'split'> = [
			'simulated',
			'theoretical',
			'split'
		];
		const current = getViewMode(idx);
		const currentIndex = modes.indexOf(current);
		viewModes[idx] = modes[(currentIndex + 1) % modes.length];
		viewModes = { ...viewModes };
	}

	function getViewModeLabel(mode: string): string {
		if (mode === 'simulated') return '模拟';
		if (mode === 'theoretical') return '理论';
		return '对比';
	}

	function toggleTileDetails(idx: number) {
		showTileDetails[idx] = !showTileDetails[idx];
		showTileDetails = { ...showTileDetails };
	}

	function addScheme() {
		if (schemes.length >= 4) return;
		const newScheme = createDefaultScheme(schemes.length);
		schemes = [...schemes, newScheme];
		viewModes = { ...viewModes };
	}

	function removeScheme(idx: number) {
		if (schemes.length <= 1) return;
		const removed = schemes[idx];
		if (removed.presetId) {
			const newSet = new Set(comparePresetIds);
			newSet.delete(removed.presetId);
			comparePresetIds = newSet;
		}
		schemes = schemes.filter((_, i) => i !== idx);
		if (activeSchemeIndex >= schemes.length) {
			activeSchemeIndex = schemes.length - 1;
		}
		viewModes = { ...viewModes };
	}

	function updateSchemeParams(idx: number, newParams: CameraParams) {
		const scheme = schemes[idx];
		if (scheme?.presetId) {
			const newSet = new Set(comparePresetIds);
			newSet.delete(scheme.presetId);
			comparePresetIds = newSet;
		}
		schemes = schemes.map((s, i) =>
			i === idx ? { ...s, params: newParams, presetId: null } : s
		);
	}

	function renameScheme(idx: number, name: string) {
		const scheme = schemes[idx];
		if (scheme?.presetId) {
			const newSet = new Set(comparePresetIds);
			newSet.delete(scheme.presetId);
			comparePresetIds = newSet;
		}
		schemes = schemes.map((s, i) => (i === idx ? { ...s, name, presetId: null } : s));
	}

	function handleCameraChange(
		idx: number,
		data: {
			position: { x: number; y: number; z: number };
			target: { x: number; y: number; z: number };
		}
	) {
		activeSceneId = idx;
		masterCameraPosition = data.position;
		masterCameraTarget = data.target;
	}

	function savePreset() {
		const name = prompt('请输入方案名称:', `方案 ${presets.length + 1}`);
		if (!name) return;

		const newPreset: Preset = {
			id: generateId(),
			name,
			params: { ...currentParams },
			createdAt: Date.now(),
			color: PRESET_COLORS[presets.length % PRESET_COLORS.length]
		};

		presets = [...presets, newPreset];
		selectedPresetId = newPreset.id;
		savePresetsToStorage();
	}

	function renamePreset(id: string, newName: string) {
		presets = presets.map((p) => (p.id === id ? { ...p, name: newName } : p));
		schemes = schemes.map((s) => (s.presetId === id ? { ...s, name: newName } : s));
		savePresetsToStorage();
	}

	function toggleCompare(presetId: string) {
		const preset = presets.find((p) => p.id === presetId);
		if (!preset) return;

		const existingIdx = schemes.findIndex((s) => s.presetId === presetId);

		if (existingIdx >= 0) {
			if (schemes.length <= 1) return;
			schemes = schemes.filter((_, i) => i !== existingIdx);
			if (activeSchemeIndex >= schemes.length) {
				activeSchemeIndex = schemes.length - 1;
			}
			const newSet = new Set(comparePresetIds);
			newSet.delete(presetId);
			comparePresetIds = newSet;
			viewModes = { ...viewModes };
		} else {
			if (schemes.length >= 4) {
				alert('最多支持 4 组方案同时对比，请先移除部分方案');
				return;
			}
			const newScheme: SchemeSlot = {
				id: generateId(),
				presetId: preset.id,
				name: preset.name,
				params: { ...preset.params },
				color: preset.color || PRESET_COLORS[schemes.length % PRESET_COLORS.length]
			};
			schemes = [...schemes, newScheme];
			const newSet = new Set(comparePresetIds);
			newSet.add(presetId);
			comparePresetIds = newSet;
			viewModes = { ...viewModes };
		}
	}

	function selectPreset(preset: Preset) {
		selectedPresetId = preset.id;
		updateSchemeParams(activeSchemeIndex, { ...preset.params });
	}

	function deletePreset(id: string) {
		presets = presets.filter((p) => p.id !== id);
		if (selectedPresetId === id) {
			selectedPresetId = null;
		}
		const newSet = new Set(comparePresetIds);
		newSet.delete(id);
		comparePresetIds = newSet;

		const linkedSchemeIdx = schemes.findIndex((s) => s.presetId === id);
		if (linkedSchemeIdx >= 0 && schemes.length > 1) {
			schemes = schemes.filter((_, i) => i !== linkedSchemeIdx);
			if (activeSchemeIndex >= schemes.length) {
				activeSchemeIndex = schemes.length - 1;
			}
			viewModes = { ...viewModes };
		}

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

	function exportScreenshot() {
		const compositeCanvas = document.createElement('canvas');
		const padding = 20;
		const labelHeight = 30;
		const infoHeight = 80;
		const scenes = schemes.length;

		const cols = scenes <= 1 ? 1 : 2;
		const rows = scenes <= 2 ? 1 : 2;

		const sceneWidth = 480;
		const sceneHeight = 360;

		const totalWidth = padding * 2 + cols * sceneWidth + (cols - 1) * padding;
		const totalHeight =
			padding * 2 +
			rows * (sceneHeight + labelHeight + infoHeight) +
			(rows - 1) * padding +
			40;

		compositeCanvas.width = totalWidth;
		compositeCanvas.height = totalHeight;
		const ctx = compositeCanvas.getContext('2d')!;

		ctx.fillStyle = '#1a1a2e';
		ctx.fillRect(0, 0, totalWidth, totalHeight);

		ctx.fillStyle = '#ee7718';
		ctx.font = 'bold 20px sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText('暗箱成像多方案对比与误差分析截图', totalWidth / 2, padding + 10);

		const promises: Promise<void>[] = [];

		schemes.forEach((scheme, idx) => {
			const col = idx % 2;
			const row = Math.floor(idx / 2);
			const x = padding + col * (sceneWidth + padding);
			const y = padding + 30 + row * (sceneHeight + labelHeight + infoHeight + padding);

			ctx.fillStyle = scheme.color;
			ctx.font = 'bold 14px sans-serif';
			ctx.textAlign = 'left';
			ctx.fillText(`${scheme.name} [${getViewModeLabel(getViewMode(idx))}]`, x, y + 14);

			const viewMode = getViewMode(idx);
			const errorAnalysis = getSchemeErrorAnalysis(idx);
			const invalidResult = getSchemeInvalidResult(idx);

			if (viewMode === 'split') {
				const halfWidth = sceneWidth / 2 - 4;
				const leftSceneRef = splitSceneRefs[`${idx}-theoretical`];
				const rightSceneRef = splitSceneRefs[`${idx}-simulated`];

				if (leftSceneRef) {
					const imgSrc = leftSceneRef.getScreenshot();
					if (imgSrc) {
						const p = new Promise<void>((resolve) => {
							const img = new Image();
							img.onload = () => {
								ctx.drawImage(img, x, y + labelHeight, halfWidth, sceneHeight);
								ctx.fillStyle = '#88ccff';
								ctx.font = 'bold 12px sans-serif';
								ctx.textAlign = 'center';
								ctx.fillText('理论成像', x + halfWidth / 2, y + labelHeight + 20);
								resolve();
							};
							img.onerror = () => resolve();
							img.src = imgSrc;
						});
						promises.push(p);
					}
				}

				if (rightSceneRef) {
					const imgSrc = rightSceneRef.getScreenshot();
					if (imgSrc) {
						const p = new Promise<void>((resolve) => {
							const img = new Image();
							img.onload = () => {
								ctx.drawImage(
									img,
									x + halfWidth + 8,
									y + labelHeight,
									halfWidth,
									sceneHeight
								);
								ctx.fillStyle = '#ffb74d';
								ctx.font = 'bold 12px sans-serif';
								ctx.textAlign = 'center';
								ctx.fillText(
									'模拟成像',
									x + halfWidth + 8 + halfWidth / 2,
									y + labelHeight + 20
								);
								resolve();
							};
							img.onerror = () => resolve();
							img.src = imgSrc;
						});
						promises.push(p);
					}
				}
			} else {
				const sceneRef = sceneRefs[idx];
				if (sceneRef) {
					const imgSrc = sceneRef.getScreenshot();
					if (imgSrc) {
						const p = new Promise<void>((resolve) => {
							const img = new Image();
							img.onload = () => {
								ctx.drawImage(img, x, y + labelHeight, sceneWidth, sceneHeight);
								resolve();
							};
							img.onerror = () => resolve();
							img.src = imgSrc;
						});
						promises.push(p);
					}
				}
			}

			const infoY = y + labelHeight + sceneHeight + 8;

			if (invalidResult.isInvalid || invalidResult.reasons.length > 0) {
				const hasError = invalidResult.reasons.some(
					(r) => r.level === 'error' || r.level === 'invalid'
				);
				ctx.fillStyle = hasError ? '#ef4444' : '#f59e0b';
				ctx.font = 'bold 11px sans-serif';
				ctx.textAlign = 'left';
				ctx.fillText(hasError ? '⚠ 无效/警告' : '⚠ 参数提示', x, infoY + 12);
			}

			ctx.fillStyle = '#e0e0e0';
			ctx.font = '11px sans-serif';
			ctx.textAlign = 'left';
			const infoLines = [
				`像高: ${errorAnalysis.simulated.imageHeight.toFixed(3)} (误差: ${errorAnalysis.imageHeightError.toFixed(2)}%)`,
				`亮度: ${errorAnalysis.simulated.brightness.toFixed(1)}% (误差: ${errorAnalysis.brightnessError.toFixed(1)}%)`,
				`清晰度: ${errorAnalysis.simulated.sharpness.toFixed(1)}% | 模糊圈: ${errorAnalysis.blurCircleDiameter.toFixed(4)} (模糊占比: ${errorAnalysis.blurCircleError.toFixed(2)}%)`
			];
			infoLines.forEach((line, i) => {
				ctx.fillText(line, x, infoY + 28 + i * 16);
			});

			ctx.strokeStyle = scheme.color;
			ctx.lineWidth = 2;
			ctx.strokeRect(
				x - 2,
				y - 2,
				sceneWidth + 4,
				sceneHeight + labelHeight + infoHeight + 4
			);
		});

		Promise.all(promises).then(() => {
			ctx.fillStyle = '#888';
			ctx.font = '11px sans-serif';
			ctx.textAlign = 'right';
			ctx.fillText(
				`生成时间: ${new Date().toLocaleString('zh-CN')}`,
				totalWidth - padding,
				totalHeight - 8
			);

			compositeCanvas.toBlob((blob) => {
				if (blob) {
					const url = URL.createObjectURL(blob);
					const a = document.createElement('a');
					a.href = url;
					a.download = `暗箱对比截图_${Date.now()}.png`;
					document.body.appendChild(a);
					a.click();
					document.body.removeChild(a);
					URL.revokeObjectURL(url);
				}
			}, 'image/png');
		});
	}

	function exportReport() {
		const html = generateReport(schemes, presets);
		downloadFile(html, `暗箱对比报告_${Date.now()}.html`, 'text/html');
	}

	function getGridClass(): string {
		const count = schemes.length;
		if (count <= 1) return 'split-grid-1';
		if (count === 2) return 'split-grid-2';
		if (count === 3) return 'split-grid-3';
		return 'split-grid-4';
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
	<header class="bg-surface-800 border-b border-surface-700 px-4 py-2.5 flex-shrink-0">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-3">
				<span class="text-2xl">📷</span>
				<div>
					<h1 class="text-lg font-bold text-surface-100">
						暗箱多方案分屏对比与真实成像误差分析系统
					</h1>
					<p class="text-xs text-surface-400">
						Multi-Scheme Split Comparison & Error Analysis
					</p>
				</div>
			</div>

			<div class="flex items-center gap-2">
				{#if !isMobile}
					<button
						on:click={exportScreenshot}
						class="px-3 py-1.5 text-xs rounded-lg bg-surface-700 text-surface-200 hover:bg-surface-600 transition-colors flex items-center gap-1.5"
						title="导出对比截图"
					>
						📸 截图
					</button>
					<button
						on:click={exportReport}
						class="px-3 py-1.5 text-xs rounded-lg bg-surface-700 text-surface-200 hover:bg-surface-600 transition-colors flex items-center gap-1.5"
						title="导出参数报告"
					>
						📄 报告
					</button>
				{/if}
				{#if isMobile}
					<button
						on:click={() => (showMobilePanel = !showMobilePanel)}
						class="btn btn-primary px-4 py-2 rounded text-sm"
					>
						{showMobilePanel ? '关闭' : '参数'}
					</button>
				{/if}
			</div>
		</div>
	</header>

	<div class="flex-1 flex overflow-hidden">
		<div class="flex-1 relative overflow-hidden">
			<div class="w-full h-full {getGridClass()}">
				{#each schemes as scheme, idx}
					{@const errorAnalysis = getSchemeErrorAnalysis(idx)}
					{@const invalidResult = getSchemeInvalidResult(idx)}
					{@const viewMode = getViewMode(idx)}
					<div class="split-tile relative" class:active-tile={activeSchemeIndex === idx}>
						<div
							class="scene-container"
							role="button"
							tabindex="0"
							on:click={() => (activeSchemeIndex = idx)}
							on:keydown={(e) => {
								if (e.key === 'Enter') activeSchemeIndex = idx;
							}}
						>
							{#if viewMode === 'split'}
								<div class="split-view-container">
									<div class="split-view-half">
										<div class="split-view-label split-view-label-theory">
											理论成像
										</div>
										<CameraObscuraScene
											params={scheme.params}
											{showRays}
											viewMode="theoretical"
											syncPosition={activeSceneId !== idx
												? masterCameraPosition
												: null}
											syncTarget={activeSceneId !== idx
												? masterCameraTarget
												: null}
											compact={true}
											on:cameraChange={(e) =>
												handleCameraChange(idx, e.detail)}
											bind:this={splitSceneRefs[`${idx}-theoretical`]}
										/>
									</div>
									<div class="split-view-divider"></div>
									<div class="split-view-half">
										<div class="split-view-label split-view-label-sim">
											模拟成像
										</div>
										<CameraObscuraScene
											params={scheme.params}
											{showRays}
											viewMode="simulated"
											syncPosition={activeSceneId !== idx
												? masterCameraPosition
												: null}
											syncTarget={activeSceneId !== idx
												? masterCameraTarget
												: null}
											compact={true}
											on:cameraChange={(e) =>
												handleCameraChange(idx, e.detail)}
											bind:this={splitSceneRefs[`${idx}-simulated`]}
										/>
									</div>
								</div>
							{:else}
								<CameraObscuraScene
									params={scheme.params}
									{showRays}
									{viewMode}
									syncPosition={activeSceneId !== idx
										? masterCameraPosition
										: null}
									syncTarget={activeSceneId !== idx ? masterCameraTarget : null}
									compact={schemes.length > 1}
									on:cameraChange={(e) => handleCameraChange(idx, e.detail)}
									bind:this={sceneRefs[idx]}
								/>
							{/if}
						</div>

						<div class="tile-header" style="border-top: 2px solid {scheme.color}">
							<div class="flex items-center justify-between w-full">
								<div class="flex items-center gap-1.5">
									<span
										class="w-2.5 h-2.5 rounded-full flex-shrink-0"
										style="background: {scheme.color}"
									></span>
									<span
										class="text-xs font-bold text-surface-100 truncate max-w-[80px]"
										>{scheme.name}</span
									>
									<button
										class="text-[10px] px-1.5 py-0.5 rounded transition-colors {viewMode ===
										'theoretical'
											? 'bg-primary-600/50 text-primary-200'
											: viewMode === 'split'
												? 'bg-purple-600/50 text-purple-200'
												: 'bg-surface-700 text-surface-300 hover:bg-surface-600'}"
										on:click|stopPropagation={() => toggleViewMode(idx)}
										title="切换视图模式（模拟→理论→对比）"
									>
										{getViewModeLabel(viewMode)}
									</button>
									<button
										class="text-[10px] px-1.5 py-0.5 rounded transition-colors bg-surface-700 text-surface-300 hover:bg-surface-600"
										on:click|stopPropagation={() => toggleTileDetails(idx)}
										title="展开/收起详细误差分析"
									>
										{showTileDetails[idx] ? '收起' : '详情'}
									</button>
								</div>
								<div class="flex items-center gap-2 text-[10px]">
									{#if errorAnalysis.simulated.isValid}
										<span class="text-warning-300"
											>亮度 {errorAnalysis.simulated.brightness.toFixed(
												1
											)}%</span
										>
										<span class="text-primary-300"
											>清晰度 {errorAnalysis.simulated.sharpness.toFixed(
												1
											)}%</span
										>
										<span class="text-success-300"
											>像高 {errorAnalysis.simulated.imageHeight.toFixed(
												2
											)}</span
										>
									{:else}
										<span class="text-error-400">无效</span>
									{/if}
								</div>
							</div>
						</div>

						{#if showTileDetails[idx] && errorAnalysis.simulated.isValid}
							<div class="tile-details-panel">
								<div class="tile-details-grid">
									<div class="tile-detail-item">
										<span class="tile-detail-label">像高误差</span>
										<span
											class="tile-detail-value {errorAnalysis.imageHeightError >
											5
												? 'text-error-400'
												: errorAnalysis.imageHeightError > 2
													? 'text-warning-400'
													: 'text-success-400'}"
										>
											{errorAnalysis.imageHeightError.toFixed(2)}%
										</span>
									</div>
									<div class="tile-detail-item">
										<span class="tile-detail-label">亮度误差</span>
										<span
											class="tile-detail-value {errorAnalysis.brightnessError >
											20
												? 'text-error-400'
												: errorAnalysis.brightnessError > 10
													? 'text-warning-400'
													: 'text-success-400'}"
										>
											{errorAnalysis.brightnessError.toFixed(1)}%
										</span>
									</div>
									<div class="tile-detail-item">
										<span class="tile-detail-label">清晰度误差</span>
										<span
											class="tile-detail-value {errorAnalysis.sharpnessError >
											30
												? 'text-error-400'
												: errorAnalysis.sharpnessError > 15
													? 'text-warning-400'
													: 'text-success-400'}"
										>
											{errorAnalysis.sharpnessError.toFixed(1)}%
										</span>
									</div>
									<div class="tile-detail-item">
										<span class="tile-detail-label">模糊圈占比</span>
										<span
											class="tile-detail-value {errorAnalysis.blurCircleError >
											20
												? 'text-error-400'
												: errorAnalysis.blurCircleError > 10
													? 'text-warning-400'
													: 'text-success-400'}"
										>
											{errorAnalysis.blurCircleError.toFixed(2)}%
										</span>
										<span class="text-[9px] text-surface-400 mt-0.5">
											直径 {errorAnalysis.blurCircleDiameter.toFixed(4)}
										</span>
									</div>
								</div>
								<div class="tile-details-bars">
									<div class="tile-bar-item">
										<div class="flex justify-between text-[10px] mb-0.5">
											<span class="text-surface-400">亮度</span>
											<span class="text-warning-400"
												>{errorAnalysis.simulated.brightness.toFixed(
													1
												)}%</span
											>
										</div>
										<div class="w-full bg-surface-700 rounded-full h-1">
											<div
												class="bg-warning-500 h-1 rounded-full"
												style="width: {Math.min(
													errorAnalysis.simulated.brightness,
													100
												)}%"
											></div>
										</div>
									</div>
									<div class="tile-bar-item">
										<div class="flex justify-between text-[10px] mb-0.5">
											<span class="text-surface-400">清晰度</span>
											<span class="text-primary-400"
												>{errorAnalysis.simulated.sharpness.toFixed(
													1
												)}%</span
											>
										</div>
										<div class="w-full bg-surface-700 rounded-full h-1">
											<div
												class="bg-primary-500 h-1 rounded-full"
												style="width: {errorAnalysis.simulated.sharpness}%"
											></div>
										</div>
									</div>
									<div class="tile-bar-item">
										<div class="flex justify-between text-[10px] mb-0.5">
											<span class="text-surface-400">模糊占比</span>
											<span
												class={errorAnalysis.blurCircleError > 20
													? 'text-error-400'
													: errorAnalysis.blurCircleError > 10
														? 'text-warning-400'
														: 'text-success-400'}
												>{errorAnalysis.blurCircleError.toFixed(2)}%</span
											>
										</div>
										<div class="w-full bg-surface-700 rounded-full h-1">
											<div
												class="{errorAnalysis.blurCircleError > 20
													? 'bg-error-500'
													: errorAnalysis.blurCircleError > 10
														? 'bg-warning-500'
														: 'bg-success-500'} h-1 rounded-full"
												style="width: {Math.min(
													errorAnalysis.blurCircleError,
													100
												)}%"
											></div>
										</div>
									</div>
								</div>
							</div>
						{/if}

						{#if invalidResult.isInvalid}
							<div class="tile-invalid-badge">⛔ 无效</div>
						{:else if invalidResult.reasons.length > 0}
							<div
								class="tile-warning-badge"
								title={invalidResult.reasons.map((r) => r.message).join('\n')}
							>
								⚠ 警告
							</div>
						{/if}
					</div>
				{/each}
			</div>

			{#if isMobile}
				<div class="absolute bottom-4 left-4 right-4 flex gap-2">
					<button
						on:click={exportScreenshot}
						class="flex-1 py-2 text-xs rounded-lg bg-surface-800/90 backdrop-blur-sm text-surface-200 hover:bg-surface-700 transition-colors"
					>
						📸 截图
					</button>
					<button
						on:click={exportReport}
						class="flex-1 py-2 text-xs rounded-lg bg-surface-800/90 backdrop-blur-sm text-surface-200 hover:bg-surface-700 transition-colors"
					>
						📄 报告
					</button>
				</div>
			{/if}
		</div>

		{#if !isMobile}
			<aside
				class="w-80 bg-surface-800 border-l border-surface-700 flex-shrink-0 overflow-hidden"
			>
				<ControlPanel
					params={currentParams}
					bind:presets
					bind:showRays
					bind:selectedPresetId
					bind:activeSchemeIndex
					{schemes}
					{comparePresetIds}
					onPresetSave={savePreset}
					onPresetRename={renamePreset}
					onPresetSelect={selectPreset}
					onPresetDelete={deletePreset}
					onToggleCompare={toggleCompare}
					onSchemeUpdate={updateSchemeParams}
					onSchemeRename={renameScheme}
					onAddScheme={addScheme}
					onRemoveScheme={removeScheme}
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
		<div
			class="mobile-drawer fixed bottom-0 left-0 right-0 bg-surface-800 rounded-t-2xl z-50 max-h-[80vh] overflow-hidden flex flex-col"
		>
			<div class="flex justify-center py-2 flex-shrink-0">
				<div class="w-12 h-1 bg-surface-600 rounded-full" />
			</div>
			<div class="overflow-y-auto flex-1">
				<ControlPanel
					params={currentParams}
					bind:presets
					bind:showRays
					bind:selectedPresetId
					bind:activeSchemeIndex
					{schemes}
					{comparePresetIds}
					onPresetSave={savePreset}
					onPresetRename={renamePreset}
					onPresetSelect={selectPreset}
					onPresetDelete={deletePreset}
					onToggleCompare={toggleCompare}
					onSchemeUpdate={updateSchemeParams}
					onSchemeRename={renameScheme}
					onAddScheme={addScheme}
					onRemoveScheme={removeScheme}
				/>
			</div>
		</div>
	{/if}
</div>

<style>
	.split-grid-1 {
		display: grid;
		grid-template-columns: 1fr;
		grid-template-rows: 1fr;
		gap: 2px;
	}

	.split-grid-2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		grid-template-rows: 1fr;
		gap: 2px;
	}

	.split-grid-3 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		grid-template-rows: 1fr 1fr;
		gap: 2px;
	}

	.split-grid-3 .split-tile:nth-child(3) {
		grid-column: 1 / -1;
	}

	.split-grid-4 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		grid-template-rows: 1fr 1fr;
		gap: 2px;
	}

	.split-tile {
		display: flex;
		flex-direction: column;
		overflow: hidden;
		position: relative;
		background: #111;
	}

	.scene-container {
		flex: 1;
		min-height: 0;
		cursor: grab;
		position: relative;
	}

	.split-view-container {
		display: flex;
		width: 100%;
		height: 100%;
		position: relative;
	}

	.split-view-half {
		flex: 1;
		position: relative;
		min-width: 0;
	}

	.split-view-divider {
		width: 2px;
		background: #333;
		flex-shrink: 0;
	}

	.split-view-label {
		position: absolute;
		top: 6px;
		left: 50%;
		transform: translateX(-50%);
		padding: 2px 8px;
		border-radius: 4px;
		font-size: 10px;
		font-weight: bold;
		z-index: 10;
		pointer-events: none;
	}

	.split-view-label-theory {
		background: rgba(79, 195, 247, 0.85);
		color: #0a1929;
	}

	.split-view-label-sim {
		background: rgba(255, 183, 77, 0.85);
		color: #1a1200;
	}

	.tile-header {
		flex-shrink: 0;
		padding: 4px 8px;
		background: rgba(30, 30, 46, 0.95);
		backdrop-filter: blur(4px);
	}

	.active-tile {
		outline: 2px solid #ee7718;
		outline-offset: -2px;
	}

	.tile-invalid-badge {
		position: absolute;
		top: 8px;
		right: 8px;
		padding: 2px 8px;
		border-radius: 4px;
		font-size: 11px;
		font-weight: bold;
		background: rgba(220, 38, 38, 0.85);
		color: white;
		backdrop-filter: blur(4px);
		z-index: 20;
	}

	.tile-warning-badge {
		position: absolute;
		top: 8px;
		right: 8px;
		padding: 2px 8px;
		border-radius: 4px;
		font-size: 11px;
		font-weight: bold;
		background: rgba(245, 158, 11, 0.85);
		color: #1a1200;
		backdrop-filter: blur(4px);
		z-index: 20;
		cursor: help;
	}

	.tile-details-panel {
		flex-shrink: 0;
		padding: 6px 8px;
		background: rgba(20, 20, 35, 0.95);
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		backdrop-filter: blur(4px);
	}

	.tile-details-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 4px;
		margin-bottom: 6px;
	}

	.tile-detail-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
	}

	.tile-detail-label {
		font-size: 9px;
		color: #888;
		margin-bottom: 2px;
	}

	.tile-detail-value {
		font-size: 11px;
		font-weight: bold;
		font-family: monospace;
	}

	.tile-details-bars {
		display: flex;
		gap: 8px;
	}

	.tile-bar-item {
		flex: 1;
	}

	.mobile-drawer {
		animation: slideUp 0.3s ease-out;
	}

	@keyframes slideUp {
		from {
			transform: translateY(100%);
		}
		to {
			transform: translateY(0);
		}
	}

	:global(.dark) .split-tile {
		background: #0d0d1a;
	}

	@media (max-width: 768px) {
		.tile-details-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
