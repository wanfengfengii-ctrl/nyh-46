<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { get } from 'svelte/store';
	import {
		createAssignment,
		createDefaultRubric,
		DEFAULT_COURSE_TOPICS,
		generateId,
		type Assignment,
		type RubricCriterion,
		type User,
		type CameraParams
	} from '$lib/cameraObscura';
	import {
		currentUser,
		activeRoomId,
		activeRoom,
		activeRoomAssignments,
		activeRoomSubmissions,
		addAssignment,
		sendSync,
		pushNotification
	} from '$lib/stores';

	export let params: CameraParams;
	export let open = false;
	export let onOpenSubmission: ((assignmentId: string) => void) | undefined;

	const dispatch = createEventDispatcher<{
		openSubmission: { assignmentId: string };
	}>();

	let showCreateForm = false;
	let expandedAssignmentId: string | null = null;
	let formStep: 'basic' | 'rubric' = 'basic';

	let newTitle = '';
	let newDescription = '';
	let newCourseTopicId: string | null = 'basics';
	let newDueDate = '';
	let newHintLevel: 'none' | 'low' | 'medium' | 'high' = 'medium';
	let needRecording = true;
	let needConclusion = true;
	let needKeyframes = 3;
	let minQualityScore = 0.5;
	let rubric: RubricCriterion[] = [];
	let useCurrentParams = false;

	$: user = get(currentUser);
	$: isTeacher = user?.role === 'teacher';
	$: roomId = get(activeRoomId);
	$: room = get(activeRoom);
	$: assignments = get(activeRoomAssignments);
	$: submissions = get(activeRoomSubmissions);

	$: totalRubricScore = rubric.reduce((s, r) => s + r.maxScore, 0);
	$: totalRubricWeight = rubric.reduce((s, r) => s + r.weight, 0);

	function openManager() {
		open = true;
		showCreateForm = false;
		expandedAssignmentId = null;
	}

	function closeManager() {
		open = false;
		showCreateForm = false;
		resetForm();
	}

	function resetForm() {
		newTitle = '';
		newDescription = '';
		newCourseTopicId = 'basics';
		newDueDate = '';
		newHintLevel = 'medium';
		needRecording = true;
		needConclusion = true;
		needKeyframes = 3;
		minQualityScore = 0.5;
		rubric = [];
		useCurrentParams = false;
		formStep = 'basic';
	}

	function startCreateAssignment() {
		resetForm();
		rubric = createDefaultRubric();
		showCreateForm = true;
		formStep = 'basic';
	}

	function cancelCreate() {
		showCreateForm = false;
		resetForm();
	}

	function addRubricCriterion() {
		rubric = [
			...rubric,
			{
				id: generateId(),
				name: '新评分项',
				description: '',
				maxScore: 10,
				weight: 0.1
			}
		];
		normalizeWeights();
	}

	function removeRubricCriterion(id: string) {
		rubric = rubric.filter((r) => r.id !== id);
		normalizeWeights();
	}

	function updateRubricCriterion(id: string, patch: Partial<RubricCriterion>) {
		rubric = rubric.map((r) => (r.id === id ? { ...r, ...patch } : r));
	}

	function onRubricNameInput(e: Event, id: string) {
		updateRubricCriterion(id, { name: (e.target as HTMLInputElement).value });
	}

	function onRubricDescInput(e: Event, id: string) {
		updateRubricCriterion(id, { description: (e.target as HTMLInputElement).value });
	}

	function onRubricMaxScoreInput(e: Event, id: string) {
		updateRubricCriterion(id, {
			maxScore: Math.max(0, parseFloat((e.target as HTMLInputElement).value) || 0)
		});
	}

	function onRubricWeightInput(e: Event, id: string) {
		updateRubricCriterion(id, {
			weight: Math.max(0, Math.min(1, parseFloat((e.target as HTMLInputElement).value) || 0))
		});
	}

	function normalizeWeights() {
		if (rubric.length === 0) return;
		const total = rubric.reduce((s, r) => s + r.weight, 0);
		if (total === 0) return;
		rubric = rubric.map((r) => ({
			...r,
			weight: Math.round((r.weight / total) * 100) / 100
		}));
	}

	function resetRubricToDefault() {
		rubric = createDefaultRubric();
	}

	function goToRubricStep() {
		if (!newTitle.trim()) {
			pushNotification('warning', '请输入任务标题');
			return;
		}
		formStep = 'rubric';
	}

	function goToBasicStep() {
		formStep = 'basic';
	}

	function publishAssignment() {
		if (!roomId || !user) {
			pushNotification('error', '房间或用户信息错误');
			return;
		}
		if (!newTitle.trim()) {
			pushNotification('warning', '请输入任务标题');
			return;
		}
		if (rubric.length === 0) {
			pushNotification('warning', '请至少添加一个评分标准');
			return;
		}

		normalizeWeights();

		const dueDateTimestamp = newDueDate ? new Date(newDueDate).getTime() : undefined;

		const assignment = createAssignment(newTitle.trim(), roomId, user.id, {
			description: newDescription.trim(),
			courseTopicId: newCourseTopicId,
			dueDate: dueDateTimestamp,
			rubric: rubric.map((r) => ({ ...r })),
			totalScore: totalRubricScore,
			requirements: {
				needRecording,
				needConclusion,
				needKeyframes,
				minQualityScore
			},
			initialParams: useCurrentParams ? { ...params } : null,
			hintLevel: newHintLevel
		});

		addAssignment(assignment);
		sendSync('assignment_publish', { assignmentId: assignment.id, assignment });
		pushNotification('success', `任务「${assignment.title}」已发布`);

		showCreateForm = false;
		resetForm();
	}

	function toggleExpand(assignmentId: string) {
		expandedAssignmentId = expandedAssignmentId === assignmentId ? null : assignmentId;
	}

	function handleOpenSubmission(assignmentId: string) {
		if (onOpenSubmission) {
			onOpenSubmission(assignmentId);
		}
		dispatch('openSubmission', { assignmentId });
	}

	function getAssignmentStats(assignmentId: string) {
		const subs = submissions.filter((s) => s.assignmentId === assignmentId);
		const reviewed = subs.filter((s) => s.status === 'reviewed' || s.status === 'submitted');
		const avgScore =
			reviewed.length > 0
				? reviewed.reduce((s, sub) => s + sub.totalScore, 0) / reviewed.length
				: 0;
		return {
			submissionCount: subs.length,
			avgScore,
			reviewedCount: reviewed.length
		};
	}

	function getTopicById(id: string | null) {
		if (!id) return null;
		return DEFAULT_COURSE_TOPICS.find((t) => t.id === id) || null;
	}

	function formatDate(ts: number) {
		return new Date(ts).toLocaleString('zh-CN', {
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function getHintLevelLabel(level: string) {
		switch (level) {
			case 'none':
				return '无提示';
			case 'low':
				return '少量提示';
			case 'medium':
				return '中等提示';
			case 'high':
				return '详细提示';
			default:
				return level;
		}
	}

	function getScoreColor(score: number, maxScore: number) {
		const ratio = maxScore > 0 ? score / maxScore : 0;
		if (ratio >= 0.8) return '#81c784';
		if (ratio >= 0.6) return '#ffb74d';
		return '#f06292';
	}

	function isOverdue(dueDate?: number) {
		if (!dueDate) return false;
		return Date.now() > dueDate;
	}

	function getRequirementsSummary(a: Assignment): string[] {
		const items: string[] = [];
		if (a.requirements.needRecording) items.push('需记录');
		if (a.requirements.needConclusion) items.push('需结论');
		if (a.requirements.needKeyframes > 0) items.push(`${a.requirements.needKeyframes}关键帧`);
		if (a.requirements.minQualityScore > 0)
			items.push(`质量≥${Math.round(a.requirements.minQualityScore * 100)}%`);
		return items;
	}
</script>

<button
	on:click={openManager}
	class="px-3 py-1.5 text-xs rounded-lg bg-surface-700 text-surface-200 hover:bg-surface-600 transition-colors flex items-center gap-1.5"
	title="任务管理"
>
	📋 任务
	{#if assignments.length > 0}
		<span class="bg-primary-500/30 text-primary-300 px-1.5 py-0.5 rounded text-[10px]">
			{assignments.length}
		</span>
	{/if}
</button>

{#if open}
	<div
		class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
		on:click={closeManager}
	>
		<div
			class="bg-surface-800 rounded-xl border border-surface-700 w-full max-w-5xl max-h-[88vh] flex flex-col overflow-hidden"
			on:click|stopPropagation
		>
			<div class="p-4 border-b border-surface-700 flex items-center justify-between flex-shrink-0">
				<div>
					<h2 class="text-xl font-bold text-surface-100 flex items-center gap-2">
						📋 任务管理
					</h2>
					<p class="text-xs text-surface-400 mt-0.5">
						{isTeacher ? '创建和管理课堂实验任务' : '查看任务要求并提交作业'}
					</p>
				</div>
				<div class="flex items-center gap-2">
					{#if isTeacher}
						<button
							on:click={startCreateAssignment}
							class="px-3 py-1.5 text-xs rounded bg-primary-500 text-white hover:bg-primary-400 transition-colors flex items-center gap-1"
							disabled={showCreateForm}
						>
							＋ 创建任务
						</button>
					{/if}
					<button
						on:click={closeManager}
						class="text-surface-400 hover:text-surface-200 text-xl ml-2 w-8 h-8 flex items-center justify-center rounded hover:bg-surface-700"
					>
						✕
					</button>
				</div>
			</div>

			<div class="flex-1 overflow-hidden flex">
				<div class="flex-1 overflow-y-auto p-4">
					{#if showCreateForm && isTeacher}
						<div class="space-y-4 animate-fadeIn">
							<div class="flex items-center gap-2 mb-4">
								<button
									on:click={cancelCreate}
									class="text-surface-400 hover:text-surface-200 text-sm flex items-center gap-1"
								>
									← 返回列表
								</button>
								<span class="text-surface-600">|</span>
								<span class="text-sm text-surface-300">
									{formStep === 'basic' ? '① 基本信息' : '② 评分标准'}
								</span>
							</div>

							{#if formStep === 'basic'}
								<div class="space-y-4">
									<div class="grid grid-cols-2 gap-4">
										<div class="col-span-2">
											<label class="block text-xs text-surface-300 mb-1.5 font-medium">
												任务标题 <span class="text-error-400">*</span>
											</label>
											<input
												type="text"
												bind:value={newTitle}
												placeholder="例如：探究孔径大小对成像质量的影响"
												class="w-full px-3 py-2.5 rounded-lg bg-surface-700 text-surface-100 text-sm border border-surface-600 focus:border-primary-500 focus:outline-none transition-colors"
											/>
										</div>

										<div class="col-span-2">
											<label class="block text-xs text-surface-300 mb-1.5 font-medium">
												任务描述
											</label>
											<textarea
												bind:value={newDescription}
												rows="3"
												placeholder="详细描述实验目的、要求和步骤..."
												class="w-full px-3 py-2.5 rounded-lg bg-surface-700 text-surface-100 text-sm border border-surface-600 focus:border-primary-500 focus:outline-none resize-none transition-colors"
											/>
										</div>

										<div>
											<label class="block text-xs text-surface-300 mb-1.5 font-medium">
												知识点分类
											</label>
											<select
												bind:value={newCourseTopicId}
												class="w-full px-3 py-2.5 rounded-lg bg-surface-700 text-surface-100 text-sm border border-surface-600 focus:border-primary-500 focus:outline-none transition-colors"
											>
												{#each DEFAULT_COURSE_TOPICS as topic}
													<option value={topic.id}>
														{topic.icon} {topic.name}
													</option>
												{/each}
											</select>
										</div>

										<div>
											<label class="block text-xs text-surface-300 mb-1.5 font-medium">
												截止日期
											</label>
											<input
												type="datetime-local"
												bind:value={newDueDate}
												class="w-full px-3 py-2.5 rounded-lg bg-surface-700 text-surface-100 text-sm border border-surface-600 focus:border-primary-500 focus:outline-none transition-colors"
											/>
										</div>

										<div>
											<label class="block text-xs text-surface-300 mb-1.5 font-medium">
												提示级别
											</label>
											<select
												bind:value={newHintLevel}
												class="w-full px-3 py-2.5 rounded-lg bg-surface-700 text-surface-100 text-sm border border-surface-600 focus:border-primary-500 focus:outline-none transition-colors"
											>
												<option value="none">🔒 无提示</option>
												<option value="low">💡 少量提示</option>
												<option value="medium">📝 中等提示</option>
												<option value="high">📚 详细提示</option>
											</select>
										</div>

										<div>
											<label class="block text-xs text-surface-300 mb-1.5 font-medium">
												初始参数
											</label>
											<div class="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-surface-700 border border-surface-600 h-[38px]">
												<input
													type="checkbox"
													id="useCurrentParams"
													bind:checked={useCurrentParams}
													class="w-4 h-4 rounded border-surface-500 bg-surface-600 text-primary-500 focus:ring-primary-500"
												/>
												<label for="useCurrentParams" class="text-sm text-surface-200 cursor-pointer">
													使用当前参数作为起始值
												</label>
											</div>
										</div>
									</div>

									<div class="p-4 rounded-lg bg-surface-700/50 border border-surface-600">
										<h4 class="text-sm font-semibold text-surface-100 mb-3 flex items-center gap-2">
											⚙️ 任务要求
										</h4>
										<div class="grid grid-cols-2 gap-4">
											<div class="flex items-center gap-2">
												<input
													type="checkbox"
													id="needRecording"
													bind:checked={needRecording}
													class="w-4 h-4 rounded border-surface-500 bg-surface-600 text-primary-500 focus:ring-primary-500"
												/>
												<label for="needRecording" class="text-sm text-surface-200 cursor-pointer">
													需要实验记录
												</label>
											</div>

											<div class="flex items-center gap-2">
												<input
													type="checkbox"
													id="needConclusion"
													bind:checked={needConclusion}
													class="w-4 h-4 rounded border-surface-500 bg-surface-600 text-primary-500 focus:ring-primary-500"
												/>
												<label for="needConclusion" class="text-sm text-surface-200 cursor-pointer">
													需要实验结论
												</label>
											</div>

											<div>
												<label class="block text-xs text-surface-300 mb-1">
													关键帧数量
												</label>
												<div class="flex items-center gap-2">
													<input
														type="range"
														bind:value={needKeyframes}
														min="0"
														max="10"
														step="1"
														class="flex-1 h-2 bg-surface-600 rounded-lg appearance-none cursor-pointer accent-primary-500"
													/>
													<span class="text-sm text-surface-100 w-8 text-right font-mono">
														{needKeyframes}
													</span>
												</div>
											</div>

											<div>
												<label class="block text-xs text-surface-300 mb-1">
													最低质量分
												</label>
												<div class="flex items-center gap-2">
													<input
														type="range"
														bind:value={minQualityScore}
														min="0"
														max="1"
														step="0.05"
														class="flex-1 h-2 bg-surface-600 rounded-lg appearance-none cursor-pointer accent-primary-500"
													/>
													<span class="text-sm text-surface-100 w-12 text-right font-mono">
														{Math.round(minQualityScore * 100)}%
													</span>
												</div>
											</div>
										</div>
									</div>

									<div class="flex justify-end gap-2 pt-2">
										<button
											on:click={cancelCreate}
											class="px-4 py-2 rounded-lg bg-surface-700 text-surface-200 hover:bg-surface-600 transition-colors text-sm"
										>
											取消
										</button>
										<button
											on:click={goToRubricStep}
											class="px-4 py-2 rounded-lg bg-primary-500 text-white hover:bg-primary-400 transition-colors text-sm"
										>
											下一步：设置评分 →
										</button>
									</div>
								</div>
							{:else}
								<div class="space-y-4">
									<div class="flex items-center justify-between">
										<h4 class="text-sm font-semibold text-surface-100 flex items-center gap-2">
											📊 评分标准 Rubric
										</h4>
										<button
											on:click={resetRubricToDefault}
											class="text-xs px-2.5 py-1 rounded bg-surface-700 text-surface-300 hover:bg-surface-600 transition-colors"
										>
											↺ 恢复默认
										</button>
									</div>

									<div class="space-y-3">
										{#each rubric as criterion, idx}
											<div
												class="p-3 rounded-lg bg-surface-700/50 border border-surface-600 space-y-2"
											>
												<div class="flex items-center gap-2">
													<span class="text-xs text-surface-400 w-5">#{idx + 1}</span>
													<input
													type="text"
													value={criterion.name}
													on:input={(e) => onRubricNameInput(e, criterion.id)}
													class="flex-1 px-2.5 py-1.5 rounded bg-surface-600 text-surface-100 text-sm border border-surface-500 focus:border-primary-500 focus:outline-none"
													placeholder="评分项名称"
												/>
													{#if rubric.length > 1}
														<button
															on:click={() => removeRubricCriterion(criterion.id)}
															class="text-surface-400 hover:text-error-400 text-lg w-7 h-7 flex items-center justify-center rounded hover:bg-surface-600 transition-colors"
															title="删除此项"
														>
															✕
														</button>
													{/if}
												</div>

												<input
													type="text"
													value={criterion.description}
													on:input={(e) => onRubricDescInput(e, criterion.id)}
													class="w-full px-2.5 py-1.5 rounded bg-surface-600 text-surface-200 text-xs border border-surface-500 focus:border-primary-500 focus:outline-none"
													placeholder="评分项描述（可选）"
												/>

												<div class="flex items-center gap-3">
													<div class="flex items-center gap-1.5">
														<span class="text-xs text-surface-400">满分</span>
														<input
														type="number"
														value={criterion.maxScore}
														on:input={(e) => onRubricMaxScoreInput(e, criterion.id)}
														min="0"
														class="w-16 px-2 py-1 rounded bg-surface-600 text-surface-100 text-sm border border-surface-500 focus:border-primary-500 focus:outline-none text-center"
													/>
													</div>
													<div class="flex items-center gap-1.5">
														<span class="text-xs text-surface-400">权重</span>
														<input
														type="number"
														value={criterion.weight}
														on:input={(e) => onRubricWeightInput(e, criterion.id)}
														min="0"
														max="1"
														step="0.05"
														class="w-16 px-2 py-1 rounded bg-surface-600 text-surface-100 text-sm border border-surface-500 focus:border-primary-500 focus:outline-none text-center"
													/>
														<span class="text-xs text-surface-500">
															({Math.round(criterion.weight * 100)}%)
														</span>
													</div>
													<div class="flex-1" />
													<div class="h-1.5 bg-surface-600 rounded-full overflow-hidden w-24">
														<div
															class="h-full rounded-full transition-all"
															style="width: {criterion.weight * 100}%; background: {['#4fc3f7', '#81c784', '#ffb74d', '#f06292', '#ba68c8', '#4dd0e1'][idx % 6]}"
														/>
													</div>
												</div>
											</div>
										{/each}
									</div>

									<button
										on:click={addRubricCriterion}
										class="w-full py-2.5 rounded-lg border-2 border-dashed border-surface-600 text-surface-400 hover:border-primary-500/50 hover:text-primary-400 hover:bg-surface-700/30 transition-colors text-sm flex items-center justify-center gap-1.5"
									>
										＋ 添加评分项
									</button>

									<div class="p-3 rounded-lg bg-surface-700/30 border border-surface-600/50 flex items-center justify-between">
										<div class="flex items-center gap-6">
											<div class="text-sm">
												<span class="text-surface-400">总分：</span>
												<span class="text-surface-100 font-bold text-lg">
													{totalRubricScore}
												</span>
											</div>
											<div class="text-sm">
												<span class="text-surface-400">权重合计：</span>
												<span
													class="font-bold {Math.abs(totalRubricWeight - 1) < 0.01
														? 'text-success-400'
														: 'text-warning-400'}"
												>
													{Math.round(totalRubricWeight * 100)}%
												</span>
												{#if Math.abs(totalRubricWeight - 1) > 0.01}
													<span class="text-xs text-surface-500 ml-1">
														（建议 100%）
													</span>
												{/if}
											</div>
										</div>
										<button
											on:click={normalizeWeights}
											class="text-xs px-2.5 py-1 rounded bg-surface-600 text-surface-300 hover:bg-surface-500 transition-colors"
										>
											自动归一化
										</button>
									</div>

									<div class="flex justify-between gap-2 pt-2">
										<button
											on:click={goToBasicStep}
											class="px-4 py-2 rounded-lg bg-surface-700 text-surface-200 hover:bg-surface-600 transition-colors text-sm"
										>
											← 上一步
										</button>
										<div class="flex gap-2">
											<button
												on:click={cancelCreate}
												class="px-4 py-2 rounded-lg bg-surface-700 text-surface-200 hover:bg-surface-600 transition-colors text-sm"
											>
												取消
											</button>
											<button
												on:click={publishAssignment}
												class="px-5 py-2 rounded-lg bg-gradient-to-r from-primary-500 to-primary-600 text-white hover:from-primary-400 hover:to-primary-500 transition-colors text-sm font-medium shadow-lg shadow-primary-500/20"
											>
												🚀 发布任务
											</button>
										</div>
									</div>
								</div>
							{/if}
						</div>
					{:else}
						{#if assignments.length === 0}
							<div class="text-center py-20">
								<span class="text-5xl mb-4 block">📭</span>
								<p class="text-surface-400">
									{isTeacher ? '暂无任务，点击右上角创建第一个任务' : '暂无待完成的任务'}
								</p>
								{#if isTeacher}
									<button
										on:click={startCreateAssignment}
										class="mt-4 px-4 py-2 rounded-lg bg-primary-500 text-white hover:bg-primary-400 transition-colors text-sm"
									>
										＋ 创建任务
									</button>
								{/if}
							</div>
						{:else}
							<div class="space-y-3">
								{#each [...assignments].sort((a, b) => b.createdAt - a.createdAt) as assignment}
									{@const stats = getAssignmentStats(assignment.id)}
									{@const isExpanded = expandedAssignmentId === assignment.id}
									{@const topic = getTopicById(assignment.courseTopicId)}
									{@const reqSummary = getRequirementsSummary(assignment)}
									{@const overdue = isOverdue(assignment.dueDate)}
									<div
										class="rounded-xl border transition-all duration-200 overflow-hidden {isExpanded
											? 'border-primary-500/50 bg-surface-700/30'
											: 'border-surface-600 bg-surface-700/50 hover:border-surface-500'}"
									>
										<div
											class="p-4 cursor-pointer"
											on:click={() => toggleExpand(assignment.id)}
										>
											<div class="flex items-start justify-between gap-4">
												<div class="flex items-start gap-3 flex-1 min-w-0">
													<div
														class="w-10 h-10 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
														style="background: {topic?.color || '#666'}22"
													>
														{topic?.icon || '📄'}
													</div>
													<div class="flex-1 min-w-0">
														<div class="flex items-center gap-2 flex-wrap">
															<h4 class="font-semibold text-surface-100 truncate">
																{assignment.title}
															</h4>
															{#if assignment.dueDate}
																<span
																	class="text-[10px] px-1.5 py-0.5 rounded {overdue
																		? 'bg-error-500/20 text-error-400'
																		: 'bg-surface-600 text-surface-300'}"
																>
																	{overdue ? '⏰ 已截止' : '📅 ' + formatDate(assignment.dueDate)}
																</span>
															{/if}
															{#if topic}
																<span
																	class="text-[10px] px-1.5 py-0.5 rounded"
																	style="background: {topic.color}22; color: {topic.color}"
																>
																	{topic.name}
																</span>
															{/if}
														</div>

														{#if assignment.description}
															<p class="text-xs text-surface-400 mt-1 line-clamp-1">
																{assignment.description}
															</p>
														{/if}

														<div class="flex items-center gap-3 mt-2 text-xs">
															<span class="text-surface-500">
																创建于 {formatDate(assignment.createdAt)}
															</span>
															<span class="text-surface-600">·</span>
															<span class="text-surface-400">
																{getHintLevelLabel(assignment.hintLevel)}
															</span>
															{#if reqSummary.length > 0}
																<span class="text-surface-600">·</span>
																<div class="flex items-center gap-1 flex-wrap">
																	{#each reqSummary as req}
																		<span class="text-[10px] px-1.5 py-0.5 rounded bg-surface-600/70 text-surface-300">
																			{req}
																		</span>
																	{/each}
																</div>
															{/if}
														</div>
													</div>
												</div>

												<div class="flex items-center gap-3 flex-shrink-0">
													<div class="text-right">
														<div class="text-xs text-surface-400">提交数</div>
														<div class="text-lg font-bold text-surface-100">
															{stats.submissionCount}
														</div>
													</div>
													<div class="text-right">
														<div class="text-xs text-surface-400">平均分</div>
														<div
															class="text-lg font-bold"
															style="color: {getScoreColor(stats.avgScore, assignment.totalScore)}"
														>
															{stats.reviewedCount > 0
																? Math.round(stats.avgScore)
																: '-'}
															<span class="text-xs text-surface-500">
																/{assignment.totalScore}
															</span>
														</div>
													</div>
													<button
														class="text-surface-400 hover:text-surface-200 w-8 h-8 flex items-center justify-center rounded hover:bg-surface-600 transition-transform {isExpanded
															? 'rotate-180'
															: ''}"
													>
														▼
													</button>
												</div>
											</div>
										</div>

										{#if isExpanded}
											<div class="border-t border-surface-600 p-4 space-y-4 animate-slideDown">
												{#if assignment.description}
													<div class="p-3 rounded-lg bg-surface-800/50 border border-surface-600/50">
														<h5 class="text-xs font-semibold text-surface-300 mb-2 flex items-center gap-1.5">
															📝 任务描述
														</h5>
														<p class="text-sm text-surface-200 whitespace-pre-wrap">
															{assignment.description}
														</p>
													</div>
												{/if}

												<div class="grid grid-cols-2 gap-4">
													<div class="p-3 rounded-lg bg-surface-800/50 border border-surface-600/50">
														<h5 class="text-xs font-semibold text-surface-300 mb-2 flex items-center gap-1.5">
															⚙️ 详细要求
														</h5>
														<div class="space-y-1.5 text-xs">
															<div class="flex justify-between">
																<span class="text-surface-400">实验记录</span>
																<span class={assignment.requirements.needRecording
																	? 'text-success-400'
																	: 'text-surface-500'}>
																	{assignment.requirements.needRecording
																		? '✓ 需要'
																		: '○ 不需要'}
																</span>
															</div>
															<div class="flex justify-between">
																<span class="text-surface-400">实验结论</span>
																<span class={assignment.requirements.needConclusion
																	? 'text-success-400'
																	: 'text-surface-500'}>
																	{assignment.requirements.needConclusion
																		? '✓ 需要'
																		: '○ 不需要'}
																</span>
															</div>
															<div class="flex justify-between">
																<span class="text-surface-400">关键帧数量</span>
																<span class="text-surface-200">
																	{assignment.requirements.needKeyframes} 个
																</span>
															</div>
															<div class="flex justify-between">
																<span class="text-surface-400">最低质量分</span>
																<span class="text-surface-200">
																	{Math.round(
																		assignment.requirements.minQualityScore *
																			100
																	)}%
																</span>
															</div>
															<div class="flex justify-between">
																<span class="text-surface-400">提示级别</span>
																<span class="text-surface-200">
																	{getHintLevelLabel(assignment.hintLevel)}
																</span>
															</div>
															{#if assignment.initialParams}
																<div class="flex justify-between">
																	<span class="text-surface-400">初始参数</span>
																	<span class="text-primary-400">已预设</span>
																</div>
															{/if}
														</div>
													</div>

													<div class="p-3 rounded-lg bg-surface-800/50 border border-surface-600/50">
														<h5 class="text-xs font-semibold text-surface-300 mb-2 flex items-center gap-1.5">
															📊 评分标准（满分 {assignment.totalScore}）
														</h5>
														<div class="space-y-2">
															{#each assignment.rubric as criterion, i}
																<div class="flex items-center gap-2">
																	<div
																		class="w-1.5 h-6 rounded-full flex-shrink-0"
																		style="background: {['#4fc3f7', '#81c784', '#ffb74d', '#f06292', '#ba68c8', '#4dd0e1'][i % 6]}"
																	/>
																	<div class="flex-1 min-w-0">
																		<div class="flex justify-between items-baseline">
																			<span class="text-xs text-surface-200 truncate">
																				{criterion.name}
																			</span>
																			<span class="text-xs text-surface-400 flex-shrink-0 ml-2">
																				{criterion.maxScore}分
																				<span class="text-surface-600">
																					 ({Math.round(criterion.weight * 100)}%)
																				</span>
																			</span>
																		</div>
																		{#if criterion.description}
																			<p class="text-[10px] text-surface-500 truncate">
																				{criterion.description}
																			</p>
																		{/if}
																	</div>
																</div>
															{/each}
														</div>
													</div>
												</div>

												{#if assignment.initialParams}
													<div class="p-3 rounded-lg bg-surface-800/50 border border-surface-600/50">
														<h5 class="text-xs font-semibold text-surface-300 mb-2 flex items-center gap-1.5">
															🎯 预设初始参数
														</h5>
														<div class="grid grid-cols-5 gap-3 text-xs">
															<div>
																<span class="text-surface-500 block">暗箱长度</span>
																<span class="text-surface-100 font-mono">
																	{assignment.initialParams.boxLength.toFixed(1)}
																</span>
															</div>
															<div>
																<span class="text-surface-500 block">孔径大小</span>
																<span class="text-surface-100 font-mono">
																	{assignment.initialParams.apertureSize.toFixed(2)}
																</span>
															</div>
															<div>
																<span class="text-surface-500 block">物体距离</span>
																<span class="text-surface-100 font-mono">
																	{assignment.initialParams.objectDistance.toFixed(1)}
																</span>
															</div>
															<div>
																<span class="text-surface-500 block">物体高度</span>
																<span class="text-surface-100 font-mono">
																	{assignment.initialParams.objectHeight.toFixed(1)}
																</span>
															</div>
															<div>
																<span class="text-surface-500 block">光线强度</span>
																<span class="text-surface-100 font-mono">
																	{assignment.initialParams.lightIntensity.toFixed(1)}
																</span>
															</div>
														</div>
													</div>
												{/if}

												<div class="flex items-center justify-between pt-1">
													<div class="text-xs text-surface-500">
														任务 ID: <span class="font-mono">{assignment.id.slice(0, 12)}...</span>
													</div>
													<button
														on:click={() => handleOpenSubmission(assignment.id)}
														class="px-4 py-2 rounded-lg bg-primary-500 text-white hover:bg-primary-400 transition-colors text-sm font-medium flex items-center gap-1.5 shadow-lg shadow-primary-500/20"
													>
														{isTeacher ? '📋 查看提交' : '📝 前往提交'}
														→
													</button>
												</div>
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.animate-fadeIn {
		animation: fadeIn 0.2s ease-out;
	}

	.animate-slideDown {
		animation: slideDown 0.25s ease-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			max-height: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			max-height: 2000px;
			transform: translateY(0);
		}
	}

	.line-clamp-1 {
		display: -webkit-box;
		-webkit-line-clamp: 1;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
