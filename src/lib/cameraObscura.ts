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
}

export interface Preset {
	id: string;
	name: string;
	params: CameraParams;
	createdAt: number;
	color?: string;
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

export function validateParams(params: CameraParams): { valid: boolean; message?: string; warnings?: ValidationWarning[] } {
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
			magnification: 0
		};
	}

	const magnification = params.boxLength / params.objectDistance;
	const imageHeight = params.objectHeight * magnification;

	const apertureArea = Math.PI * (params.apertureSize / 2) ** 2;
	const distanceFactor = 1 / (params.objectDistance ** 2);
	const brightness = params.lightIntensity * apertureArea * distanceFactor * 100;

	const diffractionLimit = 1.22 * 550e-9 * (params.boxLength / params.apertureSize);
	const apertureBlur = params.apertureSize * magnification * 2;
	const totalBlur = Math.sqrt(diffractionLimit ** 2 + apertureBlur ** 2);
	const maxBlur = params.objectHeight;
	const sharpness = Math.max(0, 1 - totalBlur / maxBlur) * 100;

	return {
		imageHeight,
		brightness: Math.min(brightness, 100),
		sharpness: Math.max(0, Math.min(sharpness, 100)),
		isValid: true,
		magnification
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
			const intensity = params.lightIntensity * (1 - distToCenter / apertureHalfSize) * 0.5 + 0.5;

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
