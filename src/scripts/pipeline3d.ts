/*
 * The hero's 3D agent pipeline: machined parts joined by conduits, in steel
 * and the accent metal (gold on the dark theme, bronze on the light one). A
 * pulse runs request -> agent -> model on CPU -> agent -> typed tool ->
 * guardrail, then lands on the applied database; every fourth run is blocked
 * at the guardrail, lands on the rolled-back hourglass and reports back up to
 * the request. Each step writes an entry to the agent log (LOG_EVENT) and
 * ripples the particle field (field:ripple).
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { PipelinePartName, TerminalTone } from "../data/types";
import { LOG_EVENT, type LogEntry } from "./terminal";

/**
 * Which run of the cycle is blocked at the guardrail: every BLOCK_EVERY runs,
 * at BLOCK_AT.
 */
export const BLOCK_EVERY = 4;
export const BLOCK_AT = 2;

/** Whether run `index` (from 0) is blocked at the guardrail. */
export const isBlocked = (index: number) => index % BLOCK_EVERY === BLOCK_AT;

/** A pulse's colouring: hit is gold, block is ember, report is steel white. */
type Tone = "hit" | "block" | "report";

/**
 * One part: radius places its label under it, spin is its idle motion, and
 * shine maps energy (1 on a hit, decaying to 0) to its glow.
 */
interface Part {
  group: THREE.Group;
  radius: number;
  spin(dt: number, t: number): void;
  shine(energy: number, t: number, tone: Tone): void;
}

interface Node {
  part: Part;
  home: THREE.Vector3;
  radius: number;
  energy: number;
  tone: Tone;
  label: HTMLElement | null;
  timer: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const at = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * Renders the pipeline into the <canvas> in `stage`, placing each part's
 * .label3d[data-part] from `stage`'s .labels3d under it, and sets
 * data-ready on `stage` after the first frame. Without reduced motion it
 * animates and runs the pipeline while `stage` is on screen and the tab is
 * shown, and the scene sways toward a fine pointer; under reduced motion it
 * renders one still frame, again on each resize and theme change. Returns a
 * function that stops it, or null when WebGL is unavailable.
 */
export function startPipeline(
  stage: HTMLElement,
  reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches,
): (() => void) | null {
  const canvas = stage.querySelector("canvas");
  if (!canvas) return null;
  const root = document.documentElement;
  const finePointer = matchMedia("(pointer: fine)").matches;
  const label = (name: PipelinePartName) =>
    stage.querySelector<HTMLElement>(`.label3d[data-part="${name}"]`);

  /* ---------- Renderer, scene, camera, lights ---------- */
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnvironment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  /**
   * A studio environment: a room of one colour lit by softboxes, each
   * [x, y, z, width, height, brightness], facing the centre and tinted by `tint`.
   */
  function studio(
    room: number,
    softboxes: number[][],
    tint = new THREE.Color(1, 1, 1),
  ) {
    const set = new THREE.Scene();
    set.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(12, 12, 12),
        new THREE.MeshBasicMaterial({ color: room, side: THREE.BackSide }),
      ),
    );
    for (const [x, y, z, width, height, brightness] of softboxes) {
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        new THREE.MeshBasicMaterial({
          color: tint.clone().multiplyScalar(brightness!),
          side: THREE.DoubleSide,
        }),
      );
      panel.position.set(x!, y!, z!);
      panel.lookAt(0, 0, 0);
      set.add(panel);
    }
    return pmrem.fromScene(set, 0.02).texture;
  }
  const SOFTBOXES = [
    [0, 5.5, 1.5, 7, 3, 3.2],
    [-5.5, 1, 2.5, 1.2, 6, 2.4],
    [5.5, 0.5, -2, 1.2, 6, 1.8],
    [0, -1, 5.5, 4, 1.5, 0.9],
    [2.5, 2.5, 5, 2, 2, 2.2],
  ];
  /**
   * A dim grey room under overhead, side, low-front and front-key softboxes:
   * steel reads as heavy silver with bright highlights.
   */
  const studioEnvironment = studio(0x4a5059, SOFTBOXES);
  /**
   * The same softboxes, warmed, in a light warm brown room: bronze keeps its
   * warmth and lightness.
   */
  const bronzeStudioEnvironment = studio(
    0x6a5846,
    SOFTBOXES,
    new THREE.Color(1, 0.94, 0.86),
  );
  pmrem.dispose();
  scene.environment = roomEnvironment;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0.1, 13);
  camera.lookAt(0.25, 0.05, 0);

  const keyLight = new THREE.DirectionalLight(0xfff0d0, 2.4);
  keyLight.position.set(4, 6, 7);
  const rimLight = new THREE.DirectionalLight(0xa8bcdc, 2.0);
  rimLight.position.set(-6, 3, -5);
  scene.add(
    keyLight,
    rimLight,
    new THREE.HemisphereLight(0xdfe6ef, 0x14161a, 0.35),
  );

  /* ---------- Materials ---------- */
  const steel = new THREE.MeshPhysicalMaterial({
    color: 0xdfe3e8,
    metalness: 1,
    roughness: 0.2,
    clearcoat: 0.6,
    clearcoatRoughness: 0.18,
  });
  /**
   * The guardrail studs' and database spacers' steel: on the dark theme it
   * reflects studioEnvironment, reading as silver.
   */
  const studSteel = steel.clone();
  /**
   * studSteel for the hourglass pillars, its environment turned 0.9 rad about
   * x, since the pillars lean toward the camera.
   */
  const pillarSteel = steel.clone();
  pillarSteel.envMapRotation.x = 0.9;
  const graphite = new THREE.MeshPhysicalMaterial({
    color: 0x5a616a,
    metalness: 1,
    roughness: 0.32,
    clearcoat: 0.35,
    clearcoatRoughness: 0.3,
  });
  /**
   * The dark theme's accent gold, deep enough to stay saturated under
   * roomEnvironment; GOLD_LINE is the matching line colour.
   */
  const GOLD_METAL = 0xc99a3c;
  const GOLD_LINE = 0xcfa44d;
  /**
   * The light theme's accent bronze, reflecting bronzeStudioEnvironment
   * BRONZE_GAIN times.
   */
  const BRONZE = 0xe0aa6e;
  const BRONZE_GAIN = 2.3;
  const gold = new THREE.MeshPhysicalMaterial({
    color: GOLD_METAL,
    metalness: 1,
    roughness: 0.18,
    clearcoat: 0.6,
    clearcoatRoughness: 0.15,
  });
  const goldFacets = gold.clone();
  goldFacets.flatShading = true;
  /**
   * Materials and lines in the accent metal, recoloured together by applyLook.
   */
  const accentMetals: THREE.MeshPhysicalMaterial[] = [gold, goldFacets];
  const accentLines: THREE.LineBasicMaterial[] = [];
  const accentMetal = (material: THREE.MeshPhysicalMaterial) => (
    accentMetals.push(material),
    material
  );
  const accentLine = (material: THREE.LineBasicMaterial) => (
    accentLines.push(material),
    material
  );
  /**
   * Flat-faced accent parts (agent core, gyroscope ring, guard ring): one tone
   * per face and a crisp glint.
   */
  const crispMetals: THREE.MeshPhysicalMaterial[] = [goldFacets];
  const crispMetal = (material: THREE.MeshPhysicalMaterial) => (
    crispMetals.push(material),
    material
  );
  /**
   * The request bubble's material: the accent metal under its own clearcoat.
   */
  const lacquerMetals: THREE.MeshPhysicalMaterial[] = [];

  /**
   * Brushed grain like --brush-noise: streaks along u whose brightness drifts
   * along them, from value-noise octaves of [cells across u, texels per cell
   * along v, amplitude]; linear greys around 0.9 that tile in u and v.
   */
  const brushTexture = (() => {
    const WIDTH = 256;
    const HEIGHT = 1024;
    const OCTAVES = [
      [2, 64, 0.34],
      [3, 32, 0.26],
      [4, 16, 0.2],
      [5, 8, 0.14],
      [6, 4, 0.1],
      [7, 2, 0.07],
    ] as const;
    const smooth = (t: number) => t * t * (3 - 2 * t);
    const value = new Float32Array(WIDTH * HEIGHT);
    for (const [cellsU, cellV, amplitude] of OCTAVES) {
      const cellsV = HEIGHT / cellV;
      const lattice = Float32Array.from(
        { length: cellsU * cellsV },
        () => Math.random() * 2 - 1,
      );
      const point = (i: number, j: number) =>
        lattice[(j % cellsV) * cellsU + (i % cellsU)]!;
      for (let y = 0; y < HEIGHT; y++) {
        const j = Math.floor(y / cellV);
        const ty = smooth(y / cellV - j);
        for (let x = 0; x < WIDTH; x++) {
          const i = Math.floor((x / WIDTH) * cellsU);
          const tx = smooth((x / WIDTH) * cellsU - i);
          const near = point(i, j) + (point(i + 1, j) - point(i, j)) * tx;
          const far =
            point(i, j + 1) + (point(i + 1, j + 1) - point(i, j + 1)) * tx;
          value[y * WIDTH + x]! += amplitude * (near + (far - near) * ty);
        }
      }
    }
    const data = new Uint8Array(WIDTH * HEIGHT * 4);
    for (let n = 0; n < WIDTH * HEIGHT; n++) {
      const grey = Math.round(
        255 * Math.min(1, Math.max(0, 0.9 + 0.16 * value[n]!)),
      );
      data.set([grey, grey, grey, 255], n * 4);
    }
    const texture = new THREE.DataTexture(data, WIDTH, HEIGHT);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    texture.needsUpdate = true;
    return texture;
  })();
  /**
   * The accent metal brushed like the buttons, for the hourglass plates and the
   * stamp's handle and plate; on the dark theme it reflects roomEnvironment at
   * BRUSHED_GLOSS.
   */
  const brushedGold = accentMetal(gold.clone());
  brushedGold.map = brushTexture;
  const BRUSHED_GLOSS = 0.6;
  /**
   * Lays brushTexture on `geometry`, one tile per unit: streaks run along x on
   * faces looking up or down, and around the part on walls.
   */
  function brushUv<T extends THREE.BufferGeometry>(geometry: T): T {
    const position = geometry.attributes.position!;
    const normal = geometry.attributes.normal!;
    const uv = new Float32Array(position.count * 2);
    for (let index = 0; index < position.count; index++) {
      const x = position.getX(index);
      const z = position.getZ(index);
      const flat = Math.abs(normal.getY(index)) > 0.7;
      uv[index * 2] = flat ? x : x + z;
      uv[index * 2 + 1] = flat ? z : position.getY(index);
    }
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    return geometry;
  }
  /**
   * Clear glass: a black body adding only its reflections through premultiplied
   * blending, so its opacity darkens what lies behind without dimming its
   * highlights.
   */
  const hourglassGlass = new THREE.MeshPhysicalMaterial({
    color: 0x000000,
    metalness: 0,
    roughness: 0.03,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  /** Faintly glowing sand, so the reservoir's downward slopes read as sand. */
  const hourglassSand = new THREE.MeshStandardMaterial({
    color: 0xc9993f,
    emissive: 0x8a6418,
    roughness: 0.85,
    metalness: 0.1,
  });
  const GOLD = new THREE.Color(0xffd27a);
  const EMBER = new THREE.Color(0xff7a4d);
  const REPORT = new THREE.Color(0xd8e4f6);

  /**
   * Theme-dependent values, set by applyLook: the conduit band tint per tone
   * and the matching pulse cores; glowGain scales every glow, haloGain the
   * halos around parts (off on the light theme), shadowGain the drop shadows
   * behind parts (light theme only), cageOpacity the agent cage's resting
   * opacity, smokeGain the request's dispatch smoke (light theme only),
   * hitFlash and ringFlash the guard ring's flash colour and strength.
   */
  const look = {
    cageOpacity: 0.62,
    smokeGain: 0,
    glowGain: 1,
    haloGain: 1,
    shadowGain: 0,
    hitFlash: new THREE.Color(),
    ringFlash: 0.9,
    pulse: new THREE.Color(),
    ember: new THREE.Color(),
    report: new THREE.Color(),
    core: new THREE.Color(),
    coreBlocked: new THREE.Color(),
    coreReport: new THREE.Color(),
  };
  const tint = (tone: Tone) =>
    ({
      hit: { band: look.pulse, halo: GOLD, core: look.core },
      block: { band: look.ember, halo: EMBER, core: look.coreBlocked },
      report: { band: look.report, halo: REPORT, core: look.coreReport },
    })[tone];

  /**
   * A soft round texture of `stops` [offset, rgba], drawn on a 128px canvas.
   */
  function radialTexture(stops: [number, string][]) {
    const size = 128;
    const surface = document.createElement("canvas");
    surface.width = surface.height = size;
    const context = surface.getContext("2d")!;
    const gradient = context.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    for (const [offset, colour] of stops) gradient.addColorStop(offset, colour);
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(surface);
  }
  const glowMap = radialTexture([
    [0, "rgba(255,255,255,1)"],
    [0.22, "rgba(255,255,255,0.6)"],
    [1, "rgba(255,255,255,0)"],
  ]);
  glowMap.colorSpace = THREE.SRGBColorSpace;
  /**
   * Every additive glow material; applyLook switches them to normal blending on
   * the light theme.
   */
  const glowMaterials: THREE.Material[] = [];
  /**
   * A glow sprite; a halo is scaled by look.haloGain instead of look.glowGain.
   */
  function glow(color: THREE.Color, size: number, opacity = 0, halo = false) {
    const material = new THREE.SpriteMaterial({
      map: glowMap,
      color,
      opacity,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    glowMaterials.push(material);
    const sprite = new THREE.Sprite(material);
    sprite.scale.setScalar(size);
    sprite.userData.halo = halo;
    return sprite;
  }
  const setGlow = (sprite: THREE.Sprite, opacity: number) =>
    (sprite.material.opacity =
      opacity * (sprite.userData.halo ? look.haloGain : look.glowGain));

  /* ---------- Parts ---------- */
  /**
   * The request: a speech bubble machined from the accent metal, with a tail
   * at its lower left and three steel dots on its face that rise in turn
   * DOT_STEP seconds apart, like a typing indicator. It sways about its
   * upright axis and stands FORWARD of the part's centre, so conduits leave
   * from behind it.
   */
  function buildRequest(): Part {
    const WIDTH = 0.9;
    const HEIGHT = 0.6;
    const CORNER = 0.18;
    const DEPTH = 0.13;
    const BEVEL = 0.035;
    const DOT_STEP = 0.25;
    const FORWARD = 0.24;
    const left = -WIDTH / 2;
    const right = WIDTH / 2;
    const bottom = -HEIGHT / 2;
    const top = HEIGHT / 2;
    const outline = new THREE.Shape();
    outline.moveTo(left + CORNER, bottom);
    outline.lineTo(left + CORNER + 0.04, bottom);
    outline.lineTo(left + 0.03, bottom - 0.2);
    outline.lineTo(left + CORNER + 0.22, bottom);
    outline.lineTo(right - CORNER, bottom);
    outline.quadraticCurveTo(right, bottom, right, bottom + CORNER);
    outline.lineTo(right, top - CORNER);
    outline.quadraticCurveTo(right, top, right - CORNER, top);
    outline.lineTo(left + CORNER, top);
    outline.quadraticCurveTo(left, top, left, top - CORNER);
    outline.lineTo(left, bottom + CORNER);
    outline.quadraticCurveTo(left, bottom, left + CORNER, bottom);
    const shellGeometry = new THREE.ExtrudeGeometry(outline, {
      depth: DEPTH,
      bevelEnabled: true,
      bevelThickness: BEVEL,
      bevelSize: BEVEL,
      bevelSegments: 4,
      curveSegments: 24,
    });
    shellGeometry.translate(0, 0, -DEPTH / 2);
    const shellMaterial = gold.clone();
    lacquerMetals.push(shellMaterial);
    const shell = new THREE.Mesh(shellGeometry, shellMaterial);
    const face = DEPTH / 2 + BEVEL;
    const dotGeometry = new THREE.CylinderGeometry(0.058, 0.058, 0.05, 32);
    const dots = [-1, 0, 1].map((step) => {
      const dot = new THREE.Mesh(dotGeometry, steel);
      dot.rotation.x = Math.PI / 2;
      dot.position.set(step * 0.2, 0, face + 0.02);
      return dot;
    });
    const bubble = new THREE.Group();
    bubble.add(shell, ...dots);
    bubble.position.z = FORWARD;
    const tilt = new THREE.Group();
    tilt.rotation.set(-0.1, 0.32, 0.04);
    tilt.add(bubble);
    const halo = glow(GOLD, 1.5, 0, true);
    const group = new THREE.Group();
    group.add(halo, tilt);
    return {
      group,
      radius: 0.56,
      spin(_dt, t) {
        bubble.rotation.y = Math.sin(t * 0.6) * 0.22;
        dots.forEach((dot, index) => {
          const lift = Math.max(0, Math.sin((t - index * DOT_STEP) * 4.2));
          dot.position.y = lift * 0.045;
          dot.position.z = face + 0.02 + lift * 0.04;
        });
      },
      shine(energy, _t, tone) {
        halo.material.color.copy(tone === "block" ? EMBER : GOLD);
        setGlow(halo, 0.16 + energy * 0.5);
      },
    };
  }

  /**
   * The agent: a faceted accent-metal core in a turning wire cage, ringed by a
   * gyroscope on a tilted axis.
   */
  function buildAgent(): Part {
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.58, 0),
      goldFacets,
    );
    const cageMaterial = accentLine(
      new THREE.LineBasicMaterial({
        color: GOLD_LINE,
        transparent: true,
        opacity: 0.8,
        toneMapped: false,
      }),
    );
    const cage = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.84, 1)),
      cageMaterial,
    );
    const aura = glow(GOLD, 2.3, 0, true);
    const gyro = new THREE.Mesh(
      new THREE.TorusGeometry(1.05, 0.018, 16, 160),
      crispMetal(accentMetal(gold.clone())),
    );
    const gyroTilt = new THREE.Group();
    gyroTilt.rotation.set(1.15, 0.35, 0);
    gyroTilt.add(gyro);
    const group = new THREE.Group();
    group.add(aura, core, cage, gyroTilt);
    return {
      group,
      radius: 1.08,
      spin(dt) {
        core.rotation.y += dt * 0.45;
        core.rotation.x += dt * 0.18;
        cage.rotation.y -= dt * 0.25;
        cage.rotation.z += dt * 0.1;
        gyro.rotation.z += dt * 0.6;
        gyroTilt.rotation.y += dt * 0.12;
      },
      shine(energy, t, tone) {
        aura.material.color.copy(tone === "block" ? EMBER : GOLD);
        setGlow(aura, 0.18 + 0.06 * Math.sin(t * 2.2) + energy * 0.55);
        cageMaterial.opacity = Math.min(1, look.cageOpacity + energy * 0.38);
      },
    };
  }

  /**
   * The model on CPU: a graphite chip with a steel die, an accent-line frame
   * and 28 gold pins, seven along each edge, turning slowly.
   */
  function buildChip(): Part {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.12, 1.1),
      graphite,
    );
    const die = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.07, 0.58), steel);
    die.position.y = 0.095;
    const frameMaterial = accentLine(
      new THREE.LineBasicMaterial({
        color: GOLD_LINE,
        transparent: true,
        opacity: 0.7,
        toneMapped: false,
      }),
    );
    const frame = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(0.68, 0.02, 0.68)),
      frameMaterial,
    );
    frame.position.y = 0.075;
    const pins = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.1, 16),
      gold.clone(),
      28,
    );
    const matrix = new THREE.Matrix4();
    const turn = new THREE.Quaternion();
    // outward lays a pin's axis (the cylinder's y) along z, out of its edge.
    const outward = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      Math.PI / 2,
    );
    const unit = new THREE.Vector3(1, 1, 1);
    for (let side = 0, index = 0; side < 4; side++) {
      turn.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (side * Math.PI) / 2);
      const facing = turn.clone().multiply(outward);
      for (let pin = 0; pin < 7; pin++, index++) {
        const position = new THREE.Vector3(
          -0.42 + pin * 0.14,
          -0.01,
          0.59,
        ).applyQuaternion(turn);
        pins.setMatrixAt(index, matrix.compose(position, facing, unit));
      }
    }
    const spinner = new THREE.Group();
    spinner.add(body, die, frame, pins);
    const tilt = new THREE.Group();
    tilt.rotation.set(0.62, 0, -0.15);
    tilt.add(spinner);
    const halo = glow(GOLD, 1.9, 0, true);
    const group = new THREE.Group();
    group.add(halo, tilt);
    return {
      group,
      radius: 0.72,
      spin(dt) {
        spinner.rotation.y += dt * 0.3;
      },
      shine(energy) {
        setGlow(halo, energy * 0.5);
        frameMaterial.opacity = 0.6 + energy * 0.4;
      },
    };
  }

  /**
   * The typed tool: a rubber stamp over a brushed plate, its lathe-turned
   * handle hovering HOVER above the plate's back left. The plate's front right
   * carries the stamp's mark, a check in a seal ring carved in CARVED. The
   * stamp bobs while the assembly sways; a hit presses it onto the plate and
   * fills the mark with gold (ember when blocked) as the energy fades.
   */
  function buildStamp(): Part {
    const HOVER = 0.12;
    const lathe = (points: [number, number][], material: THREE.Material) =>
      new THREE.Mesh(
        new THREE.LatheGeometry(
          points.map(([x, y]) => new THREE.Vector2(x, y)),
          64,
        ),
        material,
      );
    const stampRubber = new THREE.MeshPhysicalMaterial({
      color: 0x15161a,
      metalness: 0,
      roughness: 0.5,
      clearcoat: 0.3,
      clearcoatRoughness: 0.35,
    });
    const die = lathe(
      [
        [0, 0],
        [0.285, 0],
        [0.3, 0.014],
        [0.3, 0.1],
        [0.286, 0.114],
        [0.23, 0.14],
        [0, 0.14],
      ],
      stampRubber,
    );
    const handle = lathe(
      [
        [0, 0.14],
        [0.2, 0.14],
        [0.21, 0.16],
        [0.12, 0.2],
        [0.085, 0.26],
        [0.074, 0.44],
        [0.11, 0.5],
        [0.165, 0.58],
        [0.18, 0.66],
        [0.16, 0.74],
        [0.1, 0.8],
        [0, 0.82],
      ],
      brushedGold,
    );
    brushUv(handle.geometry);
    const stamp = new THREE.Group();
    stamp.add(die, handle);
    stamp.position.set(-0.2, HOVER, -0.06);
    const plateOutline = new THREE.Shape();
    const half = { x: 0.52, z: 0.36 };
    const round = 0.08;
    plateOutline.moveTo(-half.x + round, -half.z);
    plateOutline.lineTo(half.x - round, -half.z);
    plateOutline.quadraticCurveTo(half.x, -half.z, half.x, -half.z + round);
    plateOutline.lineTo(half.x, half.z - round);
    plateOutline.quadraticCurveTo(half.x, half.z, half.x - round, half.z);
    plateOutline.lineTo(-half.x + round, half.z);
    plateOutline.quadraticCurveTo(-half.x, half.z, -half.x, half.z - round);
    plateOutline.lineTo(-half.x, -half.z + round);
    plateOutline.quadraticCurveTo(-half.x, -half.z, -half.x + round, -half.z);
    const plateGeometry = new THREE.ExtrudeGeometry(plateOutline, {
      depth: 0.035,
      bevelEnabled: true,
      bevelThickness: 0.012,
      bevelSize: 0.012,
      bevelSegments: 3,
      curveSegments: 16,
    });
    plateGeometry.rotateX(Math.PI / 2);
    const plate = new THREE.Mesh(brushUv(plateGeometry), brushedGold);
    plate.position.y = -0.012;
    const check = new THREE.Shape();
    check.moveTo(-0.19, 0.02);
    check.lineTo(-0.06, -0.11);
    check.lineTo(0.2, 0.15);
    check.lineTo(0.155, 0.19);
    check.lineTo(-0.06, -0.025);
    check.lineTo(-0.145, 0.06);
    check.closePath();
    const checkGeometry = new THREE.ShapeGeometry(check)
      .scale(0.62, 0.62, 1)
      .rotateX(-Math.PI / 2);
    const ringGeometry = new THREE.RingGeometry(0.17, 0.2, 48).rotateX(
      -Math.PI / 2,
    );
    /** The floor colour of the page's carved engravings. */
    const CARVED = new THREE.Color(0x1a0b02);
    const markMaterial = new THREE.MeshBasicMaterial({
      color: CARVED,
      transparent: true,
      opacity: 0.88,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    const mark = new THREE.Group();
    mark.add(
      new THREE.Mesh(checkGeometry, markMaterial),
      new THREE.Mesh(ringGeometry, markMaterial),
    );
    mark.position.set(0.24, 0.002, 0.08);
    const assembly = new THREE.Group();
    assembly.add(plate, mark, stamp);
    assembly.position.set(0, -0.42, 0.2);
    const tilt = new THREE.Group();
    tilt.rotation.set(0.42, 0, 0);
    tilt.add(assembly);
    const halo = glow(GOLD, 1.6, 0, true);
    const group = new THREE.Group();
    group.add(halo, tilt);
    let press = 0;
    return {
      group,
      radius: 0.62,
      spin(_dt, t) {
        assembly.rotation.y = Math.sin(t * 0.5) * 0.35;
        stamp.position.y = (HOVER + Math.sin(t * 1.3) * 0.025) * (1 - press);
      },
      shine(energy, _t, tone) {
        press = Math.min(1, energy * 1.4);
        markMaterial.color
          .copy(CARVED)
          .lerp(tone === "block" ? EMBER : GOLD, energy);
        markMaterial.opacity = 0.88 + energy * 0.12;
        setGlow(halo, energy * 0.5);
      },
    };
  }

  /**
   * The guardrail: an accent-metal ring set with 16 steel studs, turning; a
   * blocked request fills it with an ember shield.
   */
  function buildGuard(): Part {
    const ringMaterial = crispMetal(accentMetal(gold.clone()));
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.74, 0.08, 40, 180),
      ringMaterial,
    );
    const studs = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.07, 16),
      studSteel,
      16,
    );
    const matrix = new THREE.Matrix4();
    const upright = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      Math.PI / 2,
    );
    const unit = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const position = new THREE.Vector3(
        Math.cos(angle) * 0.74,
        Math.sin(angle) * 0.74,
        0.09,
      );
      studs.setMatrixAt(i, matrix.compose(position, upright, unit));
    }
    const shieldMaterial = new THREE.MeshBasicMaterial({
      color: EMBER,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    glowMaterials.push(shieldMaterial);
    const shield = new THREE.Mesh(
      new THREE.CircleGeometry(0.66, 64),
      shieldMaterial,
    );
    const spinner = new THREE.Group();
    spinner.add(ring, studs, shield);
    const tilt = new THREE.Group();
    tilt.rotation.x = Math.PI / 2 - 0.42;
    tilt.add(spinner);
    const halo = glow(GOLD, 2.3, 0, true);
    const group = new THREE.Group();
    group.add(halo, tilt);
    return {
      group,
      radius: 0.62,
      spin(dt) {
        spinner.rotation.z += dt * 0.35;
      },
      shine(energy, _t, tone) {
        ringMaterial.emissive
          .copy(tone === "block" ? look.ember : look.hitFlash)
          .multiplyScalar(energy * look.ringFlash);
        halo.material.color.copy(tone === "block" ? EMBER : GOLD);
        setGlow(halo, energy * 0.6);
        shieldMaterial.opacity =
          tone === "block" ? energy * 0.55 * look.glowGain + energy * 0.15 : 0;
      },
    };
  }

  /**
   * The applied database: three accent-metal disks on steel spacers. write()
   * lights the top inlay and the bands between the disks from top to bottom,
   * turns every LED on and presses the stack down; between writes the LEDs
   * flicker.
   */
  function buildDatabase(): Part & { write(): void } {
    const RADIUS = 0.5;
    const DISK = 0.2;
    const GAP = 0.05;
    const BEVEL = 0.03;
    const TOP = 2 * (DISK + GAP) + DISK;
    const diskGeometry = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(RADIUS - BEVEL, 0),
        new THREE.Vector2(RADIUS, BEVEL),
        new THREE.Vector2(RADIUS, DISK - BEVEL),
        new THREE.Vector2(RADIUS - BEVEL, DISK),
        new THREE.Vector2(0, DISK),
      ],
      96,
    );
    const gapGeometry = new THREE.CylinderGeometry(
      RADIUS - 0.06,
      RADIUS - 0.06,
      GAP,
      64,
    );
    const ledGeometry = new THREE.SphereGeometry(0.022, 12, 8);
    const ring = (radius: number, y: number) => {
      const material = new THREE.MeshBasicMaterial({
        color: GOLD,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      glowMaterials.push(material);
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.012, 8, 120),
        material,
      );
      mesh.rotation.x = Math.PI / 2;
      mesh.position.y = y;
      return { mesh, material, energy: 0, fireAt: -1 };
    };
    const stack = new THREE.Group();
    const gapRings: ReturnType<typeof ring>[] = [];
    const leds: { material: THREE.MeshBasicMaterial; phase: number }[] = [];
    for (let i = 0; i < 3; i++) {
      const base = i * (DISK + GAP);
      const disk = new THREE.Mesh(diskGeometry, gold);
      disk.position.y = base;
      stack.add(disk);
      for (const x of [-0.13, 0.13]) {
        const material = new THREE.MeshBasicMaterial({
          color: GOLD,
          toneMapped: false,
        });
        const led = new THREE.Mesh(ledGeometry, material);
        led.position.set(
          x,
          base + DISK / 2,
          Math.sqrt(RADIUS * RADIUS - x * x) + 0.004,
        );
        stack.add(led);
        leds.push({ material, phase: Math.random() * 10 });
      }
      if (i < 2) {
        const core = new THREE.Mesh(gapGeometry, studSteel);
        core.position.y = base + DISK + GAP / 2;
        const band = ring(RADIUS - 0.045, core.position.y);
        stack.add(core, band.mesh);
        gapRings.push(band);
      }
    }
    const inlay = ring(0.36, TOP + 0.004);
    stack.add(inlay.mesh);
    const sequence = [inlay, gapRings[1]!, gapRings[0]!];
    const halo = glow(GOLD, 2.0, 0, true);
    halo.position.y = TOP + 0.25;
    const tilt = new THREE.Group();
    tilt.rotation.x = 0.3;
    tilt.add(stack);
    const group = new THREE.Group();
    group.add(halo, tilt);
    let clock = 0;
    let squash = 0;
    let writing = 0;
    return {
      group,
      radius: 0.12,
      write() {
        sequence.forEach((band, index) => (band.fireAt = clock + index * 0.12));
        squash = 1;
        writing = 1.2;
      },
      spin(dt, t) {
        clock += dt;
        for (const band of sequence) {
          if (band.fireAt >= 0 && clock >= band.fireAt) {
            band.energy = 1;
            band.fireAt = -1;
          }
          band.energy *= Math.exp(-dt * 3);
        }
        squash *= Math.exp(-dt * 7);
        stack.scale.y = 1 - squash * 0.06;
        writing = Math.max(0, writing - dt);
        for (const led of leds) {
          const flicker =
            Math.sin(t * 3.1 + led.phase) > 0.85 ||
            Math.sin(t * 1.7 + led.phase * 2) > 0.95;
          const on = writing > 0 || flicker ? 1 : 0;
          led.material.color.copy(look.pulse).multiplyScalar(0.25 + on * 0.95);
        }
      },
      shine(energy) {
        for (const band of sequence) {
          band.material.opacity =
            (0.18 + band.energy * 0.82) * Math.max(look.glowGain, 0.7);
        }
        setGlow(halo, energy * 0.55);
      },
    };
  }

  /**
   * The rolled-back hourglass: steel pillars between two brushed plates, clear
   * glass bulbs, and sand running from the top bulb to the bottom one over
   * SAND_SECONDS. open(true) lights it ember while a blocked request drops
   * onto it; open(false) turns it over in FLIP_SECONDS, rolling the run back.
   */
  function buildHourglass(): Part & { open(value: boolean): void } {
    const HEIGHT = 0.96;
    const MIDDLE = HEIGHT / 2;
    const SAND_SECONDS = 14;
    const FLIP_SECONDS = 0.9;
    // Each plate is PLATE_RADIUS wide and PLATE_THICKNESS thick, its edges
    // rounded to EDGE.
    const PLATE_RADIUS = 0.36;
    const PLATE_THICKNESS = 0.06;
    const EDGE = 0.022;
    const outline = [new THREE.Vector2(0, -PLATE_THICKNESS / 2)];
    for (const [start, centreY] of [
      [-Math.PI / 2, EDGE - PLATE_THICKNESS / 2],
      [0, PLATE_THICKNESS / 2 - EDGE],
    ] as const) {
      for (let step = 0; step <= 8; step++) {
        const angle = start + (step / 8) * (Math.PI / 2);
        outline.push(
          new THREE.Vector2(
            PLATE_RADIUS - EDGE + Math.cos(angle) * EDGE,
            centreY + Math.sin(angle) * EDGE,
          ),
        );
      }
    }
    outline.push(new THREE.Vector2(0, PLATE_THICKNESS / 2));
    const plateGeometry = brushUv(new THREE.LatheGeometry(outline, 96));
    const plate = (y: number) => {
      const mesh = new THREE.Mesh(plateGeometry, brushedGold);
      mesh.position.y = y;
      return mesh;
    };
    const pillars = [90, 210, 330].map((degrees) => {
      const angle = (degrees * Math.PI) / 180;
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.028, 0.028, HEIGHT - 0.12, 24),
        pillarSteel,
      );
      pillar.position.set(Math.cos(angle) * 0.3, MIDDLE, Math.sin(angle) * 0.3);
      return pillar;
    });
    const bulbs = new THREE.SplineCurve(
      (
        [
          [0.21, 0.06],
          [0.25, 0.2],
          [0.23, 0.32],
          [0.12, 0.42],
          [0.035, MIDDLE],
          [0.12, HEIGHT - 0.42],
          [0.23, HEIGHT - 0.32],
          [0.25, HEIGHT - 0.2],
          [0.21, HEIGHT - 0.06],
        ] as const
      ).map(([x, y]) => new THREE.Vector2(x, y)),
    );
    const glass = new THREE.Mesh(
      new THREE.LatheGeometry(bulbs.getPoints(80), 96),
      hourglassGlass,
    );
    const pile = new THREE.Mesh(
      new THREE.ConeGeometry(0.19, 0.18, 40),
      hourglassSand,
    );
    const reservoir = new THREE.Mesh(
      new THREE.ConeGeometry(0.19, 0.2, 40),
      hourglassSand,
    );
    reservoir.rotation.x = Math.PI;
    const stream = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 1, 8),
      hourglassSand,
    );
    const body = new THREE.Group();
    body.add(
      plate(0.03),
      plate(HEIGHT - 0.03),
      ...pillars,
      glass,
      pile,
      reservoir,
      stream,
    );
    body.position.y = -MIDDLE;
    const pivot = new THREE.Group();
    pivot.position.y = MIDDLE;
    pivot.add(body);
    const inner = glow(EMBER, 1.3, 0, true);
    inner.position.y = MIDDLE;
    const tilt = new THREE.Group();
    tilt.rotation.x = 0.18;
    tilt.add(pivot, inner);
    const group = new THREE.Group();
    group.add(tilt);
    // sand is the share in the bottom bulb; flip runs 0 to 1 while turning over
    // and is -1 at rest.
    let sand = 0.85;
    let flip = -1;
    let waiting = false;
    function place() {
      const fill = Math.max(sand, 0.001);
      pile.scale.set(Math.sqrt(fill), fill, Math.sqrt(fill));
      pile.position.y = 0.06 + 0.09 * fill;
      const left = Math.cbrt(Math.max(1 - sand, 0.001));
      reservoir.scale.setScalar(left);
      reservoir.position.y = MIDDLE + 0.1 * left;
      const floor = 0.06 + 0.18 * fill;
      stream.visible = sand < 1 && flip < 0;
      stream.scale.y = MIDDLE - floor;
      stream.position.y = (MIDDLE + floor) / 2;
    }
    place();
    return {
      group,
      radius: 0.08,
      open(value) {
        waiting = value;
        if (!value) flip = 0;
      },
      spin(dt) {
        if (flip >= 0) {
          flip = Math.min(1, flip + dt / FLIP_SECONDS);
          const eased =
            flip < 0.5 ? 2 * flip * flip : 1 - (2 - 2 * flip) ** 2 / 2;
          pivot.rotation.z = Math.PI * eased;
          if (flip === 1) {
            flip = -1;
            pivot.rotation.z = 0;
            sand = 1 - sand;
          }
        } else {
          sand = Math.min(1, sand + dt / SAND_SECONDS);
        }
        place();
      },
      shine(energy) {
        setGlow(inner, energy * 0.8 + (waiting ? 0.35 : 0));
      },
    };
  }

  /* ---------- Assembly ---------- */
  const rig = new THREE.Group();
  scene.add(rig);
  const shadowMap = radialTexture([
    [0, "rgba(0,0,0,1)"],
    [0.45, "rgba(0,0,0,0.55)"],
    [1, "rgba(0,0,0,0)"],
  ]);
  const shadows: THREE.Sprite[] = [];
  /**
   * Places `part` at `position`, scaled by `scale`, over a drop shadow (light
   * theme only) sized to its box: `spread` scales it and `weight` its opacity.
   */
  function addNode(
    name: PipelinePartName,
    part: Part,
    position: THREE.Vector3,
    scale: number,
    spread: number,
    weight = 1.7,
  ): Node {
    const box = new THREE.Box3();
    part.group.updateMatrixWorld(true);
    part.group.traverse((object) => {
      if (
        (object instanceof THREE.Mesh &&
          !(object instanceof THREE.InstancedMesh)) ||
        object instanceof THREE.LineSegments
      ) {
        box.expandByObject(object);
      }
    });
    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const backdrop = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: shadowMap,
        color: 0x0b0e12,
        opacity: 0,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    backdrop.position.set(
      centre.x - size.y * 0.016,
      centre.y - size.y * 0.04,
      centre.z - 0.8,
    );
    backdrop.scale.set(size.x * 1.3 * spread, size.y * 1.1 * spread, 1);
    backdrop.userData.weight = weight;
    part.group.add(backdrop);
    shadows.push(backdrop);
    part.group.position.copy(position);
    part.group.scale.setScalar(scale);
    rig.add(part.group);
    return {
      part,
      home: position.clone(),
      radius: part.radius * scale,
      energy: 0,
      tone: "hit",
      label: label(name),
      timer: 0,
    };
  }
  const database = buildDatabase();
  const hourglass = buildHourglass();
  const nodes = {
    request: addNode(
      "request",
      buildRequest(),
      at(-1.55, 3.05, -0.3),
      0.9,
      1.9,
    ),
    agent: addNode("agent", buildAgent(), at(0.05, 1.85, 0.3), 1, 1.45),
    model: addNode("model", buildChip(), at(2.15, 2.4, -0.6), 0.82, 1.45, 1),
    tool: addNode("tool", buildStamp(), at(-1.3, 0.2, 0.4), 1, 1.6),
    guard: addNode("guard", buildGuard(), at(0.4, -0.95, 0.2), 0.88, 1.75),
    pass: addNode("pass", database, at(-1.35, -2.75, 0.5), 0.9, 1.6),
    fail: addNode("fail", hourglass, at(1.8, -2.6, -0.2), 0.9, 1.5),
  } satisfies Record<PipelinePartName, Node>;

  /* ---------- Conduits ---------- */
  // uHead is the pulse's place along the tube (uv.x runs 0 to 1 along the
  // path); the band at
  // uHead and the tail behind it blend toward uPulse by uLit; uDir is 1 with
  // the path, -1 against.
  const conduitVertex = `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      vUv = uv;
      vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
      vView = normalize(-viewPosition.xyz);
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * viewPosition;
    }`;
  const conduitFragment = `
    uniform vec3 uBase;
    uniform vec3 uRim;
    uniform vec3 uPulse;
    uniform float uHead;
    uniform float uLit;
    uniform float uDir;
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 1.5);
      vec3 color = mix(uBase, uRim, rim);
      float d = (vUv.x - uHead) * uDir;
      float head = exp(-d * d * 1200.0);
      float tail = d < 0.0 ? exp(d * 9.0) * 0.6 : 0.0;
      float k = clamp(head * 1.4 + tail, 0.0, 1.0) * uLit;
      color = mix(color, uPulse * (1.0 + head * 1.2), k);
      gl_FragColor = vec4(color, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;
  interface Path {
    curve: THREE.Curve<THREE.Vector3>;
    uniforms: Record<
      "uBase" | "uRim" | "uPulse" | "uHead" | "uLit" | "uDir",
      THREE.IUniform
    > | null;
  }
  const conduits: Path[] = [];
  function connect(points: THREE.Vector3[], radius = 0.022): Path {
    const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
    const uniforms = {
      uBase: { value: new THREE.Color() },
      uRim: { value: new THREE.Color() },
      uPulse: { value: new THREE.Color() },
      uHead: { value: 0 },
      uLit: { value: 0 },
      uDir: { value: 1 },
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: conduitVertex,
      fragmentShader: conduitFragment,
    });
    rig.add(
      new THREE.Mesh(new THREE.TubeGeometry(curve, 160, radius, 10), material),
    );
    const path = { curve, uniforms };
    conduits.push(path);
    return path;
  }
  const home = (name: PipelinePartName) => nodes[name].home;
  // The database's top: its stack height scaled by 0.9, shifted forward by its
  // tilt.
  const dbTop = home("pass")
    .clone()
    .add(at(0, 0.6, 0.19));
  const passChute = dbTop.clone().add(at(0, 0.36, 0.04));
  // The hourglass's top plate: its scaled height, shifted forward by its tilt.
  const hourglassTop = home("fail")
    .clone()
    .add(at(0, 0.86, 0.15));
  const failChute = hourglassTop.clone().add(at(0, 0.38, 0.05));
  const paths = {
    reqAgent: connect([home("request"), at(-0.85, 2.8, 0), home("agent")]),
    agentModel: connect([home("agent"), at(1.1, 2.45, -0.1), home("model")]),
    modelAgent: connect([home("model"), at(1.2, 1.6, 0.15), home("agent")]),
    agentTool: connect([home("agent"), at(-0.8, 1.15, 0.5), home("tool")]),
    toolGuard: connect([home("tool"), at(-0.55, -0.6, 0.45), home("guard")]),
    guardPass: connect([home("guard"), at(-0.55, -1.45, 0.5), passChute]),
    guardFail: connect([home("guard"), at(1.3, -1.05, 0), failChute]),
    // The report line: a thinner conduit from the hourglass's top plate up the
    // right side to the agent.
    rollbackAgent: connect(
      [
        hourglassTop.clone().add(at(0.42, -0.15, 0.05)),
        at(2.55, -0.9, -0.2),
        at(2.25, 0.75, -0.1),
        at(1.0, 1.55, 0.45),
        home("agent"),
      ],
      0.014,
    ),
    // Drops from a chute onto its part, with no conduit: the pulse follows them
    // unlit.
    passDrop: {
      curve: new THREE.LineCurve3(
        passChute,
        dbTop.clone().add(at(0, -0.04, 0)),
      ),
      uniforms: null,
    },
    failDrop: {
      curve: new THREE.LineCurve3(
        failChute,
        hourglassTop.clone().add(at(0, 0.02, 0)),
      ),
      uniforms: null,
    },
  } satisfies Record<string, Path>;
  // A steel nozzle on the open end of each chute.
  for (const path of [paths.guardPass, paths.guardFail]) {
    const nozzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.05, 0.09, 24),
      steel,
    );
    nozzle.position.copy(path.curve.getPointAt(1));
    nozzle.quaternion.setFromUnitVectors(
      at(0, 1, 0),
      path.curve.getTangentAt(1).normalize(),
    );
    rig.add(nozzle);
  }

  /* ---------- Pulse, sparks and smoke ---------- */
  const pulseCoreMaterial = new THREE.MeshBasicMaterial({
    color: 0xfff1c4,
    toneMapped: false,
  });
  const pulseCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.085, 24, 16),
    pulseCoreMaterial,
  );
  const pulseHalo = glow(GOLD, 1.35);
  const pulse = new THREE.Group();
  pulse.add(pulseHalo, pulseCore);
  pulse.visible = false;
  rig.add(pulse);

  const sparks = Array.from({ length: 18 }, () => {
    const sprite = glow(GOLD, 0.16);
    rig.add(sprite);
    return { sprite, velocity: new THREE.Vector3(), life: 0 };
  });
  /** Overlapping soft white blobs, tinted grey per puff. */
  const smokeMap = (() => {
    const size = 128;
    const surface = document.createElement("canvas");
    surface.width = surface.height = size;
    const context = surface.getContext("2d")!;
    for (let i = 0; i < 9; i++) {
      const x = size / 2 + (Math.random() - 0.5) * size * 0.35;
      const y = size / 2 + (Math.random() - 0.5) * size * 0.35;
      const radius = size * (0.22 + Math.random() * 0.18);
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, "rgba(255,255,255,0.35)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, size, size);
    }
    return new THREE.CanvasTexture(surface);
  })();
  const smoke = Array.from({ length: 16 }, () => {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: smokeMap,
        color: 0x8f969f,
        opacity: 0,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    sprite.visible = false;
    rig.add(sprite);
    return { sprite, velocity: new THREE.Vector3(), life: 0, size: 0, spin: 0 };
  });
  /**
   * Throws smoke outward from `origin`, rising, swelling and fading over about
   * 1.7s (light theme only).
   */
  function puff(origin: THREE.Vector3) {
    if (!look.smokeGain) return;
    for (const particle of smoke) {
      const direction = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.3,
        Math.random() - 0.5,
      ).normalize();
      particle.sprite.position.copy(origin).addScaledVector(direction, 0.18);
      particle.velocity
        .copy(direction)
        .multiplyScalar(0.35 + Math.random() * 0.35);
      particle.velocity.y += 0.25;
      particle.life = 1;
      particle.size = 0.3 + Math.random() * 0.2;
      particle.spin = (Math.random() - 0.5) * 1.2;
      particle.sprite.material.rotation = Math.random() * Math.PI * 2;
      particle.sprite.visible = true;
    }
  }
  /**
   * Showers sparks of `colour` from `origin`; `power` scales their launch
   * speed.
   */
  function burst(origin: THREE.Vector3, colour: THREE.Color, power = 1) {
    for (const spark of sparks) {
      spark.sprite.position.copy(origin);
      spark.sprite.material.color.copy(colour);
      spark.velocity
        .set(
          (Math.random() - 0.5) * 1.6,
          1.2 + Math.random() * 1.6,
          (Math.random() - 0.5) * 1.6,
        )
        .multiplyScalar(power);
      spark.life = 1;
    }
  }

  /* ---------- Theme ---------- */
  /**
   * Sets every theme-dependent material and value from data-theme on <html>:
   * on the light theme the accent parts are bronze, reflecting
   * bronzeStudioEnvironment as their own envMap BRONZE_GAIN times, glows blend
   * normally at half strength, halos are off and parts cast drop shadows.
   */
  function applyLook() {
    const dark = root.dataset.theme !== "light";
    scene.environment = dark ? roomEnvironment : bronzeStudioEnvironment;
    keyLight.intensity = dark ? 2.4 : 2.8;
    keyLight.color.set(dark ? 0xfff0d0 : 0xffffff);
    rimLight.intensity = dark ? 2.0 : 1.4;
    for (const material of accentMetals) {
      material.envMap = dark ? null : bronzeStudioEnvironment;
      material.envMapIntensity = dark ? 1 : BRONZE_GAIN;
      material.color.set(dark ? GOLD_METAL : BRONZE);
      material.roughness = dark ? 0.18 : 0.26;
      material.needsUpdate = true;
    }
    for (const material of crispMetals) {
      material.envMap = dark ? null : bronzeStudioEnvironment;
      material.envMapIntensity = dark ? 1 : BRONZE_GAIN;
      material.color.set(dark ? GOLD_METAL : BRONZE);
      material.roughness = dark ? 0.18 : 0.2;
      material.clearcoat = dark ? 0.6 : 0.15;
      material.clearcoatRoughness = dark ? 0.15 : 0.1;
      material.needsUpdate = true;
    }
    for (const material of lacquerMetals) {
      material.envMap = dark ? null : bronzeStudioEnvironment;
      material.envMapIntensity = dark ? 1 : BRONZE_GAIN;
      material.color.set(dark ? GOLD_METAL : BRONZE);
      material.roughness = dark ? 0.18 : 0.22;
      material.clearcoat = dark ? 0.6 : 0.5;
      material.clearcoatRoughness = dark ? 0.15 : 0.1;
      material.needsUpdate = true;
    }
    studSteel.envMap = dark ? studioEnvironment : null;
    studSteel.needsUpdate = true;
    pillarSteel.envMap = dark ? studioEnvironment : bronzeStudioEnvironment;
    pillarSteel.needsUpdate = true;
    brushedGold.envMap = dark ? roomEnvironment : bronzeStudioEnvironment;
    brushedGold.envMapIntensity = dark ? BRUSHED_GLOSS : BRONZE_GAIN;
    hourglassGlass.envMap = dark ? roomEnvironment : studioEnvironment;
    hourglassGlass.envMapIntensity = dark ? 0.6 : 1.2;
    hourglassGlass.opacity = dark ? 0.06 : 0.08;
    hourglassGlass.needsUpdate = true;
    hourglassSand.envMap = dark ? roomEnvironment : null;
    hourglassSand.envMapIntensity = dark ? 0.45 : 1;
    hourglassSand.emissive.set(dark ? 0x2a1a02 : 0x8a6418);
    hourglassSand.needsUpdate = true;
    for (const material of accentLines) {
      material.color.set(dark ? GOLD_LINE : 0xa36a36);
    }
    look.cageOpacity = dark ? 0.62 : 0.9;
    look.glowGain = dark ? 1 : 0.5;
    look.haloGain = dark ? 1 : 0;
    look.shadowGain = dark ? 0 : 0.3;
    look.hitFlash.set(dark ? 0xffd27a : 0xffffff);
    look.ringFlash = dark ? 0.9 : 0.35;
    look.smokeGain = dark ? 0 : 1;
    for (const shadow of shadows) {
      shadow.material.opacity = look.shadowGain * shadow.userData.weight;
    }
    pulseHalo.scale.setScalar(dark ? 1.35 : 0.55);
    look.pulse.set(dark ? 0xffd27a : 0xb3800f);
    look.ember.set(dark ? 0xff7a4d : 0xc4451f);
    look.core.set(dark ? 0xfff1c4 : 0x9c6b05);
    look.coreBlocked.set(dark ? 0xffc2a8 : 0xa8401f);
    look.report.set(dark ? 0xd8e4f6 : 0x3a4250);
    look.coreReport.set(dark ? 0xf4f8ff : 0x2f3540);
    for (const { uniforms } of conduits) {
      uniforms!.uBase.value.set(dark ? 0x22262c : 0x2d333b);
      uniforms!.uRim.value.set(dark ? 0x98a1ad : 0x8a929c);
    }
    for (const material of glowMaterials) {
      material.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
      material.needsUpdate = true;
    }
  }

  /* ---------- Motion ---------- */
  interface Run {
    path: Path;
    start: number;
    duration: number;
    resolve: () => void;
    easing: "glide" | "fall";
    reverse: boolean;
  }
  let run: Run | null = null;
  const fading = new Set<Path>();
  /**
   * Runs the pulse along `path` over `duration` ms; glide eases in and out,
   * fall accelerates like a drop, and reverse runs it from the end back.
   */
  function travel(
    path: Path,
    duration: number,
    tone: Tone = "hit",
    easing: Run["easing"] = "glide",
    reverse = false,
  ) {
    return new Promise<void>((resolve) => {
      const colours = tint(tone);
      fading.delete(path);
      if (path.uniforms) {
        path.uniforms.uPulse.value.copy(colours.band);
        path.uniforms.uDir.value = reverse ? -1 : 1;
      }
      pulseHalo.material.color.copy(colours.halo);
      pulseCoreMaterial.color.copy(colours.core);
      pulse.visible = true;
      run = {
        path,
        start: performance.now(),
        duration,
        resolve,
        easing,
        reverse,
      };
    });
  }

  const scratch = new THREE.Vector3();
  const centre = new THREE.Vector3();
  /** `point` in client pixels. */
  function onPage(point: THREE.Vector3) {
    scratch.copy(point).project(camera);
    const box = canvas!.getBoundingClientRect();
    return {
      x: box.left + (scratch.x * 0.5 + 0.5) * box.width,
      y: box.top + (-scratch.y * 0.5 + 0.5) * box.height,
    };
  }
  /**
   * Lights part `name` in `tone`, marks its label .hit or .block for 900ms and
   * ripples the particle field from it.
   */
  function flash(name: PipelinePartName, tone: "hit" | "block" = "hit") {
    const node = nodes[name];
    node.energy = 1;
    node.tone = tone;
    node.label?.classList.toggle("hit", tone === "hit");
    node.label?.classList.toggle("block", tone === "block");
    clearTimeout(node.timer);
    node.timer = window.setTimeout(
      () => node.label?.classList.remove("hit", "block"),
      900,
    );
    const { x, y } = onPage(node.part.group.getWorldPosition(centre));
    dispatchEvent(new CustomEvent("field:ripple", { detail: { x, y, tone } }));
  }
  const log = (who: string, text: string, tone?: TerminalTone) =>
    dispatchEvent(
      new CustomEvent<LogEntry>(LOG_EVENT, { detail: { who, text, tone } }),
    );

  const pointer = { x: 0, y: 0 };
  const onPointer = (event: PointerEvent) => {
    const box = stage.getBoundingClientRect();
    const x =
      (event.clientX - (box.left + box.width / 2)) / (box.width / 2 + 200);
    const y =
      (event.clientY - (box.top + box.height / 2)) / (box.height / 2 + 200);
    pointer.x = Math.max(-1, Math.min(1, x));
    pointer.y = Math.max(-1, Math.min(1, y));
  };
  if (finePointer && !reduceMotion) {
    addEventListener("pointermove", onPointer, { passive: true });
  }

  let yaw = 0;
  let pitch = 0;
  let shake = 0;
  let last = performance.now();

  function render(now: number) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const t = now / 1000;
    // A slow sway, plus parallax toward the pointer.
    const follow = 1 - Math.exp(-dt * 3);
    yaw += (Math.sin(t * 0.21) * 0.22 + pointer.x * 0.3 - yaw) * follow;
    pitch += (Math.sin(t * 0.17) * 0.05 + pointer.y * 0.12 - pitch) * follow;
    rig.rotation.set(pitch, yaw, 0);
    rig.position.y = Math.sin(t * 0.6) * 0.06;

    for (const node of Object.values(nodes)) {
      node.energy *= Math.exp(-dt * 2.4);
      node.part.spin(dt, t);
      node.part.shine(node.energy, t, node.tone);
    }
    shake *= Math.exp(-dt * 5);
    const guard = nodes.guard;
    guard.part.group.position.set(
      guard.home.x + (Math.random() - 0.5) * shake * 0.12,
      guard.home.y + (Math.random() - 0.5) * shake * 0.08,
      guard.home.z,
    );

    if (run) {
      const progress = Math.min((now - run.start) / run.duration, 1);
      const eased =
        run.easing === "fall"
          ? progress * progress
          : progress < 0.5
            ? 2 * progress * progress
            : 1 - (-2 * progress + 2) ** 2 / 2;
      const along = run.reverse ? 1 - eased : eased;
      pulse.position.copy(run.path.curve.getPointAt(along));
      setGlow(pulseHalo, 1);
      if (run.path.uniforms) {
        run.path.uniforms.uHead.value = along;
        run.path.uniforms.uLit.value = 1;
      }
      if (progress >= 1) {
        if (run.path.uniforms) fading.add(run.path);
        const done = run.resolve;
        run = null;
        done();
      }
    }
    for (const path of fading) {
      const lit = path.uniforms!.uLit;
      lit.value *= Math.exp(-dt * 4);
      if (lit.value < 0.01) {
        lit.value = 0;
        fading.delete(path);
      }
    }
    for (const spark of sparks) {
      if (spark.life <= 0) continue;
      spark.life -= dt * 0.9;
      spark.velocity.y -= dt * 2.4;
      spark.sprite.position.addScaledVector(spark.velocity, dt);
      setGlow(spark.sprite, Math.max(spark.life, 0) * 0.9);
    }
    for (const particle of smoke) {
      if (particle.life <= 0) continue;
      particle.life -= dt * 0.6;
      particle.velocity.multiplyScalar(Math.exp(-dt * 1.6));
      particle.velocity.y += dt * 0.15;
      particle.sprite.position.addScaledVector(particle.velocity, dt);
      const age = 1 - particle.life;
      particle.sprite.scale.setScalar(particle.size * (1 + age * 2.2));
      particle.sprite.material.rotation += particle.spin * dt;
      particle.sprite.material.opacity =
        Math.max(particle.life, 0) *
        0.5 *
        look.smokeGain *
        Math.min(1, age * 6);
      if (particle.life <= 0) particle.sprite.visible = false;
    }

    renderer.render(scene, camera);
    placeLabels();
    stage.dataset.ready = "";
  }

  /**
   * Places each label under its part, dimming the labels of parts turned away
   * from the camera.
   */
  function placeLabels() {
    const width = canvas!.clientWidth;
    const height = canvas!.clientHeight;
    for (const node of Object.values(nodes)) {
      if (!node.label) continue;
      node.part.group.getWorldPosition(centre);
      const depth = scratch
        .copy(centre)
        .applyMatrix4(camera.matrixWorldInverse).z;
      scratch.copy(centre);
      scratch.y -= node.radius;
      scratch.project(camera);
      const x = (scratch.x * 0.5 + 0.5) * width;
      const y = (-scratch.y * 0.5 + 0.5) * height + 10;
      node.label.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, 0)`;
      node.label.style.opacity = String(
        Math.min(1, Math.max(0.5, 1 - (-depth - 11.4) * 0.35)),
      );
    }
  }

  function resize() {
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (reduceMotion) render(performance.now());
  }

  let frame = 0;
  let onScreen = true;
  let alive = true;
  function loop(now: number) {
    render(now);
    frame = requestAnimationFrame(loop);
  }
  function start() {
    if (frame || !onScreen || document.hidden || reduceMotion || !alive) return;
    last = performance.now();
    frame = requestAnimationFrame(loop);
  }
  function pause() {
    cancelAnimationFrame(frame);
    frame = 0;
  }
  const visibility = () => (document.hidden ? pause() : start());
  const watch = new IntersectionObserver(([entry]) => {
    onScreen = entry?.isIntersecting ?? true;
    if (onScreen) start();
    else pause();
  });
  watch.observe(stage);
  document.addEventListener("visibilitychange", visibility);
  const themes = new MutationObserver(() => {
    applyLook();
    if (reduceMotion) render(performance.now());
  });
  themes.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  const sizes = new ResizeObserver(resize);
  sizes.observe(stage);

  /**
   * The pipeline's runs, forever: a passing run, or a blocked one at BLOCK_AT
   * of every BLOCK_EVERY.
   */
  async function pipeline() {
    for (let index = 0; alive; index++) {
      while (alive && (document.hidden || !onScreen)) await sleep(400);
      if (!alive) return;
      flash("request");
      puff(home("request"));
      log("request", "plain-language change");
      await travel(paths.reqAgent, 900);
      flash("agent");
      log("agent", "→ model on CPU · intent, slots");
      await travel(paths.agentModel, 800);
      flash("model");
      await travel(paths.modelAgent, 800);
      flash("agent");
      log("agent", "→ typed tool · pages.update");
      await travel(paths.agentTool, 850);
      flash("tool");
      await travel(paths.toolGuard, 850);
      if (isBlocked(index)) {
        flash("guard", "block");
        shake = 1;
        log("guardrail", "✗ gate failed · fail-closed", "bad");
        hourglass.open(true);
        await travel(paths.guardFail, 950, "block");
        await travel(paths.failDrop, 360, "block", "fall");
        pulse.visible = false;
        hourglass.open(false);
        flash("fail", "block");
        setTimeout(() => burst(hourglassTop, EMBER, 0.45), 160);
        log("rollback", "change reverted · discarded", "bad");
        await sleep(450);
        log("report", "rollback → agent · gate failed", "bad");
        await travel(paths.rollbackAgent, 1400, "report");
        flash("agent", "block");
        log("agent", "→ request · rejected, nothing applied", "bad");
        await travel(paths.reqAgent, 1000, "report", "glide", true);
        flash("request", "block");
      } else {
        flash("guard");
        log("guardrail", "✓ gates passed", "good");
        await travel(paths.guardPass, 950);
        await travel(paths.passDrop, 300, "hit", "fall");
        pulse.visible = false;
        database.write();
        flash("pass");
        burst(dbTop, GOLD);
        log("audit", "written · operator on record", "good");
      }
      pulse.visible = false;
      await sleep(1300);
    }
  }

  applyLook();
  resize();
  if (reduceMotion) {
    render(performance.now());
  } else {
    start();
    void pipeline();
  }

  return () => {
    alive = false;
    pause();
    run?.resolve();
    watch.disconnect();
    themes.disconnect();
    sizes.disconnect();
    document.removeEventListener("visibilitychange", visibility);
    removeEventListener("pointermove", onPointer);
    renderer.dispose();
  };
}
