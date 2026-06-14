<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher } from 'svelte';
	import type {
		CameraParams,
		ExperimentRecording,
		ExperimentFrame,
		BestImagingInterval
	} from '$lib/cameraObscura';
	import {
		calculateErrorAnalysis,
		detectInvalidDistance,
		formatTime,
		generateRecordingName,
		generateId,
		detectBestImagingIntervals,
		computeImagingQualityScore,
		saveRecordingToStorage,
		loadRecordingsFromStorage
	} from '$lib/cameraObscura';

	export let params: CameraParams;
	export let activeSchemeIndex: number;

	const dispatch = createEventDispatcher<{
		seek: { params: CameraParams; timestamp: number };
		recordingSaved: { recording: ExperimentRecording };
	}>();

	let isRecording = false;
	let isPlaying = false;
	let currentTime = 0;
	let recordingStartTime = 0;
	let frames: ExperimentFrame[] = [];
	let bestIntervals: BestImagingInterval[] = [];
	let playbackSpeed = 1;
	let recordingName = '';
	let recordingDescription = '';
	let showSaveDialog = false;
	let savedRecordings: ExperimentRecording[] = [];
	let showRecordingsList = false;
	let selectedRecordingId: string | null = null;
	let qualityScore = 0;
	let lastFrameTime = 0;
	let recordingInterval: number | null = null;
	let playbackAnimationId: number | null = null;
	let playbackStartTime = 0;
	let playbackStartFrameIndex = 0;
	let showBestIntervals = true;

	$: qualityScore = computeImagingQualityScore(params);

	function startRecording() {
		frames = [];
		bestIntervals = [];
		isRecording = true;
		recordingStartTime = Date.now();
		lastFrameTime = recordingStartTime;
		currentTime = 0;
		isPlaying = false;

		recordFrame();

		recordingInterval = window.setInterval(() => {
			recordFrame();
		}, 200);
	}

	function recordFrame() {
		const now = Date.now();
		const timestamp = now - recordingStartTime;

		const frame: ExperimentFrame = {
			timestamp,
			params: { ...params },
			errorAnalysis: calculateErrorAnalysis(params),
			invalidResult: detectInvalidDistance(params)
		};

		frames.push(frame);
		currentTime = timestamp;
		lastFrameTime = now;
	}

	function stopRecording() {
		isRecording = false;
		if (recordingInterval) {
			clearInterval(recordingInterval);
			recordingInterval = null;
		}

		bestIntervals = detectBestImagingIntervals(frames);
		recordingName = generateRecordingName();
		showSaveDialog = true;
	}

	function togglePlayback() {
		if (frames.length < 2) return;

		if (isPlaying) {
			pausePlayback();
		} else {
			startPlayback();
		}
	}

	function startPlayback() {
		if (currentTime >= getDuration() && getDuration() > 0) {
			currentTime = 0;
			playbackStartFrameIndex = 0;
		} else {
			playbackStartFrameIndex = findFrameIndex(currentTime);
		}

		isPlaying = true;
		playbackStartTime = Date.now();

		function animate() {
			if (!isPlaying) return;

			const elapsed = (Date.now() - playbackStartTime) * playbackSpeed;
			const targetTime = frames[playbackStartFrameIndex]?.timestamp || 0 + elapsed;
			currentTime = Math.min(targetTime, getDuration());

			const frameIndex = findFrameIndex(currentTime);
			if (frameIndex >= 0 && frameIndex < frames.length) {
				const frame = frames[frameIndex];
				dispatch('seek', { params: { ...frame.params }, timestamp: currentTime });
			}

			if (currentTime >= getDuration()) {
				isPlaying = false;
				return;
			}

			playbackAnimationId = requestAnimationFrame(animate);
		}

		playbackAnimationId = requestAnimationFrame(animate);
	}

	function pausePlayback() {
		isPlaying = false;
		if (playbackAnimationId) {
			cancelAnimationFrame(playbackAnimationId);
			playbackAnimationId = null;
		}
	}

	function seekTimeline(e: Event) {
		const target = e.target as HTMLInputElement;
		const time = Number(target.value);
		currentTime = time;

		const frameIndex = findFrameIndex(time);
		if (frameIndex >= 0 && frameIndex < frames.length) {
			const frame = frames[frameIndex];
			dispatch('seek', { params: { ...frame.params }, timestamp: time });
		}
	}

	function findFrameIndex(time: number): number {
		if (frames.length === 0) return 0;
		if (time <= frames[0].timestamp) return 0;
		if (time >= frames[frames.length - 1].timestamp) return frames.length - 1;

		let left = 0;
		let right = frames.length - 1;
		while (left < right) {
			const mid = Math.floor((left + right) / 2);
			if (frames[mid].timestamp < time) {
				left = mid + 1;
			} else {
				right = mid;
			}
		}
		return left;
	}

	function getDuration(): number {
		if (frames.length === 0) return 0;
		return frames[frames.length - 1].timestamp;
	}

	function addKeyframe() {
		if (frames.length === 0 || !isRecording) return;
		const lastFrame = frames[frames.length - 1];
		lastFrame.isKeyframe = true;
		lastFrame.keyframeLabel = `关键帧 ${frames.filter((f) => f.isKeyframe).length + 1}`;
		frames = [...frames];
	}

	function saveRecording() {
		if (frames.length === 0) return;

		const recording: ExperimentRecording = {
			id: generateId(),
			name: recordingName || generateRecordingName(),
			description: recordingDescription,
			courseTopicId: null,
			startTime: recordingStartTime,
			endTime: recordingStartTime + getDuration(),
			frames: [...frames],
			createdAt: Date.now(),
			duration: getDuration(),
			bestIntervals: [...bestIntervals]
		};

		saveRecordingToStorage(recording);
		savedRecordings = loadRecordingsFromStorage();
		dispatch('recordingSaved', { recording });
		showSaveDialog = false;
		recordingDescription = '';
	}

	function loadRecording(recording: ExperimentRecording) {
		pausePlayback();
		frames = [...recording.frames];
		bestIntervals = [...recording.bestIntervals];
		currentTime = 0;
		selectedRecordingId = recording.id;
		showRecordingsList = false;

		if (frames.length > 0) {
			dispatch('seek', { params: { ...frames[0].params }, timestamp: 0 });
		}
	}

	function deleteRecording(id: string) {
		if (!confirm('确定要删除这条实验记录吗？')) return;

		savedRecordings = savedRecordings.filter((r) => r.id !== id);
		if (typeof localStorage !== 'undefined') {
			try {
				localStorage.setItem(
					'cameraObscuraRecordings',
					JSON.stringify(savedRecordings)
				);
			} catch (e) {
				console.warn('无法保存:', e);
			}
		}
		if (selectedRecordingId === id) {
			selectedRecordingId = null;
			frames = [];
			bestIntervals = [];
		}
	}

	function exportRecording() {
		if (frames.length === 0) return;

		const recording: ExperimentRecording = {
			id: selectedRecordingId || generateId(),
			name: recordingName || generateRecordingName(),
			description: recordingDescription,
			courseTopicId: null,
			startTime: recordingStartTime,
			endTime: recordingStartTime + getDuration(),
			frames: [...frames],
			createdAt: Date.now(),
			duration: getDuration(),
			bestIntervals: [...bestIntervals]
		};

		const json = JSON.stringify(recording, null, 2);
		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${recording.name}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function importRecording(e: Event) {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = (ev) => {
			try {
				const recording = JSON.parse(ev.target?.result as string) as ExperimentRecording;
				if (recording.frames && recording.frames.length > 0) {
					loadRecording(recording);
					saveRecordingToStorage(recording);
					savedRecordings = loadRecordingsFromStorage();
				}
			} catch (err) {
				alert('文件格式不正确');
			}
		};
		reader.readAsText(file);
		target.value = '';
	}

	function clearTimeline() {
		if (frames.length > 0 && !confirm('确定要清空当前时间轴吗？')) return;
		pausePlayback();
		frames = [];
		bestIntervals = [];
		currentTime = 0;
		selectedRecordingId = null;
	}

	function getTimelineGradient(): string {
		if (bestIntervals.length === 0 || !showBestIntervals) return '#374151';

		const duration = getDuration();
		if (duration === 0) return '#374151';

		const parts: string[] = [];
		let lastEnd = 0;

		for (const interval of bestIntervals) {
			const startPct = ((interval.startTime - recordingStartTime) / duration) * 100;
			const endPct = ((interval.endTime - recordingStartTime) / duration) * 100;

			if (startPct > lastEnd) {
				parts.push(`#374151 ${lastEnd}%`);
				parts.push(`#374151 ${startPct}%`);
			}

			const color =
				interval.dominantMetric === 'sharpness'
					? '#4fc3f7'
					: interval.dominantMetric === 'brightness'
						? '#ffb74d'
						: '#81c784';
			parts.push(`${color} ${startPct}%`);
			parts.push(`${color} ${endPct}%`);
			lastEnd = endPct;
		}

		if (lastEnd < 100) {
			parts.push(`#374151 ${lastEnd}%`);
			parts.push(`#374151 100%`);
		}

		return `linear-gradient(to right, ${parts.join(', ')})`;
	}

	onMount(() => {
		savedRecordings = loadRecordingsFromStorage();
	});

	onDestroy(() => {
		if (recordingInterval) clearInterval(recordingInterval);
		if (playbackAnimationId) cancelAnimationFrame(playbackAnimationId);
	});

	$: keyframes = frames.filter((f) => f.isKeyframe);
</script>

<div class="timeline-panel bg-surface-800 border-t border-surface-700 p-3">
	<div class="flex items-center justify-between mb-2">
		<div class="flex items-center gap-2">
			<h3 class="text-sm font-bold text-surface-100">⏱ 实验时间轴</h3>
			<span class="text-xs text-surface-400">
				{frames.length} 帧 | {formatTime(getDuration())}
			</span>
			{#if keyframes.length > 0}
				<span class="text-xs text-primary-400">🔑 {keyframes.length} 关键帧</span>
			{/if}
		</div>

		<div class="flex items-center gap-1.5">
			{#if isRecording}
				<button
					on:click={addKeyframe}
					class="px-2 py-1 text-xs rounded bg-primary-600 text-white hover:bg-primary-500 transition-colors"
					title="添加关键帧"
				>
					🔑 关键帧
				</button>
			{/if}
			<button
				on:click={() => (showRecordingsList = !showRecordingsList)}
				class="px-2 py-1 text-xs rounded bg-surface-700 text-surface-200 hover:bg-surface-600 transition-colors"
				title="历史记录"
			>
				📁 记录库
			</button>
			<label class="px-2 py-1 text-xs rounded bg-surface-700 text-surface-200 hover:bg-surface-600 transition-colors cursor-pointer">
				📥 导入
				<input type="file" accept=".json" class="hidden" on:change={importRecording} />
			</label>
			{#if frames.length > 0}
				<button
					on:click={exportRecording}
					class="px-2 py-1 text-xs rounded bg-surface-700 text-surface-200 hover:bg-surface-600 transition-colors"
					title="导出记录"
				>
					📤 导出
				</button>
				<button
					on:click={clearTimeline}
					class="px-2 py-1 text-xs rounded bg-surface-700 text-surface-200 hover:bg-surface-600 transition-colors"
					title="清空时间轴"
				>
					🗑 清空
				</button>
			{/if}
		</div>
	</div>

	<div class="flex items-center gap-3">
		<div class="flex items-center gap-1 flex-shrink-0">
			{#if !isRecording}
				<button
					on:click={startRecording}
					class="w-9 h-9 rounded-full bg-error-500 text-white hover:bg-error-400 transition-colors flex items-center justify-center text-sm"
					title="开始录制"
				>
					●
				</button>
			{:else}
				<button
					on:click={stopRecording}
					class="w-9 h-9 rounded-full bg-error-500 text-white hover:bg-error-400 transition-colors flex items-center justify-center text-sm animate-pulse"
					title="停止录制"
				>
					■
				</button>
			{/if}

			<button
				on:click={togglePlayback}
				disabled={frames.length < 2}
				class="w-9 h-9 rounded-full bg-primary-500 text-white hover:bg-primary-400 transition-colors flex items-center justify-center text-sm disabled:opacity-40 disabled:cursor-not-allowed"
				title={isPlaying ? '暂停' : '播放'}
			>
				{isPlaying ? '⏸' : '▶'}
			</button>
		</div>

		<div class="flex-1 relative">
			<input
				type="range"
				min="0"
				max={getDuration() || 1}
				value={currentTime}
				on:input={seekTimeline}
				disabled={frames.length < 2}
				class="w-full h-2 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed"
				style={`background: ${getTimelineGradient()}`}
			/>

			{#each keyframes as keyframe}
				<div
					class="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-yellow-400 rounded-full border border-yellow-200 pointer-events-none"
					style={`left: ${(keyframe.timestamp / getDuration()) * 100}%`}
					title={keyframe.keyframeLabel}
				/>
			{/each}
		</div>

		<div class="text-xs font-mono text-surface-300 flex-shrink-0 w-20 text-right">
			{formatTime(currentTime)} / {formatTime(getDuration())}
		</div>

		<div class="flex items-center gap-1 flex-shrink-0">
			<span class="text-xs text-surface-400">速度:</span>
			{#each [0.5, 1, 2] as speed}
				<button
					on:click={() => (playbackSpeed = speed)}
					class="px-1.5 py-0.5 text-xs rounded transition-colors {playbackSpeed === speed
						? 'bg-primary-600 text-white'
						: 'bg-surface-700 text-surface-300 hover:bg-surface-600'}"
				>
					{speed}x
				</button>
			{/each}
		</div>

		<div class="flex items-center gap-1 flex-shrink-0">
			<span
				class="inline-block w-3 h-3 rounded-sm"
				style="background: #81c784"
			></span>
			<span class="text-xs text-surface-400">最佳区间</span>
		</div>
	</div>

	{#if isRecording}
		<div class="mt-2 flex items-center gap-2">
			<span class="w-2 h-2 rounded-full bg-error-500 animate-pulse"></span>
			<span class="text-xs text-error-400">正在录制...</span>
			<span class="text-xs text-surface-400">
				当前质量评分: {(qualityScore * 100).toFixed(1)}%
			</span>
		</div>
	{/if}

	{#if bestIntervals.length > 0 && showBestIntervals}
		<div class="mt-2 flex flex-wrap gap-1.5">
			<span class="text-xs text-surface-400">最佳成像区间:</span>
			{#each bestIntervals as interval, idx}
				<span
					class="text-xs px-1.5 py-0.5 rounded-full"
					style={`background: ${interval.dominantMetric === 'sharpness'
						? 'rgba(79, 195, 247, 0.2)'
						: interval.dominantMetric === 'brightness'
							? 'rgba(255, 183, 77, 0.2)'
							: 'rgba(129, 199, 132, 0.2)'}; color: ${interval.dominantMetric === 'sharpness'
						? '#4fc3f7'
						: interval.dominantMetric === 'brightness'
							? '#ffb74d'
							: '#81c784'}`}
				>
					{formatTime(interval.startTime - recordingStartTime)}-{formatTime(interval.endTime - recordingStartTime)}
					({(interval.qualityScore * 100).toFixed(0)}%)
				</span>
			{/each}
		</div>
	{/if}

	{#if showRecordingsList}
		<div class="mt-3 border-t border-surface-700 pt-3">
			<div class="flex items-center justify-between mb-2">
				<h4 class="text-sm font-semibold text-surface-200">📁 实验记录库</h4>
				<button
					on:click={() => (showRecordingsList = false)}
					class="text-xs text-surface-400 hover:text-surface-200"
				>
					关闭
				</button>
			</div>

			{#if savedRecordings.length === 0}
				<p class="text-xs text-surface-400 text-center py-4">暂无保存的实验记录</p>
			{:else}
				<div class="space-y-1.5 max-h-32 overflow-y-auto">
					{#each savedRecordings as recording}
						<div
							class={`p-2 rounded-lg text-xs transition-colors cursor-pointer ${selectedRecordingId === recording.id
								? 'bg-primary-600/30 border border-primary-500'
								: 'bg-surface-700 hover:bg-surface-600 border border-transparent'}`}
							on:click={() => loadRecording(recording)}
						>
							<div class="flex items-center justify-between">
								<span class="font-medium text-surface-100 truncate">{recording.name}</span>
								<button
									on:click|stopPropagation={() => deleteRecording(recording.id)}
									class="text-surface-400 hover:text-error-400 ml-2"
									title="删除"
								>
									✕
								</button>
							</div>
							<div class="text-surface-400 mt-0.5 flex gap-3">
								<span>{recording.frames.length} 帧</span>
								<span>{formatTime(recording.duration)}</span>
								<span>{new Date(recording.createdAt).toLocaleDateString('zh-CN')}</span>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	{#if showSaveDialog}
		<div
			class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
			on:click={() => (showSaveDialog = false)}
		>
			<div
				class="bg-surface-800 rounded-lg p-5 w-80 border border-surface-700"
				on:click|stopPropagation
			>
				<h3 class="text-lg font-bold text-surface-100 mb-4">💾 保存实验记录</h3>

				<div class="space-y-3">
					<div>
						<label class="block text-xs text-surface-300 mb-1">记录名称</label>
						<input
							type="text"
							bind:value={recordingName}
							class="w-full px-3 py-2 rounded bg-surface-700 text-surface-100 text-sm border border-surface-600 focus:border-primary-500 focus:outline-none"
						/>
					</div>
					<div>
						<label class="block text-xs text-surface-300 mb-1">描述（可选）</label>
						<textarea
							bind:value={recordingDescription}
							rows="3"
							class="w-full px-3 py-2 rounded bg-surface-700 text-surface-100 text-sm border border-surface-600 focus:border-primary-500 focus:outline-none resize-none"
							placeholder="记录实验目的、发现等..."
						/>
					</div>
				</div>

				<div class="flex gap-2 mt-5">
					<button
						on:click={() => (showSaveDialog = false)}
						class="flex-1 px-4 py-2 rounded bg-surface-700 text-surface-200 hover:bg-surface-600 transition-colors text-sm"
					>
						取消
					</button>
					<button
						on:click={saveRecording}
						class="flex-1 px-4 py-2 rounded bg-primary-500 text-white hover:bg-primary-400 transition-colors text-sm"
					>
						保存
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.timeline-panel {
		flex-shrink: 0;
	}

	input[type='range']::-webkit-slider-thumb {
		appearance: none;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: #ee7718;
		cursor: pointer;
		border: 2px solid white;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
	}

	input[type='range']::-moz-range-thumb {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: #ee7718;
		cursor: pointer;
		border: 2px solid white;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
	}

	input[type='range']:disabled::-webkit-slider-thumb {
		background: #666;
		cursor: not-allowed;
	}

	input[type='range']:disabled::-moz-range-thumb {
		background: #666;
		cursor: not-allowed;
	}
</style>
