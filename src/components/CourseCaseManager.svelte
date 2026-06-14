<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import type {
		CameraParams,
		CourseTopic,
		ExperimentCase,
		ExperimentRecording,
		ExperimentConclusion
	} from '$lib/cameraObscura';
	import {
		DEFAULT_COURSE_TOPICS,
		generateId,
		generateExperimentConclusion,
		saveCaseToStorage,
		loadCasesFromStorage,
		calculateErrorAnalysis,
		computeImagingQualityScore
	} from '$lib/cameraObscura';

	export let params: CameraParams;
	export let recording: ExperimentRecording | null = null;

	const dispatch = createEventDispatcher<{
		loadCase: { params: CameraParams };
	}>();

	let isOpen = false;
	let activeTopicId: string | null = null;
	let cases: ExperimentCase[] = [];
	let showSaveDialog = false;
	let caseName = '';
	let caseDescription = '';
	let selectedTopicId = 'basics';
	let caseAuthor = '匿名用户';
	let topics: CourseTopic[] = [...DEFAULT_COURSE_TOPICS];
	let showShareInfo = false;
	let sharedCase: ExperimentCase | null = null;

	$: filteredCases = activeTopicId
		? cases.filter((c) => c.courseTopicId === activeTopicId)
		: cases;

	$: {
		topics = DEFAULT_COURSE_TOPICS.map((t) => ({
			...t,
			caseCount: cases.filter((c) => c.courseTopicId === t.id).length
		}));
	}

	function openManager() {
		isOpen = true;
		cases = loadCasesFromStorage();
	}

	function closeManager() {
		isOpen = false;
		activeTopicId = null;
		showSaveDialog = false;
	}

	function selectTopic(topicId: string | null) {
		activeTopicId = topicId;
	}

	function openSaveDialog() {
		caseName = `实验案例_${new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
		caseDescription = '';
		showSaveDialog = true;
	}

	function saveCase() {
		let conclusion: ExperimentConclusion;

		if (recording && recording.frames.length > 0) {
			conclusion = generateExperimentConclusion(recording);
		} else {
			const tempRecording: ExperimentRecording = {
				id: generateId(),
				name: caseName,
				description: caseDescription,
				courseTopicId: selectedTopicId,
				startTime: Date.now(),
				endTime: Date.now(),
				frames: [
					{
						timestamp: 0,
						params: { ...params },
						errorAnalysis: calculateErrorAnalysis(params),
						invalidResult: { isInvalid: false, reasons: [] }
					}
				],
				createdAt: Date.now(),
				duration: 0,
				bestIntervals: []
			};
			conclusion = generateExperimentConclusion(tempRecording);
		}

		const newCase: ExperimentCase = {
			id: generateId(),
			name: caseName.trim() || '未命名案例',
			description: caseDescription,
			courseTopicId: selectedTopicId,
			recordingId: recording?.id || null,
			params: { ...params },
			conclusion,
			createdAt: Date.now(),
			author: caseAuthor || '匿名用户',
			shared: false
		};

		saveCaseToStorage(newCase);
		cases = loadCasesFromStorage();
		showSaveDialog = false;
	}

	function loadCase(caseItem: ExperimentCase) {
		dispatch('loadCase', { params: { ...caseItem.params } });
	}

	function deleteCase(id: string) {
		if (!confirm('确定要删除这个案例吗？')) return;
		cases = cases.filter((c) => c.id !== id);
		if (typeof localStorage !== 'undefined') {
			try {
				localStorage.setItem('cameraObscuraCases', JSON.stringify(cases));
			} catch (e) {
				console.warn('无法保存:', e);
			}
		}
	}

	function shareCase(caseItem: ExperimentCase) {
		sharedCase = caseItem;
		showShareInfo = true;

		const shareData = JSON.stringify(caseItem, null, 2);
		if (navigator.clipboard) {
			navigator.clipboard.writeText(shareData).catch(() => {
				// ignore
			});
		}
	}

	function importCase() {
		const input = prompt('请粘贴分享的案例 JSON 数据:');
		if (!input) return;

		try {
			const caseData = JSON.parse(input) as ExperimentCase;
			if (caseData.id && caseData.params) {
				caseData.id = generateId();
				caseData.createdAt = Date.now();
				saveCaseToStorage(caseData);
				cases = loadCasesFromStorage();
				alert('案例导入成功！');
			} else {
				alert('数据格式不正确');
			}
		} catch (e) {
			alert('数据解析失败，请检查格式');
		}
	}

	function getTopicById(id: string | null): CourseTopic | undefined {
		if (!id) return undefined;
		return topics.find((t) => t.id === id);
	}

	function getQualityColor(score: number): string {
		if (score >= 0.7) return '#81c784';
		if (score >= 0.4) return '#ffb74d';
		return '#f06292';
	}

	onMount(() => {
		cases = loadCasesFromStorage();
	});
</script>

<button
	on:click={openManager}
	class="px-3 py-1.5 text-xs rounded-lg bg-surface-700 text-surface-200 hover:bg-surface-600 transition-colors flex items-center gap-1.5"
	title="案例库"
>
	📂 案例库
	{#if cases.length > 0}
		<span class="bg-primary-500/30 text-primary-300 px-1.5 py-0.5 rounded text-[10px]">
			{cases.length}
		</span>
	{/if}
</button>

{#if isOpen}
	<div
		class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
		on:click={closeManager}
	>
		<div
			class="case-modal bg-surface-800 rounded-xl border border-surface-700 w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
			on:click|stopPropagation
		>
			<div class="p-4 border-b border-surface-700 flex items-center justify-between">
				<div>
					<h2 class="text-xl font-bold text-surface-100 flex items-center gap-2">
						📂 实验案例库
					</h2>
					<p class="text-xs text-surface-400 mt-0.5">
						按课程主题分类保存和分享实验案例
					</p>
				</div>
				<div class="flex items-center gap-2">
					<button
						on:click={importCase}
						class="px-3 py-1.5 text-xs rounded bg-surface-700 text-surface-200 hover:bg-surface-600 transition-colors"
					>
						📥 导入案例
					</button>
					<button
						on:click={openSaveDialog}
						class="px-3 py-1.5 text-xs rounded bg-primary-500 text-white hover:bg-primary-400 transition-colors"
					>
						💾 保存当前
					</button>
					<button
						on:click={closeManager}
						class="text-surface-400 hover:text-surface-200 text-xl ml-2"
					>
						✕
					</button>
				</div>
			</div>

			<div class="flex-1 flex overflow-hidden">
				<div class="w-48 border-r border-surface-700 p-3 overflow-y-auto flex-shrink-0">
					<h4 class="text-xs font-semibold text-surface-400 mb-2 uppercase">课程主题</h4>
					<div class="space-y-1">
						<button
							on:click={() => selectTopic(null)}
							class="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors {activeTopicId === null
								? 'bg-surface-700 text-surface-100'
								: 'text-surface-300 hover:bg-surface-700/50'}"
						>
							<span class="mr-2">📁</span>
							全部
							<span class="float-right text-xs text-surface-500">{cases.length}</span>
						</button>

						{#each topics as topic}
							<button
								on:click={() => selectTopic(topic.id)}
								class="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors {activeTopicId === topic.id
									? 'bg-surface-700 text-surface-100'
									: 'text-surface-300 hover:bg-surface-700/50'}"
							>
								<span class="mr-2">{topic.icon}</span>
								<span class="truncate">{topic.name}</span>
								<span
									class="float-right text-xs"
									style="color: {topic.color}88"
								>
									{topic.caseCount}
								</span>
							</button>
						{/each}
					</div>
				</div>

				<div class="flex-1 overflow-y-auto p-4">
					{#if filteredCases.length === 0}
						<div class="text-center py-16">
							<span class="text-4xl mb-3 block">📭</span>
							<p class="text-surface-400 text-sm">暂无案例</p>
							<p class="text-surface-500 text-xs mt-1">
								点击"保存当前"将当前实验保存为案例
							</p>
						</div>
					{:else}
						<div class="grid grid-cols-2 gap-3">
							{#each filteredCases as caseItem}
								<div
									class="case-card p-3 rounded-lg bg-surface-700/50 border border-surface-600 hover:border-primary-500/50 transition-all cursor-pointer"
									on:click={() => loadCase(caseItem)}
								>
									<div class="flex items-start justify-between mb-2">
										<div
											class="w-8 h-8 rounded-lg flex items-center justify-center text-lg"
											style="background: {getTopicById(caseItem.courseTopicId)?.color || '#666'}22"
										>
											{getTopicById(caseItem.courseTopicId)?.icon || '📄'}
										</div>
										<div class="flex items-center gap-1">
											<button
												on:click|stopPropagation={() => shareCase(caseItem)}
												class="text-xs px-1.5 py-0.5 rounded bg-surface-600 text-surface-300 hover:bg-surface-500"
												title="分享"
											>
												🔗
											</button>
											<button
												on:click|stopPropagation={() => deleteCase(caseItem.id)}
												class="text-xs px-1.5 py-0.5 rounded bg-surface-600 text-surface-300 hover:bg-error-600 hover:text-white"
												title="删除"
											>
												✕
											</button>
										</div>
									</div>

									<h4 class="font-semibold text-surface-100 text-sm truncate">
										{caseItem.name}
									</h4>

									{#if caseItem.description}
										<p class="text-xs text-surface-400 mt-1 line-clamp-2">
											{caseItem.description}
										</p>
									{/if}

									<div class="flex items-center gap-3 mt-2 text-xs">
										<span class="text-surface-400">
											作者: {caseItem.author}
										</span>
										<span
											class="px-1.5 py-0.5 rounded"
											style="background: {getQualityColor(computeImagingQualityScore(caseItem.params))}22; color: {getQualityColor(computeImagingQualityScore(caseItem.params))}"
										>
											{(computeImagingQualityScore(caseItem.params) * 100).toFixed(0)}% 质量
										</span>
									</div>

									<div class="mt-2 text-[10px] text-surface-500">
										孔: {caseItem.params.apertureSize.toFixed(2)} | 距: {caseItem.params.objectDistance.toFixed(1)} | 箱: {caseItem.params.boxLength.toFixed(1)}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

{#if showSaveDialog}
	<div
		class="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4"
		on:click={() => (showSaveDialog = false)}
	>
		<div
			class="bg-surface-800 rounded-lg p-5 w-96 border border-surface-700"
			on:click|stopPropagation
		>
			<h3 class="text-lg font-bold text-surface-100 mb-4">💾 保存为案例</h3>

			<div class="space-y-3">
				<div>
					<label class="block text-xs text-surface-300 mb-1">案例名称</label>
					<input
						type="text"
						bind:value={caseName}
						class="w-full px-3 py-2 rounded bg-surface-700 text-surface-100 text-sm border border-surface-600 focus:border-primary-500 focus:outline-none"
					/>
				</div>

				<div>
					<label class="block text-xs text-surface-300 mb-1">所属主题</label>
					<select
						bind:value={selectedTopicId}
						class="w-full px-3 py-2 rounded bg-surface-700 text-surface-100 text-sm border border-surface-600 focus:border-primary-500 focus:outline-none"
					>
						{#each topics as topic}
							<option value={topic.id}>
								{topic.icon} {topic.name}
							</option>
						{/each}
					</select>
				</div>

				<div>
					<label class="block text-xs text-surface-300 mb-1">作者</label>
					<input
						type="text"
						bind:value={caseAuthor}
						class="w-full px-3 py-2 rounded bg-surface-700 text-surface-100 text-sm border border-surface-600 focus:border-primary-500 focus:outline-none"
					/>
				</div>

				<div>
					<label class="block text-xs text-surface-300 mb-1">描述（可选）</label>
					<textarea
						bind:value={caseDescription}
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
					on:click={saveCase}
					class="flex-1 px-4 py-2 rounded bg-primary-500 text-white hover:bg-primary-400 transition-colors text-sm"
				>
					保存
				</button>
			</div>
		</div>
	</div>
{/if}

{#if showShareInfo && sharedCase}
	<div
		class="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4"
		on:click={() => (showShareInfo = false)}
	>
		<div
			class="bg-surface-800 rounded-lg p-5 w-full max-w-md border border-surface-700"
			on:click|stopPropagation
		>
			<h3 class="text-lg font-bold text-surface-100 mb-3">🔗 分享案例</h3>
			<p class="text-xs text-surface-400 mb-3">
				已复制到剪贴板。将以下 JSON 数据发送给他人，他们可以通过"导入案例"功能加载。
			</p>
			<textarea
				readonly
				class="w-full h-40 px-3 py-2 rounded bg-surface-900 text-surface-300 text-xs border border-surface-600 font-mono resize-none"
				value={JSON.stringify(sharedCase, null, 2)}
			/>
			<div class="flex gap-2 mt-4">
				<button
					on:click={() => (showShareInfo = false)}
					class="flex-1 px-4 py-2 rounded bg-surface-700 text-surface-200 hover:bg-surface-600 transition-colors text-sm"
				>
					关闭
				</button>
				<button
					on:click={() => {
						if (navigator.clipboard) {
							navigator.clipboard.writeText(JSON.stringify(sharedCase, null, 2));
						}
					}}
					class="flex-1 px-4 py-2 rounded bg-primary-500 text-white hover:bg-primary-400 transition-colors text-sm"
				>
					重新复制
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.case-modal {
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

	.case-card:hover {
		transform: translateY(-2px);
	}

	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
