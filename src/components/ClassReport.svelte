<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import {
		generateClassReport,
		exportClassReportAsHtml,
		downloadFile,
		type ClassReport as ClassReportType,
		type Classroom
	} from '$lib/cameraObscura';
	import {
		classrooms,
		users,
		submissions,
		assignments,
		currentUser,
		pushNotification
	} from '$lib/stores';

	export let open = false;
	export let defaultClassId: string | undefined = undefined;

	let selectedClassId: string | undefined = defaultClassId;
	let report: ClassReportType | null = null;
	let loading = false;
	let startDate: string = '';
	let endDate: string = '';

	let showStudentDetails = true;
	let showWeakSuggestions = true;
	let showTrends = true;

	$: $classrooms = classrooms;
	$: $users = users;
	$: $submissions = submissions;
	$: $assignments = assignments;
	$: $currentUser = currentUser;

	$: {
		if (selectedClassId === undefined && $classrooms.length > 0) {
			selectedClassId = $classrooms[0]?.id;
		}
	}

	onMount(() => {
		const now = new Date();
		const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
		endDate = formatDateForInput(now);
		startDate = formatDateForInput(sevenDaysAgo);
	});

	function formatDateForInput(date: Date): string {
		const y = date.getFullYear();
		const m = String(date.getMonth() + 1).padStart(2, '0');
		const d = String(date.getDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}

	function formatDate(ts: number): string {
		return new Date(ts).toLocaleDateString('zh-CN');
	}

	function getSelectedClassroom(): Classroom | undefined {
		return $classrooms.find((c) => c.id === selectedClassId);
	}

	async function generateReport() {
		const classroom = getSelectedClassroom();
		if (!classroom) {
			pushNotification('warning', '请选择班级');
			return;
		}

		loading = true;
		try {
			await new Promise((r) => setTimeout(r, 500));

			const startTs = new Date(startDate).getTime();
			const endTs = new Date(endDate).getTime() + 24 * 60 * 60 * 1000 - 1;

			report = generateClassReport(
				classroom,
				get(users),
				get(submissions),
				get(assignments),
				startTs,
				endTs
			);

			pushNotification('success', '报告生成成功');
		} catch (e) {
			console.error(e);
			pushNotification('error', '报告生成失败');
		} finally {
			loading = false;
		}
	}

	function handleExportHtml() {
		if (!report) {
			pushNotification('warning', '请先生成报告');
			return;
		}
		try {
			const html = exportClassReportAsHtml(report);
			const filename = `${report.className}_学习报告_${formatDate(report.generatedAt)}.html`;
			downloadFile(html, filename, 'text/html');
			pushNotification('success', 'HTML 报告已导出');
		} catch (e) {
			console.error(e);
			pushNotification('error', '导出失败');
		}
	}

	function handleExportCsv() {
		if (!report) {
			pushNotification('warning', '请先生成报告');
			return;
		}
		try {
			const bom = '\uFEFF';
			const lines: string[] = [];

			lines.push('=== 学生排名数据 ===');
			lines.push(['排名', '姓名', '学号', '提交数', '平均分', '总分', '完成率(%)', '成像质量(%)', '优势主题', '薄弱主题'].join(','));
			for (const r of report.studentReports) {
				lines.push([
					r.rank,
					r.userName,
					r.studentId || '',
					r.submissionsCount,
					r.avgScore,
					r.totalScore,
					r.completionRate,
					r.avgQualityScore,
					r.strongTopics.join(';'),
					r.weakTopics.join(';')
				].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
			}

			lines.push('');
			lines.push('=== 班级知识点掌握度 ===');
			lines.push(['知识点', '掌握度(%)', '平均分数', '最高分', '参与人次', '趋势'].join(','));
			for (const m of report.classMastery) {
				lines.push([
					m.topicName,
					m.masteryLevel,
					m.avgScore,
					m.bestScore,
					m.attempts,
					m.trend === 'improving' ? '上升' : m.trend === 'declining' ? '下降' : '稳定'
				].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
			}

			if (showStudentDetails) {
				lines.push('');
				lines.push('=== 学生知识点详情 ===');
				lines.push(['姓名', '学号', '知识点', '掌握度(%)', '平均分数', '最高分', '尝试次数', '趋势'].join(','));
				for (const r of report.studentReports) {
					for (const m of r.masteryIndicators) {
						lines.push([
							r.userName,
							r.studentId || '',
							m.topicName,
							m.masteryLevel,
							m.avgScore,
							m.bestScore,
							m.attempts,
							m.trend === 'improving' ? '上升' : m.trend === 'declining' ? '下降' : '稳定'
						].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
					}
				}
			}

			const filename = `${report.className}_数据_${formatDate(report.generatedAt)}.csv`;
			downloadFile(bom + lines.join('\n'), filename, 'text/csv');
			pushNotification('success', 'CSV 数据已导出');
		} catch (e) {
			console.error(e);
			pushNotification('error', '导出失败');
		}
	}

	function getMasteryColor(level: number): string {
		if (level >= 70) return '#43e97b';
		if (level >= 40) return '#fbbf24';
		return '#ef4444';
	}

	function getTrendIcon(trend: string): string {
		if (trend === 'improving') return '📈';
		if (trend === 'declining') return '📉';
		return '➡️';
	}

	function getRankClass(rank: number): string {
		if (rank === 1) return 'bg-gradient-to-r from-yellow-500/40 via-amber-400/30 to-yellow-600/40 border-yellow-500/50';
		if (rank === 2) return 'bg-gradient-to-r from-slate-400/40 via-gray-300/30 to-slate-500/40 border-slate-400/50';
		if (rank === 3) return 'bg-gradient-to-r from-orange-600/40 via-amber-600/30 to-orange-700/40 border-orange-600/50';
		return '';
	}

	function getRankBadge(rank: number): string {
		if (rank === 1) return '🥇';
		if (rank === 2) return '🥈';
		if (rank === 3) return '🥉';
		return '';
	}

	export function close() {
		open = false;
	}
</script>

{#if open}
	<div
		class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
		on:click={close}
	>
		<div
			class="report-modal bg-surface-800 rounded-2xl border border-surface-700 w-full max-w-7xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl"
			on:click|stopPropagation
		>
			<div class="p-5 border-b border-surface-700 flex items-center justify-between bg-gradient-to-r from-surface-800 via-surface-700/50 to-surface-800 shrink-0">
				<div class="flex items-center gap-3">
					<div class="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center text-2xl shadow-lg shadow-primary-500/30">
						📊
					</div>
					<div>
						<h2 class="text-xl font-bold text-surface-100">班级学习报告</h2>
						<p class="text-xs text-surface-400 mt-0.5">生成综合学情分析与知识点掌握报告</p>
					</div>
				</div>
				<button
					on:click={close}
					class="w-9 h-9 rounded-lg flex items-center justify-center text-surface-400 hover:text-surface-200 hover:bg-surface-700 transition-all text-xl"
				>
					✕
				</button>
			</div>

			<div class="p-5 border-b border-surface-700 bg-surface-900/40 space-y-4 shrink-0">
				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
					<div>
						<label class="block text-xs font-medium text-surface-400 mb-1.5">选择班级</label>
						<select
							bind:value={selectedClassId}
							class="w-full bg-surface-700/60 border border-surface-600 text-surface-200 text-sm rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-primary-500/50"
						>
							{#each $classrooms as cls}
								<option value={cls.id}>{cls.name}</option>
							{/each}
						</select>
					</div>
					<div>
						<label class="block text-xs font-medium text-surface-400 mb-1.5">开始日期</label>
						<input
							type="date"
							bind:value={startDate}
							class="w-full bg-surface-700/60 border border-surface-600 text-surface-200 text-sm rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-primary-500/50"
						/>
					</div>
					<div>
						<label class="block text-xs font-medium text-surface-400 mb-1.5">结束日期</label>
						<input
							type="date"
							bind:value={endDate}
							class="w-full bg-surface-700/60 border border-surface-600 text-surface-200 text-sm rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-primary-500/50"
						/>
					</div>
					<div class="flex items-end gap-2">
						<button
							on:click={generateReport}
							disabled={loading}
							class="flex-1 px-4 py-2.5 rounded-lg bg-gradient-to-r from-primary-500 to-purple-600 text-white font-medium text-sm hover:from-primary-600 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary-500/30 flex items-center justify-center gap-2"
						>
							{#if loading}
								<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
									<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
									<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
								</svg>
								生成中...
							{:else}
								🔄 生成报告
							{/if}
						</button>
						<button
							on:click={handleExportHtml}
							disabled={!report || loading}
							class="px-3 py-2.5 rounded-lg bg-emerald-600/20 border border-emerald-600/40 text-emerald-400 text-sm hover:bg-emerald-600/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
							title="导出 HTML 报告"
						>
							📄 HTML
						</button>
						<button
							on:click={handleExportCsv}
							disabled={!report || loading}
							class="px-3 py-2.5 rounded-lg bg-sky-600/20 border border-sky-600/40 text-sky-400 text-sm hover:bg-sky-600/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
							title="导出 CSV 数据"
						>
							📊 CSV
						</button>
					</div>
				</div>

				<div class="flex flex-wrap items-center gap-4 pt-1">
					<div class="text-xs font-medium text-surface-500 uppercase tracking-wider">报告设置</div>
					<label class="flex items-center gap-2 cursor-pointer group">
						<input type="checkbox" bind:checked={showStudentDetails} class="w-4 h-4 rounded border-surface-600 bg-surface-700 text-primary-500 focus:ring-primary-500/50" />
						<span class="text-sm text-surface-300 group-hover:text-surface-200 transition-colors">显示每位学生详细信息</span>
					</label>
					<label class="flex items-center gap-2 cursor-pointer group">
						<input type="checkbox" bind:checked={showWeakSuggestions} class="w-4 h-4 rounded border-surface-600 bg-surface-700 text-primary-500 focus:ring-primary-500/50" />
						<span class="text-sm text-surface-300 group-hover:text-surface-200 transition-colors">显示薄弱知识点建议</span>
					</label>
					<label class="flex items-center gap-2 cursor-pointer group">
						<input type="checkbox" bind:checked={showTrends} class="w-4 h-4 rounded border-surface-600 bg-surface-700 text-primary-500 focus:ring-primary-500/50" />
						<span class="text-sm text-surface-300 group-hover:text-surface-200 transition-colors">显示知识点趋势</span>
					</label>
				</div>
			</div>

			{#if report}
				<div class="p-5 border-b border-surface-700 grid grid-cols-2 md:grid-cols-4 gap-4 bg-surface-900/40 shrink-0">
					<div class="p-4 rounded-xl bg-gradient-to-br from-primary-900/40 to-primary-800/20 border border-primary-700/40">
						<div class="flex items-center gap-2 mb-2">
							<span class="text-lg">📋</span>
							<span class="text-xs text-primary-300 font-medium">发布任务</span>
						</div>
						<div class="text-2xl font-bold text-primary-300">{report.assignmentSummary.totalAssignments}</div>
						<div class="text-xs text-surface-500 mt-1">周期内任务数</div>
					</div>
					<div class="p-4 rounded-xl bg-gradient-to-br from-emerald-900/40 to-emerald-800/20 border border-emerald-700/40">
						<div class="flex items-center gap-2 mb-2">
							<span class="text-lg">✅</span>
							<span class="text-xs text-emerald-300 font-medium">提交率</span>
						</div>
						<div class="text-2xl font-bold text-emerald-300">{report.assignmentSummary.submissionRate}%</div>
						<div class="w-full h-1.5 bg-surface-700 rounded-full mt-2 overflow-hidden">
							<div class="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500" style="width: {report.assignmentSummary.submissionRate}%"></div>
						</div>
					</div>
					<div class="p-4 rounded-xl bg-gradient-to-br from-amber-900/40 to-amber-800/20 border border-amber-700/40">
						<div class="flex items-center gap-2 mb-2">
							<span class="text-lg">📈</span>
							<span class="text-xs text-amber-300 font-medium">平均分</span>
						</div>
						<div class="text-2xl font-bold text-amber-300">{report.assignmentSummary.avgTotalScore}</div>
						<div class="text-xs text-surface-500 mt-1">满分 100</div>
					</div>
					<div class="p-4 rounded-xl bg-gradient-to-br from-purple-900/40 to-purple-800/20 border border-purple-700/40">
						<div class="flex items-center gap-2 mb-2">
							<span class="text-lg">✨</span>
							<span class="text-xs text-purple-300 font-medium">成像质量</span>
						</div>
						<div class="text-2xl font-bold text-purple-300">{report.assignmentSummary.avgQualityScore}%</div>
						<div class="w-full h-1.5 bg-surface-700 rounded-full mt-2 overflow-hidden">
							<div class="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500" style="width: {Math.min(report.assignmentSummary.avgQualityScore, 100)}%"></div>
						</div>
					</div>
				</div>
			{/if}

			<div class="flex-1 overflow-hidden bg-white rounded-b-2xl">
				{#if loading}
					<div class="h-full flex flex-col items-center justify-center text-surface-500">
						<svg class="w-14 h-14 animate-spin text-primary-500 mb-4" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
						</svg>
						<div class="text-sm font-medium">正在生成班级报告...</div>
						<div class="text-xs text-surface-400 mt-1">分析学生提交数据与知识点掌握情况</div>
					</div>
				{:else if !report}
					<div class="h-full flex flex-col items-center justify-center text-surface-500 p-12">
						<div class="text-7xl mb-6 opacity-40">📊</div>
						<div class="text-lg font-medium text-surface-600 mb-2">暂无报告数据</div>
						<div class="text-sm text-surface-400 max-w-md text-center">
							选择班级与时间范围后，点击「生成报告」按钮，即可查看班级学情分析、知识点掌握度统计与学生排名详情。
						</div>
					</div>
				{:else}
					<div class="report-preview h-full overflow-y-auto p-6 md:p-8 text-gray-800 report-scroll">
						<div class="max-w-5xl mx-auto">
							<div class="mb-8 pb-6 border-b-2 border-gray-200">
								<h1 class="text-3xl font-bold text-orange-500 mb-2">📊 {report.className} 学习报告</h1>
								<p class="text-sm text-gray-500">
									报告生成时间：{new Date(report.generatedAt).toLocaleString('zh-CN')}
									· 周期：{formatDate(report.periodStart)} ~ {formatDate(report.periodEnd)}
								</p>
							</div>

							<div class="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
								<h3 class="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
									📈 班级总览
								</h3>
								<div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
									<div class="text-center p-4 rounded-xl text-white bg-gradient-to-br from-indigo-500 to-purple-600">
										<div class="text-3xl font-bold">{report.assignmentSummary.totalAssignments}</div>
										<div class="text-xs opacity-90 mt-1">发布任务数</div>
									</div>
									<div class="text-center p-4 rounded-xl text-white bg-gradient-to-br from-pink-500 to-rose-500">
										<div class="text-3xl font-bold">{report.assignmentSummary.submissionRate}%</div>
										<div class="text-xs opacity-90 mt-1">作业提交率</div>
									</div>
									<div class="text-center p-4 rounded-xl text-white bg-gradient-to-br from-sky-500 to-cyan-400">
										<div class="text-3xl font-bold">{report.assignmentSummary.avgTotalScore}</div>
										<div class="text-xs opacity-90 mt-1">平均总分</div>
									</div>
									<div class="text-center p-4 rounded-xl text-white bg-gradient-to-br from-emerald-500 to-teal-400">
										<div class="text-3xl font-bold">{report.assignmentSummary.avgQualityScore}%</div>
										<div class="text-xs opacity-90 mt-1">平均成像质量</div>
									</div>
								</div>
								<div class="p-4 rounded-lg bg-amber-50 border-l-4 border-orange-400">
									<span class="font-semibold text-gray-700">整体评价：</span>
									<span class="text-gray-600">{report.overallFeedback || '暂无评价'}</span>
								</div>
							</div>

							<div class="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
								<h3 class="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
									🎯 班级知识点掌握度
								</h3>
								{#if report.classMastery.length > 0}
									<div class="overflow-x-auto">
										<table class="w-full text-sm">
											<thead>
												<tr class="bg-sky-500 text-white">
													<th class="px-4 py-3 text-left font-semibold rounded-tl-lg">知识点</th>
													<th class="px-4 py-3 text-left font-semibold">掌握度</th>
													<th class="px-4 py-3 text-center font-semibold">平均分数</th>
													<th class="px-4 py-3 text-center font-semibold">最高分</th>
													<th class="px-4 py-3 text-center font-semibold">参与人次</th>
													{#if showTrends}
														<th class="px-4 py-3 text-center font-semibold rounded-tr-lg">趋势</th>
													{/if}
												</tr>
											</thead>
											<tbody>
												{#each report.classMastery as m, i}
													<tr class={i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
														<td class="px-4 py-3 font-medium text-gray-800 border-t border-gray-100">{m.topicName}</td>
														<td class="px-4 py-3 border-t border-gray-100">
															<div class="flex items-center gap-3">
																<div class="flex-1 h-2.5 bg-gray-200 rounded-full overflow-hidden max-w-[180px]">
																	<div class="h-full rounded-full transition-all" style="width: {m.masteryLevel}%; background: {getMasteryColor(m.masteryLevel)}"></div>
																</div>
																<span class="text-xs font-semibold min-w-[40px]" style="color: {getMasteryColor(m.masteryLevel)}">{m.masteryLevel}%</span>
															</div>
														</td>
														<td class="px-4 py-3 text-center text-gray-700 border-t border-gray-100">{m.avgScore}</td>
														<td class="px-4 py-3 text-center text-gray-700 border-t border-gray-100">{m.bestScore}</td>
														<td class="px-4 py-3 text-center text-gray-700 border-t border-gray-100">{m.attempts}</td>
														{#if showTrends}
															<td class="px-4 py-3 text-center border-t border-gray-100">
																<span class="text-lg">{getTrendIcon(m.trend)}</span>
																<span class="ml-1 text-xs text-gray-500">
																	{m.trend === 'improving' ? '上升' : m.trend === 'declining' ? '下降' : '稳定'}
																</span>
															</td>
														{/if}
													</tr>
												{/each}
											</tbody>
										</table>
									</div>
								{:else}
									<div class="py-12 text-center text-gray-400">暂无知识点掌握数据</div>
								{/if}
							</div>

							<div class="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
								<h3 class="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
									🏆 学生排名
								</h3>
								{#if report.studentReports.length > 0}
									<div class="overflow-x-auto">
										<table class="w-full text-sm">
											<thead>
												<tr class="bg-sky-500 text-white">
													<th class="px-3 py-3 text-center font-semibold rounded-tl-lg w-16">排名</th>
													<th class="px-3 py-3 text-left font-semibold">姓名</th>
													<th class="px-3 py-3 text-center font-semibold">学号</th>
													<th class="px-3 py-3 text-center font-semibold">提交</th>
													<th class="px-3 py-3 text-center font-semibold">平均分</th>
													<th class="px-3 py-3 text-center font-semibold">总分</th>
													<th class="px-3 py-3 text-center font-semibold">完成率</th>
													<th class="px-3 py-3 text-center font-semibold">质量</th>
													<th class="px-3 py-3 text-left font-semibold rounded-tr-lg">优势/薄弱</th>
												</tr>
											</thead>
											<tbody>
												{#each report.studentReports as r, i}
													<tr class={i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
														<td class="px-3 py-3 text-center border-t border-gray-100">
															{#if r.rank <= 3}
																<span class="text-xl">{getRankBadge(r.rank)}</span>
															{:else}
																<span class="inline-flex w-7 h-7 items-center justify-center rounded-full bg-gray-200 text-gray-600 text-xs font-bold">{r.rank}</span>
															{/if}
														</td>
														<td class="px-3 py-3 font-semibold text-gray-800 border-t border-gray-100">{r.userName}</td>
														<td class="px-3 py-3 text-center text-gray-600 border-t border-gray-100 text-xs">{r.studentId || '-'}</td>
														<td class="px-3 py-3 text-center text-gray-700 border-t border-gray-100">{r.submissionsCount}</td>
														<td class="px-3 py-3 text-center text-gray-700 font-medium border-t border-gray-100">{r.avgScore}</td>
														<td class="px-3 py-3 text-center text-gray-800 font-bold border-t border-gray-100">{r.totalScore}</td>
														<td class="px-3 py-3 text-center border-t border-gray-100">
															<div class="inline-flex items-center gap-2">
																<div class="w-14 h-2 bg-gray-200 rounded-full overflow-hidden">
																	<div
																		class="h-full rounded-full transition-all"
																		class:bg-emerald-500={r.completionRate >= 80}
																		class:bg-amber-500={r.completionRate >= 50 && r.completionRate < 80}
																		class:bg-rose-500={r.completionRate < 50}
																		style="width: {r.completionRate}%"
																	></div>
																</div>
																<span class="text-xs text-gray-500 min-w-[32px]">{r.completionRate}%</span>
															</div>
														</td>
														<td class="px-3 py-3 text-center border-t border-gray-100">
															<div class="inline-flex items-center gap-2">
																<div class="w-14 h-2 bg-gray-200 rounded-full overflow-hidden">
																	<div
																		class="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all"
																		style="width: {Math.min(r.avgQualityScore, 100)}%"
																	></div>
																</div>
																<span class="text-xs text-purple-600 font-medium min-w-[32px]">{r.avgQualityScore}%</span>
															</div>
														</td>
														<td class="px-3 py-3 border-t border-gray-100">
															<div class="flex flex-wrap gap-1">
																{#each r.strongTopics as t}
																	<span class="inline-block px-2 py-0.5 rounded-full text-[11px] bg-emerald-100 text-emerald-700">{t}</span>
																{/each}
																{#if showWeakSuggestions}
																	{#each r.weakTopics as t}
																		<span class="inline-block px-2 py-0.5 rounded-full text-[11px] bg-rose-100 text-rose-700">{t}</span>
																	{/each}
																{/if}
																{#if r.strongTopics.length === 0 && (!showWeakSuggestions || r.weakTopics.length === 0)}
																	<span class="text-xs text-gray-400">-</span>
																{/if}
															</div>
														</td>
													</tr>
												{/each}
											</tbody>
										</table>
									</div>
								{:else}
									<div class="py-12 text-center text-gray-400">暂无学生数据</div>
								{/if}
							</div>

							{#if showStudentDetails}
								<div class="space-y-5">
									<h3 class="text-lg font-semibold text-gray-800 flex items-center gap-2">
										👤 学生详细报告
									</h3>
									{#each report.studentReports as r}
										<div
											class="bg-white rounded-xl border shadow-sm overflow-hidden"
											class:border-l-4={r.rank <= 3}
											style:border-left-color={r.rank <= 3 ? '#ee7718' : '#4fc3f7'}
										>
											<div class="p-5 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
												<div class="flex items-start justify-between flex-wrap gap-3">
													<div>
														<h4 class="text-lg font-bold text-gray-800 flex items-center gap-2">
															{#if r.rank <= 3}
																<span>{getRankBadge(r.rank)}</span>
															{:else}
																<span>👤</span>
															{/if}
															{r.userName}
															<span class="text-sm font-normal text-gray-500">
																排名 #{r.rank} / {report.studentReports.length}
															</span>
														</h4>
														<div class="text-xs text-gray-500 mt-1">
															学号：{r.studentId || '-'} · 提交作业 {r.submissionsCount} 份
														</div>
													</div>
													<div class="flex flex-wrap gap-2 text-xs">
														<span class="px-2.5 py-1 rounded-md bg-sky-100 text-sky-700 font-medium">
															平均分 {r.avgScore}
														</span>
														<span class="px-2.5 py-1 rounded-md bg-amber-100 text-amber-700 font-medium">
															总分 {r.totalScore}
														</span>
														<span class="px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-700 font-medium">
															完成率 {r.completionRate}%
														</span>
														<span class="px-2.5 py-1 rounded-md bg-purple-100 text-purple-700 font-medium">
															质量 {r.avgQualityScore}%
														</span>
													</div>
												</div>

												{#if r.strongTopics.length > 0 || (showWeakSuggestions && r.weakTopics.length > 0)}
													<div class="mt-4 flex flex-wrap gap-3">
														{#if r.strongTopics.length > 0}
															<div>
																<div class="text-xs font-semibold text-emerald-700 mb-1.5">💪 优势主题</div>
																<div class="flex flex-wrap gap-1.5">
																	{#each r.strongTopics as t}
																		<span class="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-medium">{t}</span>
																	{/each}
																</div>
															</div>
														{/if}
														{#if showWeakSuggestions && r.weakTopics.length > 0}
															<div>
																<div class="text-xs font-semibold text-rose-700 mb-1.5">⚠️ 薄弱主题</div>
																<div class="flex flex-wrap gap-1.5">
																	{#each r.weakTopics as t}
																		<span class="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-700 text-xs font-medium">{t}</span>
																	{/each}
																</div>
															</div>
														{/if}
													</div>
												{/if}
											</div>

											{#if r.masteryIndicators.length > 0}
												<div class="p-5 border-b border-gray-100">
													<div class="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">📚 各主题掌握度</div>
													<div class="overflow-x-auto">
														<table class="w-full text-xs">
															<thead>
																<tr class="text-gray-500 border-b border-gray-200">
																	<th class="pb-2 text-left font-medium">知识点</th>
																	<th class="pb-2 text-left font-medium">掌握度</th>
																	<th class="pb-2 text-center font-medium">平均分</th>
																	<th class="pb-2 text-center font-medium">最高分</th>
																	<th class="pb-2 text-center font-medium">尝试</th>
																	{#if showTrends}
																		<th class="pb-2 text-center font-medium">趋势</th>
																	{/if}
																</tr>
															</thead>
															<tbody>
																{#each r.masteryIndicators as m}
																	<tr class="border-b border-gray-50 last:border-b-0">
																		<td class="py-2.5 text-gray-700 font-medium">{m.topicName}</td>
																		<td class="py-2.5">
																			<div class="flex items-center gap-2">
																				<div class="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden max-w-[140px]">
																					<div class="h-full rounded-full transition-all" style="width: {m.masteryLevel}%; background: {getMasteryColor(m.masteryLevel)}"></div>
																				</div>
																				<span class="font-semibold" style="color: {getMasteryColor(m.masteryLevel)}">{m.masteryLevel}%</span>
																			</div>
																		</td>
																		<td class="py-2.5 text-center text-gray-700">{m.avgScore}</td>
																		<td class="py-2.5 text-center text-gray-700">{m.bestScore}</td>
																		<td class="py-2.5 text-center text-gray-600">{m.attempts}</td>
																		{#if showTrends}
																			<td class="py-2.5 text-center">{getTrendIcon(m.trend)}</td>
																		{/if}
																	</tr>
																{/each}
															</tbody>
														</table>
													</div>
												</div>
											{/if}

											{#if showWeakSuggestions && r.suggestions.length > 0}
												<div class="p-5 bg-sky-50/50">
													<div class="text-xs font-semibold text-sky-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
														💡 学习建议
													</div>
													<ul class="space-y-1.5">
														{#each r.suggestions as s}
															<li class="text-sm text-gray-700 flex items-start gap-2">
																<span class="text-sky-500 mt-0.5">▸</span>
																<span>{s}</span>
															</li>
														{/each}
													</ul>
												</div>
											{/if}
										</div>
									{/each}
								</div>
							{/if}

							<div class="mt-10 pt-6 border-t border-gray-200 text-center text-xs text-gray-400">
								报告由 暗箱实验协作与课堂评测平台 自动生成
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.report-modal {
		animation: modalIn 0.25s ease-out;
	}

	@keyframes modalIn {
		from {
			opacity: 0;
			transform: scale(0.96) translateY(10px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}

	.report-scroll::-webkit-scrollbar {
		width: 8px;
		height: 8px;
	}

	.report-scroll::-webkit-scrollbar-track {
		background: #f1f5f9;
		border-radius: 4px;
	}

	.report-scroll::-webkit-scrollbar-thumb {
		background: #cbd5e1;
		border-radius: 4px;
	}

	.report-scroll::-webkit-scrollbar-thumb:hover {
		background: #94a3b8;
	}

	.report-scroll {
		scrollbar-width: thin;
		scrollbar-color: #cbd5e1 #f1f5f9;
	}
</style>
