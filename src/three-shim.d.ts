/**
 * Ambient type shim for Three.js classes re-exported through @iwsdk/core.
 * three@0.185.1 ships no .d.ts files and @types/three is absent.
 */
declare module 'three' {
	export class Mesh { constructor(...a: any[]); [k: string]: any; }
	export class MeshBasicMaterial { constructor(...a: any[]); [k: string]: any; }
	export class MeshStandardMaterial { constructor(...a: any[]); [k: string]: any; }
	export class LineBasicMaterial { constructor(...a: any[]); [k: string]: any; }
	export class BufferGeometry { constructor(...a: any[]); [k: string]: any; }
	export class Float32BufferAttribute { constructor(...a: any[]); [k: string]: any; }
	export class Group { constructor(...a: any[]); [k: string]: any; }
	export class Color { constructor(...a: any[]); [k: string]: any; }
	export class Vector3 { constructor(...a: any[]); [k: string]: any; }
	export class Fog { constructor(...a: any[]); [k: string]: any; }
	export class FogExp2 { constructor(...a: any[]); [k: string]: any; }
	export class AmbientLight { constructor(...a: any[]); [k: string]: any; }
	export class DirectionalLight { constructor(...a: any[]); [k: string]: any; }
	export class PointLight { constructor(...a: any[]); [k: string]: any; }
	export class GridHelper { constructor(...a: any[]); [k: string]: any; }
	export class EdgesGeometry { constructor(...a: any[]); [k: string]: any; }
	export class LineSegments { constructor(...a: any[]); [k: string]: any; }
	export class Points { constructor(...a: any[]); [k: string]: any; }
	export class PointsMaterial { constructor(...a: any[]); [k: string]: any; }
	export class BoxGeometry { constructor(...a: any[]); [k: string]: any; }
	export class SphereGeometry { constructor(...a: any[]); [k: string]: any; }
	export class CylinderGeometry { constructor(...a: any[]); [k: string]: any; }
	export class TorusGeometry { constructor(...a: any[]); [k: string]: any; }
	export class OctahedronGeometry { constructor(...a: any[]); [k: string]: any; }
	export class IcosahedronGeometry { constructor(...a: any[]); [k: string]: any; }
	export class Object3D { constructor(...a: any[]); [k: string]: any; }
	export class Scene { constructor(...a: any[]); [k: string]: any; }
	export class PerspectiveCamera { constructor(...a: any[]); [k: string]: any; }
	export class WebGLRenderer { constructor(...a: any[]); [k: string]: any; }
	export const AdditiveBlending: any;
	export const DoubleSide: any;
}
