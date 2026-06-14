<script lang="ts">
	import { get } from 'svelte/store';
	import {
		calculateSubmissionAutoScore,
		getTotalScore,
		computeImagingQualityScore,
		type Assignment,
		type Submission,
		type User,
		type CameraParams,
		type ExperimentRecording,
		type ExperimentConclusion
	} from '$lib/cameraObscura';
	import {
		currentUser,
		activeRoomId,
		activeRoomAssignments,
		activeRoomSubmissions,
		submissions,
		getOrCreateSubmission,
		updateSubmission,
		submitSubmission,
		reviewSubmission,
		sendSync,
		pushNotification
	} from '$lib/stores';

	export let params: CameraParams;
	export let recording: ExperimentRecording | null = null;
	export let conclusion: ExperimentConclusion | null = null;
	export let assignmentId: string | null = null;
	export let open = false;
	export let onCompareVersions: ((submission: Submission) => void) | undefined = undefined;
	export let onOpenAnnotations: ((submission: Submission) => void) | undefined = undefined;

	type ViewMode = 'student' | 'teacher' | 'review';
	type TeacherView = 'list' | 'detail';

	let viewMode: ViewMode = 'student';
	let teacherView: TeacherView = 'list';
	let selectedAssignmentId: string | null = null;
	let selectedSubmission: Submission | null = null;
	let filterAssignmentId: string | null = null;
	let localConclusionText = '';
	let tempScores: Record<string, number> = {};
	let tempFeedback = '';

	$: user = get(currentUser);
	$: isTeacher = user?.role === 'teacher';
	$: assignments = get(activeRoomAssignments);
	$: allSubmissions = get(activeRoomSubmissions);

	$: if (assignmentId && assignments.length > 0) {
		selectedAssignmentId = assignmentId;
	}

	$: currentAssignment = assignments.find((a) => a.id === selectedAssignmentId) || null;

	$: currentSubmission = (() => {
		if (!selectedAssignmentId || !user || user.role !== 'student') return null;
		const rid = get(activeRoomId);
		if (!rid) return null;
		const sub = getOrCreateSubmission(selectedAssignmentId, rid, user);
		if (sub) {
			localConclusionText = sub.conclusionText || '';
		}
		return sub;
	})();

	$: previewScores = (() => {
		if (!currentAssignment || !currentSubmission) return {};
		const tempSub: Submission = {
			...currentSubmission,
			finalParams: currentSubmission.finalParams || params,
			recordingSnapshot: recording ? JSON.parse(JSON.stringify(recording)) : null
		};
		return calculateSubmissionAutoScore(tempSub, currentAssignment);
	})();

	$: previewTotal = getTotalScore(previewScores);

	$: filteredSubmissions = (() => {
		if (filterAssignmentId) {
			return allSubmissions.filter((s) => s.assignmentId === filterAssignmentId);
		}
		return allSubmissions;
	})();

	function openPanel() {
		open = true;
		viewMode = isTeacher ? 'teacher' : 'student';
		teacherView = 'list';
		if (assignmentId) {
			selectedAssignmentId = assignmentId;
		} else if (assignments.length > 0 && !selectedAssignmentId) {
			selectedAssignmentId = assignments[0].id;
		}
	}

	function closePanel() {
		open = false;
		selectedSubmission = null;
		teacherView = 'list';
	}

	function switchToTeacherView() {
		viewMode = 'teacher';
		teacherView = 'list';
	}

	function selectAssignment(id: string) {
		selectedAssignmentId = id;
	}

	function loadCurrentParams() {
		if (!currentSubmission) return;
		updateSubmission(currentSubmission.id, {
			finalParams: { ...params },
			recordingSnapshot: recording ? JSON.parse(JSON.stringify(recording)) : null,
			recordingId: recording?.id || null
		});
		sendSync('params_update', { submissionId: currentSubmission.id });
		pushNotification('success', '已同步当前参数和实验记录');
	}

	function saveConclusion() {
		if (!currentSubmission) return;
		updateSubmission(currentSubmission.id, {
			conclusionText: localConclusionText,
			conclusion: conclusion ? JSON.parse(JSON.stringify(conclusion)) : null
		});
		pushNotification('info', '结论已自动保存');
	}

	function handleSubmit() {
		if (!currentSubmission || !currentAssignment) return;
		if (!currentSubmission.finalParams) {
			pushNotification('warning', '请先点击"加载当前参数"同步参数');
			return;
		}
		const recSnap = currentSubmission.recordingSnapshot || recording || null;
		const fp = currentSubmission.finalParams;
		submitSubmission(currentSubmission.id, recSnap, fp);
		sendSync('submission_submit', { submissionId: currentSubmission.id });
	}

	function viewSubmissionDetail(sub: Submission) {
		selectedSubmission = sub;
		teacherView = 'detail';
		tempScores = { ...sub.scores };
		tempFeedback = sub.feedback || '';
	}

	function backToList() {
		selectedSubmission = null;
		teacherView = 'list';
	}

	function setCriterionScore(criterionId: string, value: number, maxScore: number) {
		const clamped = Math.max(0, Math.min(maxScore, Math.round(value)));
		tempScores[criterionId] = clamped;
	}

	function handleCriterionScoreInput(criterionId: string, maxScore: number, e: Event) {
		setCriterionScore(criterionId, Number((e.target as HTMLInputElement).value), maxScore);
	}

	function handleCriterionScoreRange(criterionId: string, e: Event) {
		tempScores[criterionId] = Number((e.target as HTMLInputElement).value);
	}

	function confirmReview() {
		if (!selectedSubmission || !user) return;
		reviewSubmission(selectedSubmission.id, tempScores, tempFeedback, user.id);
		sendSync('submission_review', { submissionId: selectedSubmission.id });
		pushNotification('success', '评分已确认');
		backToList();
	}

	function formatDate(ts?: number) {
		if (!ts) return '-';
		return new Date(ts).toLocaleString('zh-CN');
	}

	function statusLabel(status: string) {
		switch (status) {
			case 'draft':
				return '草稿';
			case 'submitted':
				return '已提交';
			case 'reviewed':
				return '已评分';
			case 'returned':
				return '已退回';
			default:
				return status;
		}
	}

	function statusClass(status: string) {
		switch (status) {
			case 'draft':
				return 'bg-surface-600 text-surface-300';
			case 'submitted':
				return 'bg-primary-600/30 text-primary-300 border border-primary-500/30';
			case 'reviewed':
				return 'bg-success-600/30 text-success-300 border border-success-500/30';
			case 'returned':
				return 'bg-error-600/30 text-error-300 border border-error-500/30';
			default:
				return 'bg-surface-600 text-surface-300';
		}
	}

	function scoreColor(score: number, max: number) {
		const pct = max > 0 ? score / max : 0;
		if (pct >= 0.85) return 'bg-success-500';
		if (pct >= 0.7) return 'bg-primary-500';
		if (pct >= 0.5) return 'bg-warning-500';
		return 'bg-error-500';
	}
</script>

<button
	on:click={openPanel}
	class="px-3 py-1.5 text-xs rounded-lg bg-surface-700 text-surface-200 hover:bg-surface-600 transition-colors flex items-center gap-1.5"
	title="任务提交与评分"
>
	📤 提交
</button>

{#if open}
	<div class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" on:click={closePanel}>
		<div
			class="submission-panel bg-surface-800 rounded-xl border border-surface-700 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
			on:click|stopPropagation
		>
			<div class="p-4 border-b border-surface-700 flex items-center justify-between">
				<div class="flex items-center gap-3">
					<h2 class="text-lg font-bold text-surface-100 flex items-center gap-2">
						{#if viewMode === 'student'}
							📝 任务提交
						{:else if teacherView === 'list'}
							📋 学生提交管理
						{:else}
							🔍 评分详情
						{/if}
					</h2>
					{#if isTeacher}
						<div class="flex gap-1 bg-surface-700 rounded-lg p-0.5">
							<button
								on:click={() => (viewMode = 'student')}
								class="px-2.5 py-1 text-xs rounded transition-colors"
								class:bg-surface-600={viewMode === 'student'}
								class:text-surface-400={viewMode !== 'student'}
							>
								学生视角
							</button>
							<button
								on:click={switchToTeacherView}
								class="px-2.5 py-1 text-xs rounded transition-colors"
								class:bg-surface-600={viewMode === 'teacher'}
								class:text-surface-400={viewMode !== 'teacher'}
							>
								教师视角
							</button>
						</div>
					{/if}
				</div>
				<button on:click={closePanel} class="text-surface-400 hover:text-surface-200 text-xl">
					✕
				</button>
			</div>

			<div class="flex-1 overflow-hidden flex flex-col">
				{#if viewMode === 'student'}
					<div class="flex-1 overflow-hidden flex">
						<div class="w-64 border-r border-surface-700 flex flex-col bg-surface-850">
							<div class="p-3 border-b border-surface-700">
								<h3 class="text-sm font-semibold text-surface-200 mb-2">选择任务</h3>
								{#if assignments.length === 0}
									<p class="text-xs text-surface-500">暂无可用任务</p>
								{/if}
							</div>
							<div class="flex-1 overflow-y-auto p-2 space-y-1">
								{#each assignments as a}
									{@const isSelected = selectedAssignmentId === a.id}
									<button
										on:click={() => selectAssignment(a.id)}
										class="w-full text-left p-2.5 rounded-lg transition-colors text-sm {isSelected ? 'bg-primary-600/20 border border-primary-500/40' : 'hover:bg-surface-700'}"
									>
										<div class="font-medium text-surface-100 truncate">{a.title}</div>
										<div class="text-xs text-surface-500 mt-0.5">
											满分 {a.totalScore} 分
										</div>
										{#if currentSubmission && a.id === selectedAssignmentId}
											<div
												class="mt-1.5 inline-block px-1.5 py-0.5 text-[10px] rounded {statusClass(currentSubmission.status)}"
											>
												{statusLabel(currentSubmission.status)}
											</div>
										{/if}
									</button>
								{/each}
							</div>
						</div>

						<div class="flex-1 overflow-y-auto p-5">
							{#if !currentAssignment}
								<div class="h-full flex items-center justify-center text-surface-500">
									请从左侧选择一个任务
								</div>
							{:else}
								<div class="space-y-5">
									<div class="p-4 rounded-xl bg-gradient-to-br from-primary-900/20 to-purple-900/20 border border-primary-700/30">
										<div class="flex items-start justify-between gap-4">
											<div class="flex-1">
												<h3 class="text-lg font-bold text-surface-100 mb-1">
													{currentAssignment.title}
												</h3>
												<p class="text-sm text-surface-400 leading-relaxed">
													{currentAssignment.description || '暂无任务描述'}
												</p>
											</div>
											{#if currentSubmission}
												<div
													class="px-2.5 py-1 text-xs rounded-full whitespace-nowrap {statusClass(currentSubmission.status)}"
												>
													{statusLabel(currentSubmission.status)}
												</div>
											{/if}
										</div>
										<div class="mt-3 pt-3 border-t border-surface-700/50 grid grid-cols-3 gap-4 text-xs">
											<div>
												<span class="text-surface-500">截止时间：</span>
												<span class="text-surface-300">
													{currentAssignment.dueDate ? formatDate(currentAssignment.dueDate) : '无'}
												</span>
											</div>
											<div>
												<span class="text-surface-500">需实验记录：</span>
												<span class={currentAssignment.requirements.needRecording ? 'text-success-400' : 'text-surface-500'}>
													{currentAssignment.requirements.needRecording ? '是' : '否'}
												</span>
											</div>
											<div>
												<span class="text-surface-500">最低质量分：</span>
												<span class="text-primary-400">
													{Math.round(currentAssignment.requirements.minQualityScore * 100)}%
												</span>
											</div>
										</div>
									</div>

									<div>
										<h4 class="text-sm font-semibold text-surface-200 mb-2 flex items-center gap-1.5">
											📊 评分标准
										</h4>
										<div class="space-y-2">
											{#each currentAssignment.rubric as criterion}
												<div class="p-3 rounded-lg bg-surface-700/40 border border-surface-600/50">
													<div class="flex items-center justify-between mb-1">
														<div class="flex items-center gap-2">
															<span class="font-medium text-surface-100 text-sm">
																{criterion.name}
															</span>
															<span class="text-xs text-surface-500">
																(权重 {(criterion.weight * 100).toFixed(0)}%)
															</span>
														</div>
														<div class="text-right">
															<span class="text-xs text-surface-500">自动预览 </span>
															<span class="text-sm font-bold text-primary-400">
																{previewScores[criterion.id] ?? 0}
															</span>
															<span class="text-xs text-surface-500">/{criterion.maxScore}</span>
														</div>
													</div>
													<p class="text-xs text-surface-400">{criterion.description}</p>
													<div class="mt-2 h-1.5 bg-surface-600 rounded-full overflow-hidden">
														<div
															class="h-full transition-all duration-300 {scoreColor(previewScores[criterion.id] ?? 0, criterion.maxScore)}"
															style="width: {criterion.maxScore > 0 ? ((previewScores[criterion.id] ?? 0) / criterion.maxScore) * 100 : 0}%"
														/>
													</div>
												</div>
											{/each}
										</div>
									</div>

									<div class="p-4 rounded-xl bg-surface-700/40 border border-surface-600/50">
										<div class="flex items-center justify-between mb-3">
											<h4 class="text-sm font-semibold text-surface-200 flex items-center gap-1.5">
												🎯 自动评分预览
											</h4>
											<div class="flex items-center gap-2">
												<span class="text-3xl font-bold text-primary-400">
													{previewTotal}
												</span>
												<span class="text-surface-500">/ {currentAssignment.totalScore}</span>
											</div>
										</div>
										<div class="h-2.5 bg-surface-600 rounded-full overflow-hidden">
											<div
												class="h-full transition-all duration-500 bg-gradient-to-r from-primary-500 via-warning-500 to-success-500"
												style="width: {currentAssignment.totalScore > 0 ? (previewTotal / currentAssignment.totalScore) * 100 : 0}%"
											/>
										</div>
										{#if currentSubmission?.finalParams}
											<div class="mt-3 pt-3 border-t border-surface-600/50 grid grid-cols-5 gap-2 text-center">
												<div>
													<div class="text-[10px] text-surface-500">暗箱</div>
													<div class="text-sm font-mono text-surface-300">
														{currentSubmission.finalParams.boxLength.toFixed(1)}
													</div>
												</div>
												<div>
													<div class="text-[10px] text-surface-500">孔径</div>
													<div class="text-sm font-mono text-surface-300">
														{currentSubmission.finalParams.apertureSize.toFixed(2)}
													</div>
												</div>
												<div>
													<div class="text-[10px] text-surface-500">物距</div>
													<div class="text-sm font-mono text-surface-300">
														{currentSubmission.finalParams.objectDistance.toFixed(1)}
													</div>
												</div>
												<div>
													<div class="text-[10px] text-surface-500">物高</div>
													<div class="text-sm font-mono text-surface-300">
														{currentSubmission.finalParams.objectHeight.toFixed(1)}
													</div>
												</div>
												<div>
													<div class="text-[10px] text-surface-500">质量</div>
													<div class="text-sm font-mono text-success-400">
														{Math.round(computeImagingQualityScore(currentSubmission.finalParams) * 100)}%
													</div>
												</div>
											</div>
										{/if}
									</div>

									<div class="flex gap-3">
										<button
											on:click={loadCurrentParams}
											class="flex-1 py-2.5 text-sm font-medium rounded-lg bg-surface-600 text-surface-100 hover:bg-surface-500 transition-colors flex items-center justify-center gap-2"
										>
											🔄 加载当前参数
										</button>
										<button
											on:click={handleSubmit}
											disabled={currentSubmission?.status === 'submitted' || currentSubmission?.status === 'reviewed'}
											class="flex-1 py-2.5 text-sm font-medium rounded-lg bg-primary-500 text-white hover:bg-primary-400 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
										>
											✅ 正式提交
										</button>
									</div>

									<div>
										<div class="flex items-center justify-between mb-2">
											<h4 class="text-sm font-semibold text-surface-200 flex items-center gap-1.5">
												📝 实验结论
											</h4>
											<span class="text-xs text-surface-500">
												{localConclusionText.length} 字
											</span>
										</div>
										<textarea
											bind:value={localConclusionText}
											on:blur={saveConclusion}
											placeholder="在此输入你的实验结论，包括观察到的现象、验证的原理、参数分析等..."
											rows={6}
											class="w-full p-3 text-sm bg-surface-700/60 border border-surface-600 rounded-lg text-surface-200 placeholder-surface-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 resize-none"
										/>
									</div>

									{#if currentSubmission && currentSubmission.status !== 'draft'}
										<div class="p-4 rounded-xl bg-surface-700/40 border border-surface-600/50 space-y-4">
											<h4 class="text-sm font-semibold text-surface-200 flex items-center gap-1.5">
												📋 评分结果
											</h4>

											<div class="space-y-3">
												{#each currentAssignment.rubric as criterion}
													{@const score = currentSubmission.scores[criterion.id] ?? 0}
													<div>
														<div class="flex items-center justify-between text-sm mb-1">
															<span class="text-surface-300">{criterion.name}</span>
															<span class="font-medium">
																<span class="text-primary-400">{score}</span>
																<span class="text-surface-500">/{criterion.maxScore}</span>
															</span>
														</div>
														<div class="h-2 bg-surface-600 rounded-full overflow-hidden">
															<div
																class="h-full transition-all {scoreColor(score, criterion.maxScore)}"
																style="width: {criterion.maxScore > 0 ? (score / criterion.maxScore) * 100 : 0}%"
															/>
														</div>
													</div>
												{/each}
											</div>

											<div class="pt-3 border-t border-surface-600/50 flex items-center justify-between">
												<div>
													<span class="text-surface-400 text-sm">总分</span>
													<div class="flex items-baseline gap-1">
														<span class="text-3xl font-bold text-success-400">
															{currentSubmission.totalScore}
														</span>
														<span class="text-surface-500">/ {currentAssignment.totalScore}</span>
													</div>
												</div>
												<div class="flex gap-2">
													<button
														on:click={() => onOpenAnnotations?.(currentSubmission)}
														class="px-3 py-1.5 text-xs rounded-lg bg-surface-600 text-surface-200 hover:bg-surface-500 transition-colors"
													>
														💬 批注点评
													</button>
													<button
														on:click={() => onCompareVersions?.(currentSubmission)}
														class="px-3 py-1.5 text-xs rounded-lg bg-surface-600 text-surface-200 hover:bg-surface-500 transition-colors"
													>
														🔄 版本对比
													</button>
												</div>
											</div>

											{#if currentSubmission.feedback}
												<div class="p-3 rounded-lg bg-primary-900/20 border border-primary-700/30">
													<div class="text-xs font-medium text-primary-300 mb-1">教师反馈</div>
													<p class="text-sm text-surface-300 whitespace-pre-wrap leading-relaxed">
														{currentSubmission.feedback}
													</p>
												</div>
											{/if}
										</div>
									{/if}
								</div>
							{/if}
						</div>
					</div>
				{:else if viewMode === 'teacher'}
					{#if teacherView === 'list'}
						<div class="flex-1 overflow-hidden flex flex-col">
							<div class="p-4 border-b border-surface-700 flex items-center justify-between">
								<div class="flex items-center gap-3">
									<label class="text-xs text-surface-400">筛选任务：</label>
									<select
										bind:value={filterAssignmentId}
										class="px-3 py-1.5 text-sm bg-surface-700 border border-surface-600 rounded-lg text-surface-200 focus:outline-none focus:border-primary-500"
									>
										<option value={null}>全部任务</option>
										{#each assignments as a}
											<option value={a.id}>{a.title}</option>
										{/each}
									</select>
								</div>
								<div class="flex items-center gap-4 text-xs text-surface-400">
									<span>共 {filteredSubmissions.length} 份提交</span>
								</div>
							</div>
							<div class="flex-1 overflow-y-auto">
								{#if filteredSubmissions.length === 0}
									<div class="h-full flex items-center justify-center text-surface-500 p-8">
										暂无学生提交
									</div>
								{:else}
									<table class="w-full text-sm">
										<thead class="sticky top-0 bg-surface-800 border-b border-surface-700">
											<tr>
												<th class="text-left px-4 py-3 font-medium text-surface-400">学生</th>
												<th class="text-left px-4 py-3 font-medium text-surface-400">任务</th>
												<th class="text-left px-4 py-3 font-medium text-surface-400">状态</th>
												<th class="text-left px-4 py-3 font-medium text-surface-400">提交时间</th>
												<th class="text-right px-4 py-3 font-medium text-surface-400">分数</th>
												<th class="text-right px-4 py-3 font-medium text-surface-400">操作</th>
											</tr>
										</thead>
										<tbody>
											{#each filteredSubmissions as sub}
												<tr
													class="border-b border-surface-700/50 hover:bg-surface-700/30 transition-colors cursor-pointer"
													on:click={() => viewSubmissionDetail(sub)}
												>
													<td class="px-4 py-3">
														<div class="flex items-center gap-2">
															<div
																class="w-7 h-7 rounded-full flex items-center justify-center text-sm"
																style="background: {user?.color || '#4fc3f7'}33; color: {user?.color || '#4fc3f7'}"
															>
																{assignments.find((a) => a.id === sub.assignmentId) ? (() => {
																	const idx = sub.studentName.charCodeAt(0) % 3;
																	return ['🧑', '👨', '👩'][idx];
																})() : '👤'}
															</div>
															<div>
																<div class="font-medium text-surface-200">
																	{sub.studentName}
																</div>
															</div>
														</div>
													</td>
													<td class="px-4 py-3 text-surface-300 max-w-[180px] truncate">
														{assignments.find((a) => a.id === sub.assignmentId)?.title || '-'}
													</td>
													<td class="px-4 py-3">
														<span
															class="inline-block px-2 py-0.5 text-xs rounded-full {statusClass(sub.status)}"
														>
															{statusLabel(sub.status)}
														</span>
													</td>
													<td class="px-4 py-3 text-surface-400 text-xs">
														{formatDate(sub.submittedAt)}
													</td>
													<td class="px-4 py-3 text-right">
														{#if sub.status === 'reviewed' || sub.status === 'submitted'}
															<span class="font-bold text-primary-400">
																{sub.totalScore}
															</span>
															<span class="text-surface-500 text-xs">
																/{assignments.find((a) => a.id === sub.assignmentId)?.totalScore || 0}
															</span>
														{:else}
															<span class="text-surface-500">-</span>
														{/if}
													</td>
													<td class="px-4 py-3 text-right">
														<button
															on:click|stopPropagation={() => viewSubmissionDetail(sub)}
															class="px-3 py-1 text-xs rounded bg-primary-600/30 text-primary-300 hover:bg-primary-600/50 transition-colors"
														>
															{sub.status === 'reviewed' ? '查看' : '评分'}
														</button>
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								{/if}
							</div>
						</div>
					{:else if selectedSubmission}
						{@const subAssignment = assignments.find((a) => a.id === selectedSubmission.assignmentId)}
						<div class="flex-1 overflow-y-auto p-5 space-y-5">
							<div class="flex items-center justify-between">
								<button
									on:click={backToList}
									class="text-sm text-surface-400 hover:text-surface-200 transition-colors flex items-center gap-1"
								>
									← 返回列表
								</button>
								<div class="flex gap-2">
									<button
										on:click={() => onOpenAnnotations?.(selectedSubmission)}
										class="px-3 py-1.5 text-xs rounded-lg bg-surface-600 text-surface-200 hover:bg-surface-500 transition-colors"
									>
										💬 批注点评
									</button>
									<button
										on:click={() => onCompareVersions?.(selectedSubmission)}
										class="px-3 py-1.5 text-xs rounded-lg bg-surface-600 text-surface-200 hover:bg-surface-500 transition-colors"
									>
										🔄 版本对比
									</button>
								</div>
							</div>

							<div class="p-4 rounded-xl bg-gradient-to-br from-primary-900/20 to-purple-900/20 border border-primary-700/30">
								<div class="flex items-start justify-between gap-4">
									<div>
										<h3 class="text-lg font-bold text-surface-100 mb-1">
											{subAssignment?.title || '未知任务'}
										</h3>
										<div class="flex items-center gap-3 text-sm">
											<span class="text-surface-400">
												学生：
												<span class="text-surface-200 font-medium">{selectedSubmission.studentName}</span>
											</span>
											<span class="text-surface-500">•</span>
											<span
												class="px-2 py-0.5 text-xs rounded-full {statusClass(selectedSubmission.status)}"
											>
												{statusLabel(selectedSubmission.status)}
											</span>
										</div>
									</div>
									<div class="text-right">
										<div class="text-xs text-surface-500 mb-1">当前总分</div>
										<div class="flex items-baseline gap-1">
											<span class="text-3xl font-bold text-primary-400">
												{getTotalScore(tempScores)}
											</span>
											<span class="text-surface-500">/ {subAssignment?.totalScore || 0}</span>
										</div>
									</div>
								</div>
							</div>

							{#if selectedSubmission.finalParams}
								<div class="p-4 rounded-xl bg-surface-700/40 border border-surface-600/50">
									<h4 class="text-sm font-semibold text-surface-200 mb-3 flex items-center gap-1.5">
										📷 最终参数快照
									</h4>
									<div class="grid grid-cols-6 gap-3 text-center">
										<div>
											<div class="text-[10px] text-surface-500 mb-0.5">暗箱长度</div>
											<div class="text-base font-mono text-surface-200">
												{selectedSubmission.finalParams.boxLength.toFixed(1)}
											</div>
										</div>
										<div>
											<div class="text-[10px] text-surface-500 mb-0.5">孔径大小</div>
											<div class="text-base font-mono text-surface-200">
												{selectedSubmission.finalParams.apertureSize.toFixed(2)}
											</div>
										</div>
										<div>
											<div class="text-[10px] text-surface-500 mb-0.5">物体距离</div>
											<div class="text-base font-mono text-surface-200">
												{selectedSubmission.finalParams.objectDistance.toFixed(1)}
											</div>
										</div>
										<div>
											<div class="text-[10px] text-surface-500 mb-0.5">物体高度</div>
											<div class="text-base font-mono text-surface-200">
												{selectedSubmission.finalParams.objectHeight.toFixed(1)}
											</div>
										</div>
										<div>
											<div class="text-[10px] text-surface-500 mb-0.5">光线强度</div>
											<div class="text-base font-mono text-surface-200">
												{selectedSubmission.finalParams.lightIntensity.toFixed(1)}
											</div>
										</div>
										<div>
											<div class="text-[10px] text-surface-500 mb-0.5">质量评分</div>
											<div class="text-base font-mono text-success-400">
												{Math.round(computeImagingQualityScore(selectedSubmission.finalParams) * 100)}%
											</div>
										</div>
									</div>
								</div>
							{/if}

							{#if selectedSubmission.conclusionText}
								<div class="p-4 rounded-xl bg-surface-700/40 border border-surface-600/50">
									<h4 class="text-sm font-semibold text-surface-200 mb-2 flex items-center gap-1.5">
										📝 实验结论
									</h4>
									<div class="text-sm text-surface-300 whitespace-pre-wrap leading-relaxed">
										{selectedSubmission.conclusionText}
									</div>
								</div>
							{/if}

							{#if subAssignment}
								<div class="space-y-3">
									<h4 class="text-sm font-semibold text-surface-200 flex items-center gap-1.5">
										⚖️ 手动评分调整
									</h4>
									{#each subAssignment.rubric as criterion}
										{@const currentScore = tempScores[criterion.id] ?? 0}
										<div class="p-3 rounded-lg bg-surface-700/40 border border-surface-600/50">
											<div class="flex items-center justify-between mb-2">
												<div>
													<span class="font-medium text-surface-100 text-sm">
														{criterion.name}
													</span>
													<span class="text-xs text-surface-500 ml-2">
														(权重 {(criterion.weight * 100).toFixed(0)}%)
													</span>
												</div>
												<div class="flex items-center gap-2">
													<input
														type="number"
														min={0}
														max={criterion.maxScore}
														value={currentScore}
														on:input={(e) => handleCriterionScoreInput(criterion.id, criterion.maxScore, e)}
														class="w-20 px-2 py-1 text-sm text-right bg-surface-600 border border-surface-500 rounded text-surface-200 focus:outline-none focus:border-primary-500"
													/>
													<span class="text-surface-500 text-sm">/ {criterion.maxScore}</span>
												</div>
											</div>
											<p class="text-xs text-surface-400 mb-2">{criterion.description}</p>
											<div class="flex items-center gap-2">
												<input
													type="range"
													min={0}
													max={criterion.maxScore}
													bind:value={tempScores[criterion.id]}
													on:input={(e) => handleCriterionScoreRange(criterion.id, e)}
													class="flex-1"
												/>
												<div class="h-2 w-20 bg-surface-600 rounded-full overflow-hidden">
													<div
														class="h-full {scoreColor(currentScore, criterion.maxScore)}"
														style="width: {criterion.maxScore > 0 ? (currentScore / criterion.maxScore) * 100 : 0}%"
													/>
												</div>
											</div>
										</div>
									{/each}
								</div>
							{/if}

							<div>
								<h4 class="text-sm font-semibold text-surface-200 mb-2 flex items-center gap-1.5">
									💬 教师反馈
								</h4>
								<textarea
									bind:value={tempFeedback}
									placeholder="填写对学生的评价、建议、改进意见等..."
									rows={4}
									class="w-full p-3 text-sm bg-surface-700/60 border border-surface-600 rounded-lg text-surface-200 placeholder-surface-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 resize-none"
								/>
							</div>

							<div class="pt-2 flex gap-3 justify-end">
								<button
									on:click={backToList}
									class="px-5 py-2 text-sm font-medium rounded-lg bg-surface-600 text-surface-200 hover:bg-surface-500 transition-colors"
								>
									取消
								</button>
								<button
									on:click={confirmReview}
									class="px-5 py-2 text-sm font-medium rounded-lg bg-success-500 text-white hover:bg-success-400 transition-colors flex items-center gap-2"
								>
									✅ 确认评分
								</button>
							</div>
						</div>
					{/if}
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.submission-panel {
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

	.bg-surface-850 {
		background-color: #3d332c;
	}
</style>
