import { writable, derived, get } from 'svelte/store';
import type {
	User,
	Classroom,
	CollaborationRoom,
	RoomParticipantState,
	Assignment,
	Submission,
	Annotation,
	SyncMessage,
	CameraParams,
	ExperimentRecording
} from './cameraObscura';
import {
	CollaborationManager,
	loadCurrentUser,
	saveCurrentUser,
	loadUsersFromStorage,
	saveUsersToStorage,
	loadClassroomsFromStorage,
	saveClassroomsToStorage,
	loadRoomsFromStorage,
	saveRoomsToStorage,
	loadAssignmentsFromStorage,
	saveAssignmentsToStorage,
	loadSubmissionsFromStorage,
	saveSubmissionsToStorage,
	loadParticipantStates,
	saveParticipantStates,
	createSubmission,
	calculateSubmissionAutoScore,
	getTotalScore,
	generateId,
	createSubmissionVersion
} from './cameraObscura';

const initDemoData = () => {
	const existingUsers = loadUsersFromStorage();
	if (existingUsers.length > 0) return;

	const classId = generateId();
	const teacher = {
		id: generateId(),
		name: '李老师',
		role: 'teacher' as const,
		avatar: '👨‍🏫',
		classId,
		color: '#ee7718',
		online: true,
		lastActive: Date.now()
	};

	const studentNames = ['张伟', '李娜', '王芳', '刘洋', '陈静', '杨帆', '赵磊', '黄敏'];
	const students = studentNames.map((name, i) => ({
		id: generateId(),
		name,
		role: 'student' as const,
		avatar: ['🧑‍🎓', '👨‍🎓', '👩‍🎓'][i % 3],
		studentId: 'S2024' + String(1001 + i),
		classId,
		color: ['#4fc3f7', '#81c784', '#ffb74d', '#f06292', '#ba68c8', '#4dd0e1', '#aed581', '#ff8a65'][i],
		online: i < 5,
		lastActive: Date.now() - i * 60000
	}));

	const allUsers = [teacher, ...students];
	saveUsersToStorage(allUsers);

	const classroom: Classroom = {
		id: classId,
		name: '物理实验班 2024级1班',
		teacherId: teacher.id,
		studentIds: students.map((s) => s.id),
		createdAt: Date.now() - 7 * 24 * 3600 * 1000,
		activeRoomId: null
	};
	saveClassroomsToStorage([classroom]);
};

initDemoData();

export const currentUser = writable<User | null>(loadCurrentUser());
currentUser.subscribe((u) => saveCurrentUser(u));

export const users = writable<User[]>(loadUsersFromStorage());
users.subscribe((u) => saveUsersToStorage(u));

export const classrooms = writable<Classroom[]>(loadClassroomsFromStorage());
classrooms.subscribe((c) => saveClassroomsToStorage(c));

export const rooms = writable<CollaborationRoom[]>(loadRoomsFromStorage());
rooms.subscribe((r) => saveRoomsToStorage(r));

export const assignments = writable<Assignment[]>(loadAssignmentsFromStorage());
assignments.subscribe((a) => saveAssignmentsToStorage(a));

export const submissions = writable<Submission[]>(loadSubmissionsFromStorage());
submissions.subscribe((s) => saveSubmissionsToStorage(s));

export const participantStates = writable<RoomParticipantState[]>(loadParticipantStates());
participantStates.subscribe((p) => saveParticipantStates(p));

export const activeRoomId = writable<string | null>(null);
export const chatMessages = writable<SyncMessage[]>([]);
export const notifications = writable<{ id: string; type: 'info' | 'success' | 'warning' | 'error'; message: string }[]>([]);

let manager: CollaborationManager | null = null;

export function initCollaboration(roomId: string, user: User) {
	closeCollaboration();
	manager = new CollaborationManager(roomId);
	manager.currentUser = user;
	activeRoomId.set(roomId);

	manager.on('join_room', (msg) => {
		pushNotification('info', `${msg.senderName} 加入了房间`);
	});
	manager.on('leave_room', (msg) => {
		pushNotification('info', `${msg.senderName} 离开了房间`);
	});
	manager.on('params_update', (msg) => {
		const ps = get(participantStates);
		const idx = ps.findIndex((p) => p.roomId === msg.roomId && p.userId === msg.senderId);
		if (idx >= 0) {
			ps[idx] = {
				...ps[idx],
				currentParams: msg.payload.params as CameraParams,
				lastParamsUpdate: msg.timestamp
			};
			participantStates.set([...ps]);
		}
	});
	manager.on('broadcast_params', (msg) => {
		pushNotification('info', `${msg.senderName} 广播了参数设置`);
		if (typeof window !== 'undefined') {
			const event = new CustomEvent('coop_broadcast_params', { detail: msg.payload });
			window.dispatchEvent(event);
		}
	});
	manager.on('assignment_publish', () => {
		assignments.set(loadAssignmentsFromStorage());
		pushNotification('success', '收到新的任务发布！');
	});
	manager.on('submission_submit', () => {
		submissions.set(loadSubmissionsFromStorage());
	});
	manager.on('submission_review', () => {
		submissions.set(loadSubmissionsFromStorage());
		pushNotification('success', '任务评分已更新');
	});
	manager.on('annotation_add', () => {
		submissions.set(loadSubmissionsFromStorage());
	});
	manager.on('annotation_reply', () => {
		submissions.set(loadSubmissionsFromStorage());
	});
	manager.on('room_status', () => {
		rooms.set(loadRoomsFromStorage());
	});
	manager.on('chat', (msg) => {
		chatMessages.update((arr) => [...arr, msg]);
	});
}

export function closeCollaboration() {
	manager?.close();
	manager = null;
	activeRoomId.set(null);
}

export function sendSync(type: Parameters<CollaborationManager['send']>[0], payload: Record<string, unknown>) {
	const rid = get(activeRoomId);
	if (manager && rid) manager.send(type, payload, rid);
}

export function pushNotification(type: 'info' | 'success' | 'warning' | 'error', message: string) {
	const id = generateId();
	notifications.update((arr) => [...arr, { id, type, message }]);
	if (typeof setTimeout !== 'undefined') {
		setTimeout(() => {
			notifications.update((arr) => arr.filter((n) => n.id !== id));
		}, 4000);
	}
}

export const activeRoom = derived([rooms, activeRoomId], ([$rooms, $rid]) => {
	const safeRooms = Array.isArray($rooms) ? $rooms : [];
	return safeRooms.find((r) => r.id === $rid) || null;
});

export const activeRoomAssignments = derived([assignments, activeRoomId], ([$a, $rid]) => {
	const safeAssignments = Array.isArray($a) ? $a : [];
	return safeAssignments.filter((x) => x.roomId === $rid);
});

export const activeRoomSubmissions = derived([submissions, activeRoomId], ([$s, $rid]) => {
	const safeSubmissions = Array.isArray($s) ? $s : [];
	return safeSubmissions.filter((x) => x.roomId === $rid);
});

export const activeRoomParticipants = derived(
	[users, participantStates, activeRoomId],
	([$users, $ps, $rid]) => {
		const safeUsers = Array.isArray($users) ? $users : [];
		const safePs = Array.isArray($ps) ? $ps : [];
		const states = safePs.filter((p) => p.roomId === $rid);
		return states
			.map((state) => {
				const user = safeUsers.find((u) => u.id === state.userId);
				return user ? { ...user, state } : null;
			})
			.filter(Boolean) as (User & { state: RoomParticipantState })[];
	}
);

export function setCurrentUser(user: User | null) {
	currentUser.set(user);
}

export function upsertUser(user: User) {
	users.update((arr) => {
		const idx = arr.findIndex((u) => u.id === user.id);
		if (idx >= 0) arr[idx] = { ...arr[idx], ...user };
		else arr.push(user);
		return [...arr];
	});
}

export function addRoom(room: CollaborationRoom) {
	rooms.update((arr) => [...arr, room]);
}

export function updateRoom(id: string, patch: Partial<CollaborationRoom>) {
	rooms.update((arr) => arr.map((r) => (r.id === id ? { ...r, ...patch } : r)));
}

export function addAssignment(assignment: Assignment) {
	assignments.update((arr) => [...arr, assignment]);
}

export function updateAssignment(id: string, patch: Partial<Assignment>) {
	assignments.update((arr) => arr.map((a) => (a.id === id ? { ...a, ...patch } : a)));
}

export function getOrCreateSubmission(assignmentId: string, roomId: string, student: User): Submission {
	const all = get(submissions);
	let sub = all.find((s) => s.assignmentId === assignmentId && s.studentId === student.id);
	if (!sub) {
		sub = createSubmission(assignmentId, roomId, student);
		submissions.update((arr) => [...arr, sub!]);
	}
	return sub!;
}

export function updateSubmission(id: string, patch: Partial<Submission>) {
	submissions.update((arr) => {
		const idx = arr.findIndex((s) => s.id === id);
		if (idx < 0) return arr;
		arr[idx] = { ...arr[idx], ...patch };
		if (patch.finalParams || patch.conclusionText || patch.recordingSnapshot) {
			arr[idx].versionHistory.push(
				createSubmissionVersion(arr[idx], get(currentUser)?.id || '', '自动保存')
			);
		}
		return [...arr];
	});
}

export function submitSubmission(id: string, recording: ExperimentRecording | null, params: CameraParams) {
	const all = get(submissions);
	const sub = all.find((s) => s.id === id);
	const assignment = get(assignments).find((a) => a.id === sub?.assignmentId);
	if (!sub || !assignment) return;

	const autoScores = calculateSubmissionAutoScore(sub, assignment);
	const total = getTotalScore(autoScores);

	submissions.update((arr) =>
		arr.map((s) =>
			s.id === id
				? {
						...s,
						finalParams: { ...params },
						recordingSnapshot: recording ? JSON.parse(JSON.stringify(recording)) : null,
						recordingId: recording?.id || null,
						scores: autoScores,
						totalScore: total,
						status: 'submitted',
						submittedAt: Date.now(),
						versionHistory: [
							...s.versionHistory,
							createSubmissionVersion(s, get(currentUser)?.id || '', '正式提交')
						]
					}
				: s
		)
	);
	pushNotification('success', `提交成功！自动评分 ${total} 分`);
}

export function reviewSubmission(id: string, scores: Record<string, number>, feedback: string, reviewerId: string) {
	submissions.update((arr) =>
		arr.map((s) =>
			s.id === id
				? {
						...s,
						scores: { ...s.scores, ...scores },
						totalScore: getTotalScore({ ...s.scores, ...scores }),
						feedback,
						status: 'reviewed',
						reviewedAt: Date.now(),
						reviewerId
					}
				: s
		)
	);
}

export function addAnnotation(submissionId: string, ann: Omit<Annotation, 'id' | 'submissionId' | 'timestamp' | 'replies'>) {
	const newAnn: Annotation = {
		...ann,
		id: generateId(),
		submissionId,
		timestamp: Date.now(),
		replies: []
	};
	submissions.update((arr) =>
		arr.map((s) => (s.id === submissionId ? { ...s, annotations: [...s.annotations, newAnn] } : s))
	);
}

export function replyToAnnotation(submissionId: string, annotationId: string, authorId: string, authorName: string, content: string) {
	submissions.update((arr) =>
		arr.map((s) => {
			if (s.id !== submissionId) return s;
			return {
				...s,
				annotations: s.annotations.map((a) =>
					a.id === annotationId
						? {
								...a,
								replies: [
									...(a.replies || []),
									{ id: generateId(), authorId, authorName, timestamp: Date.now(), content }
								]
							}
						: a
				)
			};
		})
	);
}

export function updateParticipantState(roomId: string, userId: string, patch: Partial<RoomParticipantState>) {
	participantStates.update((arr) => {
		const idx = arr.findIndex((p) => p.roomId === roomId && p.userId === userId);
		if (idx >= 0) {
			arr[idx] = { ...arr[idx], ...patch };
		} else {
			arr.push({
				roomId,
				userId,
				joinedAt: Date.now(),
				currentParams: null,
				currentRecordingId: null,
				lastParamsUpdate: Date.now(),
				score: 0,
				progress: 0,
				activityLog: [],
				...patch
			});
		}
		return [...arr];
	});
}

export function logActivity(roomId: string, userId: string, action: string, detail?: string) {
	participantStates.update((arr) => {
		const idx = arr.findIndex((p) => p.roomId === roomId && p.userId === userId);
		if (idx < 0) return arr;
		arr[idx] = {
			...arr[idx],
			activityLog: [
				...arr[idx].activityLog.slice(-49),
				{ timestamp: Date.now(), action, detail }
			]
		};
		return [...arr];
	});
}
