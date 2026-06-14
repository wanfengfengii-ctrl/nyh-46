<script lang="ts">
	import { onMount, tick, createEventDispatcher } from 'svelte';
	import * as THREE from 'three';
	import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
	import type { CameraParams, LightRay } from '$lib/cameraObscura';
	import { calculateLightRays } from '$lib/cameraObscura';

	export let params: CameraParams;
	export let showRays: boolean = true;
	export let viewMode: 'simulated' | 'theoretical' = 'simulated';
	export let syncPosition: { x: number; y: number; z: number } | null = null;
	export let syncTarget: { x: number; y: number; z: number } | null = null;
	export let compact: boolean = false;

	const dispatch = createEventDispatcher<{
		cameraChange: {
			position: { x: number; y: number; z: number };
			target: { x: number; y: number; z: number };
		};
	}>();

	let container: HTMLDivElement;
	let scene: THREE.Scene;
	let camera: THREE.PerspectiveCamera;
	let renderer: THREE.WebGLRenderer;
	let controls: OrbitControls;
	let animationId: number;

	let boxGroup: THREE.Group;
	let objectMesh: THREE.Group;
	let apertureRing: THREE.Mesh;
	let imageScreen: THREE.Mesh;
	let raysGroup: THREE.Group;
	let imageTexture: THREE.CanvasTexture;
	let imageCanvas: HTMLCanvasElement;
	let objectLabel: THREE.Sprite;
	let apertureLabel: THREE.Sprite;
	let imageLabel: THREE.Sprite;
	let prevBoxLength: number = 0;
	let isUserInteracting: boolean = false;
	let skipNextSync: boolean = false;

	$: imageResult = calculateLightRays(params, compact ? 9 : 15);

	export function getScreenshot(): string | null {
		if (!renderer) return null;
		renderer.render(scene, camera);
		return renderer.domElement.toDataURL('image/png');
	}

	function createBox(length: number): THREE.Group {
		const group = new THREE.Group();

		const wallMaterial = new THREE.MeshPhongMaterial({
			color: 0x4a3728,
			side: THREE.DoubleSide,
			transparent: true,
			opacity: 0.15
		});

		const height = 6;
		const width = 6;

		const backGeo = new THREE.PlaneGeometry(width, height);
		const backWall = new THREE.Mesh(backGeo, wallMaterial);
		backWall.position.set(length, 0, 0);
		backWall.rotation.y = Math.PI / 2;
		group.add(backWall);

		const topGeo = new THREE.PlaneGeometry(length, width);
		const topWall = new THREE.Mesh(topGeo, wallMaterial);
		topWall.position.set(length / 2, height / 2, 0);
		topWall.rotation.x = -Math.PI / 2;
		group.add(topWall);

		const bottomWall = new THREE.Mesh(topGeo, wallMaterial);
		bottomWall.position.set(length / 2, -height / 2, 0);
		bottomWall.rotation.x = Math.PI / 2;
		group.add(bottomWall);

		const leftGeo = new THREE.PlaneGeometry(length, height);
		const leftWall = new THREE.Mesh(leftGeo, wallMaterial);
		leftWall.position.set(length / 2, 0, -width / 2);
		group.add(leftWall);

		const rightWall = new THREE.Mesh(leftGeo, wallMaterial);
		rightWall.position.set(length / 2, 0, width / 2);
		rightWall.rotation.y = Math.PI;
		group.add(rightWall);

		const frontFrameMaterial = new THREE.MeshPhongMaterial({
			color: 0x3d2817,
			side: THREE.DoubleSide
		});

		const frameThickness = 0.3;
		const frameOuter = 3;

		const frameTopGeo = new THREE.BoxGeometry(
			frameThickness,
			frameThickness * 2,
			frameOuter * 2
		);
		const frameTop = new THREE.Mesh(frameTopGeo, frontFrameMaterial);
		frameTop.position.set(-frameThickness / 2, frameOuter, 0);
		group.add(frameTop);

		const frameBottom = new THREE.Mesh(frameTopGeo, frontFrameMaterial);
		frameBottom.position.set(-frameThickness / 2, -frameOuter, 0);
		group.add(frameBottom);

		const frameSideGeo = new THREE.BoxGeometry(
			frameThickness,
			frameOuter * 2,
			frameThickness * 2
		);
		const frameLeft = new THREE.Mesh(frameSideGeo, frontFrameMaterial);
		frameLeft.position.set(-frameThickness / 2, 0, -frameOuter);
		group.add(frameLeft);

		const frameRight = new THREE.Mesh(frameSideGeo, frontFrameMaterial);
		frameRight.position.set(-frameThickness / 2, 0, frameOuter);
		group.add(frameRight);

		return group;
	}

	function createObject(height: number): THREE.Group {
		const group = new THREE.Group();

		const arrowMaterial = new THREE.MeshPhongMaterial({
			color: 0xff6b6b,
			specular: 0x111111,
			shininess: 30
		});

		const shaftRadius = 0.15;
		const shaftHeight = height * 0.7;
		const shaftGeo = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftHeight, 16);
		const shaft = new THREE.Mesh(shaftGeo, arrowMaterial);
		shaft.position.y = shaftHeight / 2 - height / 2 + 0.3;
		group.add(shaft);

		const headHeight = height * 0.3;
		const headRadius = 0.4;
		const headGeo = new THREE.ConeGeometry(headRadius, headHeight, 16);
		const head = new THREE.Mesh(headGeo, arrowMaterial);
		head.position.y = height / 2 - headHeight / 2;
		group.add(head);

		const baseGeo = new THREE.CylinderGeometry(0.3, 0.4, 0.2, 16);
		const base = new THREE.Mesh(baseGeo, arrowMaterial);
		base.position.y = -height / 2 + 0.1;
		group.add(base);

		return group;
	}

	function createAperture(size: number): THREE.Mesh {
		const geometry = new THREE.RingGeometry(size * 0.9, size, 32);
		const material = new THREE.MeshBasicMaterial({
			color: 0x000000,
			side: THREE.DoubleSide,
			transparent: true,
			opacity: 0.9
		});
		const mesh = new THREE.Mesh(geometry, material);
		mesh.rotation.y = Math.PI / 2;
		return mesh;
	}

	function createImageScreen(length: number): {
		mesh: THREE.Mesh;
		texture: THREE.CanvasTexture;
		canvas: HTMLCanvasElement;
	} {
		const canvas = document.createElement('canvas');
		canvas.width = 512;
		canvas.height = 512;
		const ctx = canvas.getContext('2d')!;
		ctx.fillStyle = '#1a1a1a';
		ctx.fillRect(0, 0, 512, 512);

		const texture = new THREE.CanvasTexture(canvas);
		texture.needsUpdate = true;

		const geometry = new THREE.PlaneGeometry(5, 5);
		const material = new THREE.MeshBasicMaterial({
			map: texture,
			side: THREE.DoubleSide
		});
		const mesh = new THREE.Mesh(geometry, material);
		mesh.position.set(length, 0, 0);
		mesh.rotation.y = Math.PI / 2;

		return { mesh, texture, canvas };
	}

	function updateImageTexture(
		canvas: HTMLCanvasElement,
		texture: THREE.CanvasTexture,
		params: CameraParams,
		mode: 'simulated' | 'theoretical'
	) {
		const ctx = canvas.getContext('2d')!;
		const width = canvas.width;
		const height = canvas.height;

		ctx.fillStyle = '#0a0a0a';
		ctx.fillRect(0, 0, width, height);

		const validation = (() => {
			if (params.boxLength <= 0 || params.apertureSize <= 0 || params.objectDistance <= 0) {
				return { valid: false };
			}
			return { valid: true };
		})();

		if (!validation.valid) {
			ctx.fillStyle = '#ff4444';
			ctx.font = '24px sans-serif';
			ctx.textAlign = 'center';
			ctx.fillText('参数无效', width / 2, height / 2);
			texture.needsUpdate = true;
			return;
		}

		const magnification = params.boxLength / params.objectDistance;
		const imageHeight = params.objectHeight * magnification;
		const brightness =
			((params.lightIntensity * Math.PI * (params.apertureSize / 2) ** 2) /
				params.objectDistance ** 2) *
			100;

		const centerX = width / 2;
		const centerY = height / 2;
		const scale = height / 6;
		const imgPixelHeight = imageHeight * scale;

		let blurAmount = 0;
		if (mode === 'simulated') {
			const apertureBlur = params.apertureSize * magnification * 2;
			const totalBlur = apertureBlur * 50;
			blurAmount = Math.min(50, Math.max(0, totalBlur));
		}

		ctx.save();
		ctx.filter = `blur(${blurAmount}px)`;

		const gradient = ctx.createLinearGradient(
			centerX,
			centerY - imgPixelHeight / 2,
			centerX,
			centerY + imgPixelHeight / 2
		);

		const brightnessValue = Math.min(255, brightness * 2.5);
		const alpha = Math.min(1, brightness / 50);

		if (mode === 'theoretical') {
			gradient.addColorStop(0, `rgba(255, 150, 150, ${Math.min(1, alpha * 1.5)})`);
			gradient.addColorStop(0.5, `rgba(255, 180, 180, ${Math.min(1, alpha * 1.5)})`);
			gradient.addColorStop(1, `rgba(255, 120, 120, ${Math.min(1, alpha * 1.5)})`);
		} else {
			gradient.addColorStop(
				0,
				`rgba(${brightnessValue * 0.6}, ${brightnessValue * 0.3}, ${brightnessValue * 0.3}, ${alpha})`
			);
			gradient.addColorStop(
				0.5,
				`rgba(${brightnessValue * 0.8}, ${brightnessValue * 0.4}, ${brightnessValue * 0.4}, ${alpha})`
			);
			gradient.addColorStop(
				1,
				`rgba(${brightnessValue * 0.4}, ${brightnessValue * 0.2}, ${brightnessValue * 0.2}, ${alpha})`
			);
		}

		ctx.fillStyle = gradient;

		const shaftWidth = imgPixelHeight * 0.15;
		const headHeight = imgPixelHeight * 0.3;
		const headWidth = imgPixelHeight * 0.4;
		const baseHeight = imgPixelHeight * 0.1;
		const baseWidth = imgPixelHeight * 0.3;

		const topY = centerY - imgPixelHeight / 2;
		const bottomY = centerY + imgPixelHeight / 2;

		ctx.beginPath();
		ctx.moveTo(centerX - headWidth / 2, bottomY - headHeight);
		ctx.lineTo(centerX + headWidth / 2, bottomY - headHeight);
		ctx.lineTo(centerX, bottomY);
		ctx.closePath();
		ctx.fill();

		ctx.fillRect(
			centerX - shaftWidth / 2,
			topY + baseHeight,
			shaftWidth,
			imgPixelHeight - headHeight - baseHeight
		);

		ctx.fillRect(centerX - baseWidth / 2, topY, baseWidth, baseHeight);

		ctx.restore();

		if (mode === 'theoretical') {
			ctx.strokeStyle = 'rgba(100, 200, 255, 0.5)';
			ctx.lineWidth = 2;
			ctx.setLineDash([4, 4]);
		} else {
			ctx.strokeStyle = 'rgba(100, 100, 100, 0.3)';
			ctx.lineWidth = 1;
			ctx.setLineDash([]);
		}
		ctx.beginPath();
		ctx.moveTo(0, centerY);
		ctx.lineTo(width, centerY);
		ctx.stroke();
		ctx.setLineDash([]);

		if (mode === 'theoretical') {
			ctx.fillStyle = 'rgba(100, 200, 255, 0.7)';
			ctx.font = 'bold 16px sans-serif';
			ctx.textAlign = 'center';
			ctx.fillText('理论成像', width / 2, 30);
		}

		texture.needsUpdate = true;
	}

	function createRays(rays: LightRay[], mode: 'simulated' | 'theoretical'): THREE.Group {
		const group = new THREE.Group();

		for (const ray of rays) {
			const points = [
				new THREE.Vector3(ray.start.x, ray.start.y, ray.start.z),
				new THREE.Vector3(ray.aperture.x, ray.aperture.y, ray.aperture.z),
				new THREE.Vector3(ray.end.x, ray.end.y, ray.end.z)
			];

			const geometry = new THREE.BufferGeometry().setFromPoints(points);
			const intensity = ray.intensity;
			let color: THREE.Color;
			let opacity: number;

			if (mode === 'theoretical') {
				color = new THREE.Color().setHSL(0.55, 0.8, 0.5 + intensity * 0.4);
				opacity = 0.2 + intensity * 0.4;
			} else {
				color = new THREE.Color().setHSL(0.12, 0.8, 0.5 + intensity * 0.4);
				opacity = 0.3 + intensity * 0.5;
			}

			const material = new THREE.LineBasicMaterial({
				color,
				transparent: true,
				opacity
			});

			const line = new THREE.Line(geometry, material);
			group.add(line);
		}

		return group;
	}

	function initScene() {
		scene = new THREE.Scene();
		scene.background = new THREE.Color(viewMode === 'theoretical' ? 0x0d1a2e : 0x1a1a2e);
		scene.fog = new THREE.Fog(scene.background as THREE.Color, 30, 80);

		const width = container.clientWidth;
		const height = container.clientHeight;

		camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
		camera.position.set(8, 6, 12);

		renderer = new THREE.WebGLRenderer({ antialias: !compact, preserveDrawingBuffer: true });
		renderer.setSize(width, height);
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, compact ? 1 : 2));
		renderer.shadowMap.enabled = !compact;
		container.appendChild(renderer.domElement);

		controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		controls.dampingFactor = 0.05;
		controls.minDistance = 5;
		controls.maxDistance = 60;
		controls.target.set(params.boxLength / 2, 0, 0);

		controls.addEventListener('start', () => {
			isUserInteracting = true;
		});
		controls.addEventListener('end', () => {
			isUserInteracting = false;
		});
		controls.addEventListener('change', () => {
			if (isUserInteracting) {
				skipNextSync = true;
				dispatch('cameraChange', {
					position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
					target: { x: controls.target.x, y: controls.target.y, z: controls.target.z }
				});
			}
		});

		const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
		scene.add(ambientLight);

		const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
		mainLight.position.set(-10, 10, 5);
		scene.add(mainLight);

		const fillLight = new THREE.PointLight(0xffaa55, 0.5, 30);
		fillLight.position.set(-8, 0, 0);
		scene.add(fillLight);

		const gridHelper = new THREE.GridHelper(30, 30, 0x444444, 0x222222);
		gridHelper.position.y = -3;
		scene.add(gridHelper);

		const axesHelper = new THREE.AxesHelper(5);
		axesHelper.position.set(-12, -3, -6);
		scene.add(axesHelper);

		boxGroup = createBox(params.boxLength);
		scene.add(boxGroup);

		objectMesh = createObject(params.objectHeight);
		objectMesh.position.set(-params.objectDistance, 0, 0);
		scene.add(objectMesh);

		apertureRing = createAperture(params.apertureSize);
		scene.add(apertureRing);

		const screenResult = createImageScreen(params.boxLength);
		imageScreen = screenResult.mesh;
		imageTexture = screenResult.texture;
		imageCanvas = screenResult.canvas;
		scene.add(imageScreen);

		raysGroup = createRays(imageResult.rays, viewMode);
		raysGroup.visible = showRays;
		scene.add(raysGroup);

		objectLabel = createTextSprite('物体', '#ff6b6b');
		objectLabel.position.set(-params.objectDistance, params.objectHeight / 2 + 0.8, 0);
		scene.add(objectLabel);

		apertureLabel = createTextSprite('孔径', '#ffffff');
		apertureLabel.position.set(0, Math.max(params.apertureSize + 0.5, 1), 0);
		scene.add(apertureLabel);

		imageLabel = createTextSprite('成像面', viewMode === 'theoretical' ? '#88ccff' : '#66ccff');
		imageLabel.position.set(params.boxLength, 2.8, 0);
		scene.add(imageLabel);

		prevBoxLength = params.boxLength;
	}

	function createTextSprite(text: string, color: string): THREE.Sprite {
		const canvas = document.createElement('canvas');
		canvas.width = 256;
		canvas.height = 64;
		const ctx = canvas.getContext('2d')!;
		ctx.font = 'bold 32px sans-serif';
		ctx.fillStyle = color;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(text, 128, 32);

		const texture = new THREE.CanvasTexture(canvas);
		const material = new THREE.SpriteMaterial({
			map: texture,
			transparent: true
		});
		const sprite = new THREE.Sprite(material);
		sprite.scale.set(2, 0.5, 1);
		return sprite;
	}

	function updateScene() {
		if (!scene) return;

		const boxLengthChanged = prevBoxLength !== 0 && prevBoxLength !== params.boxLength;
		const oldTarget = boxLengthChanged ? controls.target.clone() : null;
		const oldCameraPosition = boxLengthChanged ? camera.position.clone() : null;
		const offset =
			boxLengthChanged && oldTarget
				? new THREE.Vector3().subVectors(oldCameraPosition!, oldTarget)
				: null;

		while (boxGroup.children.length > 0) {
			boxGroup.remove(boxGroup.children[0]);
		}
		const newBox = createBox(params.boxLength);
		boxGroup.add(...newBox.children);

		objectMesh.position.set(-params.objectDistance, 0, 0);
		while (objectMesh.children.length > 0) {
			objectMesh.remove(objectMesh.children[0]);
		}
		const newObject = createObject(params.objectHeight);
		objectMesh.add(...newObject.children);

		if (apertureRing) {
			scene.remove(apertureRing);
			apertureRing.geometry.dispose();
			(apertureRing.material as THREE.Material).dispose();
		}
		apertureRing = createAperture(params.apertureSize);
		scene.add(apertureRing);

		imageScreen.position.set(params.boxLength, 0, 0);
		updateImageTexture(imageCanvas, imageTexture, params, viewMode);

		if (raysGroup) {
			scene.remove(raysGroup);
			raysGroup.traverse((child) => {
				if (child instanceof THREE.Line) {
					child.geometry.dispose();
					(child.material as THREE.Material).dispose();
				}
			});
		}
		const raysResult = calculateLightRays(params, compact ? 9 : 15);
		raysGroup = createRays(raysResult.rays, viewMode);
		raysGroup.visible = showRays;
		scene.add(raysGroup);

		if (objectLabel) {
			objectLabel.position.set(-params.objectDistance, params.objectHeight / 2 + 0.8, 0);
		}
		if (apertureLabel) {
			apertureLabel.position.set(0, Math.max(params.apertureSize + 0.5, 1), 0);
		}
		if (imageLabel) {
			imageLabel.position.set(params.boxLength, 2.8, 0);
		}

		if (boxLengthChanged && offset) {
			const newTarget = new THREE.Vector3(params.boxLength / 2, 0, 0);
			controls.target.copy(newTarget);
			camera.position.copy(newTarget).add(offset);
			controls.update();
		}

		prevBoxLength = params.boxLength;
	}

	function applyCameraSync() {
		if (!camera || !controls) return;
		if (skipNextSync) {
			skipNextSync = false;
			return;
		}
		if (isUserInteracting) return;
		if (syncPosition && syncTarget) {
			camera.position.set(syncPosition.x, syncPosition.y, syncPosition.z);
			controls.target.set(syncTarget.x, syncTarget.y, syncTarget.z);
			controls.update();
		}
	}

	function animate() {
		animationId = requestAnimationFrame(animate);
		controls.update();
		renderer.render(scene, camera);
	}

	function handleResize() {
		if (!container || !camera || !renderer) return;
		const width = container.clientWidth;
		const height = container.clientHeight;
		if (width === 0 || height === 0) return;
		camera.aspect = width / height;
		camera.updateProjectionMatrix();
		renderer.setSize(width, height);
	}

	onMount(() => {
		let cleanup: (() => void) | undefined;

		(async () => {
			await tick();
			initScene();
			animate();
			window.addEventListener('resize', handleResize);

			cleanup = () => {
				cancelAnimationFrame(animationId);
				window.removeEventListener('resize', handleResize);
				if (renderer) {
					renderer.dispose();
				}
			};
		})();

		return () => {
			if (cleanup) cleanup();
		};
	});

	$: if (scene) {
		updateScene();
	}

	$: if (syncPosition && syncTarget && !isUserInteracting) {
		applyCameraSync();
	}

	$: if (raysGroup) {
		raysGroup.visible = showRays;
	}
</script>

<div bind:this={container} class="w-full h-full" />
