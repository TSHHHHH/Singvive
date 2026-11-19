import { MercatorCoordinate, type CustomLayerInterface, type Map as MlMap } from 'maplibre-gl';
import polygonClipping from 'polygon-clipping';
import {
  BackSide, BatchedMesh, Camera, DirectionalLight, ExtrudeGeometry, Matrix4, Mesh, Path, PlaneGeometry,
  Scene, ShadowMaterial, Shape, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { shadowSun } from './atmosphere';
import { BuildingEngine, LOD_ZOOM, ZOOM_RISE_SPAN, type ShadowBlock } from './buildings';
import { alive } from './layers';
import { slotId } from './mapStyle';

const LAYER = 'building-shadows';
const RECENTER_M = 48;
const RANGE_STEP_M = 64;
const MESH_BUDGET_MS = 3;
const ORIGIN = MercatorCoordinate.fromLngLat([103.82, 1.35]);
const UNIT = ORIGIN.meterInMercatorCoordinateUnits();
// East, north and up in metres. Premultiply in double precision before the GPU sees the matrix.
const model = new Matrix4().makeScale(UNIT, -UNIT, UNIT).setPosition(ORIGIN.x, ORIGIN.y, 0);
function local(lng: number, lat: number) {
  const p = MercatorCoordinate.fromLngLat([lng, lat]);
  return new Vector2((p.x - ORIGIN.x) / UNIT, (ORIGIN.y - p.y) / UNIT);
}

function geometryFor(block: ShadowBlock) {
  const parts: ExtrudeGeometry[] = [];
  for (const { polygons, top, base } of block.parts) {
    if (!polygons.length || !(top > base)) continue;
    // Vector tile buffers overlap. Dissolving fragments also removes internal seam walls.
    const outline = polygons.length === 1 ? polygons : polygonClipping.union(polygons[0], ...polygons.slice(1));
    const shapes = outline.map((polygon) => {
      const rings = polygon.map((ring) => ring.map(([lng, lat]) => local(lng, lat)));
      const shape = new Shape(rings[0]);
      shape.holes = rings.slice(1).map((ring) => new Path(ring));
      return shape;
    });
    const piece = new ExtrudeGeometry(shapes, { depth: top - base, bevelEnabled: false });
    parts.push(piece.translate(0, 0, base));
  }
  if (parts.length <= 1) return parts[0];
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
}

/** Native extrusions supply colour, picking and depth. These meshes only add the sun's occlusion. */
export function installBuildingShadows(map: MlMap, engine: BuildingEngine, shadowSize: 2048 | 4096) {
  const scene = new Scene();
  const camera = new Camera();
  const sun = new DirectionalLight();
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.camera.up.set(0, 1, 0);
  sun.shadow.bias = -0.00008;
  sun.shadow.normalBias = 0.25;
  scene.add(sun, sun.target);

  const material = new ShadowMaterial({
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
  });
  // Closed extrusions write their exit depth so grazing light cannot stripe the entry face.
  material.shadowSide = BackSide;
  const centre = { value: new Vector2() };
  const radius = { value: 0 };
  const toSun = { value: new Vector3() };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.discCentre = centre;
    shader.uniforms.discRadius = radius;
    shader.uniforms.toSun = toSun;
    shader.vertexShader = 'varying vec2 groundXY; varying float directLight; uniform vec3 toSun;\n' + shader.vertexShader.replace(
      '#include <worldpos_vertex>', `#include <worldpos_vertex>
        groundXY = worldPosition.xy;
        directLight = dot(inverseTransformDirection(transformedNormal, viewMatrix), toSun);
      `,
    );
    shader.fragmentShader = 'varying vec2 groundXY; varying float directLight; uniform vec2 discCentre; uniform float discRadius;\n' +
      shader.fragmentShader.replace('#include <tonemapping_fragment>', `
        // Native lighting already shades faces turned away from the sun.
        gl_FragColor.a *= smoothstep(0.0, 0.12, directLight);
        gl_FragColor.a *= 1.0 - smoothstep(max(0.0, discRadius - 12.0), discRadius, distance(groundXY, discCentre));
        #include <tonemapping_fragment>
      `);
  };
  const ground = new Mesh(new PlaneGeometry(2, 2), material);
  ground.receiveShadow = true;
  scene.add(ground);

  let vertexCapacity = 65536;
  const batch = new BatchedMesh(256, vertexCapacity, 0, material);
  batch.castShadow = batch.receiveShadow = true;
  batch.sortObjects = false;
  batch.frustumCulled = false; // The batch culls individual buildings against each pass's camera.
  scene.add(batch);
  const scaleMatrix = new Matrix4();
  const blocks = new Map<string, { geometryId: number; instance: number; scale: number; ruin: number; block: ShadowBlock; signature: string }>();
  const pending: { key: string; block: ShadowBlock; signature: string }[] = [];
  let revision = -1;
  let heightRevision = -1;
  let ruinRevision = -1;
  let lastZoomRise = NaN;
  let standing = false;
  let coverage = 0;
  let maxHeight = 0;
  let origin: Vector2 | null = null;
  let originLat = 0;
  let originLng = 0;
  let lastPolar = NaN;
  let lastBearing = NaN;
  let renderer: WebGLRenderer | undefined;
  let failed = false;
  // MapLibre reserves part of window-depth space for its ordered layers. Three's
  // private shadow texture needs the full range; restore MapLibre's before receivers draw.
  let mapDepth: Float32Array | null = null;
  function restoreDepth() {
    if (mapDepth && renderer) renderer.getContext().depthRange(mapDepth[0], mapDepth[1]);
    mapDepth = null;
  }
  material.onBeforeRender = restoreDepth;
  function syncBlocks(lat: number, lng: number) {
    const keep = new Set<string>();
    let changed = false;
    pending.length = 0;
    maxHeight = 0;
    for (const block of engine.shadowBlocks(lat, lng, coverage + RECENTER_M)) {
      for (const part of block.parts) maxHeight = Math.max(maxHeight, part.top);
      const key = JSON.stringify(block.target);
      const old = blocks.get(key);
      if (old?.block === block) {
        keep.add(key);
        continue;
      }
      const signature = JSON.stringify(block.parts);
      if (old?.signature === signature) {
        old.block = block;
        keep.add(key);
        continue;
      }
      pending.push({ key, block, signature });
    }
    for (const [key, entry] of blocks) {
      if (keep.has(key)) continue;
      batch.deleteGeometry(entry.geometryId);
      blocks.delete(key);
      changed = true;
    }
    return changed;
  }

  function buildPending() {
    const deadline = performance.now() + MESH_BUDGET_MS;
    let changed = false;
    while (pending.length && performance.now() < deadline) {
      const { key, block, signature } = pending.pop()!;
      // A degenerate tile ring can fail polygon union. Skip that caster, keeping the native building.
      let geometry;
      try {
        geometry = geometryFor(block);
      } catch {
        continue;
      }
      if (!geometry) continue;
      geometry.deleteAttribute('uv'); // Shadow passes only need positions and normals.
      const count = geometry.getAttribute('position').count;
      if (count > batch.unusedVertexCount) {
        batch.optimize();
        if (count > batch.unusedVertexCount) {
          vertexCapacity = Math.max(vertexCapacity * 2, vertexCapacity + count);
          batch.setGeometrySize(vertexCapacity, 0);
        }
      }
      if (batch.instanceCount === batch.maxInstanceCount) batch.setInstanceCount(batch.maxInstanceCount * 2);
      const geometryId = batch.addGeometry(geometry);
      const instance = batch.addInstance(geometryId);
      geometry.dispose();
      blocks.set(key, { geometryId, instance, scale: NaN, ruin: NaN, block, signature });
      changed = true;
    }
    if (pending.length) map.triggerRepaint();
    return changed;
  }

  function onRestore() {
    lastPolar = NaN;
    failed = false;
  }
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    map.off('webglcontextrestored', onRestore);
    batch.dispose();
    engine.releaseShadowFootprints();
    blocks.clear();
    ground.geometry.dispose();
    material.dispose();
    sun.shadow.dispose();
    renderer?.dispose();
  }
  const layer: CustomLayerInterface = {
    id: LAYER, type: 'custom', renderingMode: '3d',
    onAdd(_, gl) {
      try {
        renderer = new WebGLRenderer({ canvas: map.getCanvas(), context: gl as WebGL2RenderingContext });
        renderer.autoClear = false;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.autoUpdate = false;
        map.on('webglcontextrestored', onRestore);
      } catch (error) {
        failed = true;
        console.warn('Building shadows unavailable', error);
      }
    },
    render(gl, input) {
      const disc = engine.shadowDisc;
      const light = shadowSun.get(map);
      const zoom = map.getZoom();
      if (!renderer || failed || !disc || disc.r <= 0 || !light || light.opacity <= 0 || zoom <= LOD_ZOOM) return;
      const here = local(disc.lng, disc.lat);
      centre.value.copy(here);
      radius.value = disc.r;
      ground.scale.set(disc.r, disc.r, 1);
      ground.position.set(here.x, here.y, 0);
      let dirty = false;
      const nextCoverage = Math.ceil(disc.r / RANGE_STEP_M) * RANGE_STEP_M;
      if (!origin || origin.distanceTo(here) >= RECENTER_M || nextCoverage !== coverage) {
        origin = here;
        originLat = disc.lat;
        originLng = disc.lng;
        coverage = nextCoverage;
        dirty = true;
      }
      if (dirty || revision !== engine.shadowGeometryRevision) {
        if (revision !== engine.shadowGeometryRevision) ruinRevision = -1;
        revision = engine.shadowGeometryRevision;
        heightRevision = -1;
        dirty = syncBlocks(originLat, originLng) || dirty;
      }
      if (pending.length) dirty = buildPending() || dirty;
      if (!blocks.size) return;
      const zoomRise = Math.min(1, (zoom - LOD_ZOOM) / ZOOM_RISE_SPAN);
      if (dirty || heightRevision !== engine.shadowHeightRevision || zoomRise !== lastZoomRise) {
        heightRevision = engine.shadowHeightRevision;
        lastZoomRise = zoomRise;
        standing = false;
        for (const entry of blocks.values()) {
          const { block } = entry;
          // Only damage and tile changes invalidate the stump multiplier. Most
          // height changes are a few buildings rising at the rim of the disc.
          if (!block.wreck && (ruinRevision !== engine.shadowRuinRevision || Number.isNaN(entry.ruin))) {
            const state = map.getFeatureState(block.target);
            entry.ruin = Number(state.ruin ?? state.wreckHidden ?? state.aruin ?? 1);
          }
          const scale = zoomRise * (block.wreck
            ? Number(map.getFeatureState(block.target).rise ?? 0)
            : engine.buildingRise(block.target.id) * entry.ruin);
          if (entry.scale !== scale) {
            dirty = true;
            batch.setVisibleAt(entry.instance, scale > 0);
            if (scale > 0) batch.setMatrixAt(entry.instance, scaleMatrix.makeScale(1, 1, scale));
            entry.scale = scale;
          }
          standing ||= scale > 0;
        }
        ruinRevision = engine.shadowRuinRevision;
      }
      if (!standing) return;
      if (dirty || light.polar !== lastPolar || light.bearing !== lastBearing) {
        const polar = light.polar * Math.PI / 180;
        const bearing = light.bearing * Math.PI / 180;
        const halfHeight = maxHeight / 2;
        const extent = Math.hypot(coverage + RECENTER_M, halfHeight) + 4;
        const shadowCamera = sun.shadow.camera;
        if (shadowCamera.right !== extent) {
          Object.assign(shadowCamera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 1, far: 2 * extent + 4 });
          shadowCamera.updateProjectionMatrix();
        }
        sun.target.position.set(origin.x, origin.y, halfHeight);
        toSun.value.set(
          Math.sin(bearing) * Math.sin(polar), Math.cos(bearing) * Math.sin(polar), Math.cos(polar),
        );
        sun.position.copy(sun.target.position).addScaledVector(toSun.value, extent + 2);
        renderer.shadowMap.needsUpdate = true;
        lastPolar = light.polar;
        lastBearing = light.bearing;
      }
      material.opacity = light.opacity;
      camera.projectionMatrix.fromArray(input.defaultProjectionData.mainMatrix).multiply(model);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      try {
        renderer.resetState();
        renderer.setViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        if (renderer.shadowMap.needsUpdate) {
          mapDepth = gl.getParameter(gl.DEPTH_RANGE) as Float32Array;
          gl.depthRange(0, 1);
        }
        renderer.render(scene, camera);
      } catch (error) {
        failed = true;
        console.warn('Building shadows unavailable', error);
      } finally {
        restoreDepth();
        renderer.resetState();
      }
    },
    onRemove: dispose,
  };
  map.addLayer(layer, slotId('buildings'));
  return () => {
    if (alive(map) && map.getLayer(LAYER)) map.removeLayer(LAYER);
    // MapView can remove the whole map before child effects clean up.
    dispose();
  };
}
