<script lang="ts">
	import {
		generateRoomCode,
		generateId,
		createDefaultUser,
		CollaborationManager,
		DEFAULT_PARAMS,
		type User,
		type CollaborationRoom,
		type CameraParams,
		type SyncMessage
	} from '$lib/cameraObscura';
	import {
		currentUser,
		users,
		rooms,
		activeRoomId,
		activeRoom,
		activeRoomParticipants,
		chatMessages,
		setCurrentUser,
		upsertUser,
		addRoom,
		updateRoom,
		initCollaboration,
		closeCollaboration,
		sendSync,
		updateParticipantState,
		pushNotification
	} from '$lib/stores';
	import { get } from 'svelte/store';

	export let params: CameraParams;
	export let open: boolean = false;
	export let onBroadcastParams: ((params: CameraParams) => void) | undefined = undefined;

	type Step = 'auth' | 'lobby' | 'room';
	type RoleSelection = 'teacher' | 'student';
	type RoomMode = 'individual' | 'group' | 'demo';

	let step: Step = 'auth';
	let selectedRole: RoleSelection = 'student';
	let inputName: string = '';
	let inputRoomName: string = '';
	let inputRoomCode: string = '';
	let selectedMode: RoomMode = 'group';
	let chatInput: string = '';
	let copied: boolean = false;

	$: isInRoom = $activeRoomId !== null;
	$: currentRoom = $activeRoom;
	$: participants = $activeRoomParticipants;
	$: messages = $chatMessages;
	$: user = $currentUser;
	$: isTeacher = user?.role === 'teacher';

	const demoTeachers = [
		{ name: '李老师', avatar: '👨‍🏫' },
		{ name: '王教授', avatar: '👩‍🏫' }
	];

	const demoStudents = [
		{ name: '张伟', avatar: '🧑‍🎓' },
		{ name: '李娜', avatar: '👩‍🎓' },
		{ name: '刘洋', avatar: '👨‍🎓' },
		{ name: '陈静', avatar: '🧑‍🎓' }
	];

	function selectDemoUser(demo: { name: string; avatar: string }) {
		const role: RoleSelection = demoTeachers.includes(demo) ? 'teacher' : 'student';
		const newUser = createDefaultUser(demo.name, role);
		newUser.avatar = demo.avatar;
		upsertUser(newUser);
		setCurrentUser(newUser);
		inputName = demo.name;
		selectedRole = role;
	}

	function confirmIdentity() {
		if (!inputName.trim()) {
			pushNotification('warning', '请输入姓名');
			return;
		}
		const newUser = createDefaultUser(inputName.trim(), selectedRole);
		upsertUser(newUser);
		setCurrentUser(newUser);
		step = 'lobby';
	}

	function goBackToAuth() {
		step = 'auth';
	}

	function createRoom() {
		if (!inputRoomName.trim()) {
			pushNotification('warning', '请输入房间名');
			return;
		}
		const u = get(currentUser);
		if (!u) return;

		const code = generateRoomCode();
		const room: CollaborationRoom = {
			id: generateId(),
			code,
			name: inputRoomName.trim(),
			classId: null,
			teacherId: u.id,
			participantIds: [u.id],
			status: 'waiting',
			createdAt: Date.now(),
			mode: selectedMode
		};

		addRoom(room);
		initCollaboration(room.id, u);
		updateParticipantState(room.id, u.id, {
			joinedAt: Date.now(),
			currentParams: { ...params },
			lastParamsUpdate: Date.now()
		});
		sendSync('join_room', { userId: u.id, userName: u.name });
		step = 'room';
	}

	function joinRoom() {
		const code = inputRoomCode.trim().toUpperCase();
		if (code.length !== 6) {
			pushNotification('warning', '房间码为 6 位字符');
			return;
		}
		const allRooms = get(rooms);
		const room = allRooms.find((r) => r.code === code);
		if (!room) {
			pushNotification('error', '未找到该房间，请检查房间码');
			return;
		}
		if (room.status === 'ended') {
			pushNotification('error', '该房间已结束');
			return;
		}
		const u = get(currentUser);
		if (!u) return;

		if (!room.participantIds.includes(u.id)) {
			updateRoom(room.id, {
				participantIds: [...room.participantIds, u.id]
			});
		}
		initCollaboration(room.id, u);
		updateParticipantState(room.id, u.id, {
			joinedAt: Date.now(),
			currentParams: { ...params },
			lastParamsUpdate: Date.now()
		});
		sendSync('join_room', { userId: u.id, userName: u.name });
		step = 'room';
	}

	export function broadcastCurrentParams() {
		if (!isTeacher || !currentRoom) return;
		sendSync('broadcast_params', { params: { ...params } });
		onBroadcastParams?.({ ...params });
		pushNotification('success', '已广播参数设置');
	}

	function changeRoomStatus(status: 'active' | 'paused' | 'ended') {
		if (!isTeacher || !currentRoom) return;
		const patch: Partial<CollaborationRoom> = { status };
		if (status === 'active' && !currentRoom.startedAt) patch.startedAt = Date.now();
		if (status === 'ended') patch.endedAt = Date.now();
		updateRoom(currentRoom.id, patch);
		sendSync('room_status', { status });
		pushNotification(
			'success',
			status === 'active' ? '房间已开始' : status === 'paused' ? '房间已暂停' : '房间已结束'
		);
	}

	function sendChatMessage() {
		const text = chatInput.trim();
		if (!text || !currentRoom) return;
		sendSync('chat', { text });
		chatInput = '';
	}

	function copyRoomCode() {
		if (!currentRoom) return;
		navigator.clipboard.writeText(currentRoom.code).then(() => {
			copied = true;
			pushNotification('success', '房间码已复制');
			setTimeout(() => (copied = false), 2000);
		});
	}

	function leaveRoom() {
		if (!currentRoom || !user) return;
		sendSync('leave_room', { userId: user.id, userName: user.name });
		if (isTeacher && currentRoom.status !== 'ended') {
			updateRoom(currentRoom.id, { status: 'ended', endedAt: Date.now() });
		}
		closeCollaboration();
		step = 'auth';
		inputRoomName = '';
		inputRoomCode = '';
	}

	function getStatusLabel(status: string): string {
		switch (status) {
			case 'waiting':
				return '等待中';
			case 'active':
				return '进行中';
			case 'paused':
				return '已暂停';
			case 'ended':
				return '已结束';
			default:
				return status;
		}
	}

	function getStatusColor(status: string): string {
		switch (status) {
			case 'waiting':
				return 'text-warning-400 bg-warning-500/20';
			case 'active':
				return 'text-success-400 bg-success-500/20';
			case 'paused':
				return 'text-primary-400 bg-primary-500/20';
			case 'ended':
				return 'text-surface-400 bg-surface-600/50';
			default:
				return 'text-surface-300 bg-surface-700';
		}
	}

	function getModeLabel(mode: string): string {
		switch (mode) {
			case 'individual':
				return '👤 独立模式';
			case 'group':
				return '👥 小组模式';
			case 'demo':
				return '📺 演示模式';
			default:
				return mode;
		}
	}

	function formatParamsSummary(p: CameraParams | null): string {
		if (!p) return '暂无参数';
		return `孔${p.apertureSize.toFixed(2)} · 距${p.objectDistance.toFixed(1)} · 箱${p.boxLength.toFixed(1)}`;
	}

	function formatTime(ts: number): string {
		const d = new Date(ts);
		return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
	}
</script>

{#if open}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
		<div class="w-full max-w-5xl max-h-[90vh] bg-surface-900 border border-surface-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
			<!-- 头部 -->
			<div class="flex items-center justify-between px-6 py-4 bg-surface-800 border-b border-surface-700">
				<div class="flex items-center gap-3">
					<div class="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-xl">
						🤝
					</div>
					<div>
						<h2 class="text-xl font-bold text-surface-100">协作教室</h2>
						<p class="text-xs text-surface-400">小孔成像多人互动实验平台</p>
					</div>
				</div>
				<div class="flex items-center gap-3">
					{#if user}
						<div class="flex items-center gap-2 px-3 py-1.5 bg-surface-700/50 rounded-lg">
							<span class="text-lg">{user.avatar}</span>
							<div class="text-sm">
								<div class="text-surface-100 font-medium">{user.name}</div>
								<div class="text-[10px] text-surface-400">
									{user.role === 'teacher' ? '👨‍🏫 教师' : '🧑‍🎓 学生'}
								</div>
							</div>
							<span class="w-2 h-2 rounded-full bg-success-500 animate-pulse" title="在线"></span>
						</div>
					{/if}
					{#if step === 'room'}
						<button
							on:click={leaveRoom}
							class="px-3 py-1.5 bg-error-500/20 text-error-400 border border-error-500/30 rounded-lg text-sm hover:bg-error-500/30 transition-colors"
						>
							离开房间
						</button>
					{/if}
					<button
						on:click={() => {
							if (step === 'room') leaveRoom();
							open = false;
						}}
						class="w-9 h-9 rounded-lg bg-surface-700 text-surface-300 hover:bg-surface-600 hover:text-surface-100 transition-colors flex items-center justify-center"
						aria-label="关闭"
					>
						✕
					</button>
				</div>
			</div>

			<!-- 主体内容 -->
			<div class="flex-1 overflow-hidden">
				<!-- 步骤 1: 身份认证 -->
				{#if step === 'auth'}
					<div class="h-full overflow-y-auto p-6 md:p-10">
						<div class="max-w-lg mx-auto">
							<div class="text-center mb-8">
								<div class="text-5xl mb-3">🎓</div>
								<h3 class="text-2xl font-bold text-surface-100 mb-2">欢迎进入协作教室</h3>
								<p class="text-surface-400">请先选择您的身份并输入姓名</p>
							</div>

							<div class="card bg-surface-800 border-surface-700 p-6 mb-6">
								<label class="block text-sm font-medium text-surface-200 mb-3">选择身份</label>
								<div class="grid grid-cols-2 gap-3 mb-5">
									<button
										class={`p-4 rounded-xl border-2 transition-all ${selectedRole === 'student'
											? 'border-primary-500 bg-primary-500/15'
											: 'border-surface-600 bg-surface-700/30 hover:border-surface-500'}`}
										on:click={() => (selectedRole = 'student')}
									>
										<div class="text-3xl mb-2">🧑‍🎓</div>
										<div class={`font-semibold ${selectedRole === 'student' ? 'text-primary-400' : 'text-surface-200'}`}>学生</div>
										<div class="text-xs text-surface-400 mt-1">加入房间进行实验</div>
									</button>
									<button
										class={`p-4 rounded-xl border-2 transition-all ${selectedRole === 'teacher'
											? 'border-accent-500 bg-accent-500/15'
											: 'border-surface-600 bg-surface-700/30 hover:border-surface-500'}`}
										on:click={() => (selectedRole = 'teacher')}
									>
										<div class="text-3xl mb-2">👨‍🏫</div>
										<div class={`font-semibold ${selectedRole === 'teacher' ? 'text-accent-400' : 'text-surface-200'}`}>教师</div>
										<div class="text-xs text-surface-400 mt-1">创建房间组织教学</div>
									</button>
								</div>

								<label class="block text-sm font-medium text-surface-200 mb-2">姓名</label>
								<input
									type="text"
									bind:value={inputName}
									placeholder="请输入您的姓名"
									class="w-full px-4 py-3 bg-surface-700 border border-surface-600 rounded-xl text-surface-100 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
									on:keydown={(e) => {
										if (e.key === 'Enter') confirmIdentity();
									}}
								/>

								<button
									on:click={confirmIdentity}
									disabled={!inputName.trim()}
									class="w-full mt-5 py-3 bg-gradient-to-r from-primary-500 to-accent-500 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
								>
									确认身份 →
								</button>
							</div>

							<div class="text-center mb-3">
								<span class="text-xs text-surface-500">— 或快速选择演示用户 —</span>
							</div>

							<div class="card bg-surface-800/50 border-surface-700/50 p-4">
								{#if selectedRole === 'teacher'}
									<div class="text-xs text-accent-400 mb-2 font-medium">教师演示账号</div>
									<div class="grid grid-cols-2 gap-2">
										{#each demoTeachers as t}
											<button
												on:click={() => selectDemoUser(t)}
												class="flex items-center gap-2 p-3 bg-surface-700/50 border border-surface-600/50 rounded-lg hover:bg-surface-700 hover:border-accent-500/50 transition-colors text-left"
											>
												<span class="text-2xl">{t.avatar}</span>
												<span class="text-surface-200 font-medium text-sm">{t.name}</span>
											</button>
										{/each}
									</div>
								{:else}
									<div class="text-xs text-primary-400 mb-2 font-medium">学生演示账号</div>
									<div class="grid grid-cols-2 gap-2">
										{#each demoStudents as s}
											<button
												on:click={() => selectDemoUser(s)}
												class="flex items-center gap-2 p-3 bg-surface-700/50 border border-surface-600/50 rounded-lg hover:bg-surface-700 hover:border-primary-500/50 transition-colors text-left"
											>
												<span class="text-2xl">{s.avatar}</span>
												<span class="text-surface-200 font-medium text-sm">{s.name}</span>
											</button>
										{/each}
									</div>
								{/if}
							</div>
						</div>
					</div>

				<!-- 步骤 2: 大厅 (创建/加入房间) -->
				{:else if step === 'lobby'}
					<div class="h-full overflow-y-auto p-6 md:p-10">
						<div class="max-w-3xl mx-auto">
							<div class="flex items-center justify-between mb-6">
								<div>
									<button
										on:click={goBackToAuth}
										class="text-sm text-surface-400 hover:text-surface-200 mb-2 flex items-center gap-1"
									>
										← 返回
									</button>
									<h3 class="text-2xl font-bold text-surface-100">
										{selectedRole === 'teacher' ? '创建教学房间' : '加入协作房间'}
									</h3>
								</div>
							</div>

							{#if selectedRole === 'teacher'}
								<div class="card bg-surface-800 border-surface-700 p-6">
									<div class="mb-5">
										<label class="block text-sm font-medium text-surface-200 mb-2">房间名称</label>
										<input
											type="text"
											bind:value={inputRoomName}
											placeholder="例如：小孔成像探究实验课"
											class="w-full px-4 py-3 bg-surface-700 border border-surface-600 rounded-xl text-surface-100 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent"
										/>
									</div>

									<div class="mb-6">
										<label class="block text-sm font-medium text-surface-200 mb-3">教学模式</label>
										<div class="grid grid-cols-3 gap-3">
											<button
												class={`p-4 rounded-xl border-2 transition-all text-left ${selectedMode === 'individual'
													? 'border-primary-500 bg-primary-500/15'
													: 'border-surface-600 bg-surface-700/30 hover:border-surface-500'}`}
												on:click={() => (selectedMode = 'individual')}
											>
												<div class="text-2xl mb-2">👤</div>
												<div class={`font-semibold text-sm ${selectedMode === 'individual' ? 'text-primary-400' : 'text-surface-200'}`}>
													独立模式
												</div>
												<div class="text-[11px] text-surface-400 mt-1 leading-relaxed">
													学生独立操作，教师查看
												</div>
											</button>
											<button
												class={`p-4 rounded-xl border-2 transition-all text-left ${selectedMode === 'group'
													? 'border-primary-500 bg-primary-500/15'
													: 'border-surface-600 bg-surface-700/30 hover:border-surface-500'}`}
												on:click={() => (selectedMode = 'group')}
											>
												<div class="text-2xl mb-2">👥</div>
												<div class={`font-semibold text-sm ${selectedMode === 'group' ? 'text-primary-400' : 'text-surface-200'}`}>
													小组模式
												</div>
												<div class="text-[11px] text-surface-400 mt-1 leading-relaxed">
													分组协作，可互相查看
												</div>
											</button>
											<button
												class={`p-4 rounded-xl border-2 transition-all text-left ${selectedMode === 'demo'
													? 'border-primary-500 bg-primary-500/15'
													: 'border-surface-600 bg-surface-700/30 hover:border-surface-500'}`}
												on:click={() => (selectedMode = 'demo')}
											>
												<div class="text-2xl mb-2">📺</div>
												<div class={`font-semibold text-sm ${selectedMode === 'demo' ? 'text-primary-400' : 'text-surface-200'}`}>
													演示模式
												</div>
												<div class="text-[11px] text-surface-400 mt-1 leading-relaxed">
													教师演示，同步参数
												</div>
											</button>
										</div>
									</div>

									<button
										on:click={createRoom}
										disabled={!inputRoomName.trim()}
										class="w-full py-3.5 bg-gradient-to-r from-accent-500 to-primary-500 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed text-lg"
									>
										✨ 创建房间并生成房间码
									</button>
								</div>
							{:else}
								<div class="card bg-surface-800 border-surface-700 p-6">
									<div class="text-center mb-6">
										<div class="text-5xl mb-3">🔑</div>
										<div class="text-surface-200 text-lg">输入教师分享的 6 位房间码</div>
									</div>
									<div class="max-w-xs mx-auto mb-6">
										<input
											type="text"
											bind:value={inputRoomCode}
											maxlength="6"
											placeholder="输入房间码"
											class="w-full px-4 py-4 bg-surface-700 border-2 border-surface-600 rounded-2xl text-surface-100 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-center text-2xl font-bold tracking-widest font-mono uppercase"
											on:keydown={(e) => {
												if (e.key === 'Enter') joinRoom();
											}}
										/>
									</div>
									<button
										on:click={joinRoom}
										disabled={inputRoomCode.trim().length !== 6}
										class="w-full max-w-xs mx-auto block py-3.5 bg-gradient-to-r from-primary-500 to-accent-500 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
									>
										🚪 加入房间
									</button>
								</div>
							{/if}
						</div>
					</div>

				<!-- 步骤 3: 房间内部 -->
				{:else if step === 'room' && currentRoom}
					<div class="h-full overflow-hidden grid grid-cols-1 lg:grid-cols-3 gap-0">
						<!-- 左侧: 房间信息 + 参与者 -->
						<div class="lg:col-span-1 flex flex-col border-r border-surface-700 overflow-hidden">
							<!-- 房间信息卡 -->
							<div class="p-4 border-b border-surface-700 bg-surface-800/50">
								<div class="flex items-start justify-between mb-3">
									<div>
										<h4 class="font-bold text-surface-100 text-lg">{currentRoom.name}</h4>
										<div class="flex items-center gap-2 mt-1">
											<span class={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(currentRoom.status)}`}>
												{getStatusLabel(currentRoom.status)}
											</span>
											<span class="text-xs text-surface-400">
												{getModeLabel(currentRoom.mode)}
											</span>
										</div>
									</div>
								</div>

								<div class="bg-surface-700/50 rounded-xl p-3">
									<div class="flex items-center justify-between">
										<div>
											<div class="text-[10px] text-surface-400 uppercase tracking-wider mb-1">房间码</div>
											<div class="text-2xl font-mono font-bold tracking-widest text-primary-400">
												{currentRoom.code}
											</div>
										</div>
										<button
											on:click={copyRoomCode}
											class={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${copied
												? 'bg-success-500/20 text-success-400 border border-success-500/30'
												: 'bg-surface-600 text-surface-300 hover:bg-surface-500 border border-surface-500'}`}
										>
											{copied ? '✓ 已复制' : '📋 复制'}
										</button>
									</div>
								</div>

								{#if isTeacher}
									<div class="grid grid-cols-3 gap-2 mt-3">
										{#if currentRoom.status === 'waiting' || currentRoom.status === 'paused'}
											<button
												on:click={() => changeRoomStatus('active')}
												class="py-2 bg-success-500/20 text-success-400 border border-success-500/30 rounded-lg text-sm font-medium hover:bg-success-500/30 transition-colors"
											>
												▶ 开始
											</button>
										{/if}
										{#if currentRoom.status === 'active'}
											<button
												on:click={() => changeRoomStatus('paused')}
												class="py-2 bg-warning-500/20 text-warning-400 border border-warning-500/30 rounded-lg text-sm font-medium hover:bg-warning-500/30 transition-colors"
											>
												⏸ 暂停
											</button>
										{/if}
										{#if currentRoom.status !== 'ended'}
											<button
												on:click={() => changeRoomStatus('ended')}
												class="py-2 bg-error-500/20 text-error-400 border border-error-500/30 rounded-lg text-sm font-medium hover:bg-error-500/30 transition-colors"
											>
												⏹ 结束
											</button>
										{/if}
										<button
											on:click={broadcastCurrentParams}
											class="py-2 bg-primary-500/20 text-primary-400 border border-primary-500/30 rounded-lg text-sm font-medium hover:bg-primary-500/30 transition-colors"
											title="将当前参数同步给所有学生"
										>
											📡 广播参数
										</button>
									</div>
								{/if}
							</div>

							<!-- 参与者列表 -->
							<div class="flex-1 overflow-hidden flex flex-col p-4">
								<div class="flex items-center justify-between mb-3">
									<h5 class="font-semibold text-surface-200 flex items-center gap-2">
										👥 在线参与者
										<span class="px-2 py-0.5 bg-surface-700 rounded-full text-xs text-surface-400">
											{participants.length}
										</span>
									</h5>
								</div>

								<div class="flex-1 overflow-y-auto space-y-2 pr-1" style="scrollbar-width: thin;">
									{#each participants as p (p.id)}
										<div
											class="p-3 rounded-xl bg-surface-800/70 border border-surface-700/50 hover:bg-surface-800 transition-colors"
										>
											<div class="flex items-start gap-3">
												<div class="relative flex-shrink-0">
													<div
														class="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
														style="background: {p.color || '#4b5563'}33;"
													>
														{p.avatar}
													</div>
													<span
														class={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-surface-800 ${p.online
															? 'bg-success-500'
															: 'bg-surface-500'}`}
													></span>
												</div>
												<div class="flex-1 min-w-0">
													<div class="flex items-center gap-2">
														<span class="font-medium text-surface-100 text-sm truncate">
															{p.name}
														</span>
														{#if p.id === currentRoom.teacherId}
															<span class="px-1.5 py-0.5 bg-accent-500/20 text-accent-400 rounded text-[10px] font-medium flex-shrink-0">
																教师
															</span>
														{:else}
															<span class="px-1.5 py-0.5 bg-primary-500/20 text-primary-400 rounded text-[10px] font-medium flex-shrink-0">
																学生
															</span>
														{/if}
														{#if p.id === user?.id}
															<span class="px-1.5 py-0.5 bg-success-500/20 text-success-400 rounded text-[10px] flex-shrink-0">
																我
															</span>
														{/if}
													</div>
													<div class="mt-1.5">
														<div class="text-[10px] text-surface-400 mb-1">当前参数</div>
														<div class="font-mono text-[11px] text-surface-300 bg-surface-700/50 px-2 py-1 rounded truncate">
															{formatParamsSummary(p.state?.currentParams || null)}
														</div>
													</div>
													{#if p.studentId}
														<div class="text-[10px] text-surface-500 mt-1">学号：{p.studentId}</div>
													{/if}
												</div>
											</div>
										</div>
									{:else}
										<div class="text-center py-8 text-surface-500 text-sm">
											暂无参与者
										</div>
									{/each}
								</div>
							</div>
						</div>

						<!-- 右侧: 聊天区 -->
						<div class="lg:col-span-2 flex flex-col overflow-hidden">
							<div class="flex-1 overflow-hidden flex flex-col bg-surface-800/30">
								<div class="px-5 py-3 border-b border-surface-700 flex items-center justify-between">
									<h5 class="font-semibold text-surface-200 flex items-center gap-2">
										💬 教室聊天
										<span class="px-2 py-0.5 bg-surface-700 rounded-full text-xs text-surface-400">
											{messages.length}
										</span>
									</h5>
									{#if currentRoom.status !== 'waiting'}
										<span class={`text-xs ${currentRoom.status === 'active'
											? 'text-success-400'
											: currentRoom.status === 'paused'
												? 'text-warning-400'
												: 'text-error-400'}`}>
											● {currentRoom.status === 'active'
												? '实验进行中'
												: currentRoom.status === 'paused'
													? '实验暂停'
													: '实验已结束'}
										</span>
									{/if}
								</div>

								<div class="flex-1 overflow-y-auto p-5 space-y-3" style="scrollbar-width: thin;">
									{#if messages.length === 0}
										<div class="h-full flex flex-col items-center justify-center text-surface-500">
											<div class="text-5xl mb-3 opacity-50">💭</div>
											<div class="text-sm">暂无消息，打个招呼吧！</div>
										</div>
									{:else}
										{#each messages as msg (msg.timestamp + msg.senderId)}
											{@const isMe = msg.senderId === user?.id}
											{@const senderIsTeacher = participants.find(p => p.id === msg.senderId)?.role === 'teacher'}
											<div class="flex gap-3 {isMe ? 'flex-row-reverse' : ''}">
												<div
													class="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
													style="background: {participants.find(p => p.id === msg.senderId)?.color || '#4b5563'}33;"
												>
													{participants.find(p => p.id === msg.senderId)?.avatar || '👤'}
												</div>
												<div class="max-w-[75%] {isMe ? 'items-end' : 'items-start'}">
													<div class="flex items-center gap-2 mb-1 {isMe ? 'flex-row-reverse' : ''}">
														<span class={`text-xs font-medium ${senderIsTeacher ? 'text-accent-400' : 'text-surface-300'}`}>
															{msg.senderName}
														</span>
														<span class="text-[10px] text-surface-500">
															{formatTime(msg.timestamp)}
														</span>
													</div>
													<div
														class={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${isMe
															? 'bg-primary-500 text-white rounded-br-md'
															: senderIsTeacher
																? 'bg-accent-500/20 text-accent-100 border border-accent-500/30 rounded-bl-md'
																: 'bg-surface-700 text-surface-100 rounded-bl-md'}`}
													>
														{String(msg.payload.text || '')}
													</div>
												</div>
											</div>
										{/each}
									{/if}
								</div>

								<div class="p-4 border-t border-surface-700 bg-surface-800/50">
									<div class="flex gap-2">
										<input
											type="text"
											bind:value={chatInput}
											placeholder="输入消息..."
											class="flex-1 px-4 py-2.5 bg-surface-700 border border-surface-600 rounded-xl text-surface-100 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
											on:keydown={(e) => {
												if (e.key === 'Enter' && !e.shiftKey) {
													e.preventDefault();
													sendChatMessage();
												}
											}}
										/>
										<button
											on:click={sendChatMessage}
											disabled={!chatInput.trim()}
											class="px-5 py-2.5 bg-gradient-to-r from-primary-500 to-accent-500 text-white font-medium rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
										>
											发送
										</button>
									</div>
								</div>
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	::-webkit-scrollbar {
		width: 6px;
		height: 6px;
	}

	::-webkit-scrollbar-track {
		background: transparent;
	}

	::-webkit-scrollbar-thumb {
		background: #4b5563;
		border-radius: 3px;
	}

	::-webkit-scrollbar-thumb:hover {
		background: #6b7280;
	}
</style>
