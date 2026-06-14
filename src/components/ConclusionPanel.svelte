<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { ExperimentRecording, ExperimentConclusion, CameraParams } from '$lib/cameraObscura';
	import { generateExperimentConclusion, calculateErrorAnalysis, detectInvalidDistance } from '$lib/cameraObscura';

	export let recording: ExperimentRecording | null = null;
	export let currentParams: CameraParams;

	const dispatch = createEventDispatcher<{
		close: void;
	}>();

	let isOpen = false;
	let activeTab: 'summary' | 'analysis' | 'formulas' = 'summary';

	const tabs = [
		{ id: 'summary', label: '摘要', icon: '📝' },
		{ id: 'analysis', label: '参数分析', icon: '📊' },
		{ id: 'formulas', label: '原理公式', icon: '📚' }
	];

	function setActiveTab(id: string) {
		activeTab = id as 'summary' | 'analysis' | 'formulas';
	}

	let conclusion: ExperimentConclusion;
	$: conclusion = recording
		? generateExperimentConclusion(recording)
		: getSingleParamConclusion();

	function getSingleParamConclusion(): ExperimentConclusion {
		const error = calculateErrorAnalysis(currentParams);
		const invalid = detectInvalidDistance(currentParams);

		return {
			summary: '当前参数下的成像分析。建议进行完整实验录制以获得更全面的结论。',
			keyFindings: [
				`当前像高: ${error.simulated.imageHeight.toFixed(3)}（误差 ${error.imageHeightError.toFixed(2)}%）`,
				`当前亮度: ${error.simulated.brightness.toFixed(1)}%（误差 ${error.brightnessError.toFixed(1)}%）`,
				`当前清晰度: ${error.simulated.sharpness.toFixed(1)}%（误差 ${error.sharpnessError.toFixed(1)}%）`,
				`模糊占比: ${error.blurCircleError.toFixed(2)}%`
			],
			parameterAnalysis: [
				{
					param: 'apertureSize',
					label: '孔径大小',
					trend: '当前值 ' + currentParams.apertureSize.toFixed(2),
					optimalRange: '建议 0.1-0.5 范围，平衡清晰度与亮度'
				},
				{
					param: 'objectDistance',
					label: '物体距离',
					trend: '当前值 ' + currentParams.objectDistance.toFixed(1),
					optimalRange: '建议 5-20 单位范围，兼顾像大小与亮度'
				},
				{
					param: 'boxLength',
					label: '暗箱长度',
					trend: '当前值 ' + currentParams.boxLength.toFixed(1),
					optimalRange: '建议 3-10 单位范围，获得合适放大倍率'
				}
			],
			recommendations: [
				'点击"开始录制"按钮进行实验，系统将自动记录参数变化并生成完整结论',
				'尝试系统地改变单一参数，观察其对成像的影响',
				'使用教学引导功能进行系统性学习'
			],
			formulaVerified: [
				'像高公式：像高 = 物体高度 × 暗箱长度 / 物体距离',
				'亮度规律：成像亮度与孔径面积成正比，与物距平方成反比',
				'清晰度规律：孔径越小越清晰但越暗，存在最佳平衡点'
			]
		};
	}

	function exportConclusion() {
		const html = generateConclusionHtml(conclusion, recording);
		const blob = new Blob([html], { type: 'text/html' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `实验结论_${Date.now()}.html`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function generateConclusionHtml(conc: ExperimentConclusion, rec: ExperimentRecording | null): string {
		const timestamp = new Date().toLocaleString('zh-CN');
		const title = rec ? rec.name : '单参数分析';

		return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>暗箱实验结论报告</title>
<style>
body{font-family:'Segoe UI',system-ui,sans-serif;background:#1a1a2e;color:#e0e0e0;padding:32px;margin:0;line-height:1.6}
h1{color:#ee7718;border-bottom:2px solid #ee7718;padding-bottom:8px}
h2{color:#4fc3f7;margin-top:24px}
h3{color:#81c784;margin-top:16px}
ul{padding-left:20px}
li{margin-bottom:6px}
.card{background:#2a2a3e;border-radius:8px;padding:16px;margin:12px 0}
.timestamp{color:#888;font-size:12px;margin-top:32px;text-align:right}
.highlight{color:#ffb74d;font-weight:bold}
</style>
</head>
<body>
<h1>📷 暗箱成像实验结论报告</h1>
<p><strong>实验名称：</strong>${title}</p>
<p><strong>生成时间：</strong>${timestamp}</p>

<div class="card">
<h2>📝 实验摘要</h2>
<p>${conc.summary}</p>
</div>

<h2>🔍 主要发现</h2>
<ul>
${conc.keyFindings.map((f) => `<li>${f}</li>`).join('')}
</ul>

<h2>📊 参数分析</h2>
${conc.parameterAnalysis
	.map(
		(p) => `
<div class="card">
<h3>${p.label}</h3>
<p><strong>变化趋势：</strong>${p.trend}</p>
<p><strong>最佳范围：</strong>${p.optimalRange}</p>
</div>
`
	)
	.join('')}

<h2>💡 建议</h2>
<ul>
${conc.recommendations.map((r) => `<li>${r}</li>`).join('')}
</ul>

<h2>📚 验证的公式与原理</h2>
<ul>
${conc.formulaVerified.map((f) => `<li>${f}</li>`).join('')}
</ul>

<p class="timestamp">报告由 暗箱历史实验回放与学习引导系统 自动生成</p>
</body>
</html>`;
	}
</script>

<button
	on:click={() => (isOpen = true)}
	class="px-3 py-1.5 text-xs rounded-lg bg-surface-700 text-surface-200 hover:bg-surface-600 transition-colors flex items-center gap-1.5"
	title="实验结论"
>
	📋 结论
</button>

{#if isOpen}
	<div
		class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
		on:click={() => (isOpen = false)}
	>
		<div
			class="conclusion-modal bg-surface-800 rounded-xl border border-surface-700 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
			on:click|stopPropagation
		>
			<div class="p-5 border-b border-surface-700 flex items-center justify-between">
				<div>
					<h2 class="text-xl font-bold text-surface-100 flex items-center gap-2">
						📋 实验结论
						{#if recording}
							<span class="text-xs font-normal text-surface-400">
								（基于 {recording.frames.length} 帧实验数据）
							</span>
						{:else}
							<span class="text-xs font-normal text-surface-400">（当前参数）</span>
						{/if}
					</h2>
				</div>
				<div class="flex items-center gap-2">
					<button
						on:click={exportConclusion}
						class="px-3 py-1.5 text-xs rounded bg-primary-500 text-white hover:bg-primary-400 transition-colors"
					>
						📄 导出报告
					</button>
					<button
						on:click={() => (isOpen = false)}
						class="text-surface-400 hover:text-surface-200 text-xl"
					>
						✕
					</button>
				</div>
			</div>

			<div class="flex border-b border-surface-700">
				{#each tabs as item}
					<button
						on:click={() => setActiveTab(item.id)}
						class="flex-1 px-4 py-2.5 text-sm font-medium transition-colors border-b-2"
						class:text-primary-400={activeTab === item.id}
						class:border-primary-500={activeTab === item.id}
						class:text-surface-400={activeTab !== item.id}
						class:border-transparent={activeTab !== item.id}
						class:hover:text-surface-200={activeTab !== item.id}
					>
						<span class="mr-1">{item.icon}</span>
						{item.label}
					</button>
				{/each}
			</div>

			<div class="flex-1 overflow-y-auto p-5">
				{#if activeTab === 'summary'}
					<div class="space-y-4">
						<div class="p-4 rounded-lg bg-gradient-to-br from-primary-900/30 to-purple-900/20 border border-primary-700/30">
							<h3 class="font-bold text-surface-100 mb-2 flex items-center gap-2">
								<span class="text-xl">📝</span> 实验摘要
							</h3>
							<p class="text-sm text-surface-300 leading-relaxed">
								{conclusion.summary}
							</p>
						</div>

						<div>
							<h3 class="font-bold text-surface-100 mb-3 flex items-center gap-2">
								<span>🔍</span> 主要发现
							</h3>
							<div class="space-y-2">
								{#each conclusion.keyFindings as finding, idx}
									<div class="flex items-start gap-2 p-3 bg-surface-700/50 rounded-lg">
										<span
											class="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold"
											style="background: {idx === 0 ? '#ffb74d' : idx === 1 ? '#4fc3f7' : '#81c784'}22; color: {idx === 0 ? '#ffb74d' : idx === 1 ? '#4fc3f7' : '#81c784'}"
										>
											{idx + 1}
										</span>
										<p class="text-sm text-surface-300 leading-relaxed">
											{finding}
										</p>
									</div>
								{/each}
							</div>
						</div>

						<div>
							<h3 class="font-bold text-surface-100 mb-3 flex items-center gap-2">
								<span>💡</span> 实验建议
							</h3>
							<div class="space-y-2">
								{#each conclusion.recommendations as rec, idx}
									<div class="flex items-start gap-2">
										<span class="text-warning-400 flex-shrink-0">●</span>
										<p class="text-sm text-surface-300">{rec}</p>
									</div>
								{/each}
							</div>
						</div>
					</div>
				{:else if activeTab === 'analysis'}
					<div class="space-y-3">
						{#each conclusion.parameterAnalysis as param}
							<div class="p-4 rounded-lg bg-surface-700/50 border border-surface-600">
								<div class="flex items-center justify-between mb-2">
									<h4 class="font-semibold text-surface-100">{param.label}</h4>
									<span
										class="text-xs px-2 py-0.5 rounded bg-primary-600/30 text-primary-300"
									>
										{param.param}
									</span>
								</div>
								<div class="space-y-2 text-sm">
									<div class="flex items-start gap-2">
										<span class="text-surface-500 flex-shrink-0">趋势:</span>
										<span class="text-surface-300">{param.trend}</span>
									</div>
									<div class="flex items-start gap-2">
										<span class="text-surface-500 flex-shrink-0">最佳:</span>
										<span class="text-success-300">{param.optimalRange}</span>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{:else if activeTab === 'formulas'}
					<div class="space-y-4">
						<h3 class="font-bold text-surface-100 mb-3">📚 验证的公式与原理</h3>

						{#each conclusion.formulaVerified as formula, idx}
							<div
								class="p-4 rounded-lg bg-gradient-to-r from-surface-700/50 to-surface-700/30 border border-surface-600"
							>
								<div class="flex items-start gap-3">
									<span
										class="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold"
										style="background: {idx === 0 ? '#4fc3f7' : idx === 1 ? '#ffb74d' : '#81c784'}22; color: {idx === 0 ? '#4fc3f7' : idx === 1 ? '#ffb74d' : '#81c784'}"
									>
										{idx + 1}
									</span>
									<p class="text-sm text-surface-300 leading-relaxed pt-1">
										{formula}
									</p>
								</div>
							</div>
						{/each}

						<div class="mt-6 p-4 rounded-lg bg-purple-900/20 border border-purple-700/30">
							<h4 class="font-semibold text-purple-300 mb-2">💡 学习提示</h4>
							<p class="text-sm text-purple-200 leading-relaxed">
								使用"教学引导"功能进行系统学习，通过步骤式引导深入理解小孔成像的原理和规律。
								每个课程都包含目标提示和原理讲解，帮助你更好地掌握知识。
							</p>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.conclusion-modal {
		animation: modalIn 0.2s ease-out;
	}

	@keyframes modalIn {
		from {
			opacity: 0;
			transform: scale(0.95);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}
</style>
