<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { get } from 'svelte/store';
	import { computeLeaderboard, type LeaderboardEntry } from '$lib/cameraObscura';
	import { currentUser, users, classrooms, activeRoomSubmissions, submissions } from '$lib/stores';

	export let open = false;
	export let defaultClassId: string | undefined = undefined;
	export let mode: 'room' | 'class' = 'class';

	let localMode: 'room' | 'class' = mode;
	let selectedClassId: string | undefined = defaultClassId;
	let leaderboard: LeaderboardEntry[] = [];
	let refreshTimer: number | null = null;

	$: $classrooms = classrooms;
	$: $users = users;
	$: $currentUser = currentUser;

	$: {
		if (selectedClassId === undefined && $classrooms.length > 0) {
			selectedClassId = $classrooms[0]?.id;
		}
	}

	$: currentUserId = $currentUser?.id;

	function refreshLeaderboard() {
		const allSubs = localMode === 'room'
			? get(activeRoomSubmissions)
			: get(submissions);
		const classFilter = localMode === 'class' ? selectedClassId : undefined;
		leaderboard = computeLeaderboard(allSubs, get(users), classFilter);
	}

	$: [localMode, selectedClassId, $classrooms], refreshLeaderboard();

	$: classStats = (() => {
		if (leaderboard.length === 0) {
			return { avgScore: 0, participationRate: 0, bestScore: 0 };
		}
		const totalAvg = leaderboard.reduce((s, e) => s + e.avgScore, 0) / leaderboard.length;
		const best = Math.max(...leaderboard.map((e) => e.bestScore));
		const targetStudents = localMode === 'class' && selectedClassId
			? $users.filter((u) => u.classId === selectedClassId && u.role === 'student').length
			: leaderboard.length;
		const rate = targetStudents > 0 ? Math.round((leaderboard.length / targetStudents) * 100) : 0;
		return {
			avgScore: Math.round(totalAvg * 10) / 10,
			participationRate: Math.min(rate, 100),
			bestScore: best
		};
	})();

	$: maxTotalScore = leaderboard.length > 0 ? Math.max(...leaderboard.map((e) => e.totalScore)) : 0;

	$: top10ForChart = leaderboard.slice(0, 10);

	$: myRank = currentUserId
		? leaderboard.find((e) => e.userId === currentUserId)
		: null;

	function getRankBadge(rank: number): { icon: string; gradient: string } | null {
		if (rank === 1) return { icon: '🥇', gradient: 'from-yellow-500/40 via-amber-400/30 to-yellow-600/40 border-yellow-500/50' };
		if (rank === 2) return { icon: '🥈', gradient: 'from-slate-400/40 via-gray-300/30 to-slate-500/40 border-slate-400/50' };
		if (rank === 3) return { icon: '🥉', gradient: 'from-orange-600/40 via-amber-600/30 to-orange-700/40 border-orange-600/50' };
		return null;
	}

	function getBarHeight(score: number): string {
		if (maxTotalScore === 0) return '0%';
		return `${Math.max((score / maxTotalScore) * 100, 2)}%`;
	}

	function getBarColor(entry: LeaderboardEntry): string {
		if (entry.userId === currentUserId) return '#4fc3f7';
		if (entry.rank === 1) return '#fbbf24';
		if (entry.rank === 2) return '#9ca3af';
		if (entry.rank === 3) return '#f97316';
		return '#6366f1';
	}

	function formatTime(ts: number): string {
		if (!ts) return '-';
		const diff = Date.now() - ts;
		if (diff < 60000) return '刚刚';
		if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
		if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
		return new Date(ts).toLocaleDateString('zh-CN');
	}

	const achievementLegend = [
		{ icon: '🏆', name: '金牌实验者', desc: '最佳成绩 ≥ 90 分' },
		{ icon: '🥈', name: '银牌实验者', desc: '最佳成绩 ≥ 75 分' },
		{ icon: '🥉', name: '铜牌实验者', desc: '最佳成绩 ≥ 60 分' },
		{ icon: '📚', name: '勤勉学者', desc: '累计提交 ≥ 5 次' },
		{ icon: '✨', name: '质量先锋', desc: '平均成像质量 ≥ 80%' }
	];

	function handleSubmitEvent() {
		refreshLeaderboard();
	}

	onMount(() => {
		if (typeof window !== 'undefined') {
			refreshTimer = window.setInterval(() => {
				if (open) refreshLeaderboard();
			}, 5000);
			window.addEventListener('submission_submit', handleSubmitEvent);
			window.addEventListener('submission_review', handleSubmitEvent);
		}
	});

	onDestroy(() => {
		if (refreshTimer) {
			clearInterval(refreshTimer);
			refreshTimer = null;
		}
		if (typeof window !== 'undefined') {
			window.removeEventListener('submission_submit', handleSubmitEvent);
			window.removeEventListener('submission_review', handleSubmitEvent);
		}
	});

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
			class="leaderboard-modal bg-surface-800 rounded-2xl border border-surface-700 w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
			on:click|stopPropagation
		>
			<div class="p-5 border-b border-surface-700 flex items-center justify-between bg-gradient-to-r from-surface-800 via-surface-700/50 to-surface-800">
				<div class="flex items-center gap-3">
					<div class="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center text-2xl shadow-lg shadow-primary-500/30">
						🏆
					</div>
					<div>
						<h2 class="text-xl font-bold text-surface-100">实时排行榜</h2>
						<p class="text-xs text-surface-400 mt-0.5">
							{localMode === 'class' ? '班级范围' : '当前房间'} · 共 {leaderboard.length} 名参赛者
						</p>
					</div>
				</div>

				<div class="flex items-center gap-3">
					<div class="flex bg-surface-700/60 rounded-lg p-0.5 border border-surface-600">
						<button
							on:click={() => (localMode = 'class')}
							class="px-3.5 py-1.5 text-xs font-medium rounded-md transition-all {localMode === 'class' ? 'bg-primary-500 text-white' : 'text-surface-400 hover:text-surface-200'}"
						>
							🏫 班级
						</button>
						<button
							on:click={() => (localMode = 'room')}
							class="px-3.5 py-1.5 text-xs font-medium rounded-md transition-all {localMode === 'room' ? 'bg-primary-500 text-white' : 'text-surface-400 hover:text-surface-200'}"
						>
							🚪 房间
						</button>
					</div>

					{#if localMode === 'class' && $classrooms.length > 1}
						<select
							bind:value={selectedClassId}
							class="bg-surface-700/60 border border-surface-600 text-surface-200 text-xs rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary-500/50"
						>
							{#each $classrooms as cls}
								<option value={cls.id}>{cls.name}</option>
							{/each}
						</select>
					{/if}

					<button
						on:click={refreshLeaderboard}
						class="p-2 rounded-lg bg-surface-700/60 text-surface-400 hover:text-surface-200 hover:bg-surface-600 transition-all border border-surface-600"
						title="刷新"
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
						</svg>
					</button>

					<button
						on:click={close}
						class="w-9 h-9 rounded-lg flex items-center justify-center text-surface-400 hover:text-surface-200 hover:bg-surface-700 transition-all text-xl"
					>
						✕
					</button>
				</div>
			</div>

			<div class="p-5 border-b border-surface-700 grid grid-cols-1 md:grid-cols-4 gap-4 bg-surface-900/40">
				<div class="p-4 rounded-xl bg-gradient-to-br from-primary-900/40 to-primary-800/20 border border-primary-700/40">
					<div class="flex items-center gap-2 mb-2">
						<span class="text-lg">📊</span>
						<span class="text-xs text-primary-300 font-medium">班级平均分</span>
					</div>
					<div class="text-2xl font-bold text-primary-300">{classStats.avgScore}</div>
					<div class="text-xs text-surface-500 mt-1">满分 100</div>
				</div>

				<div class="p-4 rounded-xl bg-gradient-to-br from-emerald-900/40 to-emerald-800/20 border border-emerald-700/40">
					<div class="flex items-center gap-2 mb-2">
						<span class="text-lg">👥</span>
						<span class="text-xs text-emerald-300 font-medium">参与率</span>
					</div>
					<div class="text-2xl font-bold text-emerald-300">{classStats.participationRate}%</div>
					<div class="w-full h-1.5 bg-surface-700 rounded-full mt-2 overflow-hidden">
						<div
							class="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500"
							style="width: {classStats.participationRate}%"
						></div>
					</div>
				</div>

				<div class="p-4 rounded-xl bg-gradient-to-br from-amber-900/40 to-amber-800/20 border border-amber-700/40">
					<div class="flex items-center gap-2 mb-2">
						<span class="text-lg">🏅</span>
						<span class="text-xs text-amber-300 font-medium">最高分</span>
					</div>
					<div class="text-2xl font-bold text-amber-300">{classStats.bestScore}</div>
					<div class="text-xs text-surface-500 mt-1">最佳个人成绩</div>
				</div>

				<div class="p-4 rounded-xl bg-gradient-to-br from-sky-900/40 to-sky-800/20 border border-sky-700/40">
					<div class="flex items-center gap-2 mb-2">
						<span class="text-lg">📍</span>
						<span class="text-xs text-sky-300 font-medium">我的排名</span>
					</div>
					<div class="text-2xl font-bold text-sky-300">
						{#if myRank}
							#{myRank.rank}
							<span class="text-sm text-surface-500 font-normal ml-1">/ {leaderboard.length}</span>
						{:else}
							<span class="text-surface-500 text-lg">未上榜</span>
						{/if}
					</div>
					{#if myRank}
						<div class="text-xs text-sky-400 mt-1">总分 {myRank.totalScore} 分</div>
					{/if}
				</div>
			</div>

			<div class="flex-1 overflow-hidden flex flex-col lg:flex-row gap-5 p-5">
				<div class="flex-1 flex flex-col min-h-0">
					<div class="flex items-center justify-between mb-3">
						<h3 class="text-sm font-semibold text-surface-200 flex items-center gap-2">
							<span>📋</span> 排名详情
						</h3>
						<div class="flex items-center gap-2">
							{#each [1,2,3] as r}
								{@const badge = getRankBadge(r)}
								{@const entry = leaderboard.find(e => e.rank === r)}
								{#if entry && badge}
									<div class="flex items-center gap-1 px-2 py-1 rounded-md bg-surface-700/40 border border-surface-600">
										<span>{badge.icon}</span>
										<span class="text-xs text-surface-300 truncate max-w-[60px]">{entry.userName}</span>
									</div>
								{/if}
							{/each}
						</div>
					</div>

					<div class="flex-1 overflow-y-auto rounded-xl border border-surface-700 bg-surface-900/30">
						<table class="w-full text-sm">
							<thead class="sticky top-0 z-10 bg-surface-800/95 backdrop-blur border-b border-surface-700">
								<tr class="text-xs text-surface-400 uppercase tracking-wider">
									<th class="px-4 py-3 text-left font-medium w-16">排名</th>
									<th class="px-3 py-3 text-left font-medium">参赛者</th>
									<th class="px-3 py-3 text-right font-medium">总分</th>
									<th class="px-3 py-3 text-right font-medium hidden md:table-cell">平均</th>
									<th class="px-3 py-3 text-right font-medium hidden md:table-cell">最高</th>
									<th class="px-3 py-3 text-right font-medium hidden lg:table-cell">完成</th>
									<th class="px-3 py-3 text-right font-medium hidden lg:table-cell">质量</th>
									<th class="px-3 py-3 text-left font-medium hidden xl:table-cell">成就</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-surface-700/50">
								{#if leaderboard.length === 0}
									<tr>
										<td colspan="8" class="px-6 py-16 text-center">
											<div class="text-5xl mb-4 opacity-40">📊</div>
											<div class="text-surface-400 text-sm">暂无排行数据</div>
											<div class="text-surface-500 text-xs mt-2">提交作业后将显示排名</div>
										</td>
									</tr>
								{/if}
								{#each leaderboard as entry (entry.userId)}
									{@const badge = getRankBadge(entry.rank)}
									{@const isMe = entry.userId === currentUserId}
									{@const rowClasses = [
										'transition-all duration-200',
										badge ? `bg-gradient-to-r ${badge.gradient}` : '',
										isMe ? 'bg-sky-500/10 border-l-4 border-sky-400' : '',
										(!isMe && !badge) ? 'hover:bg-surface-700/40' : ''
									].filter(Boolean).join(' ')}
									{@const rankBadgeClasses = [
										'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold',
										isMe ? 'bg-sky-500/20 text-sky-300' : 'bg-surface-700 text-surface-400'
									].filter(Boolean).join(' ')}
									<tr class="{rowClasses}">
										<td class="px-4 py-3">
											<div class="flex items-center gap-1.5">
												{#if badge}
													<span class="text-xl">{badge.icon}</span>
												{:else}
													<span class="{rankBadgeClasses}">
														{entry.rank}
													</span>
												{/if}
												{#if entry.prevRank && entry.prevRank !== entry.rank}
													<span
														class={`text-xs ${entry.rank < entry.prevRank ? 'text-emerald-400' : 'text-rose-400'}`}
													>
														{entry.rank < entry.prevRank ? '↑' : '↓'}
													</span>
												{/if}
											</div>
										</td>

										<td class="px-3 py-3">
											<div class="flex items-center gap-3 min-w-0">
												<div
													class="w-9 h-9 rounded-full flex items-center justify-center text-lg flex-shrink-0 border-2 shadow-md"
													style={`background: ${entry.color || '#4fc3f7'}22; border-color: ${entry.color || '#4fc3f7'}66`}
												>
													{entry.avatar}
												</div>
												<div class="min-w-0 flex-1">
													<div class="flex items-center gap-2">
														<span
															class="font-medium truncate"
															class:text-sky-300={isMe}
															class:text-surface-100={!isMe}
														>
															{entry.userName}
															{#if isMe}
																<span class="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-sky-500/30 text-sky-300 font-medium">我</span>
															{/if}
														</span>
													</div>
													<div class="text-xs text-surface-500 truncate mt-0.5">
														{entry.studentId || '—'} · {formatTime(entry.lastActivity)}
													</div>
												</div>
											</div>
										</td>

										<td class="px-3 py-3 text-right">
											<div
												class="font-bold text-lg"
												class:text-amber-300={entry.rank === 1}
												class:text-slate-300={entry.rank === 2}
												class:text-orange-400={entry.rank === 3}
												class:text-sky-300={isMe && entry.rank > 3}
												class:text-surface-100={entry.rank > 3 && !isMe}
											>
												{entry.totalScore}
											</div>
											<div class="text-[10px] text-surface-500 mt-0.5">{entry.assignmentCount} 次</div>
										</td>

										<td class="px-3 py-3 text-right hidden md:table-cell">
											<span class="text-surface-300">{entry.avgScore}</span>
										</td>

										<td class="px-3 py-3 text-right hidden md:table-cell">
											<span class="text-surface-300">{entry.bestScore}</span>
										</td>

										<td class="px-3 py-3 text-right hidden lg:table-cell">
											<div class="inline-flex items-center gap-1.5">
												<div class="w-16 h-1.5 bg-surface-700 rounded-full overflow-hidden">
													<div
														class="h-full rounded-full transition-all duration-500"
														class:bg-emerald-500={entry.completionRate >= 80}
														class:bg-amber-500={entry.completionRate >= 50 && entry.completionRate < 80}
														class:bg-rose-500={entry.completionRate < 50}
														style="width: {entry.completionRate}%"
													></div>
												</div>
												<span class="text-xs text-surface-400 w-9">{entry.completionRate}%</span>
											</div>
										</td>

										<td class="px-3 py-3 text-right hidden lg:table-cell">
											<div class="inline-flex items-center gap-1.5">
												<div class="w-16 h-1.5 bg-surface-700 rounded-full overflow-hidden">
													<div
														class="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500"
														style="width: {Math.min(entry.qualityScore, 100)}%"
													></div>
												</div>
												<span class="text-xs text-purple-300 w-9">{Math.round(entry.qualityScore)}%</span>
											</div>
										</td>

										<td class="px-3 py-3 hidden xl:table-cell">
											<div class="flex items-center gap-1 flex-wrap">
												{#each entry.achievements as ach}
													<span
														class="text-xs px-2 py-0.5 rounded-full bg-surface-700/60 border border-surface-600"
														title={ach}
													>
														{ach.split(' ')[0]}
													</span>
												{:else}
													<span class="text-xs text-surface-600">—</span>
												{/each}
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>

				<div class="w-full lg:w-80 flex flex-col gap-5 shrink-0">
					<div class="p-4 rounded-xl border border-surface-700 bg-surface-900/40">
						<h3 class="text-sm font-semibold text-surface-200 mb-4 flex items-center gap-2">
							<span>📊</span> TOP 10 总分柱状图
						</h3>
						{#if top10ForChart.length > 0}
							<div class="flex items-end justify-around gap-2 h-48 border-b border-l border-surface-700 pb-2 pl-2 relative">
								<div class="absolute left-0 top-0 h-full flex flex-col justify-between text-[10px] text-surface-600 -ml-8 w-7 text-right">
									<span>{maxTotalScore}</span>
									<span>{Math.round(maxTotalScore * 0.75)}</span>
									<span>{Math.round(maxTotalScore * 0.5)}</span>
									<span>{Math.round(maxTotalScore * 0.25)}</span>
									<span>0</span>
								</div>
								{#each top10ForChart as entry (entry.userId)}
									<div class="flex flex-col items-center gap-1 flex-1 min-w-0">
										<div class="text-[10px] font-bold text-surface-300 mb-1">{entry.totalScore}</div>
										<div class="w-full flex justify-center">
											<div
												class="w-5 sm:w-7 rounded-t-md transition-all duration-500 relative group cursor-pointer shadow-md"
												style={`height: ${getBarHeight(entry.totalScore)}; background: linear-gradient(to top, ${getBarColor(entry)}, ${getBarColor(entry)}88);`}
											>
												{#if entry.rank <= 3}
													<div class="absolute -top-4 left-1/2 -translate-x-1/2 text-sm">
														{getRankBadge(entry.rank)?.icon}
													</div>
												{/if}
												{#if entry.userId === currentUserId}
													<div class="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] text-sky-300 font-bold">我</div>
												{/if}
												<div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded bg-surface-950 border border-surface-700 text-[10px] text-surface-200 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-lg">
													{entry.userName} · {entry.totalScore}分
												</div>
											</div>
										</div>
										<div
											class="text-[10px] text-surface-400 truncate w-full text-center"
											class:text-sky-300={entry.userId === currentUserId}
											title={entry.userName}
										>
											{#if entry.rank <= 3}
												{getRankBadge(entry.rank)?.icon}
											{:else}
												{entry.rank}
											{/if}
										</div>
									</div>
								{/each}
							</div>
						{:else}
							<div class="h-48 flex items-center justify-center text-surface-500 text-sm">
								暂无数据
							</div>
						{/if}
					</div>

					<div class="p-4 rounded-xl border border-surface-700 bg-surface-900/40">
						<h3 class="text-sm font-semibold text-surface-200 mb-3 flex items-center gap-2">
							<span>🎖️</span> 成就图例
						</h3>
						<div class="space-y-2">
							{#each achievementLegend as item}
								<div class="flex items-center gap-3 p-2 rounded-lg bg-surface-800/40 hover:bg-surface-700/40 transition-colors">
									<span class="text-xl w-8 text-center">{item.icon}</span>
									<div class="min-w-0 flex-1">
										<div class="text-xs font-medium text-surface-200">{item.name}</div>
										<div class="text-[11px] text-surface-500 truncate">{item.desc}</div>
									</div>
								</div>
							{/each}
						</div>
					</div>

					<div class="p-4 rounded-xl border border-surface-700 bg-gradient-to-br from-primary-900/20 to-purple-900/10">
						<div class="flex items-start gap-3">
							<div class="text-2xl">💡</div>
							<div class="text-xs text-surface-400 leading-relaxed flex-1">
								排行榜每 5 秒自动刷新，提交作业后立即更新。
								<br />
								<span class="text-primary-400">综合得分</span> = 总分加权 · 成像质量 · 完成率
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.leaderboard-modal {
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

	table tbody tr {
		animation: rowIn 0.3s ease-out backwards;
	}

	@keyframes rowIn {
		from {
			opacity: 0;
			transform: translateX(-8px);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}

	table tbody tr:nth-child(1) { animation-delay: 0.02s; }
	table tbody tr:nth-child(2) { animation-delay: 0.04s; }
	table tbody tr:nth-child(3) { animation-delay: 0.06s; }
	table tbody tr:nth-child(4) { animation-delay: 0.08s; }
	table tbody tr:nth-child(5) { animation-delay: 0.10s; }
	table tbody tr:nth-child(6) { animation-delay: 0.12s; }
	table tbody tr:nth-child(7) { animation-delay: 0.14s; }
	table tbody tr:nth-child(8) { animation-delay: 0.16s; }
	table tbody tr:nth-child(9) { animation-delay: 0.18s; }
	table tbody tr:nth-child(10) { animation-delay: 0.20s; }
</style>
