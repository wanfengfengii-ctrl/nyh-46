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
