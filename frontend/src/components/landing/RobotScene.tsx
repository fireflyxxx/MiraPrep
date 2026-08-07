"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useReducedMotionPreference } from "./useReducedMotionPreference";

const WHITE = 0xf7f7f5;
const DARK = 0x14161a;
const ORANGE = 0xf97316;
const EYE = 0xffa63d;

const FOV = 30;
// Half-extents the camera must keep in frame. The antenna tip reaches y≈1.56 and the ear
// pods reach x≈±1.14; a hardcoded camera distance framed those on a wide viewport and
// sliced the antenna off on anything squarer, so the distance is solved per aspect instead.
const FIT_HALF_HEIGHT = 1.95;
const FIT_HALF_WIDTH = 1.6;

/** Rounded square outline — the eye tiles and nothing else. */
function roundedSquare(size: number, radius: number) {
  const h = size / 2;
  const r = Math.min(radius, h);
  const shape = new THREE.Shape();
  shape.moveTo(-h + r, -h);
  shape.lineTo(h - r, -h);
  shape.quadraticCurveTo(h, -h, h, -h + r);
  shape.lineTo(h, h - r);
  shape.quadraticCurveTo(h, h, h - r, h);
  shape.lineTo(-h + r, h);
  shape.quadraticCurveTo(-h, h, -h, h - r);
  shape.lineTo(-h, -h + r);
  shape.quadraticCurveTo(-h, -h, -h + r, -h);
  return shape;
}

type Built = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  head: THREE.Group;
  eyes: THREE.Group;
  antennaTip: THREE.Mesh;
  disposables: { dispose: () => void }[];
};

function buildRobot(): Built {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.set(0, 0.05, 7.2);

  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(item: T) => {
    disposables.push(item);
    return item;
  };

  const shell = track(
    new THREE.MeshPhysicalMaterial({
      color: WHITE,
      roughness: 0.34,
      metalness: 0.04,
      clearcoat: 1,
      clearcoatRoughness: 0.22,
    }),
  );
  const visorMaterial = track(
    new THREE.MeshPhysicalMaterial({
      color: DARK,
      // Broad, soft highlights: a mirror-sharp visor turns each light into a hard white
      // dot that reads as a smudge on the face.
      roughness: 0.2,
      metalness: 0.35,
      clearcoat: 1,
      clearcoatRoughness: 0.16,
    }),
  );
  const accent = track(
    new THREE.MeshStandardMaterial({ color: ORANGE, roughness: 0.38, metalness: 0.18 }),
  );
  // toneMapped:false keeps the eyes at full punch — ACES would otherwise roll them off into
  // the same beige as the shell, which is exactly what makes a robot look switched off.
  const eyeMaterial = track(
    new THREE.MeshBasicMaterial({ color: EYE, toneMapped: false }),
  );

  const robot = new THREE.Group();
  const head = new THREE.Group();
  robot.add(head);

  // Skull is a true sphere on purpose. Any non-uniform scale here and a concentric visor
  // cap no longer rides parallel to the surface — that is what punched the skull through
  // the visor and ate it into a crescent.
  const skullGeometry = track(new THREE.SphereGeometry(1, 96, 96));
  const skull = new THREE.Mesh(skullGeometry, shell);
  head.add(skull);

  // Visor: a cap on a slightly larger concentric sphere, so it sits proud of the skull
  // everywhere and cannot intersect it. Rotation keeps that guarantee; scaling would not.
  const VISOR_R = 1.035;
  const visorGeometry = track(
    new THREE.SphereGeometry(VISOR_R, 96, 96, 0, Math.PI * 2, 0, 0.66),
  );
  const visor = new THREE.Mesh(visorGeometry, visorMaterial);
  visor.rotation.x = Math.PI / 2 + 0.07;
  head.add(visor);

  // Eyes: 2x2 tiles each, the detail that makes the face read as this robot.
  const eyes = new THREE.Group();
  const tileGeometry = track(new THREE.ShapeGeometry(roundedSquare(0.082, 0.024), 8));
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    for (const [ox, oy] of [
      [-0.048, 0.048],
      [0.048, 0.048],
      [-0.048, -0.048],
      [0.048, -0.048],
    ]) {
      const tile = new THREE.Mesh(tileGeometry, eyeMaterial);
      tile.position.set(ox, oy, 0);
      eye.add(tile);
    }
    // Seat each eye on the visor's sphere and turn it along the surface normal, so the
    // tiles stay flush instead of floating or sinking as the head turns.
    const x = side * 0.3;
    const y = 0.05;
    const z = Math.sqrt((VISOR_R + 0.02) ** 2 - x * x - y * y);
    eye.position.set(x, y, z);
    eye.rotation.y = Math.atan2(x, z);
    eyes.add(eye);
  }
  head.add(eyes);

  // Ear pods.
  const podGeometry = track(new THREE.CapsuleGeometry(0.26, 0.46, 10, 28));
  for (const side of [-1, 1]) {
    const pod = new THREE.Mesh(podGeometry, accent);
    pod.position.set(side * 0.88, -0.06, 0.02);
    pod.rotation.z = Math.PI / 2;
    pod.scale.set(1, 0.58, 0.92);
    head.add(pod);
  }

  // Antenna.
  const baseGeometry = track(new THREE.CylinderGeometry(0.17, 0.22, 0.13, 32));
  const base = new THREE.Mesh(baseGeometry, accent);
  base.position.y = 1.05;
  head.add(base);

  const stemGeometry = track(new THREE.CylinderGeometry(0.026, 0.034, 0.4, 20));
  const stem = new THREE.Mesh(stemGeometry, shell);
  stem.position.y = 1.24;
  head.add(stem);

  const tipGeometry = track(new THREE.SphereGeometry(0.075, 24, 24));
  const antennaTip = new THREE.Mesh(tipGeometry, eyeMaterial);
  antennaTip.position.y = 1.48;
  head.add(antennaTip);

  // Neck and shoulders — the hero fades the lower edge out, so they only imply a body.
  const neckGeometry = track(new THREE.CylinderGeometry(0.26, 0.36, 0.62, 40));
  const neck = new THREE.Mesh(neckGeometry, visorMaterial);
  neck.position.y = -1.26;
  robot.add(neck);

  const collarGeometry = track(new THREE.TorusGeometry(0.5, 0.06, 16, 64));
  const collar = new THREE.Mesh(collarGeometry, accent);
  collar.rotation.x = Math.PI / 2 - 0.2;
  collar.position.y = -1.5;
  robot.add(collar);

  const torsoGeometry = track(new THREE.SphereGeometry(1.2, 64, 64));
  const torso = new THREE.Mesh(torsoGeometry, shell);
  torso.scale.set(1.2, 0.66, 0.86);
  torso.position.y = -2.36;
  robot.add(torso);

  scene.add(robot);

  // Warm key, cool fill, orange rim — the rim is what separates the white shell from a
  // white page.
  scene.add(new THREE.AmbientLight(0xffffff, 1.15));
  const key = new THREE.DirectionalLight(0xfff2e4, 2.6);
  key.position.set(-2.6, 3.2, 4.2);
  scene.add(key);
  // Fill sits well off to the side and there is no point light at all: anything near the
  // camera axis lands a specular dot on the glossy visor, which reads as a smudge on the
  // face rather than as lighting.
  const fill = new THREE.DirectionalLight(0xdfe7ff, 0.5);
  fill.position.set(4.2, -1.2, 1.2);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(ORANGE, 3.2);
  rim.position.set(1.4, 1.2, -3.2);
  scene.add(rim);

  return { scene, camera, head, eyes, antennaTip, disposables };
}

export default function RobotScene({ className }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotionPreference();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      // ponytail: no WebGL (jsdom, blocked GPU) leaves the slot empty rather than throwing
      // the whole landing page away. The hero still reads without it.
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setClearAlpha(0);
    host.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";

    const { scene, camera, head, eyes, antennaTip, disposables } = buildRobot();

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      const aspect = w / h;
      camera.aspect = aspect;
      const halfFov = THREE.MathUtils.degToRad(FOV) / 2;
      camera.position.z = Math.max(
        FIT_HALF_HEIGHT / Math.tan(halfFov),
        FIT_HALF_WIDTH / (Math.tan(halfFov) * aspect),
      );
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    // Pointer drives where the head looks; it is normalised against the viewport so the
    // robot tracks the cursor anywhere on the hero, not just over the canvas.
    const pointer = { x: 0, y: 0 };
    const onPointerMove = (event: PointerEvent) => {
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
    };
    if (!reducedMotion) window.addEventListener("pointermove", onPointerMove);

    let frame = 0;
    let nextBlink = 1.8;
    const clock = new THREE.Clock();

    const render = () => {
      const t = clock.getElapsedTime();

      if (!reducedMotion) {
        head.rotation.y += (pointer.x * 0.42 - head.rotation.y) * 0.055;
        head.rotation.x += (pointer.y * 0.26 - head.rotation.x) * 0.055;
        head.position.y = Math.sin(t * 1.15) * 0.035;

        if (t > nextBlink) {
          const since = t - nextBlink;
          // 140ms shut-and-open, then wait a randomised beat so it never looks metronomic.
          eyes.scale.y = since < 0.14 ? Math.max(0.06, Math.abs(since - 0.07) / 0.07) : 1;
          if (since >= 0.14) nextBlink = t + 2.4 + Math.random() * 3.2;
        }
        antennaTip.scale.setScalar(1 + Math.sin(t * 2.6) * 0.16);
      }

      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };

    const start = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(render);
    };
    const stop = () => cancelAnimationFrame(frame);

    // Draw one frame synchronously so the robot is on screen before the first rAF lands —
    // otherwise a throttled or not-yet-compositing tab shows an empty box.
    renderer.render(scene, camera);
    if (!reducedMotion) start();

    const visibility = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !document.hidden && !reducedMotion) start();
      else stop();
    });
    visibility.observe(host);

    const onVisibilityChange = () => {
      if (!document.hidden && !reducedMotion) start();
      else stop();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stop();
      observer.disconnect();
      visibility.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pointermove", onPointerMove);
      for (const item of disposables) item.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [reducedMotion]);

  return (
    <div
      ref={hostRef}
      className={className}
      data-testid="robot-scene"
      role="img"
      aria-label="Mira 机器人面试官"
    />
  );
}
