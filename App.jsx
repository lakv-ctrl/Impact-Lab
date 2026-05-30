import React, {
  useState, useEffect, useRef, useCallback, useMemo, Suspense
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Sky, Cloud, Environment, PerspectiveCamera,
  useTexture, MeshReflectorMaterial, Stars
} from "@react-three/drei";
import { motion, AnimatePresence } from "framer-motion";
import { Howl, Howler } from "howler";
import * as THREE from "three";

const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&family=Barlow+Condensed:wght@300;400;600;700;800&family=Syne:wght@400;700;800&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:        #020617;
    --bg2:       #060d1f;
    --navy:      #0a1628;
    --slate:     #1e3a5f;
    --cyan:      #06b6d4;
    --cyan2:     #22d3ee;
    --cyan-dim:  rgba(6,182,212,0.15);
    --amber:     #f59e0b;
    --amber2:    #fbbf24;
    --amber-dim: rgba(245,158,11,0.15);
    --glass:     rgba(6,13,31,0.72);
    --glass2:    rgba(14,28,58,0.55);
    --border:    rgba(6,182,212,0.22);
    --border2:   rgba(6,182,212,0.08);
    --text:      #e2e8f0;
    --muted:     #64748b;
    --font-mono: 'Space Mono', monospace;
    --font-head: 'Syne', sans-serif;
    --font-body: 'Barlow Condensed', sans-serif;
  }

  html, body, #root {
    height: 100%; width: 100%;
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-body);
    overflow: hidden;
    user-select: none;
  }

  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: var(--bg2); }
  ::-webkit-scrollbar-thumb { background: var(--cyan-dim); border-radius: 2px; }

  .glow-cyan { text-shadow: 0 0 20px var(--cyan), 0 0 40px rgba(6,182,212,0.4); }
  .glow-amber { text-shadow: 0 0 20px var(--amber), 0 0 40px rgba(245,158,11,0.4); }

  .panel {
    background: var(--glass);
    backdrop-filter: blur(20px) saturate(1.4);
    border: 1px solid var(--border);
    border-radius: 4px;
    position: relative;
    overflow: hidden;
  }
  .panel::before {
    content:'';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(6,182,212,0.04) 0%, transparent 60%);
    pointer-events: none;
  }

  input[type=range] {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 3px;
    background: linear-gradient(to right, var(--cyan) var(--pct,50%), var(--slate) var(--pct,50%));
    border-radius: 2px;
    outline: none;
    cursor: pointer;
  }
  input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px; height: 14px;
    border-radius: 50%;
    background: var(--cyan);
    border: 2px solid var(--bg);
    box-shadow: 0 0 8px var(--cyan);
    cursor: pointer;
    transition: transform 0.15s;
  }
  input[type=range]::-webkit-slider-thumb:hover { transform: scale(1.3); }

  .btn-primary {
    background: transparent;
    color: var(--cyan);
    border: 1px solid var(--cyan);
    font-family: var(--font-mono);
    font-size: 13px;
    letter-spacing: 0.12em;
    padding: 12px 32px;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    transition: color 0.2s, box-shadow 0.2s;
    text-transform: uppercase;
  }
  .btn-primary::before {
    content:'';
    position: absolute;
    inset: 0;
    background: var(--cyan);
    transform: scaleX(0);
    transform-origin: left;
    transition: transform 0.25s ease;
    z-index: 0;
  }
  .btn-primary:hover::before { transform: scaleX(1); }
  .btn-primary:hover { color: var(--bg); box-shadow: 0 0 20px rgba(6,182,212,0.4); }
  .btn-primary span { position: relative; z-index: 1; }

  .btn-amber {
    background: var(--amber);
    color: var(--bg);
    border: none;
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.12em;
    padding: 14px 40px;
    cursor: pointer;
    text-transform: uppercase;
    transition: background 0.2s, box-shadow 0.2s, transform 0.1s;
  }
  .btn-amber:hover {
    background: var(--amber2);
    box-shadow: 0 0 30px rgba(245,158,11,0.5);
    transform: translateY(-1px);
  }
  .btn-amber:active { transform: translateY(0); }

  .scanline {
    position: absolute; inset: 0;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(0,0,0,0.03) 2px,
      rgba(0,0,0,0.03) 4px
    );
    pointer-events: none;
    z-index: 9999;
  }

  @keyframes flicker {
    0%,100% { opacity:1 }
    92% { opacity:1 }
    93% { opacity:0.97 }
    94% { opacity:1 }
    97% { opacity:0.98 }
  }
`;

function createPhysicsWorker() {
  const src = `
    self.onmessage = function(e) {
      const { height, mass, orientation, landingAngle, layers, bubbleStrength, wrapTightness, monteCarlo } = e.data;
      const GRAVITY = 9.81, RHO = 1.225, CD = 1.0, DT = 0.01;
      const areaMult = [0.5,1.2,0.6,1.0][orientation] || 1.0;
      const effArea  = 0.7 * areaMult;

      const angleVar    = monteCarlo ? (Math.random()-0.5)*10 : 0;
      const strengthVar = monteCarlo ? (Math.random()-0.5)*0.15 : 0;
      const effAngle    = Math.max(0, Math.min(85, landingAngle + angleVar));
      const effStrength = Math.max(0, Math.min(1, bubbleStrength + strengthVar));

      const frames = [];
      let pos = height, vel = 0;
      while (pos > 0 && frames.length < 20000) {
        const drag = 0.5 * RHO * CD * effArea * vel * vel / mass;
        const acc  = Math.max(0, GRAVITY - drag);
        vel += acc * DT;
        pos = Math.max(0, pos - vel * DT);
        frames.push({ position: pos, velocity: vel });
      }

      const impactVel = frames.length ? frames[frames.length-1].velocity : 0;
      const baseAbsorb = Math.min(0.75, layers * 0.04 * effStrength * (0.7 + 0.3 * wrapTightness));
      const angleCos   = Math.cos(effAngle * Math.PI / 180);
      const absorb     = baseAbsorb * (0.6 + 0.4 * angleCos);
      const postVel    = impactVel * Math.sqrt(Math.max(0, 1 - absorb));
      const deform     = Math.max(0.05, Math.min(0.60, 0.10 + layers * 0.008 * effStrength));
      const decel      = (postVel * postVel) / (2 * deform);
      const impactForce = mass * decel;
      const peakG      = decel / GRAVITY;

      let dv = postVel;
      while (dv > 0 && frames.length < 20000) {
        dv = Math.max(0, dv - decel * DT);
        frames.push({ position: 0, velocity: dv });
      }

      const g = peakG;
      let prob;
      if      (g < 10)  prob = 1.00;
      else if (g < 25)  prob = 1.00 - (g-10)/15*0.05;
      else if (g < 50)  prob = 0.95 - (g-25)/25*0.20;
      else if (g < 100) prob = 0.75 - (g-50)/50*0.35;
      else if (g < 200) prob = 0.40 - (g-100)/100*0.38;
      else              prob = 0.02;
      prob += (1 - angleCos) * 0.05;
      prob  = Math.max(0, Math.min(1, prob));

      const injuryClass = g < 10 ? 0 : g < 30 ? 1 : g < 70 ? 2 : g < 150 ? 3 : 4;
      const injuryLabel = ['NONE','MINOR','MODERATE','SEVERE','FATAL'][injuryClass];

      self.postMessage({ frames, impactForce, peakG, survivalProb: prob, injuryClass, injuryLabel });
    };
  `;
  const blob = new Blob([src], { type: "application/javascript" });
  return new Worker(URL.createObjectURL(blob));
}

function makeToneDataURL(freq, dur, type = "sine", vol = 0.4) {
  const SR = 22050, N = Math.floor(SR * dur);
  const buf = new ArrayBuffer(44 + N * 2);
  const view = new DataView(buf);
  const w = (off, v, s) => s === 4 ? view.setUint32(off, v, true) : s === 2 ? view.setUint16(off, v, true) : view.setUint8(off, v);
  [82,73,70,70].forEach((b,i) => w(i, b));
  w(4, 36 + N * 2, 4);
  [87,65,86,69,102,109,116,32].forEach((b,i) => w(8+i, b));
  w(16, 16, 4); w(20, 1, 2); w(22, 1, 2);
  w(24, SR, 4); w(28, SR * 2, 4); w(30, 2, 2); w(34, 16, 2);
  [100,97,116,97].forEach((b,i) => w(36+i, b));
  w(40, N * 2, 4);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const env = t < 0.01 ? t / 0.01 : Math.exp(-t * (type === "thud" ? 8 : 3));
    let s;
    if (type === "thud") s = Math.sin(2*Math.PI*freq*t*Math.exp(-t*10)) * env;
    else if (type === "pop") s = (Math.random() * 2 - 1) * env * Math.sin(2*Math.PI*freq*t);
    else s = Math.sin(2*Math.PI*freq*t) * env;
    view.setInt16(44 + i * 2, Math.max(-32767, Math.min(32767, s * vol * 32767)), true);
  }
  const bytes = new Uint8Array(buf);
  let b64 = "";
  for (let i = 0; i < bytes.length; i++) b64 += String.fromCharCode(bytes[i]);
  return "data:audio/wav;base64," + btoa(b64);
}

const Sounds = (() => {
  let s = null;
  return {
    init() {
      if (s) return;
      s = {
        click:  new Howl({ src: [makeToneDataURL(800, 0.08, "sine", 0.3)], volume: 0.4 }),
        hover:  new Howl({ src: [makeToneDataURL(1200, 0.04, "sine", 0.15)], volume: 0.2 }),
        wind:   new Howl({ src: [makeToneDataURL(180, 2.0, "pop", 0.5)], volume: 0, loop: true }),
        hum:    new Howl({ src: [makeToneDataURL(60, 3.0, "sine", 0.2)], volume: 0.15, loop: true }),
        pop:    new Howl({ src: [makeToneDataURL(400, 0.12, "pop", 0.6)], volume: 0.5 }),
        impact: new Howl({ src: [makeToneDataURL(55, 0.6, "thud", 0.9)], volume: 0.8 }),
      };
    },
    play(name) { s && s[name] && s[name].play(); },
    setWindVol(v) { s && s.wind && s.wind.volume(v); },
    startWind() { s && s.wind && !s.wind.playing() && s.wind.play(); },
    stopWind() { s && s.wind && s.wind.stop(); },
    startHum() { s && s.hum && !s.hum.playing() && s.hum.play(); },
    stopHum() { s && s.hum && s.hum.stop(); },
    mute(m) { Howler.mute(m); },
  };
})();

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[400, 400, 64, 64]} />
      <meshStandardMaterial
        color="#1a1a2e"
        roughness={0.85}
        metalness={0.1}
        envMapIntensity={0.3}
      />
    </mesh>
  );
}

function TargetRings() {
  const rings = [1.5, 3, 5, 8, 12];
  return (
    <group position={[0, 0.01, 0]}>
      {rings.map((r, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r - 0.06, r, 64]} />
          <meshBasicMaterial
            color={i === 0 ? "#06b6d4" : i === 1 ? "#0e7490" : "#164e63"}
            transparent opacity={0.7 - i * 0.1}
          />
        </mesh>
      ))}
      {[-20,-15,-10,-5,0,5,10,15,20].map((x, i) => (
        <group key={i}>
          <mesh position={[x, 0, 0]} rotation={[-Math.PI/2,0,0]}>
            <planeGeometry args={[0.04, 40]} />
            <meshBasicMaterial color="#0e3050" transparent opacity={0.4} />
          </mesh>
          <mesh position={[0, 0, x]} rotation={[-Math.PI/2,0,0]}>
            <planeGeometry args={[40, 0.04]} />
            <meshBasicMaterial color="#0e3050" transparent opacity={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Building({ position, width, depth, height, color = "#0f172a" }) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={color} roughness={0.6} metalness={0.3} envMapIntensity={0.2} />
      </mesh>
      {Array.from({ length: Math.floor(height / 4) }).map((_, row) =>
        Array.from({ length: Math.floor(width / 3) }).map((_, col) => (
          <mesh key={`${row}-${col}`}
            position={[
              -width / 2 + 1.5 + col * 3,
              2 + row * 4,
              depth / 2 + 0.02
            ]}
          >
            <planeGeometry args={[1.2, 1.8]} />
            <meshBasicMaterial
              color={Math.random() > 0.4 ? "#fbbf24" : "#0f172a"}
              transparent opacity={0.6}
            />
          </mesh>
        ))
      )}
    </group>
  );
}

function Buildings() {
  const layout = [
    { pos: [-80, 0, -60], w: 20, d: 18, h: 35, col: "#0a1628" },
    { pos: [80, 0, -70], w: 14, d: 14, h: 55, col: "#0d1f3c" },
    { pos: [-60, 0, -90], w: 30, d: 20, h: 18, col: "#050d1a" },
    { pos: [55, 0, -80], w: 10, d: 10, h: 70, col: "#0a1628" },
    { pos: [120, 0, -100], w: 25, d: 20, h: 40, col: "#060f1f" },
    { pos: [-120, 0, -100], w: 18, d: 16, h: 30, col: "#0a1628" },
    { pos: [0, 0, -120], w: 22, d: 18, h: 50, col: "#0d1f3c" },
    { pos: [40, 0, -50], w: 5, d: 5, h: 28, col: "#1e3a5f" },
    { pos: [40, 0, -50], w: 12, d: 12, h: 3, col: "#1e3a5f" },
  ];
  return (
    <>
      {layout.map((b, i) => (
        <Building key={i} position={b.pos} width={b.w} depth={b.d} height={b.h} color={b.col} />
      ))}
    </>
  );
}

function Humanoid({ positionY, velocity, impacted, phase }) {
  const groupRef = useRef();
  const torsoRef = useRef();
  const headRef  = useRef();
  const lArmRef  = useRef();
  const rArmRef  = useRef();
  const lLegRef  = useRef();
  const rLegRef  = useRef();
  const wrapRef  = useRef();
  const t = useRef(0);

  const stressColor = useMemo(() => {
    if (impacted) return "#ffffff";
    const v = Math.min(velocity / 80, 1);
    return `hsl(${190 - v * 190}, ${80 + v * 20}%, ${50 + v * 40}%)`;
  }, [velocity, impacted]);

  useFrame((_, delta) => {
    t.current += delta;
    if (!groupRef.current) return;

    if (phase === "falling") {
      groupRef.current.rotation.z = Math.sin(t.current * 0.8) * 0.12;
      groupRef.current.rotation.x = Math.sin(t.current * 0.5) * 0.06;
      if (lArmRef.current) lArmRef.current.rotation.z = 0.4 + Math.sin(t.current * 2) * 0.15;
      if (rArmRef.current) rArmRef.current.rotation.z = -0.4 - Math.sin(t.current * 2) * 0.15;
      if (lLegRef.current) lLegRef.current.rotation.x = Math.sin(t.current * 1.5) * 0.1;
      if (rLegRef.current) rLegRef.current.rotation.x = -Math.sin(t.current * 1.5) * 0.1;
    } else if (phase === "idle") {
      groupRef.current.rotation.z = 0;
      groupRef.current.rotation.x = 0;
    }
  });

  const mat = (
    <meshStandardMaterial
      color={stressColor}
      roughness={0.4}
      metalness={0.1}
      emissive={stressColor}
      emissiveIntensity={impacted ? 0.8 : velocity > 30 ? 0.3 : 0.05}
    />
  );
  const wrapMat = (
    <meshPhysicalMaterial
      color="#a5f3fc"
      transparent
      opacity={0.45}
      roughness={0.1}
      metalness={0.0}
      transmission={0.3}
      thickness={0.5}
    />
  );

  const scale = impacted ? [1, 0.75, 1.3] : [1, 1, 1];

  return (
    <group ref={groupRef} position={[0, positionY, 0]} scale={scale}>
      <mesh ref={headRef} position={[0, 1.85, 0]} castShadow>
        <sphereGeometry args={[0.22, 16, 16]} />
        {mat}
      </mesh>
      <mesh position={[0, 1.6, 0]}>
        <cylinderGeometry args={[0.08, 0.1, 0.2, 8]} />
        {mat}
      </mesh>
      <mesh ref={torsoRef} position={[0, 1.1, 0]} castShadow>
        <boxGeometry args={[0.44, 0.75, 0.22]} />
        {mat}
      </mesh>
      <mesh position={[0, 0.66, 0]}>
        <boxGeometry args={[0.38, 0.22, 0.2]} />
        {mat}
      </mesh>
      <group ref={lArmRef} position={[0.32, 1.1, 0]}>
        <mesh position={[0.2, 0, 0]}>
          <capsuleGeometry args={[0.07, 0.42, 4, 8]} />
          {mat}
        </mesh>
        <mesh position={[0.42, -0.16, 0]}>
          <capsuleGeometry args={[0.055, 0.35, 4, 8]} />
          {mat}
        </mesh>
      </group>
      <group ref={rArmRef} position={[-0.32, 1.1, 0]}>
        <mesh position={[-0.2, 0, 0]}>
          <capsuleGeometry args={[0.07, 0.42, 4, 8]} />
          {mat}
        </mesh>
        <mesh position={[-0.42, -0.16, 0]}>
          <capsuleGeometry args={[0.055, 0.35, 4, 8]} />
          {mat}
        </mesh>
      </group>
      <group ref={lLegRef} position={[0.14, 0.55, 0]}>
        <mesh position={[0, -0.22, 0]}>
          <capsuleGeometry args={[0.09, 0.42, 4, 8]} />
          {mat}
        </mesh>
        <mesh position={[0, -0.66, 0]}>
          <capsuleGeometry args={[0.075, 0.4, 4, 8]} />
          {mat}
        </mesh>
      </group>
      <group ref={rLegRef} position={[-0.14, 0.55, 0]}>
        <mesh position={[0, -0.22, 0]}>
          <capsuleGeometry args={[0.09, 0.42, 4, 8]} />
          {mat}
        </mesh>
        <mesh position={[0, -0.66, 0]}>
          <capsuleGeometry args={[0.075, 0.4, 4, 8]} />
          {mat}
        </mesh>
      </group>
      <group ref={wrapRef}>
        <mesh position={[0, 1.1, 0]}>
          <boxGeometry args={[0.54, 0.88, 0.32]} />
          {wrapMat}
        </mesh>
        {Array.from({ length: 20 }).map((_, i) => (
          <mesh key={i} position={[
            (Math.random() - 0.5) * 0.44,
            0.75 + Math.random() * 0.6,
            0.18 + Math.random() * 0.04
          ]}>
            <sphereGeometry args={[0.04 + Math.random() * 0.025, 6, 6]} />
            {wrapMat}
          </mesh>
        ))}
        <mesh position={[0.52, 1.1, 0]}>
          <capsuleGeometry args={[0.1, 0.8, 4, 8]} />
          {wrapMat}
        </mesh>
        <mesh position={[-0.52, 1.1, 0]}>
          <capsuleGeometry args={[0.1, 0.8, 4, 8]} />
          {wrapMat}
        </mesh>
        <mesh position={[0.14, 0.2, 0]}>
          <capsuleGeometry args={[0.12, 0.85, 4, 8]} />
          {wrapMat}
        </mesh>
        <mesh position={[-0.14, 0.2, 0]}>
          <capsuleGeometry args={[0.12, 0.85, 4, 8]} />
          {wrapMat}
        </mesh>
      </group>
    </group>
  );
}

function BubbleParticles({ active, position }) {
  const ref = useRef();
  const particles = useMemo(() => Array.from({ length: 40 }, () => ({
    offset: [(Math.random()-0.5)*1.2, (Math.random()-0.5)*1.2, (Math.random()-0.5)*1.2],
    speed:  [( Math.random()-0.5)*4,  Math.random()*4+1,       (Math.random()-0.5)*4],
    size:   0.04 + Math.random() * 0.06,
  })), []);
  const t = useRef(0);

  useFrame((_, delta) => {
    if (!active || !ref.current) return;
    t.current += delta;
    ref.current.children.forEach((mesh, i) => {
      const p = particles[i];
      mesh.position.set(
        position[0] + p.offset[0] + p.speed[0] * t.current,
        position[1] + p.offset[1] + p.speed[1] * t.current - 2 * t.current * t.current,
        position[2] + p.offset[2] + p.speed[2] * t.current
      );
      mesh.scale.setScalar(Math.max(0, 1 - t.current * 2));
    });
  });

  if (!active) return null;
  return (
    <group ref={ref}>
      {particles.map((p, i) => (
        <mesh key={i}>
          <sphereGeometry args={[p.size, 4, 4]} />
          <meshBasicMaterial color="#a5f3fc" transparent opacity={0.7} />
        </mesh>
      ))}
    </group>
  );
}

function CameraController({ shake }) {
  const { camera } = useThree();
  const t = useRef(0);
  useFrame((_, delta) => {
    t.current += delta;
    if (shake) {
      camera.position.x = 12 + Math.sin(t.current * 30) * 0.18;
      camera.position.y = 8  + Math.cos(t.current * 25) * 0.12;
    } else {
      camera.position.x += (12 - camera.position.x) * 0.05;
      camera.position.y += (8  - camera.position.y) * 0.05;
    }
    camera.lookAt(0, 4, 0);
  });
  return null;
}

function Scene({ simState, onImpact }) {
  const { phase, currentFrame, frames, velocity, peakG } = simState;
  const [impacted, setImpacted] = useState(false);
  const [shake, setShake] = useState(false);
  const prevPhase = useRef(phase);

  useEffect(() => {
    if (phase === "idle") { setImpacted(false); setShake(false); }
    if (phase === "done" && prevPhase.current !== "done") {
      setImpacted(true);
      setShake(true);
      setTimeout(() => setShake(false), 600);
      onImpact && onImpact();
    }
    prevPhase.current = phase;
  }, [phase]);

  const posY = frames.length && currentFrame < frames.length
    ? frames[currentFrame].position + 0.95
    : phase === "idle" ? 80 + 0.95 : 0.95;

  const vel = frames.length && currentFrame < frames.length
    ? frames[currentFrame].velocity
    : 0;

  return (
    <>
      <PerspectiveCamera makeDefault position={[12, 8, 22]} fov={55} />
      <CameraController shake={shake} />
      <ambientLight intensity={0.4} color="#cce4ff" />
      <directionalLight
        position={[50, 80, 30]}
        intensity={2.2}
        color="#fff5e0"
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <pointLight position={[0, 2, 0]} intensity={0.5} color="#06b6d4" distance={20} />
      <Sky
        sunPosition={[100, 20, 100]}
        turbidity={4}
        rayleigh={1.2}
        mieCoefficient={0.005}
        mieDirectionalG={0.8}
      />

      <Suspense fallback={null}>
        <Environment preset="dawn" />
      </Suspense>

      <Buildings />
      <Ground />
      <TargetRings />

      <Humanoid
        positionY={posY}
        velocity={vel}
        impacted={impacted}
        phase={phase}
      />

      <BubbleParticles
        active={impacted}
        position={[0, 1, 0]}
      />
      {impacted && (
        <pointLight position={[0, 0.5, 0]} intensity={8} color="#06b6d4" distance={15} decay={2} />
      )}
    </>
  );
}

const INJURY_LABELS = ["NONE", "MINOR", "MODERATE", "SEVERE", "FATAL"];
const INJURY_COLORS = ["#06b6d4", "#22d3ee", "#f59e0b", "#ef4444", "#7f1d1d"];

function TelemetryHUD({ simState, params }) {
  const { phase, frames, currentFrame, peakG, impactForce, survivalProb, injuryClass } = simState;
  if (phase === "idle") return null;

  const vel = frames.length && currentFrame < frames.length
    ? frames[currentFrame].velocity : 0;
  const pos = frames.length && currentFrame < frames.length
    ? frames[currentFrame].position : 0;
  const progress = frames.length ? currentFrame / frames.length : 0;

  return (
    <div style={{
      position: "absolute", top: 16, left: 16,
      zIndex: 10, width: 220,
      fontFamily: "var(--font-mono)",
    }}>
      <div className="panel" style={{ padding: "14px 16px" }}>
        <div style={{ color: "var(--cyan)", fontSize: 10, letterSpacing: "0.15em", marginBottom: 8 }}>
          ◈ TELEMETRY LIVE
        </div>
        {[
          ["ALT", `${pos.toFixed(1)} m`],
          ["VEL", `${vel.toFixed(1)} m/s`],
          ["G-FORCE", `${(vel / 9.81 * 0.5).toFixed(1)} G`],
          ["HEIGHT", `${params.heightM} m`],
          ["MASS", `${params.mass} kg`],
        ].map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
            <span style={{ color: "var(--muted)" }}>{k}</span>
            <span style={{ color: "var(--text)" }}>{v}</span>
          </div>
        ))}
        <div style={{ marginTop: 10, height: 2, background: "var(--slate)", borderRadius: 1 }}>
          <div style={{
            width: `${progress * 100}%`,
            height: "100%",
            background: "var(--cyan)",
            borderRadius: 1,
            transition: "width 0.05s",
            boxShadow: "0 0 6px var(--cyan)",
          }} />
        </div>
        <div style={{ color: "var(--muted)", fontSize: 9, marginTop: 4, letterSpacing: "0.1em" }}>
          {phase === "done" ? "IMPACT COMPLETE" : "SIMULATING…"}
        </div>
      </div>
    </div>
  );
}

function ResultOverlay({ simState, onReset }) {
  const { phase, peakG, impactForce, survivalProb, injuryClass } = simState;
  if (phase !== "done") return null;

  const injLabel = INJURY_LABELS[injuryClass] || "UNKNOWN";
  const injColor = INJURY_COLORS[injuryClass] || "#06b6d4";
  const survPct  = (survivalProb * 100).toFixed(1);

  return (
    <AnimatePresence>
      <motion.div
        key="result"
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: "absolute",
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 20,
          width: 380,
          textAlign: "center",
        }}
      >
        <div className="panel" style={{ padding: "36px 40px" }}>
          {["top-left","top-right","bottom-left","bottom-right"].map(c => (
            <div key={c} style={{
              position:"absolute",
              width: 14, height: 14,
              borderColor: "var(--cyan)",
              borderStyle: "solid",
              borderWidth: c.includes("top") ? "2px 0 0 2px" : "0 2px 2px 0",
              [c.includes("top")?"top":"bottom"]: -1,
              [c.includes("left")?"left":"right"]: -1,
            }} />
          ))}

          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.2em",
            color: "var(--cyan)",
            marginBottom: 20,
          }}>◈ SIMULATION COMPLETE</div>
          <motion.div
            initial={{ scale: 0.5 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          >
            <div style={{
              fontFamily: "var(--font-head)",
              fontSize: 72,
              fontWeight: 800,
              color: survivalProb > 0.5 ? "var(--cyan)" : "var(--amber)",
              lineHeight: 1,
              textShadow: `0 0 30px ${survivalProb > 0.5 ? "var(--cyan)" : "var(--amber)"}`,
            }}>
              {survPct}%
            </div>
            <div style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--muted)",
              letterSpacing: "0.15em",
              marginTop: 4,
              marginBottom: 28,
            }}>SURVIVAL PROBABILITY</div>
          </motion.div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
            {[
              ["PEAK G-FORCE", `${peakG.toFixed(1)} G`, peakG > 100 ? "#ef4444" : "var(--text)"],
              ["IMPACT FORCE", `${(impactForce/1000).toFixed(2)} kN`, impactForce > 50000 ? "#ef4444" : "var(--text)"],
            ].map(([label, value, color]) => (
              <div key={label} className="panel" style={{ padding: "12px 14px" }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--muted)", letterSpacing: "0.1em", marginBottom: 4 }}>
                  {label}
                </div>
                <div style={{ fontFamily: "var(--font-head)", fontSize: 22, fontWeight: 700, color }}>
                  {value}
                </div>
              </div>
            ))}
          </div>
          <div style={{
            padding: "10px 20px",
            border: `1px solid ${injColor}`,
            display: "inline-block",
            marginBottom: 28,
            background: `${injColor}18`,
          }}>
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              color: injColor,
              letterSpacing: "0.18em",
            }}>
              ◈ INJURY CLASS: {injLabel}
            </span>
          </div>

          <div>
            <button className="btn-primary" onClick={onReset} style={{ width: "100%" }}>
              <span>RUN NEW SIMULATION</span>
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function EntryPage({ onEnter }) {
  const [name, setName] = useState(() => localStorage.getItem("il_name") || "");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Sounds.init();
    Sounds.startHum();
    setTimeout(() => setReady(true), 100);
  }, []);

  const handleEnter = () => {
    if (!name.trim()) return;
    localStorage.setItem("il_name", name.trim());
    Sounds.play("click");
    onEnter(name.trim());
  };

  const particles = useMemo(() =>
    Array.from({ length: 60 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 1 + Math.random() * 2,
      dur: 4 + Math.random() * 8,
      delay: -Math.random() * 10,
    })), []);

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "radial-gradient(ellipse at 50% 60%, #0a1628 0%, #020617 70%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    }}>
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.35 }}>
        {particles.map(p => (
          <circle key={p.id} r={p.size} fill="#06b6d4">
            <animateMotion
              dur={`${p.dur}s`}
              repeatCount="indefinite"
              begin={`${p.delay}s`}
              path={`M ${p.x * window.innerWidth / 100} ${p.y * window.innerHeight / 100} q ${(Math.random()-0.5)*200} ${(Math.random()-0.5)*200} ${(Math.random()-0.5)*100} ${(Math.random()-0.5)*100}`}
            />
          </circle>
        ))}
      </svg>
      <div style={{
        position:"absolute", inset:0,
        backgroundImage: `
          linear-gradient(rgba(6,182,212,0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(6,182,212,0.04) 1px, transparent 1px)
        `,
        backgroundSize: "60px 60px",
      }} />

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: ready ? 1 : 0, y: ready ? 0 : 40 }}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        style={{ position:"relative", zIndex:2, textAlign:"center", width:480, padding:"0 24px" }}
      >
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.2, duration: 0.8, type: "spring" }}
          style={{
            width: 64, height: 64, margin: "0 auto 32px",
            border: "2px solid var(--cyan)",
            transform: "rotate(45deg)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 30px rgba(6,182,212,0.4), inset 0 0 20px rgba(6,182,212,0.1)",
          }}
        >
          <div style={{ transform: "rotate(-45deg)", color: "var(--cyan)", fontSize: 22, fontFamily: "var(--font-mono)" }}>◈</div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div style={{
            fontFamily: "var(--font-head)",
            fontSize: 72,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            lineHeight: 0.9,
            color: "var(--text)",
          }}>
            IMPACT
          </div>
          <div style={{
            fontFamily: "var(--font-head)",
            fontSize: 72,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            lineHeight: 0.9,
            color: "var(--cyan)",
            textShadow: "0 0 40px rgba(6,182,212,0.6)",
            marginBottom: 8,
          }}>
            LAB
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.22em",
            color: "var(--muted)",
            marginBottom: 48,
            textTransform: "uppercase",
          }}
        >
          Physics-Based Fall Survival Simulator
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          style={{ marginBottom: 20 }}
        >
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.15em",
            color: "var(--muted)",
            textAlign: "left",
            marginBottom: 8,
          }}>
            OPERATOR ID
          </div>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleEnter()}
            placeholder="Enter your name"
            style={{
              width: "100%",
              background: "rgba(6,13,31,0.8)",
              border: "1px solid var(--border)",
              borderBottom: "1px solid var(--cyan)",
              color: "var(--text)",
              fontFamily: "var(--font-mono)",
              fontSize: 16,
              padding: "14px 16px",
              outline: "none",
              letterSpacing: "0.05em",
              transition: "border-color 0.2s, box-shadow 0.2s",
            }}
            onFocus={e => {
              e.target.style.borderColor = "var(--cyan)";
              e.target.style.boxShadow = "0 0 20px rgba(6,182,212,0.2)";
            }}
            onBlur={e => {
              e.target.style.borderColor = "var(--border)";
              e.target.style.boxShadow = "none";
              e.target.style.borderBottomColor = "var(--cyan)";
            }}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1 }}
        >
          <button
            className="btn-amber"
            onClick={handleEnter}
            style={{ width: "100%", fontSize: 14, letterSpacing: "0.2em" }}
          >
            ENTER IMPACT LAB
          </button>
        </motion.div>
        <div style={{
          marginTop: 32,
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "var(--muted)",
          letterSpacing: "0.1em",
          opacity: 0.5,
        }}>
          v2.1.0 — WASM PHYSICS ENGINE — MONTE CARLO ENABLED
        </div>
      </motion.div>
    </div>
  );
}

const HEIGHT_PRESETS = [
  { label: "2-Story House",      meters: 6 },
  { label: "Rooftop",            meters: 20 },
  { label: "Apartment Building", meters: 50 },
  { label: "Skyscraper",         meters: 200 },
  { label: "Airplane Jump",      meters: 1000 },
];

const ORIENTATIONS = ["Feet-First", "Back", "Head-First", "Tumbling"];

function SliderRow({ label, value, min, max, step = 1, unit = "", onChange }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        display: "flex", justifyContent: "space-between",
        fontFamily: "var(--font-mono)", fontSize: 10,
        letterSpacing: "0.1em", marginBottom: 8,
      }}>
        <span style={{ color: "var(--muted)" }}>{label}</span>
        <span style={{ color: "var(--cyan)" }}>{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        style={{ "--pct": `${pct}%` }}
        onChange={e => onChange(Number(e.target.value))}
        onMouseEnter={() => Sounds.play("hover")}
      />
    </div>
  );
}

function ConsolePage({ name, onStart }) {
  const [heightIdx, setHeightIdx] = useState(1);
  const [mass, setMass]           = useState(75);
  const [orientation, setOrient]  = useState(0);
  const [landingAngle, setAngle]  = useState(10);
  const [layers, setLayers]       = useState(8);
  const [bubbleStr, setBubbleStr] = useState(0.7);
  const [wrapTight, setWrapTight] = useState(0.6);
  const [monteCarlo, setMC]       = useState(true);

  const params = {
    heightM: HEIGHT_PRESETS[heightIdx].meters,
    mass, orientation, landingAngle, layers, bubbleStrength: bubbleStr,
    wrapTightness: wrapTight, monteCarlo,
  };

  return (
    <div style={{
      position:"fixed", inset:0,
      background:"radial-gradient(ellipse at 30% 40%, #061020 0%, #020617 70%)",
      display:"flex", flexDirection:"column",
      overflow:"hidden",
    }}>
      <div style={{
        height: 52,
        borderBottom: "1px solid var(--border2)",
        display: "flex", alignItems: "center",
        padding: "0 24px",
        justifyContent: "space-between",
        flexShrink: 0,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:16 }}>
          <div style={{
            width:8, height:8,
            background:"var(--cyan)",
            boxShadow:"0 0 8px var(--cyan)",
            transform:"rotate(45deg)",
          }} />
          <span style={{ fontFamily:"var(--font-head)", fontSize:18, fontWeight:700, letterSpacing:"0.05em" }}>
            IMPACT LAB
          </span>
          <span style={{
            fontFamily:"var(--font-mono)", fontSize:10,
            color:"var(--muted)", letterSpacing:"0.1em",
          }}>
            SIMULATION CONSOLE
          </span>
        </div>
        <div style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--cyan)" }}>
          OP: {name.toUpperCase()}
        </div>
      </div>
      <div style={{
        flex:1, display:"grid",
        gridTemplateColumns:"1fr 1fr 1fr",
        gap: 16, padding:16,
        overflow: "auto",
        minHeight: 0,
      }}>
        <div className="panel" style={{ padding:20 }}>
          <div style={{
            fontFamily:"var(--font-mono)", fontSize:10,
            letterSpacing:"0.18em", color:"var(--cyan)",
            marginBottom:16,
          }}>◈ DROP HEIGHT</div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {HEIGHT_PRESETS.map((p, i) => (
              <button
                key={i}
                onClick={() => { setHeightIdx(i); Sounds.play("click"); }}
                onMouseEnter={() => Sounds.play("hover")}
                style={{
                  background: i === heightIdx ? "rgba(6,182,212,0.12)" : "transparent",
                  border: `1px solid ${i === heightIdx ? "var(--cyan)" : "var(--border2)"}`,
                  color: i === heightIdx ? "var(--cyan)" : "var(--muted)",
                  fontFamily:"var(--font-body)", fontSize:13, fontWeight:600,
                  padding:"10px 14px",
                  cursor:"pointer",
                  display:"flex", justifyContent:"space-between", alignItems:"center",
                  transition:"all 0.15s",
                  textAlign:"left",
                }}
              >
                <span>{p.label}</span>
                <span style={{
                  fontFamily:"var(--font-mono)", fontSize:10,
                  color: i === heightIdx ? "var(--cyan)" : "var(--slate)",
                }}>
                  {p.meters >= 1000 ? `${(p.meters/1000).toFixed(1)} km` : `${p.meters} m`}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="panel" style={{ padding:20 }}>
          <div style={{
            fontFamily:"var(--font-mono)", fontSize:10,
            letterSpacing:"0.18em", color:"var(--cyan)",
            marginBottom:16,
          }}>◈ BODY PARAMETERS</div>

          <SliderRow label="BODY MASS" value={mass} min={40} max={200} unit=" kg" onChange={setMass} />

          <div style={{ marginBottom:16 }}>
            <div style={{
              fontFamily:"var(--font-mono)", fontSize:10,
              color:"var(--muted)", letterSpacing:"0.1em", marginBottom:8,
            }}>ORIENTATION</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
              {ORIENTATIONS.map((o, i) => (
                <button
                  key={i}
                  onClick={() => { setOrient(i); Sounds.play("click"); }}
                  style={{
                    background: i === orientation ? "var(--cyan-dim)" : "transparent",
                    border:`1px solid ${i === orientation ? "var(--cyan)" : "var(--border2)"}`,
                    color: i === orientation ? "var(--cyan)" : "var(--muted)",
                    fontFamily:"var(--font-mono)", fontSize:9,
                    letterSpacing:"0.05em",
                    padding:"8px 6px",
                    cursor:"pointer",
                    transition:"all 0.15s",
                    textTransform:"uppercase",
                  }}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>

          <SliderRow label="LANDING ANGLE" value={landingAngle} min={0} max={85} unit="°" onChange={setAngle} />
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:12 }}>
            <span style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--muted)", letterSpacing:"0.1em" }}>
              MONTE CARLO VARIANCE
            </span>
            <button
              onClick={() => { setMC(!monteCarlo); Sounds.play("click"); }}
              style={{
                width:40, height:22,
                background: monteCarlo ? "var(--cyan)" : "var(--slate)",
                borderRadius:11,
                border:"none",
                cursor:"pointer",
                position:"relative",
                transition:"background 0.2s",
              }}
            >
              <div style={{
                position:"absolute",
                width:16, height:16, borderRadius:"50%",
                background:"white",
                top:3, left: monteCarlo ? 21 : 3,
                transition:"left 0.2s",
              }} />
            </button>
          </div>
        </div>
        <div className="panel" style={{ padding:20 }}>
          <div style={{
            fontFamily:"var(--font-mono)", fontSize:10,
            letterSpacing:"0.18em", color:"var(--cyan)",
            marginBottom:16,
          }}>◈ BUBBLE WRAP CONFIG</div>

          <SliderRow label="LAYERS" value={layers} min={0} max={20} onChange={setLayers} />
          <SliderRow label="BUBBLE STRENGTH" value={Math.round(bubbleStr*100)} min={0} max={100} unit="%" onChange={v => setBubbleStr(v/100)} />
          <SliderRow label="WRAP TIGHTNESS" value={Math.round(wrapTight*100)} min={0} max={100} unit="%" onChange={v => setWrapTight(v/100)} />
          <div style={{ marginTop:20, padding:14, background:"var(--bg2)", border:"1px solid var(--border2)" }}>
            <div style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--muted)", letterSpacing:"0.1em", marginBottom:8 }}>
              EST. ENERGY ABSORPTION
            </div>
            {(() => {
              const abs = Math.min(75, Math.round(layers * 4 * bubbleStr * (0.7 + 0.3 * wrapTight)));
              return (
                <>
                  <div style={{ height:6, background:"var(--slate)", borderRadius:3, overflow:"hidden" }}>
                    <div style={{
                      width:`${abs}%`, height:"100%",
                      background: abs > 60 ? "var(--cyan)" : abs > 30 ? "var(--amber)" : "#ef4444",
                      borderRadius:3,
                      boxShadow: `0 0 8px ${abs > 60 ? "var(--cyan)" : "var(--amber)"}`,
                      transition:"width 0.3s",
                    }} />
                  </div>
                  <div style={{ fontFamily:"var(--font-head)", fontSize:22, fontWeight:700, color:"var(--text)", marginTop:6 }}>
                    {abs}%
                  </div>
                </>
              );
            })()}
          </div>
          <div style={{ marginTop:16, fontFamily:"var(--font-mono)", fontSize:9, color:"var(--muted)", lineHeight:1.6 }}>
            <div>HEIGHT → {HEIGHT_PRESETS[heightIdx].meters} m</div>
            <div>MASS → {mass} kg</div>
            <div>ORIENT → {ORIENTATIONS[orientation].toUpperCase()}</div>
          </div>
        </div>
      </div>
      <div style={{
        borderTop:"1px solid var(--border2)",
        padding:"16px 24px",
        display:"flex", justifyContent:"flex-end", gap:12,
        flexShrink:0,
      }}>
        <button
          className="btn-primary"
          onClick={() => Sounds.play("click")}
          style={{ padding:"12px 24px" }}
        >
          <span>RESET</span>
        </button>
        <button
          className="btn-amber"
          style={{ fontSize:14, letterSpacing:"0.15em", padding:"12px 40px" }}
          onClick={() => { Sounds.play("click"); onStart(params); }}
        >
          START SIMULATION
        </button>
      </div>
    </div>
  );
}

function SimulationPage({ name, params, onReset }) {
  const [simState, setSimState] = useState({
    phase: "loading",
    frames: [],
    currentFrame: 0,
    peakG: 0,
    impactForce: 0,
    survivalProb: 0,
    injuryClass: 0,
    injuryLabel: "NONE",
    velocity: 0,
  });
  const [muted, setMuted] = useState(false);
  const animRef = useRef(null);
  const frameRef = useRef(0);
  const workerRef = useRef(null);

  useEffect(() => {
    const worker = createPhysicsWorker();
    workerRef.current = worker;
    Sounds.startWind();

    worker.onmessage = (e) => {
      const { frames, impactForce, peakG, survivalProb, injuryClass, injuryLabel } = e.data;
      setSimState(s => ({
        ...s, frames, phase: "falling",
        peakG, impactForce, survivalProb, injuryClass, injuryLabel,
      }));
    };

    worker.postMessage({
      height:       params.heightM,
      mass:         params.mass,
      orientation:  params.orientation,
      landingAngle: params.landingAngle,
      layers:       params.layers,
      bubbleStrength: params.bubbleStrength,
      wrapTightness: params.wrapTightness,
      monteCarlo:   params.monteCarlo ? 1 : 0,
    });

    return () => {
      worker.terminate();
      cancelAnimationFrame(animRef.current);
      Sounds.stopWind();
      Sounds.stopHum();
    };
  }, []);

  useEffect(() => {
    if (simState.phase !== "falling" || !simState.frames.length) return;

    const totalFrames = simState.frames.length;
    const skipFactor  = Math.max(1, Math.floor(totalFrames / 2000));

    const tick = () => {
      frameRef.current += skipFactor;

      if (frameRef.current >= totalFrames) {
        frameRef.current = totalFrames - 1;
        const f = simState.frames[frameRef.current];
        setSimState(s => ({
          ...s,
          currentFrame: frameRef.current,
          velocity: f.velocity,
          phase: "done",
        }));
        Sounds.play("impact");
        Sounds.stopWind();
        for (let i = 0; i < 8; i++) {
          setTimeout(() => Sounds.play("pop"), i * 80);
        }
        return;
      }

      const f = simState.frames[frameRef.current];
      const vel = f.velocity;
      Sounds.setWindVol(Math.min(0.8, vel / 60));

      setSimState(s => ({
        ...s,
        currentFrame: frameRef.current,
        velocity: vel,
      }));
      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [simState.phase]);

  const handleReset = () => {
    Sounds.play("click");
    Sounds.stopWind();
    onReset();
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    Sounds.mute(next);
    Sounds.play("click");
  };

  const posY = simState.frames.length && simState.currentFrame < simState.frames.length
    ? simState.frames[simState.currentFrame].position + 0.95
    : params.heightM + 0.95;

  return (
    <div style={{ position:"fixed", inset:0, background:"#020617" }}>
      <Canvas
        shadows
        style={{ position:"absolute", inset:0 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.9 }}
      >
        <Scene
          simState={simState}
          onImpact={() => {}}
        />
      </Canvas>
      <div className="scanline" />
      <div style={{
        position:"absolute", top:0, left:0, right:0,
        height:48,
        borderBottom:"1px solid var(--border2)",
        background:"rgba(2,6,23,0.7)",
        backdropFilter:"blur(10px)",
        display:"flex", alignItems:"center",
        padding:"0 20px",
        justifyContent:"space-between",
        zIndex:10,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{
            width:6, height:6, background:"var(--cyan)",
            transform:"rotate(45deg)",
            boxShadow:"0 0 6px var(--cyan)",
          }} />
          <span style={{ fontFamily:"var(--font-head)", fontSize:16, fontWeight:700 }}>IMPACT LAB</span>
          <span style={{ fontFamily:"var(--font-mono)", fontSize:9, color:"var(--muted)", letterSpacing:"0.12em" }}>
            3D SIMULATION VIEW
          </span>
        </div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <div style={{ fontFamily:"var(--font-mono)", fontSize:10, color:"var(--cyan)" }}>
            OP: {name.toUpperCase()}
          </div>
          <button
            onClick={toggleMute}
            style={{
              background:"transparent", border:"1px solid var(--border)",
              color: muted ? "var(--muted)" : "var(--cyan)",
              fontFamily:"var(--font-mono)", fontSize:10,
              padding:"5px 12px", cursor:"pointer",
              letterSpacing:"0.1em",
            }}
          >
            {muted ? "UNMUTE" : "MUTE"}
          </button>
          <button
            onClick={handleReset}
            className="btn-primary"
            style={{ padding:"5px 16px", fontSize:10 }}
          >
            <span>← CONSOLE</span>
          </button>
        </div>
      </div>
      <div style={{ marginTop:48 }}>
        <TelemetryHUD simState={simState} params={params} />
      </div>
      {simState.phase === "loading" && (
        <div style={{
          position:"absolute", inset:0,
          display:"flex", alignItems:"center", justifyContent:"center",
          background:"rgba(2,6,23,0.7)", zIndex:5,
        }}>
          <div style={{ textAlign:"center" }}>
            <motion.div
              animate={{ rotate:360 }}
              transition={{ duration:1, repeat:Infinity, ease:"linear" }}
              style={{
                width:48, height:48,
                border:"2px solid var(--border2)",
                borderTop:"2px solid var(--cyan)",
                borderRadius:"50%",
                margin:"0 auto 16px",
              }}
            />
            <div style={{ fontFamily:"var(--font-mono)", fontSize:11, color:"var(--cyan)", letterSpacing:"0.15em" }}>
              COMPUTING PHYSICS…
            </div>
          </div>
        </div>
      )}
      <ResultOverlay
        simState={simState}
        onReset={handleReset}
      />
      <div style={{
        position:"absolute", bottom:0, left:0, right:0,
        height:36, borderTop:"1px solid var(--border2)",
        background:"rgba(2,6,23,0.7)",
        backdropFilter:"blur(8px)",
        display:"flex", alignItems:"center",
        padding:"0 20px", gap:24, zIndex:10,
      }}>
        {[
          ["HEIGHT", `${params.heightM}m`],
          ["MASS", `${params.mass}kg`],
          ["LAYERS", `${params.layers}`],
          ["STRENGTH", `${Math.round(params.bubbleStrength*100)}%`],
          ["TIGHTNESS", `${Math.round(params.wrapTightness*100)}%`],
          ["MC", params.monteCarlo ? "ON" : "OFF"],
        ].map(([k, v]) => (
          <div key={k} style={{
            fontFamily:"var(--font-mono)", fontSize:9,
            display:"flex", gap:6, alignItems:"center",
          }}>
            <span style={{ color:"var(--muted)", letterSpacing:"0.1em" }}>{k}</span>
            <span style={{ color:"var(--cyan)" }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [page, setPage]     = useState("entry");
  const [name, setName]     = useState("");
  const [params, setParams] = useState(null);

  const handleEnter = useCallback((n) => {
    setName(n);
    setPage("console");
  }, []);

  const handleStart = useCallback((p) => {
    setParams(p);
    setPage("sim");
  }, []);

  const handleReset = useCallback(() => {
    setPage("console");
  }, []);

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <AnimatePresence mode="wait">
        {page === "entry" && (
          <motion.div key="entry" style={{ position:"fixed", inset:0 }}
            initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            transition={{ duration:0.4 }}
          >
            <EntryPage onEnter={handleEnter} />
          </motion.div>
        )}
        {page === "console" && (
          <motion.div key="console" style={{ position:"fixed", inset:0 }}
            initial={{ opacity:0, x:30 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-30 }}
            transition={{ duration:0.4 }}
          >
            <ConsolePage name={name} onStart={handleStart} />
          </motion.div>
        )}
        {page === "sim" && params && (
          <motion.div key="sim" style={{ position:"fixed", inset:0 }}
            initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            transition={{ duration:0.5 }}
          >
            <SimulationPage name={name} params={params} onReset={handleReset} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
