<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { ExperimentFrame } from '$lib/cameraObscura';

	export let frames: ExperimentFrame[] = [];
	export let currentTime: number = 0;

	let canvas: HTMLCanvasElement;
	let canvasWidth = 600;
	let canvasHeight = 200;
	let showParams: Record<string, boolean> = {
		apertureSize: true,
		objectDistance: true,
		boxLength: false,
		brightness: true,
		sharpness: true,
		blurError: false
	};

	const paramColors: Record<string, string> = {
		apertureSize: '#ffb74d',
		objectDistance: '#4fc3f7',
		boxLength: '#81c784',
		brightness: '#ffb74d',
		sharpness: '#4fc3f7',
		blurError: '#ef4444',
		objectHeight: '#ba68c8',
		lightIntensity: '#f06292'
	};

	const paramLabels: Record<string, string> = {
		apertureSize: '孔径',
		objectDistance: '物距',
		boxLength: '箱长',
		brightness: '亮度(%)',
		sharpness: '清晰度(%)',
		blurError: '模糊占比(%)',
		objectHeight: '物高',
		lightIntensity: '光强'
	};

	$: drawChart();

	function drawChart() {
		if (!canvas || frames.length < 2) return;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const dpr = window.devicePixelRatio || 1;
		canvas.width = canvasWidth * dpr;
		canvas.height = canvasHeight * dpr;
		ctx.scale(dpr, dpr);

		ctx.fillStyle = '#1e1e2e';
		ctx.fillRect(0, 0, canvasWidth, canvasHeight);

		const padding = { top: 20, right: 60, bottom: 25, left: 60 };
		const chartWidth = canvasWidth - padding.left - padding.right;
		const chartHeight = canvasHeight - padding.top - padding.bottom;

		const activeParams = Object.entries(showParams)
			.filter(([, v]) => v)
			.map(([k]) => k);

		if (activeParams.length === 0) {
			ctx.fillStyle = '#666';
			ctx.font = '12px sans-serif';
			ctx.textAlign = 'center';
			ctx.fillText('请选择要显示的指标', canvasWidth / 2, canvasHeight / 2);
			return;
		}

		const timeMin = frames[0].timestamp;
		const timeMax = frames[frames.length - 1].timestamp;
		const timeRange = timeMax - timeMin || 1;

		ctx.strokeStyle = '#333';
		ctx.lineWidth = 0.5;
		for (let i = 0; i <= 4; i++) {
			const y = padding.top + (chartHeight * i) / 4;
			ctx.beginPath();
			ctx.moveTo(padding.left, y);
			ctx.lineTo(canvasWidth - padding.right, y);
			ctx.stroke();
		}

		for (let i = 0; i <= 5; i++) {
			const x = padding.left + (chartWidth * i) / 5;
			ctx.beginPath();
			ctx.moveTo(x, padding.top);
			ctx.lineTo(x, padding.top + chartHeight);
			ctx.stroke();

			const time = timeMin + (timeRange * i) / 5;
			ctx.fillStyle = '#888';
			ctx.font = '10px sans-serif';
			ctx.textAlign = 'center';
			const seconds = Math.floor(time / 1000);
			ctx.fillText(`${seconds}s`, x, canvasHeight - 8);
		}

		for (const param of activeParams) {
			const values = frames.map((f) => getValue(f, param));
			const minVal = Math.min(...values);
			const maxVal = Math.max(...values);
			const range = maxVal - minVal || 1;

			ctx.strokeStyle = paramColors[param] || '#888';
			ctx.lineWidth = 1.5;
			ctx.beginPath();

			frames.forEach((frame, i) => {
				const x = padding.left + ((frame.timestamp - timeMin) / timeRange) * chartWidth;
				const y = padding.top + chartHeight - ((values[i] - minVal) / range) * chartHeight;

				if (i === 0) {
					ctx.moveTo(x, y);
				} else {
					ctx.lineTo(x, y);
				}
			});
			ctx.stroke();

			ctx.fillStyle = paramColors[param] || '#888';
			ctx.font = '10px sans-serif';
			ctx.textAlign = 'left';
			const labelY = padding.top + 12 + activeParams.indexOf(param) * 14;
			ctx.fillRect(canvasWidth - padding.right + 8, labelY - 8, 10, 10);
			ctx.fillText(paramLabels[param], canvasWidth - padding.right + 22, labelY + 2);
		}

		if (currentTime > 0) {
			const x =
				padding.left +
				((Math.min(currentTime, timeMax) - timeMin) / timeRange) * chartWidth;

			ctx.strokeStyle = '#ee7718';
			ctx.lineWidth = 1;
			ctx.setLineDash([4, 4]);
			ctx.beginPath();
			ctx.moveTo(x, padding.top);
			ctx.lineTo(x, padding.top + chartHeight);
			ctx.stroke();
			ctx.setLineDash([]);
		}

		ctx.strokeStyle = '#555';
		ctx.lineWidth = 1;
		ctx.strokeRect(padding.left, padding.top, chartWidth, chartHeight);
	}

	function getValue(frame: ExperimentFrame, param: string): number {
		switch (param) {
			case 'apertureSize':
				return frame.params.apertureSize;
			case 'objectDistance':
				return frame.params.objectDistance;
			case 'boxLength':
				return frame.params.boxLength;
			case 'objectHeight':
				return frame.params.objectHeight;
			case 'lightIntensity':
				return frame.params.lightIntensity;
			case 'brightness':
				return frame.errorAnalysis.simulated.brightness;
			case 'sharpness':
				return frame.errorAnalysis.simulated.sharpness;
			case 'blurError':
				return frame.errorAnalysis.blurCircleError;
			default:
				return 0;
		}
	}

	function toggleParam(param: string) {
		showParams = { ...showParams, [param]: !showParams[param] };
	}

	function handleResize() {
		if (canvas && canvas.parentElement) {
			canvasWidth = canvas.parentElement.clientWidth;
		}
	}

	onMount(() => {
		handleResize();
		window.addEventListener('resize', handleResize);
	});

	onDestroy(() => {
		window.removeEventListener('resize', handleResize);
	});
</script>

<div class="parameter-trajectory bg-surface-800 p-3 rounded-lg border border-surface-700">
	<div class="flex items-center justify-between mb-2">
		<h3 class="text-sm font-bold text-surface-100">📊 参数变化轨迹</h3>
	</div>

	<div class="flex flex-wrap gap-2 mb-2">
		<span class="text-xs text-surface-400">参数:</span>
		{#each ['apertureSize', 'objectDistance', 'boxLength'] as param}
			<button
				on:click={() => toggleParam(param)}
				class="text-xs px-2 py-0.5 rounded transition-colors"
				class:bg-surface-600={!showParams[param]}
				class:text-surface-300={!showParams[param]}
				style={showParams[param]
					? `background: ${paramColors[param]}22; color: ${paramColors[param]}; border: 1px solid ${paramColors[param]}66`
					: ''}
			>
				{paramLabels[param]}
			</button>
		{/each}
	</div>

	<div class="flex flex-wrap gap-2 mb-2">
		<span class="text-xs text-surface-400">指标:</span>
		{#each ['brightness', 'sharpness', 'blurError'] as param}
			<button
				on:click={() => toggleParam(param)}
				class="text-xs px-2 py-0.5 rounded transition-colors"
				class:bg-surface-600={!showParams[param]}
				class:text-surface-300={!showParams[param]}
				style={showParams[param]
					? `background: ${paramColors[param]}22; color: ${paramColors[param]}; border: 1px solid ${paramColors[param]}66`
					: ''}
			>
				{paramLabels[param]}
			</button>
		{/each}
	</div>

	<div class="chart-container">
		{#if frames.length < 2}
			<div class="empty-state">
				<p class="text-sm text-surface-400">暂无数据</p>
				<p class="text-xs text-surface-500">开始录制实验以查看参数变化轨迹</p>
			</div>
		{:else}
			<canvas bind:this={canvas} style="width: {canvasWidth}px; height: {canvasHeight}px;" />
		{/if}
	</div>
</div>

<style>
	.chart-container {
		width: 100%;
		min-height: 200px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.empty-state {
		text-align: center;
		padding: 40px 20px;
	}
</style>
