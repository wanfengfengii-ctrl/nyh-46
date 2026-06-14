<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import {
		calculateErrorAnalysis,
		computeImagingQualityScore,
		formatTime,
		type Submission,
		type SubmissionVersion,
		type CameraParams
	} from '$lib/cameraObscura';
	import { pushNotification } from '$lib/stores';

	export let submission: Submission | null = null;
	export let open = false;
	export let onApplyParams: ((params: CameraParams) => void) | undefined = undefined;

	const dispatch = createEventDispatcher<{
		close: void;
	}>();

	type ViewMode = 'side-by-side' | 'unified';

	let viewMode: ViewMode = 'side-by-side';
	let leftVersionId: string = '';
	let rightVersionId: string = '';
	let animationActive = false;
	let animationTimer: number | null = null;
	let animationShowLeft = true;

	$: versionHistory = submission?.versionHistory || [];
	$: sortedHistory = [...versionHistory].sort((a, b) => a.timestamp - b.timestamp);

	$: if (sortedHistory.length > 0 && !leftVersionId) {
		leftVersionId = sortedHistory[0]?.id || '';
	}
	$: if (sortedHistory.length > 1 && !rightVersionId) {
		rightVersionId = sortedHistory[sortedHistory.length - 1]?.id || '';
	} else if (sortedHistory.length === 1 && !rightVersionId) {
		rightVersionId = sortedHistory[0]?.id || '';
	}

	$: leftVersion = sortedHistory.find((v) => v.id === leftVersionId) || null;
	$: rightVersion = sortedHistory.find((v) => v.id === rightVersionId) || null;

	$: leftError = leftVersion?.params ? calculateErrorAnalysis(leftVersion.params) : null;
	$: rightError = rightVersion?.params ? calculateErrorAnalysis(rightVersion.params) : null;

	$: leftQuality = leftVersion?.params ? computeImagingQualityScore(leftVersion.params) : 0;
	$: rightQuality = rightVersion?.params ? computeImagingQualityScore(rightVersion.params) : 0;

	$: leftRecordingFrames = leftVersion?.recordingSnapshot?.frames?.length || 0;
	$: rightRecordingFrames = rightVersion?.recordingSnapshot?.frames?.length || 0;

	const paramLabels: { key: keyof CameraParams; label: string; unit: string }[] = [
		{ key: 'boxLength', label: '箱长', unit: '' },
		{ key: 'apertureSize', label: '孔径', unit: '' },
		{ key: 'objectDistance', label: '物距', unit: '' },
		{ key: 'objectHeight', label: '物高', unit: '' },
		{ key: 'lightIntensity', label: '光强', unit: '' }
	];

	const qualityMetrics = [
		{ key: 'sharpness', label: '清晰度', format: (v: number) => `${v.toFixed(1)}%`, max: 100 },
		{ key: 'brightness', label: '亮度', format: (v: number) => `${v.toFixed(1)}%`, max: 100 },
		{ key: 'imageHeight', label: '像高', format: (v: number) => v.toFixed(3), max: 10 },
		{ key: 'blurError', label: '模糊占比', format: (v: number) => `${v.toFixed(1)}%`, max: 100 }
	];

	function isFormalSubmission(version: SubmissionVersion): boolean {
		return version.note?.includes('正式提交') || false;
	}

	function getParamValue(version: SubmissionVersion | null, key: keyof CameraParams): number | null {
		return version?.params ? version.params[key] : null;
	}

	function formatParamValue(val: number | null, key: keyof CameraParams): string {
		if (val === null) return '-';
		switch (key) {
			case 'apertureSize':
				return val.toFixed(2);
			default:
				return val.toFixed(1);
		}
	}

	function isParamDifferent(key: keyof CameraParams): boolean {
		if (!leftVersion?.params || !rightVersion?.params) return false;
		return leftVersion.params[key] !== rightVersion.params[key];
	}

	function getQualityValue(
		error: ReturnType<typeof calculateErrorAnalysis> | null,
		key: string
	): number {
		if (!error) return 0;
		switch (key) {
			case 'sharpness':
				return error.simulated.sharpness;
			case 'brightness':
				return error.simulated.brightness;
			case 'imageHeight':
				return error.simulated.imageHeight;
			case 'blurError':
				return error.blurCircleError;
			default:
				return 0;
		}
	}

	function isQualityDifferent(key: string): boolean {
		if (!leftError || !rightError) return false;
		return getQualityValue(leftError, key) !== getQualityValue(rightError, key);
	}

	function formatVersionTime(ts: number): string {
		return new Date(ts).toLocaleString('zh-CN', {
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	function selectTimelineVersion(id: string, side: 'left' | 'right' | 'both') {
		if (side === 'left' || side === 'both') {
			leftVersionId = id;
		}
		if (side === 'right' || side === 'both') {
			rightVersionId = id;
		}
	}

	function handleApplyParams(version: SubmissionVersion | null) {
		if (!version?.params) {
			pushNotification('warning', '该版本无参数数据');
			return;
		}
		if (onApplyParams) {
			onApplyParams({ ...version.params });
		}
		dispatch('close');
		pushNotification('success', `已应用 v${version.versionNumber} 版本参数`);
	}

	function toggleAnimation() {
		if (animationActive) {
			stopAnimation();
		} else {
			startAnimation();
		}
	}

	function startAnimation() {
		if (!leftVersion?.params || !rightVersion?.params) {
			pushNotification('warning', '需要选择两个有效版本才能播放动画');
			return;
		}
		animationActive = true;
		animationShowLeft = true;
		animationTimer = window.setInterval(() => {
			animationShowLeft = !animationShowLeft;
			if (onApplyParams) {
				const params = animationShowLeft ? leftVersion.params! : rightVersion.params!;
				onApplyParams({ ...params });
			}
		}, 1500);
	}

	function stopAnimation() {
		animationActive = false;
		if (animationTimer) {
			clearInterval(animationTimer);
			animationTimer = null;
		}
	}

	function exportDiffSummary() {
		if (!leftVersion || !rightVersion) {
			pushNotification('warning', '请选择两个版本进行对比');
			return;
		}

		const lines: string[] = [];
		lines.push(`=== 版本差异摘要 ===`);
		lines.push(`版本 A: v${leftVersion.versionNumber} (${formatVersionTime(leftVersion.timestamp)})`);
		lines.push(`版本 B: v${rightVersion.versionNumber} (${formatVersionTime(rightVersion.timestamp)})`);
		lines.push(``);

		lines.push(`--- 参数差异 ---`);
		for (const p of paramLabels) {
			const lv = getParamValue(leftVersion, p.key);
			const rv = getParamValue(rightVersion, p.key);
			const same = lv === rv;
			lines.push(
				`${p.label}: ${formatParamValue(lv, p.key)} ${same ? '=' : '→'} ${formatParamValue(rv, p.key)}${same ? '' : ' 🔴'}`
			);
		}
		lines.push(``);

		lines.push(`--- 成像质量差异 ---`);
		for (const q of qualityMetrics) {
			const lv = getQualityValue(leftError, q.key);
			const rv = getQualityValue(rightError, q.key);
			const diff = rv - lv;
			lines.push(
				`${q.label}: ${q.format(lv)} → ${q.format(rv)} (${diff >= 0 ? '+' : ''}${q.format(Math.abs(diff))})`
			);
		}
		lines.push(``);

		lines.push(`--- 综合质量评分 ---`);
		lines.push(`版本A: ${(leftQuality * 100).toFixed(1)}%`);
		lines.push(`版本B: ${(rightQuality * 100).toFixed(1)}%`);
		lines.push(``);

		lines.push(`--- 录制帧数量 ---`);
		lines.push(`版本A: ${leftRecordingFrames} 帧`);
		lines.push(`版本B: ${rightRecordingFrames} 帧`);
		lines.push(``);

		if (leftVersion.conclusionText !== rightVersion.conclusionText) {
			lines.push(`--- 结论文本差异 ---`);
			lines.push(`[版本A]: ${leftVersion.conclusionText || '(空)'}`);
			lines.push(`[版本B]: ${rightVersion.conclusionText || '(空)'}`);
		}

		const summary = lines.join('\n');

		if (navigator.clipboard) {
			navigator.clipboard
				.writeText(summary)
				.then(() => pushNotification('success', '差异摘要已复制到剪贴板'))
				.catch(() => pushNotification('error', '复制失败，请手动复制'));
		}

		return summary;
	}

	function getConclusionDiffLines(
		leftText: string,
		rightText: string
	): { leftLines: string[]; rightLines: string[]; leftDiff: boolean[]; rightDiff: boolean[] } {
		const leftLines = (leftText || '').split('\n');
		const rightLines = (rightText || '').split('\n');
		const maxLen = Math.max(leftLines.length, rightLines.length);
		const leftDiff: boolean[] = [];
		const rightDiff: boolean[] = [];

		for (let i = 0; i < maxLen; i++) {
			const l = leftLines[i] || '';
			const r = rightLines[i] || '';
			const different = l !== r;
			leftDiff.push(different);
			rightDiff.push(different);
		}

		return { leftLines, rightLines, leftDiff, rightDiff };
	}

	function closeModal() {
		stopAnimation();
		open = false;
		dispatch('close');
	}

	onMount(() => {
		stopAnimation();
	});
</script>

{#if open}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
		on:click|self={closeModal}>
		<div class="bg-surface-900 border border-surface-700 rounded-2xl shadow-2xl w-full max-w-7xl max-h-[92vh] flex flex-col overflow-hidden">

			<div class="flex items-center justify-between px-6 py-4 border-b border-surface-700 bg-surface-800/50">
				<div class="flex items-center gap-3">
					<div class="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-secondary-500 flex items-center justify-center text-xl">
						📊
					</div>
					<div>
						<h2 class="text-lg font-bold text-white">版本历史对比</h2>
						<p class="text-sm text-surface-400">
							{submission ? `${submission.studentName} 的提交记录，共 ${sortedHistory.length} 个版本` : '暂无提交数据'}
						</p>
					</div>
				</div>
				<div class="flex items-center gap-2">
					<div class="flex bg-surface-700 rounded-lg p-0.5 text-sm">
						<button
							class="px-3 py-1.5 rounded-md transition-colors {viewMode === 'side-by-side' ? 'bg-primary-600 text-white' : 'text-surface-300 hover:text-white'}"
							on:click={() => (viewMode = 'side-by-side')}
						>
							并排对比
						</button>
						<button
							class="px-3 py-1.5 rounded-md transition-colors {viewMode === 'unified' ? 'bg-primary-600 text-white' : 'text-surface-300 hover:text-white'}"
							on:click={() => (viewMode = 'unified')}
						>
							统一列表
						</button>
					</div>
					<button
						class="w-9 h-9 rounded-lg text-surface-400 hover:text-white hover:bg-surface-700 transition-colors flex items-center justify-center"
						on:click={closeModal}
					>
						✕
					</button>
				</div>
			</div>

			<div class="overflow-y-auto flex-1 p-6 space-y-5">

				<div class="bg-surface-800 rounded-xl p-4 border border-surface-700">
					<div class="flex items-center justify-between mb-3">
						<h3 class="text-sm font-semibold text-surface-200">📈 版本时间线</h3>
						<p class="text-xs text-surface-500">左键设置左侧版本 · 右键设置右侧版本 · 中键同时设置</p>
					</div>
					<div class="relative">
						<div class="absolute top-4 left-0 right-0 h-0.5 bg-surface-600"></div>
						<div class="relative flex items-start gap-2 overflow-x-auto pb-2">
							{#each sortedHistory as version, idx}
								{@const isFormal = isFormalSubmission(version)}
								{@const isLeft = version.id === leftVersionId}
								{@const isRight = version.id === rightVersionId}
								<button
									class="relative flex-shrink-0 group"
									on:click={() => selectTimelineVersion(version.id, 'left')}
									on:contextmenu|preventDefault={() => selectTimelineVersion(version.id, 'right')}
									on:auxclick={(e) => {
										if (e.button === 1) {
											e.preventDefault();
											selectTimelineVersion(version.id, 'both');
										}
									}}
								>
									<div class="flex flex-col items-center pt-2 w-28">
										<div
											class="w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold z-10 transition-all cursor-pointer
											{isFormal
												? 'bg-gradient-to-br from-amber-500 to-orange-600 border-amber-400 text-white shadow-lg shadow-amber-500/30'
												: 'bg-surface-700 border-surface-500 text-surface-300'
											}
											{isLeft ? 'ring-2 ring-offset-2 ring-offset-surface-800 ring-blue-500' : ''}
											{isRight && !isLeft ? 'ring-2 ring-offset-2 ring-offset-surface-800 ring-green-500' : ''}
											{isLeft && isRight ? 'ring-2 ring-offset-2 ring-offset-surface-800 ring-purple-500' : ''}
											group-hover:scale-110"
										>
											v{version.versionNumber}
										</div>
										<div class="mt-2 text-center space-y-0.5">
											<div class="text-[11px] text-surface-300 truncate w-full">
												{formatVersionTime(version.timestamp)}
											</div>
											{#if isFormal}
												<div class="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
													正式提交
												</div>
											{:else if version.note}
												<div class="text-[10px] text-surface-500 truncate w-full">
													{version.note}
												</div>
											{/if}
										</div>
										<div class="flex gap-1 mt-1">
											{#if isLeft}
												<span class="px-1 py-0.5 rounded text-[9px] bg-blue-500/20 text-blue-300">左</span>
											{/if}
											{#if isRight}
												<span class="px-1 py-0.5 rounded text-[9px] bg-green-500/20 text-green-300">右</span>
											{/if}
										</div>
									</div>
								</button>
								{#if idx < sortedHistory.length - 1}
									<div class="flex-shrink-0 w-6 pt-4 text-surface-600 text-xs">→</div>
								{/if}
							{:else}
								<div class="text-center py-8 text-surface-500 w-full">暂无版本历史记录</div>
							{/each}
						</div>
					</div>
				</div>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div class="flex items-center gap-2 bg-surface-800 rounded-xl p-3 border border-surface-700">
						<div class="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-sm">A</div>
						<div class="flex-1">
							<label class="text-xs text-surface-400 block mb-1">左侧版本</label>
							<select
								class="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
								bind:value={leftVersionId}
							>
								{#each sortedHistory as v}
									<option value={v.id}>
										v{v.versionNumber} - {formatVersionTime(v.timestamp)}
										{isFormalSubmission(v) ? ' ✅ 正式提交' : ''}
									</option>
								{/each}
							</select>
						</div>
					</div>
					<div class="flex items-center gap-2 bg-surface-800 rounded-xl p-3 border border-surface-700">
						<div class="w-8 h-8 rounded-lg bg-green-500/20 border border-green-500/30 flex items-center justify-center text-green-400 font-bold text-sm">B</div>
						<div class="flex-1">
							<label class="text-xs text-surface-400 block mb-1">右侧版本</label>
							<select
								class="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-green-500"
								bind:value={rightVersionId}
							>
								{#each sortedHistory as v}
									<option value={v.id}>
										v{v.versionNumber} - {formatVersionTime(v.timestamp)}
										{isFormalSubmission(v) ? ' ✅ 正式提交' : ''}
									</option>
								{/each}
							</select>
						</div>
					</div>
				</div>

				{#if viewMode === 'side-by-side'}
					<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">

						{#each [
							{ ver: leftVersion, err: leftError, qual: leftQuality, frames: leftRecordingFrames, side: 'left', color: 'blue' },
							{ ver: rightVersion, err: rightError, qual: rightQuality, frames: rightRecordingFrames, side: 'right', color: 'green' }
						] as col}
							<div
								class="bg-surface-800 rounded-xl border border-surface-700 overflow-hidden
								{animationActive && ((col.side === 'left' && animationShowLeft) || (col.side === 'right' && !animationShowLeft))
									? 'ring-2 ring-primary-500'
									: ''}"
							>
								<div
									class="px-4 py-3 border-b border-surface-700 flex items-center justify-between
									{col.color === 'blue' ? 'bg-blue-500/10' : 'bg-green-500/10'}"
								>
									<div class="flex items-center gap-2">
										<div
											class="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-sm
											{col.color === 'blue' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'}"
										>
											{col.side === 'left' ? 'A' : 'B'}
										</div>
										<div>
											<div class="font-bold text-white text-sm">
												版本 v{col.ver?.versionNumber ?? '-'}
												{#if col.ver && isFormalSubmission(col.ver)}
													<span class="ml-2 text-amber-400 text-xs">✅ 正式提交</span>
												{/if}
											</div>
											<div class="text-xs text-surface-400">
												{col.ver ? formatVersionTime(col.ver.timestamp) : '-'}
											</div>
										</div>
									</div>
									<div class="text-right">
										<div class="text-xs text-surface-400">质量评分</div>
										<div
											class="font-bold text-lg
											{col.qual >= 0.7 ? 'text-success-400' : col.qual >= 0.4 ? 'text-warning-400' : 'text-error-400'}"
										>
											{(col.qual * 100).toFixed(1)}%
										</div>
									</div>
								</div>

								<div class="p-4 space-y-4">
									<div class="flex items-center gap-4 text-xs text-surface-400">
										<div>作者: <span class="text-surface-200">{col.ver?.userId.slice(0, 8) || '-'}</span></div>
										<div>备注: <span class="text-surface-200">{col.ver?.note || '-'}</span></div>
									</div>

									<div class="bg-surface-900/50 rounded-lg p-3 border border-surface-700">
										<h4 class="text-xs font-semibold text-surface-300 mb-2 flex items-center gap-1">
											<span>⚙️</span> 参数对比
										</h4>
										<div class="grid grid-cols-5 gap-2">
											{#each paramLabels as p}
												{@const val = getParamValue(col.ver, p.key)}
												{@const diff = isParamDifferent(p.key)}
												<div
													class="text-center p-2 rounded-lg transition-colors
													{diff ? 'bg-red-500/20 border border-red-500/30' : 'bg-surface-700/50 border border-surface-600'}"
												>
													<div class="text-[10px] text-surface-400 mb-1">{p.label}</div>
													<div
														class="font-mono font-bold text-sm
														{diff ? 'text-red-300' : 'text-white'}"
													>
														{formatParamValue(val, p.key)}
													</div>
												</div>
											{/each}
										</div>
									</div>

									<div class="bg-surface-900/50 rounded-lg p-3 border border-surface-700">
										<h4 class="text-xs font-semibold text-surface-300 mb-3 flex items-center gap-1">
											<span>🎯</span> 成像质量
										</h4>
										<div class="space-y-2.5">
											{#each qualityMetrics as q}
												{@const val = getQualityValue(col.err, q.key)}
												{@const diff = isQualityDifferent(q.key)}
												<div>
													<div class="flex items-center justify-between text-xs mb-1">
														<span class="{diff ? 'text-red-300' : 'text-surface-300'}">{q.label}</span>
														<span
															class="font-mono font-semibold
															{diff ? 'text-red-300' : 'text-surface-200'}"
														>
															{q.format(val)}
														</span>
													</div>
													<div class="h-2 bg-surface-700 rounded-full overflow-hidden">
														<div
															class="h-full rounded-full transition-all duration-500
															{diff ? 'bg-gradient-to-r from-red-500 to-red-400' : 'bg-gradient-to-r from-primary-500 to-secondary-500'}"
															style="width: {Math.min(100, (val / q.max) * 100)}%"
														></div>
													</div>
												</div>
											{/each}
										</div>
									</div>

									<div class="bg-surface-900/50 rounded-lg p-3 border border-surface-700">
										<h4 class="text-xs font-semibold text-surface-300 mb-2 flex items-center gap-1">
											<span>📝</span> 结论文本
										</h4>
										{#if col.side === 'left'}
											{@const diffResult = getConclusionDiffLines(leftVersion?.conclusionText || '', rightVersion?.conclusionText || '')}
											<div class="space-y-0.5 text-xs font-mono max-h-32 overflow-y-auto">
												{#each diffResult.leftLines as line, i}
													<div
														class="px-2 py-1 rounded whitespace-pre-wrap break-words
														{diffResult.leftDiff[i] ? 'bg-red-500/20 text-red-300' : 'text-surface-300'}"
													>
														{line || '\u00A0'}
													</div>
												{/each}
											</div>
										{:else}
											{@const diffResult = getConclusionDiffLines(leftVersion?.conclusionText || '', rightVersion?.conclusionText || '')}
											<div class="space-y-0.5 text-xs font-mono max-h-32 overflow-y-auto">
												{#each diffResult.rightLines as line, i}
													<div
														class="px-2 py-1 rounded whitespace-pre-wrap break-words
														{diffResult.rightDiff[i] ? 'bg-red-500/20 text-red-300' : 'text-surface-300'}"
													>
														{line || '\u00A0'}
													</div>
												{/each}
											</div>
										{/if}
									</div>

									<div class="bg-surface-900/50 rounded-lg p-3 border border-surface-700">
										<h4 class="text-xs font-semibold text-surface-300 mb-2 flex items-center gap-1">
											<span>🎬</span> 录制快照
										</h4>
										<div
											class="flex items-center justify-between text-sm
											{leftRecordingFrames !== rightRecordingFrames ? 'text-red-300' : 'text-surface-200'}"
										>
											<div>
												<span class="font-bold">{col.frames}</span>
												<span class="text-surface-400 ml-1">帧</span>
											</div>
											{#if col.ver?.recordingSnapshot}
												<div class="text-xs text-surface-400">
													时长 {formatTime(col.ver.recordingSnapshot.duration)}
												</div>
											{/if}
										</div>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<div class="bg-surface-800 rounded-xl border border-surface-700 overflow-hidden">
						<div class="overflow-x-auto">
							<table class="w-full text-sm">
								<thead class="bg-surface-700/50 text-xs uppercase text-surface-400">
									<tr>
										<th class="text-left px-4 py-3 font-semibold">项目</th>
										<th class="text-left px-4 py-3 font-semibold">
											<span class="inline-flex items-center gap-1">
												<span class="w-5 h-5 rounded bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold">A</span>
												版本 v{leftVersion?.versionNumber ?? '-'}
											</span>
										</th>
										<th class="text-left px-4 py-3 font-semibold">
											<span class="inline-flex items-center gap-1">
												<span class="w-5 h-5 rounded bg-green-500/20 text-green-400 flex items-center justify-center text-xs font-bold">B</span>
												版本 v{rightVersion?.versionNumber ?? '-'}
											</span>
										</th>
										<th class="text-left px-4 py-3 font-semibold">差异</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-surface-700">
									<tr class="bg-surface-700/30">
										<td class="px-4 py-2.5 text-surface-400 font-semibold text-xs uppercase" colspan="4">基本信息</td>
									</tr>
									<tr>
										<td class="px-4 py-2.5 text-surface-300">时间</td>
										<td class="px-4 py-2.5 text-white font-mono text-xs">{leftVersion ? formatVersionTime(leftVersion.timestamp) : '-'}</td>
										<td class="px-4 py-2.5 text-white font-mono text-xs">{rightVersion ? formatVersionTime(rightVersion.timestamp) : '-'}</td>
										<td class="px-4 py-2.5"></td>
									</tr>
									<tr>
										<td class="px-4 py-2.5 text-surface-300">作者</td>
										<td class="px-4 py-2.5 text-white text-xs">{leftVersion?.userId.slice(0, 12) || '-'}</td>
										<td class="px-4 py-2.5 text-white text-xs">{rightVersion?.userId.slice(0, 12) || '-'}</td>
										<td class="px-4 py-2.5">
											{#if leftVersion?.userId !== rightVersion?.userId}
												<span class="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-300">不同</span>
											{/if}
										</td>
									</tr>
									<tr>
										<td class="px-4 py-2.5 text-surface-300">备注</td>
										<td class="px-4 py-2.5 text-white text-xs">{leftVersion?.note || '-'}</td>
										<td class="px-4 py-2.5 text-white text-xs">{rightVersion?.note || '-'}</td>
										<td class="px-4 py-2.5">
											{#if leftVersion?.note !== rightVersion?.note}
												<span class="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-300">不同</span>
											{/if}
										</td>
									</tr>
									<tr>
										<td class="px-4 py-2.5 text-surface-300">质量评分</td>
										<td class="px-4 py-2.5">
											<span class="font-bold {leftQuality >= 0.7 ? 'text-success-400' : leftQuality >= 0.4 ? 'text-warning-400' : 'text-error-400'}">
												{(leftQuality * 100).toFixed(1)}%
											</span>
										</td>
										<td class="px-4 py-2.5">
											<span class="font-bold {rightQuality >= 0.7 ? 'text-success-400' : rightQuality >= 0.4 ? 'text-warning-400' : 'text-error-400'}">
												{(rightQuality * 100).toFixed(1)}%
											</span>
										</td>
										<td class="px-4 py-2.5">
											{#if true}
												{@const qDiff = rightQuality - leftQuality}
												<span
													class="font-mono text-xs
													{qDiff > 0 ? 'text-green-400' : qDiff < 0 ? 'text-red-400' : 'text-surface-500'}"
												>
													{qDiff > 0 ? '+' : ''}{(qDiff * 100).toFixed(1)}%
												</span>
											{/if}
										</td>
									</tr>

									<tr class="bg-surface-700/30">
										<td class="px-4 py-2.5 text-surface-400 font-semibold text-xs uppercase" colspan="4">⚙️ 参数对比</td>
									</tr>
									{#each paramLabels as p}
										{@const lv = getParamValue(leftVersion, p.key)}
										{@const rv = getParamValue(rightVersion, p.key)}
										{@const diff = isParamDifferent(p.key)}
										<tr>
											<td class="px-4 py-2.5 text-surface-300">{p.label}</td>
											<td class="px-4 py-2.5 font-mono {diff ? 'text-red-300 bg-red-500/10' : 'text-white'}">
												{formatParamValue(lv, p.key)}
											</td>
											<td class="px-4 py-2.5 font-mono {diff ? 'text-red-300 bg-red-500/10' : 'text-white'}">
												{formatParamValue(rv, p.key)}
											</td>
											<td class="px-4 py-2.5">
												{#if diff && lv !== null && rv !== null}
													<span class="font-mono text-xs {rv > lv ? 'text-green-400' : 'text-red-400'}">
														{rv > lv ? '↑' : '↓'} {Math.abs(rv - lv).toFixed(p.key === 'apertureSize' ? 2 : 1)}
													</span>
												{/if}
											</td>
										</tr>
									{/each}

									<tr class="bg-surface-700/30">
										<td class="px-4 py-2.5 text-surface-400 font-semibold text-xs uppercase" colspan="4">🎯 成像质量</td>
									</tr>
									{#each qualityMetrics as q}
										{@const lv = getQualityValue(leftError, q.key)}
										{@const rv = getQualityValue(rightError, q.key)}
										{@const diff = isQualityDifferent(q.key)}
										<tr>
											<td class="px-4 py-2.5 text-surface-300">{q.label}</td>
											<td class="px-4 py-2.5">
												<div class="{diff ? 'text-red-300' : 'text-white'}">
													<span class="font-mono font-semibold">{q.format(lv)}</span>
													<div class="h-1.5 bg-surface-700 rounded-full mt-1 overflow-hidden w-24">
														<div
															class="h-full rounded-full {diff ? 'bg-red-500' : 'bg-primary-500'}"
															style="width: {Math.min(100, (lv / q.max) * 100)}%"
														></div>
													</div>
												</div>
											</td>
											<td class="px-4 py-2.5">
												<div class="{diff ? 'text-red-300' : 'text-white'}">
													<span class="font-mono font-semibold">{q.format(rv)}</span>
													<div class="h-1.5 bg-surface-700 rounded-full mt-1 overflow-hidden w-24">
														<div
															class="h-full rounded-full {diff ? 'bg-red-500' : 'bg-primary-500'}"
															style="width: {Math.min(100, (rv / q.max) * 100)}%"
														></div>
													</div>
												</div>
											</td>
											<td class="px-4 py-2.5">
												{#if diff}
													<span class="font-mono text-xs {rv > lv ? 'text-green-400' : 'text-red-400'}">
														{rv > lv ? '↑' : '↓'} {q.format(Math.abs(rv - lv))}
													</span>
												{/if}
											</td>
										</tr>
									{/each}

									<tr class="bg-surface-700/30">
										<td class="px-4 py-2.5 text-surface-400 font-semibold text-xs uppercase" colspan="4">🎬 录制数据</td>
									</tr>
									<tr>
										<td class="px-4 py-2.5 text-surface-300">帧数</td>
										<td
											class="px-4 py-2.5 {leftRecordingFrames !== rightRecordingFrames ? 'text-red-300 bg-red-500/10' : 'text-white'}"
										>
											{leftRecordingFrames} 帧
										</td>
										<td
											class="px-4 py-2.5 {leftRecordingFrames !== rightRecordingFrames ? 'text-red-300 bg-red-500/10' : 'text-white'}"
										>
											{rightRecordingFrames} 帧
										</td>
										<td class="px-4 py-2.5">
											{#if true}
												{@const fDiff = rightRecordingFrames - leftRecordingFrames}
												{#if fDiff !== 0}
													<span class="font-mono text-xs {fDiff > 0 ? 'text-green-400' : 'text-red-400'}">
														{fDiff > 0 ? '+' : ''}{fDiff}
													</span>
												{/if}
											{/if}
										</td>
									</tr>
								</tbody>
							</table>
						</div>
					</div>
				{/if}
			</div>

			<div class="flex items-center justify-between gap-3 px-6 py-4 border-t border-surface-700 bg-surface-800/50">
				<div class="flex items-center gap-2">
					<button
						class="px-4 py-2 rounded-lg text-sm font-medium transition-colors
						{animationActive
							? 'bg-error-600 hover:bg-error-500 text-white'
							: 'bg-surface-700 hover:bg-surface-600 text-surface-200'}"
						on:click={toggleAnimation}
						disabled={!leftVersion?.params || !rightVersion?.params}
					>
						{animationActive ? '⏹ 停止动画' : '▶️ 播放对比动画'}
					</button>
					<button
						class="px-4 py-2 rounded-lg text-sm font-medium bg-surface-700 hover:bg-surface-600 text-surface-200 transition-colors"
						on:click={exportDiffSummary}
					>
						📋 导出差异摘要
					</button>
				</div>
				<div class="flex items-center gap-2">
					<button
						class="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600/80 hover:bg-blue-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						on:click={() => handleApplyParams(leftVersion)}
						disabled={!leftVersion?.params}
					>
						应用 A 版参数
					</button>
					<button
						class="px-4 py-2 rounded-lg text-sm font-medium bg-green-600/80 hover:bg-green-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						on:click={() => handleApplyParams(rightVersion)}
						disabled={!rightVersion?.params}
					>
						应用 B 版参数
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
