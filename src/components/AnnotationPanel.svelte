<script lang="ts">
	import { get } from 'svelte/store';
	import {
		generateId,
		computeImagingQualityScore,
		type Annotation,
		type Submission,
		type User,
		type AnnotationReply,
		type CameraParams
	} from '$lib/cameraObscura';
	import {
		currentUser,
		submissions,
		addAnnotation,
		replyToAnnotation,
		sendSync,
		pushNotification
	} from '$lib/stores';

	export let submission: Submission | null = null;
	export let open = false;

	type TabFilter = 'all' | 'teacher' | 'mine';
	type AnnotationType = 'comment' | 'suggestion' | 'correction' | 'praise';
	type TargetType = 'params' | 'conclusion' | 'recording' | 'general';

	const tabFilterOptions: { key: TabFilter; label: string }[] = [
		{ key: 'all', label: '全部' },
		{ key: 'teacher', label: '仅教师' },
		{ key: 'mine', label: '仅我' }
	];

	const typeFilterOptions: { key: AnnotationType; label: string; emoji: string; cls: string }[] = [
		{ key: 'comment', label: '评论', emoji: '💬', cls: 'text-blue-400' },
		{ key: 'suggestion', label: '建议', emoji: '💡', cls: 'text-yellow-400' },
		{ key: 'correction', label: '纠正', emoji: '❌', cls: 'text-red-400' },
		{ key: 'praise', label: '表扬', emoji: '👍', cls: 'text-green-400' }
	];

	const targetTypeOptions: { key: TargetType; label: string; emoji: string }[] = [
		{ key: 'params', label: '参数', emoji: '⚙️' },
		{ key: 'conclusion', label: '结论', emoji: '📝' },
		{ key: 'recording', label: '记录', emoji: '🎬' },
		{ key: 'general', label: '总体', emoji: '📋' }
	];

	let tabFilter: TabFilter = 'all';
	let typeFilter: AnnotationType | 'all' = 'all';
	let expandedIds: Set<string> = new Set();

	let newAnnType: AnnotationType = 'comment';
	let newAnnTarget: TargetType = 'general';
	let newAnnFrameIndex: string = '';
	let newAnnContent: string = '';

	let replyContents: Record<string, string> = {};

	$: user = get(currentUser);

	$: filteredAnnotations = (() => {
		if (!submission) return [];
		let result = [...submission.annotations];

		if (tabFilter === 'teacher') {
			result = result.filter((a) => a.authorRole === 'teacher');
		} else if (tabFilter === 'mine' && user) {
			result = result.filter((a) => a.authorId === user.id);
		}

		if (typeFilter !== 'all') {
			result = result.filter((a) => a.type === typeFilter);
		}

		return result.sort((a, b) => b.timestamp - a.timestamp);
	})();

	function formatTime(ts: number): string {
		const d = new Date(ts);
		const now = new Date();
		const diff = now.getTime() - ts;
		if (diff < 60000) return '刚刚';
		if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
		if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
		return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
	}

	function typeInfo(type: AnnotationType) {
		switch (type) {
			case 'comment':
				return { label: '评论', emoji: '💬', bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' };
			case 'suggestion':
				return { label: '建议', emoji: '💡', bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30' };
			case 'correction':
				return { label: '纠正', emoji: '❌', bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30' };
			case 'praise':
				return { label: '表扬', emoji: '👍', bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' };
		}
	}

	function statusLabel(s: string) {
		switch (s) {
			case 'draft': return { label: '草稿', cls: 'bg-surface-600 text-surface-300' };
			case 'submitted': return { label: '已提交', cls: 'bg-blue-500/20 text-blue-400' };
			case 'reviewed': return { label: '已评分', cls: 'bg-green-500/20 text-green-400' };
			case 'returned': return { label: '已退回', cls: 'bg-red-500/20 text-red-400' };
			default: return { label: s, cls: 'bg-surface-600 text-surface-300' };
		}
	}

	function targetLabel(t: TargetType) {
		switch (t) {
			case 'params': return '参数';
			case 'conclusion': return '结论';
			case 'recording': return '记录';
			case 'general': return '总体';
		}
	}

	function toggleExpand(id: string) {
		if (expandedIds.has(id)) {
			expandedIds.delete(id);
		} else {
			expandedIds.add(id);
		}
		expandedIds = new Set(expandedIds);
	}

	function handleAddAnnotation() {
		if (!submission || !user || !newAnnContent.trim()) {
			if (!newAnnContent.trim()) pushNotification('warning', '请输入批注内容');
			return;
		}

		addAnnotation(submission.id, {
			authorId: user.id,
			authorName: user.name,
			authorRole: user.role,
			type: newAnnType,
			content: newAnnContent.trim(),
			targetType: newAnnTarget,
			targetRef: newAnnTarget === 'recording' ? undefined : undefined,
			frameIndex: newAnnFrameIndex ? parseInt(newAnnFrameIndex) : undefined
		});

		sendSync('annotation_add', { submissionId: submission.id });
		pushNotification('success', '批注已添加');

		newAnnContent = '';
		newAnnFrameIndex = '';
	}

	function handleReply(annotationId: string) {
		if (!submission || !user) return;
		const content = replyContents[annotationId]?.trim();
		if (!content) {
			pushNotification('warning', '请输入回复内容');
			return;
		}

		replyToAnnotation(submission.id, annotationId, user.id, user.name, content);
		sendSync('annotation_reply', { submissionId: submission.id, annotationId });
		pushNotification('success', '回复已发送');

		replyContents[annotationId] = '';
		replyContents = { ...replyContents };

		if (!expandedIds.has(annotationId)) {
			expandedIds.add(annotationId);
			expandedIds = new Set(expandedIds);
		}
	}

	function handleReplyInput(annotationId: string, e: Event) {
		const val = (e.target as HTMLInputElement).value;
		if (!replyContents[annotationId] || replyContents[annotationId] !== val) {
			replyContents[annotationId] = val;
			replyContents = replyContents;
		}
	}

	function handleReplyKeydown(annotationId: string, e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleReply(annotationId);
		}
	}

	function scoreColor(score: number, max: number) {
		const pct = max > 0 ? score / max : 0;
		if (pct >= 0.8) return 'bg-green-500';
		if (pct >= 0.6) return 'bg-yellow-500';
		if (pct >= 0.4) return 'bg-orange-500';
		return 'bg-red-500';
	}

	function closePanel() {
		open = false;
	}
</script>

{#if open}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" on:click|self={closePanel}>
		<div class="w-[95vw] max-w-[1400px] h-[90vh] bg-surface-900 border border-surface-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
			<!-- Header -->
			<div class="flex items-center justify-between px-5 py-4 border-b border-surface-700 bg-surface-800/50">
				<div class="flex items-center gap-3">
					<div class="w-10 h-10 rounded-xl bg-primary-500/20 flex items-center justify-center text-xl">
						💬
					</div>
					<div>
						<h2 class="text-lg font-bold text-surface-100">批注点评面板</h2>
						<p class="text-xs text-surface-400">
							{#if submission}
								学生：{submission.studentName} · {statusLabel(submission.status).label}
							{:else}
								暂无提交数据
							{/if}
						</p>
					</div>
				</div>
				<button
					on:click={closePanel}
					class="w-9 h-9 rounded-lg bg-surface-700 hover:bg-surface-600 text-surface-400 hover:text-surface-200 transition-colors flex items-center justify-center"
				>
					✕
				</button>
			</div>

			<!-- Body: 3-column layout -->
			{#if submission}
				<div class="flex-1 flex overflow-hidden">
					<!-- Left: Submission Overview -->
					<div class="w-72 border-r border-surface-700 bg-surface-900 overflow-y-auto">
						<div class="p-4 space-y-4">
							<!-- Status -->
							<div class="p-3 rounded-xl bg-surface-800/60 border border-surface-700/50">
								<div class="text-xs text-surface-500 mb-2">提交状态</div>
								<div class="flex items-center gap-2">
									<span class="px-2.5 py-1 text-xs font-medium rounded-full {statusLabel(submission.status).cls}">
										{statusLabel(submission.status).label}
									</span>
									{#if submission.submittedAt}
										<span class="text-xs text-surface-500">
											{formatTime(submission.submittedAt)}
										</span>
									{/if}
								</div>
							</div>

							<!-- Score -->
							<div class="p-4 rounded-xl bg-gradient-to-br from-primary-900/30 to-purple-900/20 border border-primary-700/30">
								<div class="text-xs text-surface-400 mb-1">综合评分</div>
								<div class="flex items-baseline gap-1.5 mb-3">
									<span class="text-4xl font-bold text-primary-400">{submission.totalScore}</span>
									<span class="text-surface-500 text-sm">/ 100</span>
								</div>
								<div class="h-2 bg-surface-700 rounded-full overflow-hidden">
									<div
										class="h-full transition-all {scoreColor(submission.totalScore, 100)}"
										style="width: {Math.min(submission.totalScore, 100)}%"
									/>
								</div>
							</div>

							<!-- Parameters -->
							<div class="p-3 rounded-xl bg-surface-800/60 border border-surface-700/50">
								<div class="text-xs text-surface-500 mb-3 flex items-center gap-1.5">
									⚙️ 最终参数
								</div>
								{#if submission.finalParams}
									<div class="space-y-2">
										<div class="flex items-center justify-between text-sm">
											<span class="text-surface-400">暗箱长度</span>
											<span class="font-mono text-surface-200">{submission.finalParams.boxLength.toFixed(1)}</span>
										</div>
										<div class="flex items-center justify-between text-sm">
											<span class="text-surface-400">孔径大小</span>
											<span class="font-mono text-surface-200">{submission.finalParams.apertureSize.toFixed(2)}</span>
										</div>
										<div class="flex items-center justify-between text-sm">
											<span class="text-surface-400">物体距离</span>
											<span class="font-mono text-surface-200">{submission.finalParams.objectDistance.toFixed(1)}</span>
										</div>
										<div class="flex items-center justify-between text-sm">
											<span class="text-surface-400">物体高度</span>
											<span class="font-mono text-surface-200">{submission.finalParams.objectHeight.toFixed(1)}</span>
										</div>
										<div class="flex items-center justify-between text-sm">
											<span class="text-surface-400">光线强度</span>
											<span class="font-mono text-surface-200">{submission.finalParams.lightIntensity.toFixed(1)}</span>
										</div>
										<div class="pt-2 mt-2 border-t border-surface-700/50 flex items-center justify-between text-sm">
											<span class="text-surface-400">成像质量</span>
											<span class="font-mono font-bold text-success-400">
												{Math.round(computeImagingQualityScore(submission.finalParams) * 100)}%
											</span>
										</div>
									</div>
								{:else}
									<div class="text-sm text-surface-500 text-center py-2">暂无参数数据</div>
								{/if}
							</div>

							<!-- Conclusion -->
							<div class="p-3 rounded-xl bg-surface-800/60 border border-surface-700/50">
								<div class="text-xs text-surface-500 mb-2 flex items-center gap-1.5">
									📝 实验结论
								</div>
								{#if submission.conclusionText}
									<p class="text-sm text-surface-300 leading-relaxed line-clamp-6">
										{submission.conclusionText}
									</p>
								{:else if submission.conclusion?.summary}
									<p class="text-sm text-surface-300 leading-relaxed line-clamp-6">
										{submission.conclusion.summary}
									</p>
								{:else}
									<div class="text-sm text-surface-500 text-center py-2">暂无结论</div>
								{/if}
							</div>

							<!-- Stats -->
							<div class="p-3 rounded-xl bg-surface-800/60 border border-surface-700/50">
								<div class="text-xs text-surface-500 mb-3">批注统计</div>
								<div class="grid grid-cols-2 gap-2 text-center">
									<div class="p-2 rounded-lg bg-surface-700/40">
										<div class="text-lg font-bold text-blue-400">
											{submission.annotations.filter(a => a.type === 'comment').length}
										</div>
										<div class="text-[10px] text-surface-500">评论</div>
									</div>
									<div class="p-2 rounded-lg bg-surface-700/40">
										<div class="text-lg font-bold text-yellow-400">
											{submission.annotations.filter(a => a.type === 'suggestion').length}
										</div>
										<div class="text-[10px] text-surface-500">建议</div>
									</div>
									<div class="p-2 rounded-lg bg-surface-700/40">
										<div class="text-lg font-bold text-red-400">
											{submission.annotations.filter(a => a.type === 'correction').length}
										</div>
										<div class="text-[10px] text-surface-500">纠正</div>
									</div>
									<div class="p-2 rounded-lg bg-surface-700/40">
										<div class="text-lg font-bold text-green-400">
											{submission.annotations.filter(a => a.type === 'praise').length}
										</div>
										<div class="text-[10px] text-surface-500">表扬</div>
									</div>
								</div>
								<div class="mt-3 pt-3 border-t border-surface-700/50 text-center">
									<div class="text-xl font-bold text-surface-200">{submission.annotations.length}</div>
									<div class="text-[10px] text-surface-500">批注总数</div>
								</div>
							</div>
						</div>
					</div>

					<!-- Middle: Annotation List -->
					<div class="flex-1 flex flex-col bg-surface-850 overflow-hidden">
						<!-- Filters -->
						<div class="px-5 py-3 border-b border-surface-700 bg-surface-800/30 space-y-3">
							<!-- Tabs -->
							<div class="flex items-center gap-1 bg-surface-800 rounded-lg p-1 w-fit">
								{#each tabFilterOptions as tab}
									<button
										on:click={() => tabFilter = tab.key}
										class="px-4 py-1.5 text-xs font-medium rounded-md transition-colors {
											tabFilter === tab.key
												? 'bg-primary-500 text-white'
												: 'text-surface-400 hover:text-surface-200 hover:bg-surface-700/50'
										}"
									>
										{tab.label}
									</button>
								{/each}
							</div>

							<!-- Type filter -->
							<div class="flex items-center gap-2 flex-wrap">
								<span class="text-xs text-surface-500">类型：</span>
								<button
									on:click={() => typeFilter = 'all'}
									class="px-2.5 py-1 text-xs rounded-md transition-colors {
										typeFilter === 'all'
											? 'bg-surface-600 text-surface-100'
											: 'bg-surface-700/50 text-surface-400 hover:bg-surface-700'
									}"
								>
									全部
								</button>
								{#each typeFilterOptions as t}
									<button
										on:click={() => typeFilter = t.key}
										class="px-2.5 py-1 text-xs rounded-md transition-colors {
											typeFilter === t.key
												? 'bg-surface-600 text-surface-100'
												: 'bg-surface-700/50 text-surface-400 hover:bg-surface-700'
										}"
									>
										<span class={typeFilter === t.key ? t.cls : ''}>{t.emoji}</span> {t.label}
									</button>
								{/each}
								<span class="ml-auto text-xs text-surface-500">共 {filteredAnnotations.length} 条</span>
							</div>
						</div>

						<!-- List -->
						<div class="flex-1 overflow-y-auto">
							{#if filteredAnnotations.length === 0}
								<div class="h-full flex flex-col items-center justify-center text-surface-500 p-8 gap-3">
									<div class="text-6xl opacity-30">📭</div>
									<div class="text-sm">暂无匹配的批注</div>
									<div class="text-xs text-surface-600">
										{tabFilter !== 'all' || typeFilter !== 'all' ? '尝试调整筛选条件' : '使用右侧表单添加第一条批注'}
									</div>
								</div>
							{:else}
								<div class="p-4 space-y-3">
									{#each filteredAnnotations as ann (ann.id)}
										{@const info = typeInfo(ann.type)}
										{@const expanded = expandedIds.has(ann.id)}
										<div class="rounded-xl border {info.border} bg-surface-800/40 overflow-hidden">
											<!-- Main annotation -->
											<div class="p-4">
												<div class="flex items-start justify-between gap-3 mb-3">
													<div class="flex items-center gap-2 flex-wrap">
														<span class="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full {info.bg} {info.text}">
															{info.emoji} {info.label}
														</span>
														<span class="px-1.5 py-0.5 text-[10px] rounded bg-surface-700 text-surface-400">
															{targetLabel(ann.targetType)}
														</span>
														{#if ann.frameIndex !== undefined}
															<span class="px-1.5 py-0.5 text-[10px] rounded bg-surface-700 text-surface-400">
																帧 #{ann.frameIndex}
															</span>
														{/if}
													</div>
													<span class="text-[11px] text-surface-500 whitespace-nowrap">
														{formatTime(ann.timestamp)}
													</span>
												</div>

												<div class="flex items-start gap-3">
													<div
														class="w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0"
														style="background: {ann.authorRole === 'teacher' ? '#ee771833' : '#4fc3f733'}; color: {ann.authorRole === 'teacher' ? '#ee7718' : '#4fc3f7'}"
													>
														{ann.authorRole === 'teacher' ? '👨‍🏫' : '🧑‍🎓'}
													</div>
													<div class="flex-1 min-w-0">
														<div class="flex items-center gap-2 mb-1.5">
															<span class="text-sm font-medium text-surface-200">{ann.authorName}</span>
															<span class="px-1.5 py-0.5 text-[10px] rounded {ann.authorRole === 'teacher' ? 'bg-orange-500/20 text-orange-400' : 'bg-blue-500/20 text-blue-400'}">
																{ann.authorRole === 'teacher' ? '教师' : '学生'}
															</span>
														</div>
														<p class="text-sm text-surface-300 leading-relaxed whitespace-pre-wrap break-words">
															{ann.content}
														</p>
													</div>
												</div>

												<!-- Actions -->
												<div class="mt-3 pt-3 border-t border-surface-700/40 flex items-center gap-2">
													<button
														on:click={() => toggleExpand(ann.id)}
														class="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md bg-surface-700/50 text-surface-400 hover:bg-surface-700 hover:text-surface-200 transition-colors"
													>
														<span class="inline-block transition-transform {expanded ? 'rotate-90' : ''}">▶</span>
														回复 ({ann.replies?.length || 0})
													</button>
												</div>
											</div>

											<!-- Replies -->
											{#if expanded}
												<div class="border-t border-surface-700/50 bg-surface-900/30">
													{#if ann.replies && ann.replies.length > 0}
														<div class="p-4 pl-14 space-y-3">
															{#each ann.replies as reply (reply.id)}
																<div class="flex items-start gap-3 p-3 rounded-lg bg-surface-800/40 border border-surface-700/30">
																	<div class="w-7 h-7 rounded-full flex items-center justify-center text-xs flex-shrink-0 bg-surface-700 text-surface-300">
																		👤
																	</div>
																	<div class="flex-1 min-w-0">
																		<div class="flex items-center gap-2 mb-1">
																			<span class="text-xs font-medium text-surface-200">{reply.authorName}</span>
																			<span class="text-[10px] text-surface-500">{formatTime(reply.timestamp)}</span>
																		</div>
																		<p class="text-xs text-surface-300 leading-relaxed whitespace-pre-wrap break-words">
																			{reply.content}
																		</p>
																	</div>
																</div>
															{/each}
														</div>
													{/if}

													<!-- Reply input -->
													<div class="p-4 pl-14 border-t border-surface-700/30">
														<div class="flex gap-2">
															<input
																value={replyContents[ann.id] ?? ''}
																on:input={(e) => handleReplyInput(ann.id, e)}
																on:keydown={(e) => handleReplyKeydown(ann.id, e)}
																type="text"
																placeholder="输入回复，按 Enter 发送..."
																class="flex-1 px-3 py-2 text-sm bg-surface-700 border border-surface-600 rounded-lg text-surface-200 placeholder-surface-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
															/>
															<button
																on:click={() => handleReply(ann.id)}
																class="px-4 py-2 text-sm font-medium rounded-lg bg-primary-500 text-white hover:bg-primary-400 transition-colors flex items-center gap-1.5"
															>
																📨 回复
															</button>
														</div>
													</div>
												</div>
											{/if}
										</div>
									{/each}
								</div>
							{/if}
						</div>
					</div>

					<!-- Right: Add Annotation Form -->
					<div class="w-80 border-l border-surface-700 bg-surface-900 overflow-y-auto">
						<div class="p-4">
							<div class="p-3 rounded-xl bg-gradient-to-br from-primary-900/20 to-purple-900/20 border border-primary-700/30 mb-4">
								<h3 class="text-sm font-bold text-surface-100 flex items-center gap-2">
									✏️ 添加新批注
								</h3>
								<p class="text-xs text-surface-400 mt-1">对学生的提交进行点评和反馈</p>
							</div>

							<div class="space-y-4">
								<!-- Type -->
								<div>
									<label class="block text-xs font-medium text-surface-400 mb-1.5">
										批注类型
									</label>
									<select
										bind:value={newAnnType}
										class="w-full px-3 py-2 text-sm bg-surface-800 border border-surface-600 rounded-lg text-surface-200 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
									>
										<option value="comment">💬 评论 - 一般性评论</option>
										<option value="suggestion">💡 建议 - 改进建议</option>
										<option value="correction">❌ 纠正 - 指出错误</option>
										<option value="praise">👍 表扬 - 做得好的地方</option>
									</select>
								</div>

								<!-- Target type -->
								<div>
									<label class="block text-xs font-medium text-surface-400 mb-1.5">
										目标类型
									</label>
									<div class="grid grid-cols-2 gap-2">
										{#each targetTypeOptions as tgt}
											<button
												on:click={() => newAnnTarget = tgt.key}
												class="px-2 py-2 text-xs rounded-lg border transition-colors flex items-center justify-center gap-1 {
													newAnnTarget === tgt.key
														? 'bg-primary-500/20 border-primary-500/50 text-primary-300'
														: 'bg-surface-800 border-surface-600 text-surface-400 hover:border-surface-500'
												}"
											>
												{tgt.emoji} {tgt.label}
											</button>
										{/each}
									</div>
								</div>

								<!-- Frame index -->
								{#if newAnnTarget === 'recording'}
									<div>
										<label class="block text-xs font-medium text-surface-400 mb-1.5">
											关联帧索引 <span class="text-surface-600">(可选)</span>
										</label>
										<input
											bind:value={newAnnFrameIndex}
											type="number"
											min="0"
											placeholder="例如：5"
											class="w-full px-3 py-2 text-sm bg-surface-800 border border-surface-600 rounded-lg text-surface-200 placeholder-surface-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
										/>
									</div>
								{/if}

								<!-- Content -->
								<div>
									<label class="block text-xs font-medium text-surface-400 mb-1.5">
										批注内容
									</label>
									<textarea
										bind:value={newAnnContent}
										placeholder="详细描述您的批注内容..."
										rows={6}
										class="w-full px-3 py-2.5 text-sm bg-surface-800 border border-surface-600 rounded-lg text-surface-200 placeholder-surface-500 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 resize-none"
									/>
									<div class="flex items-center justify-between mt-1">
										<span class="text-[10px] text-surface-600">支持多行文本</span>
										<span class="text-[10px] {newAnnContent.length > 500 ? 'text-red-400' : 'text-surface-600'}">
											{newAnnContent.length} 字
										</span>
									</div>
								</div>

								<!-- Preview -->
								{#if newAnnContent.trim()}
									<div class="p-3 rounded-xl border {typeInfo(newAnnType).border} bg-surface-800/40">
										<div class="text-[10px] text-surface-500 mb-2">预览</div>
										<div class="flex items-center gap-2 mb-2">
											<span class="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full {typeInfo(newAnnType).bg} {typeInfo(newAnnType).text}">
												{typeInfo(newAnnType).emoji} {typeInfo(newAnnType).label}
											</span>
											<span class="px-1.5 py-0.5 text-[10px] rounded bg-surface-700 text-surface-400">
												{targetLabel(newAnnTarget)}
											</span>
										</div>
										<p class="text-xs text-surface-300 leading-relaxed line-clamp-3">
											{newAnnContent}
										</p>
									</div>
								{/if}

								<!-- Submit button -->
								<button
									on:click={handleAddAnnotation}
									disabled={!newAnnContent.trim()}
									class="w-full py-3 text-sm font-medium rounded-xl bg-gradient-to-r from-primary-500 to-primary-600 text-white hover:from-primary-400 hover:to-primary-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-primary-500/20"
								>
									➕ 添加批注
								</button>
							</div>

							<!-- Quick tips -->
							<div class="mt-6 p-3 rounded-xl bg-surface-800/40 border border-surface-700/50">
								<div class="text-xs font-medium text-surface-400 mb-2 flex items-center gap-1.5">
									💡 批注使用建议
								</div>
								<ul class="text-[11px] text-surface-500 space-y-1.5 leading-relaxed">
									<li>• <span class="text-blue-400">评论</span>：用于一般性交流提问</li>
									<li>• <span class="text-yellow-400">建议</span>：给出具体可操作的改进方向</li>
									<li>• <span class="text-red-400">纠正</span>：指出概念或原理性错误</li>
									<li>• <span class="text-green-400">表扬</span>：鼓励做得好的方面</li>
								</ul>
							</div>
						</div>
					</div>
				</div>
			{:else}
				<div class="flex-1 flex flex-col items-center justify-center text-surface-500 gap-4">
					<div class="text-7xl opacity-30">📄</div>
					<div class="text-lg">未选择提交</div>
					<div class="text-sm text-surface-600">请先选择一个学生提交以查看和添加批注</div>
				</div>
			{/if}
		</div>
	</div>
{/if}
