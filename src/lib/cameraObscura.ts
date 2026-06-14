export interface CameraParams {
	boxLength: number;
	apertureSize: number;
	objectDistance: number;
	objectHeight: number;
	lightIntensity: number;
}

export interface ImageResult {
	imageHeight: number;
	brightness: number;
	sharpness: number;
	isValid: boolean;
	message?: string;
	magnification: number;
	blurCircleDiameter: number;
}

export interface TheoreticalResult {
	imageHeight: number;
	brightness: number;
	sharpness: number;
	magnification: number;
	blurCircleDiameter: number;
}

export interface ErrorAnalysis {
	imageHeightError: number;
	brightnessError: number;
	sharpnessError: number;
	blurCircleDiameter: number;
	blurCircleError: number;
	theoretical: TheoreticalResult;
	simulated: ImageResult;
}

export interface InvalidDistanceResult {
	isInvalid: boolean;
	reasons: InvalidReason[];
}

export interface InvalidReason {
	field: string;
	level: 'warning' | 'error' | 'invalid';
	message: string;
	suggestion: string;
}

export interface Preset {
	id: string;
	name: string;
	params: CameraParams;
	createdAt: number;
	color?: string;
}

export interface SchemeSlot {
	id: string;
	presetId: string | null;
	name: string;
	params: CameraParams;
	color: string;
}

export const PRESET_COLORS = [
	'#4fc3f7',
	'#81c784',
	'#ffb74d',
	'#f06292',
	'#ba68c8',
	'#4dd0e1',
	'#aed581',
	'#ff8a65'
];

export const DEFAULT_PARAMS: CameraParams = {
	boxLength: 5,
	apertureSize: 0.2,
	objectDistance: 10,
	objectHeight: 4,
	lightIntensity: 1
};

export interface ValidationWarning {
	field: string;
	level: 'warning' | 'error';
	message: string;
}

export function validateParams(params: CameraParams): {
	valid: boolean;
	message?: string;
	warnings?: ValidationWarning[];
} {
	const warnings: ValidationWarning[] = [];

	if (params.boxLength <= 0) {
		return { valid: false, message: '暗箱长度必须大于零' };
	}
	if (params.apertureSize <= 0) {
		return { valid: false, message: '孔径大小必须大于零' };
	}
	if (params.objectDistance <= 0) {
		return { valid: false, message: '物体距离必须大于零' };
	}
	if (params.objectHeight <= 0) {
		return { valid: false, message: '物体高度必须大于零' };
	}
	if (params.lightIntensity <= 0) {
		return { valid: false, message: '光线强度必须大于零' };
	}

	if (params.objectDistance <= params.boxLength) {
		warnings.push({
			field: 'objectDistance',
			level: 'warning',
			message: `物体距离(${params.objectDistance.toFixed(1)})过近，应大于暗箱长度(${params.boxLength.toFixed(1)})才能形成清晰倒像`
		});
	}

	if (params.objectDistance >= 25) {
		warnings.push({
			field: 'objectDistance',
			level: 'warning',
			message: '物体距离过大，成像将非常小且暗淡，可能难以观察'
		});
	}

	if (params.objectDistance <= 2.5) {
		warnings.push({
			field: 'objectDistance',
			level: 'warning',
			message: '物体距离过近，成像放大倍率过大，成像质量会显著下降'
		});
	}

	if (params.apertureSize > 1) {
		warnings.push({
			field: 'apertureSize',
			level: 'warning',
			message: '孔径较大，成像更亮但更模糊（小孔成像原理）'
		});
	}

	if (params.apertureSize < 0.1) {
		warnings.push({
			field: 'apertureSize',
			level: 'warning',
			message: '孔径非常小，成像清晰但非常暗淡'
		});
	}

	return { valid: true, warnings };
}

export function calculateImage(params: CameraParams): ImageResult {
	const validation = validateParams(params);
	if (!validation.valid) {
		return {
			imageHeight: 0,
			brightness: 0,
			sharpness: 0,
			isValid: false,
			message: validation.message,
			magnification: 0,
			blurCircleDiameter: 0
		};
	}

	const magnification = params.boxLength / params.objectDistance;
	const imageHeight = params.objectHeight * magnification;

	const apertureArea = Math.PI * (params.apertureSize / 2) ** 2;
	const distanceFactor = 1 / params.objectDistance ** 2;
	const brightness = params.lightIntensity * apertureArea * distanceFactor * 100;

	const diffractionLimit = 1.22 * 550e-9 * (params.boxLength / params.apertureSize);
	const apertureBlur = params.apertureSize * magnification * 2;
	const totalBlur = Math.sqrt(diffractionLimit ** 2 + apertureBlur ** 2);
	const blurCircleDiameter = totalBlur;
	const maxBlur = params.objectHeight;
	const sharpness = Math.max(0, 1 - totalBlur / maxBlur) * 100;

	return {
		imageHeight,
		brightness: Math.min(brightness, 100),
		sharpness: Math.max(0, Math.min(sharpness, 100)),
		isValid: true,
		magnification,
		blurCircleDiameter
	};
}

export function calculateTheoreticalImage(params: CameraParams): TheoreticalResult {
	const magnification = params.boxLength / params.objectDistance;
	const imageHeight = params.objectHeight * magnification;

	const apertureArea = Math.PI * (params.apertureSize / 2) ** 2;
	const brightness = ((params.lightIntensity * apertureArea) / params.objectDistance ** 2) * 100;

	return {
		imageHeight,
		brightness: Math.min(brightness, 100),
		sharpness: 100,
		magnification,
		blurCircleDiameter: 0
	};
}

export function calculateErrorAnalysis(params: CameraParams): ErrorAnalysis {
	const theoretical = calculateTheoreticalImage(params);
	const simulated = calculateImage(params);

	const imageHeightError =
		theoretical.imageHeight > 0
			? (Math.abs(simulated.imageHeight - theoretical.imageHeight) /
					theoretical.imageHeight) *
				100
			: 0;

	const brightnessError =
		theoretical.brightness > 0
			? (Math.abs(simulated.brightness - theoretical.brightness) / theoretical.brightness) *
				100
			: 0;

	const sharpnessError =
		theoretical.sharpness > 0
			? (Math.abs(simulated.sharpness - theoretical.sharpness) / theoretical.sharpness) * 100
			: 0;

	const blurCircleError =
		simulated.imageHeight > 0
			? (simulated.blurCircleDiameter / simulated.imageHeight) * 100
			: 0;

	return {
		imageHeightError,
		brightnessError,
		sharpnessError,
		blurCircleDiameter: simulated.blurCircleDiameter,
		blurCircleError,
		theoretical,
		simulated
	};
}

export function detectInvalidDistance(params: CameraParams): InvalidDistanceResult {
	const reasons: InvalidReason[] = [];

	if (params.objectDistance <= params.boxLength) {
		reasons.push({
			field: 'objectDistance',
			level: 'error',
			message: `物体距离(${params.objectDistance.toFixed(1)}) ≤ 暗箱长度(${params.boxLength.toFixed(1)})，无法形成实像`,
			suggestion: '增大物体距离至大于暗箱长度'
		});
	}

	if (params.objectDistance >= 25) {
		reasons.push({
			field: 'objectDistance',
			level: 'warning',
			message: '物体距离过大，成像极小且极暗，实际不可观察',
			suggestion: '减小物体距离至 25 以内'
		});
	}

	if (params.objectDistance <= 2.5) {
		reasons.push({
			field: 'objectDistance',
			level: 'warning',
			message: '物体距离过近，放大率过大，成像严重失真',
			suggestion: '增大物体距离至 2.5 以上'
		});
	}

	const magnification = params.boxLength / params.objectDistance;
	if (magnification > 5) {
		reasons.push({
			field: 'magnification',
			level: 'warning',
			message: `放大倍率(${magnification.toFixed(1)}x)过大，成像质量严重下降`,
			suggestion: '增大物体距离或减小暗箱长度'
		});
	}

	if (magnification < 0.05) {
		reasons.push({
			field: 'magnification',
			level: 'invalid',
			message: `放大倍率(${magnification.toFixed(3)}x)极小，成像几乎不可见`,
			suggestion: '减小物体距离或增大暗箱长度'
		});
	}

	const simulated = calculateImage(params);
	if (simulated.isValid && simulated.brightness < 1) {
		reasons.push({
			field: 'brightness',
			level: 'invalid',
			message: `成像亮度(${simulated.brightness.toFixed(2)}%)极低，实际不可见`,
			suggestion: '增大孔径或光线强度，或减小物体距离'
		});
	}

	if (simulated.isValid && simulated.sharpness < 5) {
		reasons.push({
			field: 'sharpness',
			level: 'warning',
			message: `成像清晰度(${simulated.sharpness.toFixed(1)}%)极低，像严重模糊`,
			suggestion: '减小孔径大小以提升清晰度'
		});
	}

	if (simulated.isValid && simulated.imageHeight < 0.05) {
		reasons.push({
			field: 'imageHeight',
			level: 'invalid',
			message: `像高(${simulated.imageHeight.toFixed(3)})极小，实际不可分辨`,
			suggestion: '增大物体高度或减小物体距离'
		});
	}

	return {
		isInvalid: reasons.some((r) => r.level === 'error' || r.level === 'invalid'),
		reasons
	};
}

export interface LightRay {
	start: { x: number; y: number; z: number };
	aperture: { x: number; y: number; z: number };
	end: { x: number; y: number; z: number };
	intensity: number;
}

export function calculateLightRays(
	params: CameraParams,
	rayCount: number = 11
): { rays: LightRay[]; apertureCenter: { x: number; y: number; z: number } } {
	const rays: LightRay[] = [];
	const apertureCenter = { x: 0, y: 0, z: 0 };

	if (!validateParams(params).valid) {
		return { rays, apertureCenter };
	}

	const objectX = -params.objectDistance;
	const boxEndX = params.boxLength;

	const topY = params.objectHeight / 2;
	const bottomY = -params.objectHeight / 2;
	const midY = 0;

	const objectPoints = [
		{ x: objectX, y: topY, z: 0 },
		{ x: objectX, y: midY, z: 0 },
		{ x: objectX, y: bottomY, z: 0 }
	];

	const apertureHalfSize = params.apertureSize / 2;
	const aperturePoints: { x: number; y: number; z: number }[] = [];

	for (let i = 0; i < rayCount; i++) {
		const t = i / (rayCount - 1);
		const y = apertureHalfSize * (2 * t - 1);
		aperturePoints.push({ x: 0, y, z: 0 });
	}

	for (const objPoint of objectPoints) {
		for (const apPoint of aperturePoints) {
			const dirX = apPoint.x - objPoint.x;
			const dirY = apPoint.y - objPoint.y;
			const dirZ = apPoint.z - objPoint.z;

			const t = (boxEndX - objPoint.x) / dirX;
			const endY = objPoint.y + dirY * t;
			const endZ = objPoint.z + dirZ * t;

			const distToCenter = Math.sqrt(apPoint.y ** 2 + apPoint.z ** 2);
			const intensity =
				params.lightIntensity * (1 - distToCenter / apertureHalfSize) * 0.5 + 0.5;

			rays.push({
				start: { ...objPoint },
				aperture: { ...apPoint },
				end: { x: boxEndX, y: endY, z: endZ },
				intensity: Math.max(0.2, Math.min(1, intensity))
			});
		}
	}

	return { rays, apertureCenter };
}

export function generateId(): string {
	return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

export function generateReport(schemes: SchemeSlot[], _allPresets: Preset[]): string {
	const timestamp = new Date().toLocaleString('zh-CN');
	let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>暗箱成像对比分析报告</title>
<style>
body{font-family:'Segoe UI',system-ui,sans-serif;background:#1a1a2e;color:#e0e0e0;padding:24px;margin:0}
h1{color:#ee7718;border-bottom:2px solid #ee7718;padding-bottom:8px}
h2{color:#4fc3f7;margin-top:24px}
table{border-collapse:collapse;width:100%;margin:12px 0}
th,td{border:1px solid #444;padding:8px 12px;text-align:center;font-size:14px}
th{background:#2a2a3e;color:#f1953d}
tr:nth-child(even){background:#22223a}
.error-cell{color:#ef4444;font-weight:bold}
.good-cell{color:#4ade80}
.warn-cell{color:#fbbf24}
.timestamp{color:#888;font-size:12px;margin-top:32px}
.scheme-color{display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:6px;vertical-align:middle}
</style>
</head>
<body>
<h1>📷 暗箱成像多方案对比分析报告</h1>
<p>生成时间：${timestamp}</p>
`;

	schemes.forEach((scheme, idx) => {
		const error = calculateErrorAnalysis(scheme.params);
		const invalid = detectInvalidDistance(scheme.params);

		html += `<h2><span class="scheme-color" style="background:${scheme.color}"></span>方案 ${idx + 1}：${scheme.name}</h2>`;
		html += `<table><tr><th>参数</th><th>数值</th></tr>`;
		html += `<tr><td>暗箱长度</td><td>${scheme.params.boxLength.toFixed(1)}</td></tr>`;
		html += `<tr><td>孔径大小</td><td>${scheme.params.apertureSize.toFixed(2)}</td></tr>`;
		html += `<tr><td>物体距离</td><td>${scheme.params.objectDistance.toFixed(1)}</td></tr>`;
		html += `<tr><td>物体高度</td><td>${scheme.params.objectHeight.toFixed(1)}</td></tr>`;
		html += `<tr><td>光线强度</td><td>${scheme.params.lightIntensity.toFixed(1)}</td></tr>`;
		html += `</table>`;

		html += `<table><tr><th>指标</th><th>理论值</th><th>模拟值</th><th>误差</th></tr>`;
		html += `<tr><td>像高</td><td>${error.theoretical.imageHeight.toFixed(3)}</td><td>${error.simulated.imageHeight.toFixed(3)}</td><td class="${error.imageHeightError > 5 ? 'error-cell' : 'good-cell'}">${error.imageHeightError.toFixed(2)}%</td></tr>`;
		html += `<tr><td>亮度</td><td>${error.theoretical.brightness.toFixed(2)}%</td><td>${error.simulated.brightness.toFixed(2)}%</td><td class="${error.brightnessError > 20 ? 'error-cell' : error.brightnessError > 10 ? 'warn-cell' : 'good-cell'}">${error.brightnessError.toFixed(2)}%</td></tr>`;
		html += `<tr><td>清晰度</td><td>${error.theoretical.sharpness.toFixed(1)}%</td><td>${error.simulated.sharpness.toFixed(1)}%</td><td class="${error.sharpnessError > 30 ? 'error-cell' : error.sharpnessError > 15 ? 'warn-cell' : 'good-cell'}">${error.sharpnessError.toFixed(2)}%</td></tr>`;
		html += `<tr><td>模糊圈直径</td><td>0</td><td>${error.blurCircleDiameter.toFixed(4)}</td><td class="${error.blurCircleError > 20 ? 'error-cell' : error.blurCircleError > 10 ? 'warn-cell' : 'good-cell'}">模糊占比 ${error.blurCircleError.toFixed(2)}%</td></tr>`;
		html += `<tr><td>放大倍率</td><td>${error.theoretical.magnification.toFixed(3)}x</td><td>${error.simulated.magnification.toFixed(3)}x</td><td>-</td></tr>`;
		html += `</table>`;

		if (invalid.reasons.length > 0) {
			html += `<h3 style="color:#f59e0b">⚠ 成像问题</h3><ul>`;
			invalid.reasons.forEach((r) => {
				html += `<li style="color:${r.level === 'error' ? '#ef4444' : r.level === 'invalid' ? '#f87171' : '#fbbf24'}">${r.message} → 建议：${r.suggestion}</li>`;
			});
			html += `</ul>`;
		}
	});

	html += `<p class="timestamp">报告由 暗箱多方案分屏对比与真实成像误差分析系统 自动生成</p>`;
	html += `</body></html>`;

	return html;
}

export function downloadFile(content: string, filename: string, type: string = 'text/html') {
	const blob = new Blob([content], { type });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

export function createDefaultScheme(index: number): SchemeSlot {
	return {
		id: generateId(),
		presetId: null,
		name: `方案 ${index + 1}`,
		params: { ...DEFAULT_PARAMS },
		color: PRESET_COLORS[index % PRESET_COLORS.length]
	};
}

export interface ExperimentFrame {
	timestamp: number;
	params: CameraParams;
	errorAnalysis: ErrorAnalysis;
	invalidResult: InvalidDistanceResult;
	notes?: string;
	isKeyframe?: boolean;
	keyframeLabel?: string;
}

export interface ExperimentRecording {
	id: string;
	name: string;
	description: string;
	courseTopicId: string | null;
	startTime: number;
	endTime: number;
	frames: ExperimentFrame[];
	createdAt: number;
	duration: number;
	bestIntervals: BestImagingInterval[];
}

export interface BestImagingInterval {
	startTime: number;
	endTime: number;
	qualityScore: number;
	dominantMetric: 'sharpness' | 'brightness' | 'balance';
	description: string;
}

export interface TeachingStep {
	id: string;
	stepNumber: number;
	title: string;
	description: string;
	targetParams: Partial<CameraParams>;
	hint: string;
	explanation: string;
	checkCondition: (params: CameraParams) => boolean;
}

export interface TeachingCourse {
	id: string;
	title: string;
	description: string;
	icon: string;
	difficulty: 'beginner' | 'intermediate' | 'advanced';
	estimatedTime: number;
	steps: TeachingStep[];
}

export interface CourseTopic {
	id: string;
	name: string;
	description: string;
	icon: string;
	color: string;
	caseCount: number;
}

export interface ExperimentCase {
	id: string;
	name: string;
	description: string;
	courseTopicId: string | null;
	recordingId: string | null;
	params: CameraParams;
	conclusion: ExperimentConclusion;
	createdAt: number;
	author: string;
	shared: boolean;
}

export interface ExperimentConclusion {
	summary: string;
	keyFindings: string[];
	parameterAnalysis: {
		param: string;
		label: string;
		trend: string;
		optimalRange: string;
	}[];
	recommendations: string[];
	formulaVerified: string[];
}

export function computeImagingQualityScore(params: CameraParams): number {
	const result = calculateImage(params);
	if (!result.isValid) return 0;

	const sharpnessWeight = 0.35;
	const brightnessWeight = 0.3;
	const blurWeight = 0.25;
	const validityWeight = 0.1;

	const sharpnessScore = result.sharpness / 100;
	const brightnessScore = Math.min(result.brightness / 30, 1);
	const blurScore = Math.max(0, 1 - (result.blurCircleDiameter / result.imageHeight) * 3);
	const validityScore = result.isValid ? 1 : 0;

	return (
		sharpnessScore * sharpnessWeight +
		brightnessScore * brightnessWeight +
		blurScore * blurWeight +
		validityScore * validityWeight
	);
}

export function detectBestImagingIntervals(
	frames: ExperimentFrame[],
	threshold: number = 0.6,
	minDuration: number = 2000
): BestImagingInterval[] {
	if (frames.length < 2) return [];

	const intervals: BestImagingInterval[] = [];
	let currentInterval: BestImagingInterval | null = null;

	for (const frame of frames) {
		const score = computeImagingQualityScore(frame.params);
		const isGood = score >= threshold;

		if (isGood && !currentInterval) {
			currentInterval = {
				startTime: frame.timestamp,
				endTime: frame.timestamp,
				qualityScore: score,
				dominantMetric: 'balance',
				description: ''
			};
		} else if (isGood && currentInterval) {
			currentInterval.endTime = frame.timestamp;
			currentInterval.qualityScore = Math.max(currentInterval.qualityScore, score);
		} else if (!isGood && currentInterval) {
			if (currentInterval.endTime - currentInterval.startTime >= minDuration) {
				const midTime = (currentInterval.startTime + currentInterval.endTime) / 2;
				const midFrame = frames.find(
					(f) => Math.abs(f.timestamp - midTime) < 500
				) || frame;
				currentInterval.dominantMetric = determineDominantMetric(midFrame.params);
				currentInterval.description = generateIntervalDescription(currentInterval, midFrame);
				intervals.push(currentInterval);
			}
			currentInterval = null;
		}
	}

	if (currentInterval && currentInterval.endTime - currentInterval.startTime >= minDuration) {
		const midTime = (currentInterval.startTime + currentInterval.endTime) / 2;
		const midFrame = frames.find((f) => Math.abs(f.timestamp - midTime) < 500) || frames[frames.length - 1];
		currentInterval.dominantMetric = determineDominantMetric(midFrame.params);
		currentInterval.description = generateIntervalDescription(currentInterval, midFrame);
		intervals.push(currentInterval);
	}

	return intervals;
}

function determineDominantMetric(params: CameraParams): 'sharpness' | 'brightness' | 'balance' {
	const result = calculateImage(params);
	if (!result.isValid) return 'balance';

	const sharpnessNorm = result.sharpness / 100;
	const brightnessNorm = Math.min(result.brightness / 30, 1);

	const diff = Math.abs(sharpnessNorm - brightnessNorm);
	if (diff < 0.15) return 'balance';
	return sharpnessNorm > brightnessNorm ? 'sharpness' : 'brightness';
}

function generateIntervalDescription(interval: BestImagingInterval, frame: ExperimentFrame): string {
	const result = frame.errorAnalysis.simulated;
	if (!result.isValid) return '成像质量良好区间';

	const metrics: string[] = [];
	if (result.sharpness > 70) metrics.push('清晰度高');
	if (result.brightness > 20) metrics.push('亮度充足');
	if (frame.errorAnalysis.blurCircleError < 10) metrics.push('模糊度低');

	if (metrics.length === 0) return '成像质量较好区间';
	return metrics.join('、') + '的成像区间';
}

export function generateExperimentConclusion(
	recording: ExperimentRecording
): ExperimentConclusion {
	const frames = recording.frames;
	if (frames.length === 0) {
		return {
			summary: '暂无实验数据，无法生成结论。',
			keyFindings: [],
			parameterAnalysis: [],
			recommendations: [],
			formulaVerified: []
		};
	}

	const firstFrame = frames[0];
	const lastFrame = frames[frames.length - 1];
	const bestInterval = recording.bestIntervals[0];

	const keyFindings: string[] = [];
	const parameterAnalysis: ExperimentConclusion['parameterAnalysis'] = [];
	const recommendations: string[] = [];
	const formulaVerified: string[] = [];

	const allBrightness = frames.map((f) => f.errorAnalysis.simulated.brightness);
	const allSharpness = frames.map((f) => f.errorAnalysis.simulated.sharpness);
	const allImageHeight = frames.map((f) => f.errorAnalysis.simulated.imageHeight);
	const allBlurError = frames.map((f) => f.errorAnalysis.blurCircleError);

	const avgBrightness = allBrightness.reduce((a, b) => a + b, 0) / allBrightness.length;
	const avgSharpness = allSharpness.reduce((a, b) => a + b, 0) / allSharpness.length;
	const maxBrightness = Math.max(...allBrightness);
	const maxSharpness = Math.max(...allSharpness);
	const minBlurError = Math.min(...allBlurError);

	formulaVerified.push('像高公式：像高 = 物体高度 × 暗箱长度 / 物体距离（相似三角形原理）');
	formulaVerified.push('亮度规律：成像亮度与孔径面积成正比，与物距平方成反比');
	formulaVerified.push('清晰度规律：孔径越小，衍射效应越明显；孔径越大，几何模糊越严重');

	if (bestInterval) {
		keyFindings.push(
			`最佳成像区间出现在 ${formatTime(bestInterval.startTime - recording.startTime)} 至 ${formatTime(bestInterval.endTime - recording.startTime)}，综合质量评分 ${(bestInterval.qualityScore * 100).toFixed(1)}%`
		);
	}

	keyFindings.push(
		`实验过程中，平均亮度 ${avgBrightness.toFixed(1)}%，最高亮度 ${maxBrightness.toFixed(1)}%`
	);
	keyFindings.push(
		`平均清晰度 ${avgSharpness.toFixed(1)}%，最高清晰度 ${maxSharpness.toFixed(1)}%`
	);
	keyFindings.push(`最小模糊占比 ${minBlurError.toFixed(2)}%`);

	const boxLengthVaried = hasVaried(frames, 'boxLength');
	const apertureVaried = hasVaried(frames, 'apertureSize');
	const distanceVaried = hasVaried(frames, 'objectDistance');
	const heightVaried = hasVaried(frames, 'objectHeight');

	if (distanceVaried) {
		const analysis = analyzeTrend(frames, 'objectDistance', '像高');
		parameterAnalysis.push({
			param: 'objectDistance',
			label: '物体距离',
			trend: analysis.trend,
			optimalRange: '建议 5-20 单位范围，兼顾像大小与亮度'
		});
	}

	if (apertureVaried) {
		const analysis = analyzeTrend(frames, 'apertureSize', '亮度');
		parameterAnalysis.push({
			param: 'apertureSize',
			label: '孔径大小',
			trend: analysis.trend,
			optimalRange: '建议 0.1-0.5 范围，平衡清晰度与亮度'
		});
	}

	if (boxLengthVaried) {
		const analysis = analyzeTrend(frames, 'boxLength', '像高');
		parameterAnalysis.push({
			param: 'boxLength',
			label: '暗箱长度',
			trend: analysis.trend,
			optimalRange: '建议 3-10 单位范围，获得合适放大倍率'
		});
	}

	if (parameterAnalysis.length === 0) {
		parameterAnalysis.push(
			{
				param: 'apertureSize',
				label: '孔径大小',
				trend: '本次实验未系统变化',
				optimalRange: '建议 0.1-0.5 范围'
			},
			{
				param: 'objectDistance',
				label: '物体距离',
				trend: '本次实验未系统变化',
				optimalRange: '建议 5-20 单位范围'
			},
			{
				param: 'boxLength',
				label: '暗箱长度',
				trend: '本次实验未系统变化',
				optimalRange: '建议 3-10 单位范围'
			}
		);
	}

	recommendations.push('进行系统的单变量实验，每次只改变一个参数以观察其影响');
	recommendations.push('尝试找到清晰度与亮度的最佳平衡点');
	recommendations.push('记录不同参数组合下的成像效果，建立参数-效果对照表');

	if (avgSharpness < 50) {
		recommendations.unshift('当前成像清晰度较低，建议减小孔径大小以提升清晰度');
	}
	if (avgBrightness < 10) {
		recommendations.unshift('当前成像较暗，建议增大孔径或减小物体距离以提升亮度');
	}

	const summary = `本实验通过调整暗箱成像参数，${bestInterval ? '找到了成像质量最佳的参数区间' : '观察了各参数对成像效果的影响'}。实验验证了小孔成像的基本原理：像的大小与物距成反比、与暗箱长度成正比；成像亮度与孔径面积成正比、与物距平方成反比。${bestInterval ? `最佳成像综合质量达 ${(bestInterval.qualityScore * 100).toFixed(1)}%。` : ''}`;

	return {
		summary,
		keyFindings,
		parameterAnalysis,
		recommendations,
		formulaVerified
	};
}

function hasVaried(frames: ExperimentFrame[], param: keyof CameraParams): boolean {
	if (frames.length < 2) return false;
	const values = frames.map((f) => f.params[param]);
	const min = Math.min(...values);
	const max = Math.max(...values);
	return max - min > (max + min) * 0.05;
}

function analyzeTrend(
	frames: ExperimentFrame[],
	paramKey: keyof CameraParams,
	metricName: string
): { trend: string } {
	if (frames.length < 5) {
		return { trend: '数据点不足，趋势不明显' };
	}

	const sorted = [...frames].sort((a, b) => a.params[paramKey] - b.params[paramKey]);
	const firstHalf = sorted.slice(0, Math.floor(sorted.length / 2));
	const secondHalf = sorted.slice(Math.floor(sorted.length / 2));

	const firstAvg = firstHalf.reduce((sum, f) => sum + f.errorAnalysis.simulated.imageHeight, 0) / firstHalf.length;
	const secondAvg = secondHalf.reduce((sum, f) => sum + f.errorAnalysis.simulated.imageHeight, 0) / secondHalf.length;

	const ratio = secondAvg / firstAvg;
	const direction = ratio > 1.1 ? '增大' : ratio < 0.9 ? '减小' : '基本不变';

	return {
		trend: `随着${paramKey === 'objectDistance' ? '物体距离' : paramKey === 'boxLength' ? '暗箱长度' : paramKey === 'apertureSize' ? '孔径' : '参数'}${direction}，${metricName}${direction}（变化率 ${((ratio - 1) * 100).toFixed(1)}%）`
	};
}

export function formatTime(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function generateRecordingName(): string {
	const now = new Date();
	return `实验记录_${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}`;
}

export const DEFAULT_COURSE_TOPICS: CourseTopic[] = [
	{
		id: 'basics',
		name: '基础原理',
		description: '小孔成像的基本概念与原理验证',
		icon: '🔬',
		color: '#4fc3f7',
		caseCount: 0
	},
	{
		id: 'aperture',
		name: '孔径研究',
		description: '孔径大小对成像质量的影响',
		icon: '⭕',
		color: '#81c784',
		caseCount: 0
	},
	{
		id: 'distance',
		name: '物距探索',
		description: '物体距离与成像关系的实验',
		icon: '📏',
		color: '#ffb74d',
		caseCount: 0
	},
	{
		id: 'box',
		name: '暗箱长度',
		description: '暗箱长度对放大倍率的影响',
		icon: '📦',
		color: '#f06292',
		caseCount: 0
	},
	{
		id: 'comprehensive',
		name: '综合实验',
		description: '多参数综合优化实验案例',
		icon: '🎯',
		color: '#ba68c8',
		caseCount: 0
	}
];

export const TEACHING_COURSES: TeachingCourse[] = [
	{
		id: 'intro-course',
		title: '初识小孔成像',
		description: '了解暗箱成像的基本原理，观察倒立实像的形成',
		icon: '📷',
		difficulty: 'beginner',
		estimatedTime: 10,
		steps: [
			{
				id: 'step-1',
				stepNumber: 1,
				title: '观察默认成像',
				description: '先观察当前默认参数下的成像效果，注意像的方向与物体方向的关系。',
				targetParams: {},
				hint: '仔细看成像面（右侧）上的像，它是正立还是倒立的？',
				explanation: '小孔成像的特点是成倒立的实像。这是因为光沿直线传播，物体顶部的光通过小孔后到达成像面的下方，物体底部的光则到达上方。',
				checkCondition: () => true
			},
			{
				id: 'step-2',
				stepNumber: 2,
				title: '增大物体距离',
				description: '将物体距离滑块向右拖动，增大到 15 左右，观察像的大小变化。',
				targetParams: { objectDistance: 15 },
				hint: '物体距离越大，像会变大还是变小？',
				explanation: '根据相似三角形原理，像高 = 物高 × 暗箱长度 / 物距。物距增大时，像会变小。',
				checkCondition: (params) => params.objectDistance >= 14
			},
			{
				id: 'step-3',
				stepNumber: 3,
				title: '减小物体距离',
				description: '将物体距离减小到 5 左右，观察像的变化。',
				targetParams: { objectDistance: 5 },
				hint: '物距减小，像会怎样变化？亮度呢？',
				explanation: '物距减小时，像变大且变亮。因为物距减小后，更多的光线能通过小孔到达成像面，而且像被放大了。',
				checkCondition: (params) => params.objectDistance <= 6
			},
			{
				id: 'step-4',
				stepNumber: 4,
				title: '改变孔径大小',
				description: '尝试将孔径调整到 0.05 和 1.0，对比清晰度和亮度的变化。',
				targetParams: { apertureSize: 0.5 },
				hint: '孔径越小，像越清晰还是越模糊？越亮还是越暗？',
				explanation: '小孔成像中，孔径越小像越清晰（几何模糊小），但同时也越暗（通过的光少）。孔径太大时，像会变模糊（孔径模糊效应）。',
				checkCondition: (params) => params.apertureSize >= 0.4 && params.apertureSize <= 0.6
			},
			{
				id: 'step-5',
				stepNumber: 5,
				title: '实验完成',
				description: '恭喜你完成了小孔成像基础实验！你已经了解了成像的基本规律。',
				targetParams: {},
				hint: '回顾一下：像的大小与物距成什么关系？孔径对成像有什么影响？',
				explanation: '小结：1. 小孔成倒立实像；2. 像的大小与物距成反比，与暗箱长度成正比；3. 孔径越小像越清晰但越暗，存在一个最佳孔径范围。',
				checkCondition: () => true
			}
		]
	},
	{
		id: 'aperture-course',
		title: '孔径与成像质量',
		description: '深入研究孔径大小对清晰度、亮度和模糊度的影响',
		icon: '⭕',
		difficulty: 'intermediate',
		estimatedTime: 15,
		steps: [
			{
				id: 'ap-step-1',
				stepNumber: 1,
				title: '从小孔径开始',
				description: '将孔径设为 0.05，观察此时的成像特点。',
				targetParams: { apertureSize: 0.05 },
				hint: '注意观察像的清晰度和亮度',
				explanation: '极小孔径下，成像非常清晰（几何模糊极小），但非常暗淡，因为只有很少的光通过小孔。',
				checkCondition: (params) => params.apertureSize <= 0.08
			},
			{
				id: 'ap-step-2',
				stepNumber: 2,
				title: '中等孔径',
				description: '将孔径逐渐增大到 0.3 左右，观察成像变化。',
				targetParams: { apertureSize: 0.3 },
				hint: '亮度和清晰度如何变化？哪个变化更快？',
				explanation: '孔径增大时，亮度快速增加（与孔径面积成正比，即与孔径平方成正比），清晰度开始缓慢下降。',
				checkCondition: (params) => params.apertureSize >= 0.25 && params.apertureSize <= 0.35
			},
			{
				id: 'ap-step-3',
				stepNumber: 3,
				title: '大孔径',
				description: '将孔径增大到 1.0 以上，观察大孔径下的成像效果。',
				targetParams: { apertureSize: 1.2 },
				hint: '此时的像还清晰吗？模糊圈有多大？',
				explanation: '大孔径下，几何模糊（孔径模糊）成为主导因素，像变得非常模糊。模糊圈直径约等于孔径大小乘以放大倍率。',
				checkCondition: (params) => params.apertureSize >= 1
			},
			{
				id: 'ap-step-4',
				stepNumber: 4,
				title: '寻找最佳孔径',
				description: '在 0.1-0.5 之间调整，找到清晰度和亮度都比较好的"最佳孔径"。',
				targetParams: { apertureSize: 0.2 },
				hint: '综合考虑清晰度和亮度，找一个平衡点',
				explanation: '最佳孔径通常出现在清晰度和亮度的平衡点。在实际应用中，需要根据具体需求（如拍照还是观察）选择合适的孔径。',
				checkCondition: (params) => params.apertureSize >= 0.1 && params.apertureSize <= 0.5
			},
			{
				id: 'ap-step-5',
				stepNumber: 5,
				title: '实验总结',
				description: '你已经完成了孔径对成像质量影响的探究实验！',
				targetParams: {},
				hint: '总结一下孔径与清晰度、亮度的关系',
				explanation: '总结：孔径与亮度近似平方关系（亮 ∝ 孔径²）；孔径过小时衍射限制清晰度，孔径过大时几何模糊主导。存在最佳孔径区间。',
				checkCondition: () => true
			}
		]
	},
	{
		id: 'distance-course',
		title: '物距与像的关系',
		description: '定量研究物距对像高、亮度、清晰度的影响',
		icon: '📏',
		difficulty: 'intermediate',
		estimatedTime: 12,
		steps: [
			{
				id: 'd-step-1',
				stepNumber: 1,
				title: '近物成像',
				description: '将物体距离设为 4（大于暗箱长度），观察近物成像。',
				targetParams: { objectDistance: 4 },
				hint: '像的大小、亮度、清晰度各有什么特点？',
				explanation: '物距较小时，像很大很亮，但因放大倍率大，孔径模糊也被放大，清晰度会降低。',
				checkCondition: (params) => params.objectDistance >= 3.5 && params.objectDistance <= 4.5
			},
			{
				id: 'd-step-2',
				stepNumber: 2,
				title: '中等距离',
				description: '将物距增大到 10 左右，观察成像变化。',
				targetParams: { objectDistance: 10 },
				hint: '像高、亮度、清晰度各有什么变化？',
				explanation: '物距增大时，像高按比例减小（相似三角形），亮度按平方反比减小（距离平方反比定律），清晰度会提升（因为模糊影响被缩小了）。',
				checkCondition: (params) => params.objectDistance >= 9 && params.objectDistance <= 11
			},
			{
				id: 'd-step-3',
				stepNumber: 3,
				title: '远物成像',
				description: '将物距增大到 20 以上，观察远物成像特点。',
				targetParams: { objectDistance: 22 },
				hint: '像还能看清吗？亮度如何？',
				explanation: '物距很大时，像非常小且非常暗淡，几乎不可观察。这是为什么实际相机需要镜头聚光，而不是简单的小孔。',
				checkCondition: (params) => params.objectDistance >= 20
			},
			{
				id: 'd-step-4',
				stepNumber: 4,
				title: '验证反比关系',
				description: '比较物距 5 和物距 10 时的像高，验证是否近似 2:1 的关系。',
				targetParams: { objectDistance: 7.5 },
				hint: '像高与物距成反比：物距减半，像高加倍',
				explanation: '根据 像高 = 物高 × 箱长 / 物距 的公式，物距减半时像高加倍。这是相似三角形的必然结果。',
				checkCondition: (params) => params.objectDistance >= 7 && params.objectDistance <= 8
			},
			{
				id: 'd-step-5',
				stepNumber: 5,
				title: '实验完成',
				description: '恭喜完成物距与像关系的探究！',
				targetParams: {},
				hint: '回忆：像高、亮度分别与物距是什么关系？',
				explanation: '总结：像高与物距成反比（一次方关系）；亮度与物距平方成反比；清晰度随物距增大而提高（模糊被缩小）。',
				checkCondition: () => true
			}
		]
	}
];

export function saveRecordingToStorage(recording: ExperimentRecording) {
	if (typeof localStorage === 'undefined') return;
	try {
		const saved = localStorage.getItem('cameraObscuraRecordings');
		const recordings: ExperimentRecording[] = saved ? JSON.parse(saved) : [];
		const existingIndex = recordings.findIndex((r) => r.id === recording.id);
		if (existingIndex >= 0) {
			recordings[existingIndex] = recording;
		} else {
			recordings.push(recording);
		}
		localStorage.setItem('cameraObscuraRecordings', JSON.stringify(recordings));
	} catch (e) {
		console.warn('无法保存实验记录:', e);
	}
}

export function loadRecordingsFromStorage(): ExperimentRecording[] {
	if (typeof localStorage === 'undefined') return [];
	try {
		const saved = localStorage.getItem('cameraObscuraRecordings');
		return saved ? JSON.parse(saved) : [];
	} catch (e) {
		console.warn('无法加载实验记录:', e);
		return [];
	}
}

export function saveCaseToStorage(caseItem: ExperimentCase) {
	if (typeof localStorage === 'undefined') return;
	try {
		const saved = localStorage.getItem('cameraObscuraCases');
		const cases: ExperimentCase[] = saved ? JSON.parse(saved) : [];
		const existingIndex = cases.findIndex((c) => c.id === caseItem.id);
		if (existingIndex >= 0) {
			cases[existingIndex] = caseItem;
		} else {
			cases.push(caseItem);
		}
		localStorage.setItem('cameraObscuraCases', JSON.stringify(cases));
	} catch (e) {
		console.warn('无法保存案例:', e);
	}
}

export function loadCasesFromStorage(): ExperimentCase[] {
	if (typeof localStorage === 'undefined') return [];
	try {
		const saved = localStorage.getItem('cameraObscuraCases');
		return saved ? JSON.parse(saved) : [];
	} catch (e) {
		console.warn('无法加载案例:', e);
		return [];
	}
}

export function exportRecordingAsJson(recording: ExperimentRecording): string {
	return JSON.stringify(recording, null, 2);
}

export function importRecordingFromJson(json: string): ExperimentRecording | null {
	try {
		const data = JSON.parse(json);
		if (data.id && data.frames && Array.isArray(data.frames)) {
			return data as ExperimentRecording;
		}
		return null;
	} catch (e) {
		return null;
	}
}
