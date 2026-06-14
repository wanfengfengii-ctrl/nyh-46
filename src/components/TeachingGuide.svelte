<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import type { CameraParams, TeachingCourse, TeachingStep } from '$lib/cameraObscura';
	import { TEACHING_COURSES, DEFAULT_PARAMS } from '$lib/cameraObscura';

	export let params: CameraParams;

	const dispatch = createEventDispatcher<{
		applyParams: { params: CameraParams };
	}>();

	let isGuideOpen = false;
	let currentCourse: TeachingCourse | null = null;
	let currentStepIndex = 0;
	let showHint = false;
	let showExplanation = false;
	let completedCourses: Set<string> = new Set();
	let completedSteps: Set<string> = new Set();

	$: currentStep = currentCourse?.steps[currentStepIndex] || null;
	$: isStepCompleted = currentStep ? currentStep.checkCondition(params) : false;
	$: progress = currentCourse
		? ((currentStepIndex + (isStepCompleted ? 1 : 0)) / currentCourse.steps.length) * 100
		: 0;

	function openGuide() {
		isGuideOpen = true;
	}

	function closeGuide() {
		isGuideOpen = false;
		currentCourse = null;
		currentStepIndex = 0;
		showHint = false;
		showExplanation = false;
	}

	function selectCourse(course: TeachingCourse) {
		currentCourse = course;
		currentStepIndex = 0;
		showHint = false;
		showExplanation = false;

		if (course.steps[0]?.targetParams) {
			const targetParams = { ...DEFAULT_PARAMS, ...course.steps[0].targetParams };
			dispatch('applyParams', { params: targetParams });
		}
	}

	function nextStep() {
		if (!currentCourse) return;
		if (currentStepIndex < currentCourse.steps.length - 1) {
			if (currentStep) {
				completedSteps.add(currentStep.id);
			}
			currentStepIndex++;
			showHint = false;
			showExplanation = false;

			const nextStep = currentCourse.steps[currentStepIndex];
			if (nextStep?.targetParams && Object.keys(nextStep.targetParams).length > 0) {
			}
		} else {
			completedCourses.add(currentCourse.id);
			closeGuide();
		}
	}

	function prevStep() {
		if (!currentCourse) return;
		if (currentStepIndex > 0) {
			currentStepIndex--;
			showHint = false;
			showExplanation = false;
		}
	}

	function applyTargetParams() {
		if (!currentStep?.targetParams) return;
		const targetParams = { ...params, ...currentStep.targetParams };
		dispatch('applyParams', { params: targetParams });
	}

	function getDifficultyLabel(difficulty: string): string {
		switch (difficulty) {
			case 'beginner':
				return '入门';
			case 'intermediate':
				return '进阶';
			case 'advanced':
				return '高级';
			default:
				return difficulty;
		}
	}

	function getDifficultyColor(difficulty: string): string {
		switch (difficulty) {
			case 'beginner':
				return '#81c784';
			case 'intermediate':
				return '#ffb74d';
			case 'advanced':
				return '#f06292';
			default:
				return '#888';
		}
	}

	onMount(() => {
		const saved = localStorage.getItem('cameraObscuraTeachingProgress');
		if (saved) {
			try {
				const data = JSON.parse(saved);
				completedCourses = new Set(data.completedCourses || []);
				completedSteps = new Set(data.completedSteps || []);
			} catch (e) {
				console.warn('无法加载学习进度');
			}
		}
	});

	$: if (completedCourses.size > 0 || completedSteps.size > 0) {
		try {
			localStorage.setItem(
				'cameraObscuraTeachingProgress',
				JSON.stringify({
					completedCourses: Array.from(completedCourses),
					completedSteps: Array.from(completedSteps)
				})
			);
		} catch (e) {
			// ignore
		}
	}
</script>

<button
	on:click={openGuide}
	class="teaching-guide-btn px-3 py-1.5 text-xs rounded-lg bg-purple-600 text-white hover:bg-purple-500 transition-colors flex items-center gap-1.5"
	title="教学引导"
>
	📚 教学引导
	{#if completedCourses.size > 0}
		<span class="bg-white/20 px-1.5 py-0.5 rounded text-[10px]">
			{completedCourses.size}/{TEACHING_COURSES.length}
		</span>
	{/if}
</button>

{#if isGuideOpen}
	<div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" on:click={closeGuide}>
		<div
			class="guide-modal bg-surface-800 rounded-xl border border-surface-700 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
			on:click|stopPropagation
		>
			{#if !currentCourse}
				<div class="p-5 border-b border-surface-700">
					<div class="flex items-center justify-between">
						<h2 class="text-xl font-bold text-surface-100 flex items-center gap-2">
							📚 教学课程
						</h2>
						<button
							on:click={closeGuide}
							class="text-surface-400 hover:text-surface-200 text-xl"
						>
							✕
						</button>
					</div>
					<p class="text-sm text-surface-400 mt-1">
						选择一门课程，通过步骤式引导学习小孔成像原理
					</p>
				</div>

				<div class="flex-1 overflow-y-auto p-5 space-y-3">
					{#each TEACHING_COURSES as course}
						<div
							class="course-card p-4 rounded-lg border-2 transition-all cursor-pointer hover:border-purple-500/50 {completedCourses.has(course.id)
								? 'border-purple-500 bg-purple-900/20'
								: 'border-surface-600 bg-surface-700/50'}"
							on:click={() => selectCourse(course)}
						>
							<div class="flex items-start gap-3">
								<span class="text-3xl">{course.icon}</span>
								<div class="flex-1">
									<div class="flex items-center gap-2">
										<h3 class="font-bold text-surface-100">{course.title}</h3>
										{#if completedCourses.has(course.id)}
											<span class="text-success-400 text-xs">✓ 已完成</span>
										{/if}
									</div>
									<p class="text-xs text-surface-400 mt-1">{course.description}</p>
									<div class="flex items-center gap-3 mt-2">
										<span
											class="text-[10px] px-1.5 py-0.5 rounded"
											style="background: {getDifficultyColor(course.difficulty)}22; color: {getDifficultyColor(course.difficulty)}"
										>
											{getDifficultyLabel(course.difficulty)}
										</span>
										<span class="text-[10px] text-surface-400">
											⏱ {course.estimatedTime} 分钟
										</span>
										<span class="text-[10px] text-surface-400">
											{course.steps.length} 个步骤
										</span>
									</div>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="p-5 border-b border-surface-700">
					<div class="flex items-center justify-between">
						<button
							on:click={() => (currentCourse = null)}
							class="text-surface-400 hover:text-surface-200 text-sm flex items-center gap-1"
						>
							← 返回课程列表
						</button>
						<button
							on:click={closeGuide}
							class="text-surface-400 hover:text-surface-200 text-xl"
						>
							✕
						</button>
					</div>
				</div>

				<div class="flex-1 overflow-y-auto p-5">
					<div class="flex items-center gap-2 mb-4">
						<span class="text-2xl">{currentCourse.icon}</span>
						<div>
							<h3 class="font-bold text-surface-100">{currentCourse.title}</h3>
							<div class="flex items-center gap-2 mt-1">
								<span class="text-xs text-surface-400">
									步骤 {currentStepIndex + 1} / {currentCourse.steps.length}
								</span>
								<div class="flex-1 h-1.5 bg-surface-700 rounded-full min-w-[100px]">
									<div
										class="h-full bg-purple-500 rounded-full transition-all"
										style="width: {progress}%"
									/>
								</div>
							</div>
						</div>
					</div>

					{#if currentStep}
						<div class="bg-surface-700/50 rounded-lg p-4 mb-4">
							<div class="flex items-center gap-2 mb-2">
								<span
									class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
									class:bg-success-500={isStepCompleted}
									class:bg-purple-600={!isStepCompleted}
									class:text-white={true}
								>
									{#if isStepCompleted}✓{:else}{currentStep.stepNumber}{/if}
								</span>
								<h4 class="font-semibold text-surface-100">{currentStep.title}</h4>
							</div>
							<p class="text-sm text-surface-300 leading-relaxed pl-8">
								{currentStep.description}
							</p>
						</div>

						{#if currentStep.targetParams && Object.keys(currentStep.targetParams).length > 0}
							<div class="mb-4">
								<button
									on:click={applyTargetParams}
									class="text-xs px-3 py-1.5 rounded bg-purple-600/30 text-purple-300 hover:bg-purple-600/50 transition-colors border border-purple-500/30"
								>
									🎯 应用目标参数
								</button>
							</div>
						{/if}

						<div class="space-y-3">
							<button
								on:click={() => (showHint = !showHint)}
								class="w-full text-left p-3 rounded-lg bg-warning-900/20 border border-warning-700/30 hover:bg-warning-900/30 transition-colors"
							>
								<div class="flex items-center gap-2">
									<span>💡</span>
									<span class="text-sm font-medium text-warning-300">
										提示 {showHint ? '▲' : '▼'}
									</span>
								</div>
								{#if showHint}
									<p class="text-sm text-warning-200 mt-2 pl-6">
										{currentStep.hint}
									</p>
								{/if}
							</button>

							<button
								on:click={() => (showExplanation = !showExplanation)}
								class="w-full text-left p-3 rounded-lg bg-primary-900/20 border border-primary-700/30 hover:bg-primary-900/30 transition-colors"
							>
								<div class="flex items-center gap-2">
									<span>📖</span>
									<span class="text-sm font-medium text-primary-300">
										原理讲解 {showExplanation ? '▲' : '▼'}
									</span>
								</div>
								{#if showExplanation}
									<p class="text-sm text-primary-200 mt-2 pl-6 leading-relaxed">
										{currentStep.explanation}
									</p>
								{/if}
							</button>
						</div>

						{#if isStepCompleted}
							<div class="mt-4 p-3 rounded-lg bg-success-900/30 border border-success-700/30">
								<div class="flex items-center gap-2">
									<span class="text-success-400">✓</span>
									<span class="text-sm text-success-300 font-medium">
										任务完成！
									</span>
								</div>
							</div>
						{/if}
					{/if}
				</div>

				<div class="p-4 border-t border-surface-700 flex items-center justify-between">
					<button
						on:click={prevStep}
						disabled={currentStepIndex === 0}
						class="px-4 py-2 rounded-lg bg-surface-700 text-surface-200 hover:bg-surface-600 transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
					>
						上一步
					</button>

					<span class="text-xs text-surface-400">
						{currentStepIndex + 1} / {currentCourse.steps.length}
					</span>

					<button
						on:click={nextStep}
						class="px-4 py-2 rounded-lg bg-purple-500 text-white hover:bg-purple-400 transition-colors text-sm"
					>
						{currentStepIndex === currentCourse.steps.length - 1 ? '完成课程' : '下一步'}
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.guide-modal {
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

	.course-card:hover {
		transform: translateY(-1px);
	}
</style>
