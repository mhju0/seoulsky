"use client";

import { useEffect, useRef } from "react";
import type { QualitySettings } from "@/components/three/quality";
import {
  cloneVisualConfig,
  copyDiscrete,
  lerpVisualConfig,
  type VisualConfig,
} from "@/lib/atmosphere/weatherVisualConfig";

/**
 * The Atmospheric Color Field itself: ONE fullscreen fragment shader, drawn with
 * raw WebGL (no three.js scene graph — it's a single quad, so the reconciler
 * would be pure overhead). The shader paints a living Seoul sky: a vertical
 * light gradient with a warm horizon band, slow drifting cloud shadows, soft
 * fog/haze, atmospheric light diffusion, a wet-glass vertical warp in rain, slow
 * bright snow, and a fine film grain.
 *
 * Weather/time live in a mutable {@link VisualConfig}. The component keeps a
 * "live" copy and lerps it toward the latest `target` every frame, so refreshes
 * and time-of-day drift cross-fade smoothly. React never re-renders for motion —
 * the prop only updates a ref the render loop reads.
 */

// --- GLSL ------------------------------------------------------------------

const VERT = `
attribute vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

// `__OCTAVES__` / `__SNOW__` are replaced per quality tier before compile.
const FRAG = `
precision highp float;

uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_pointer;

uniform vec3 u_skyTop, u_skyHorizon, u_skyBottom, u_sunColor, u_accent;
uniform vec2 u_sunPos, u_windDir;
uniform float u_horizonY, u_sunIntensity, u_warmth, u_haze, u_cloudShadow;
uniform float u_windSpeed, u_rain, u_snow, u_lightDiffusion, u_contrast, u_grain;
uniform float u_scroll;   // damped altitude: 0 = top of atmosphere, 1 = ground (task 1.1)

float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p){
  float v = 0.0;
  float amp = 0.5;
  for(int i = 0; i < __OCTAVES__; i++){
    v += amp * noise(p);
    p *= 2.02;
    amp *= 0.5;
  }
  return v;
}

float snowField(vec2 uv, float aspect){
  float acc = 0.0;
  for(int i = 0; i < __SNOW__; i++){
    float fi = float(i);
    float sc = 9.0 + fi * 7.0;
    vec2 gp = vec2(uv.x * aspect, uv.y) * sc;
    gp.y += u_time * (0.45 + fi * 0.18);                 // fall
    gp.x += sin(u_time * 0.3 + fi) * 0.5 + u_windDir.x * u_time * (0.2 + u_windSpeed);
    vec2 id = floor(gp);
    vec2 f = fract(gp) - 0.5;
    float h = hash(id + fi * 17.0);
    if(h > 0.86){
      acc += smoothstep(0.2, 0.0, length(f)) * (0.55 + 0.45 * h);
    }
  }
  return acc * 0.55;
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_res;            // 0..1, y up
  float aspect = u_res.x / u_res.y;
  vec2 par = u_pointer * 0.012;                 // subtle pointer depth

  // wind drift (flow direction over time)
  vec2 drift = u_windDir * u_time * (0.004 + u_windSpeed * 0.02);

  // wet-glass refraction warp when raining (stronger toward the lower frame)
  vec2 warp = vec2(0.0);
  if(u_rain > 0.001){
    float streak = sin(uv.y * 36.0 - u_time * 2.0 + fbm(vec2(uv.x * 7.0, u_time * 0.3)) * 6.0);
    warp.x += streak * 0.006 * u_rain;
    float rivulet = fbm(vec2(uv.x * 22.0, uv.y * 3.0 - u_time * 0.7));
    warp.x += (rivulet - 0.5) * 0.02 * u_rain * smoothstep(0.0, 0.55, uv.y);
  }

  vec2 p = vec2(uv.x * aspect, uv.y) + par + warp;
  float hb = u_horizonY;
  float y = uv.y + warp.y;

  // aspect-corrected sun vector — reused for cloud lighting, glow and reflection
  vec2 sd = (uv - u_sunPos);
  sd.x *= aspect;
  float sunDist = length(sd);

  // --- FAR SKY: three-stop vertical gradient -------------------------------
  vec3 sky = y < hb
    ? mix(u_skyBottom, u_skyHorizon, smoothstep(0.0, hb, y))
    : mix(u_skyHorizon, u_skyTop, smoothstep(hb, 1.0, y));

  // --- PLANE 1: far soft cloud masses (large, slow), lit toward the sun -----
  float farN = fbm(p * 0.85 + drift * 0.7);
  float farClouds = smoothstep(0.42, 0.95, farN) * smoothstep(0.05, 0.4, y);
  float sunSide = exp(-sunDist * 1.3);
  vec3 cloudLit = mix(u_skyHorizon * 0.78, u_sunColor, 0.2 + 0.55 * sunSide);
  sky = mix(sky, cloudLit, farClouds * (0.22 + 0.4 * u_cloudShadow));

  // --- PLANE 2: mid cloud shadows (smaller, faster, darker) → depth ---------
  float midN = fbm(p * 1.9 - drift * 1.4 + 7.3);
  float midClouds = smoothstep(0.55, 0.92, midN) * smoothstep(0.03, 0.32, y);
  sky *= 1.0 - midClouds * u_cloudShadow * 0.5;

  // --- haze / fog: lift toward pale grey, densest low and along the horizon -
  float hazeN = fbm(p * 0.7 - drift * 0.5);
  vec3 fogCol = mix(vec3(0.60, 0.64, 0.70), u_skyHorizon, 0.5);
  float lowBias = mix(1.5, 0.45, smoothstep(hb - 0.12, 1.0, y));
  float hazeAmt = u_haze * (0.4 + 0.6 * hazeN) * lowBias;
  sky = mix(sky, fogCol, clamp(hazeAmt * 0.5, 0.0, 0.82));

  // --- PLANE 3: distant ridge silhouette just under the horizon -------------
  float ridgeY = hb - 0.05 + (fbm(vec2(uv.x * 2.0 + 11.0, 5.0)) - 0.5) * 0.055;
  float belowR = ridgeY - y;                                 // >0 below the ridge line
  float ridgeMask = smoothstep(0.0, 0.005, belowR) * smoothstep(0.18, 0.0, belowR);
  vec3 ridgeCol = mix(u_skyBottom, vec3(0.035, 0.045, 0.085), 0.72);
  sky = mix(sky, ridgeCol, clamp(ridgeMask, 0.0, 1.0) * 0.6 * (1.0 - u_haze * 0.45));

  // --- reflective foreground (river / wet ground): mirror the sun w/ ripple -
  float foreMask = smoothstep(0.0, 0.03, ridgeY - y);        // strictly below the ridge
  vec2 rsd = vec2(uv.x - u_sunPos.x, (2.0 * ridgeY - y) - u_sunPos.y);
  rsd.x *= aspect;
  float ripple = 0.55 + 0.45 * sin(uv.x * 54.0 + u_time * 0.5 + noise(vec2(uv.x * 8.0, u_time * 0.2)) * 6.0);
  float refl = exp(-length(rsd) * mix(7.0, 3.5, u_lightDiffusion)) * ripple;
  vec3 water = mix(u_skyBottom * 0.55, u_sunColor, clamp(refl * 0.6, 0.0, 0.8));
  sky = mix(sky, water, foreMask * 0.45);

  // --- SUN: tight directional core + soft halo + horizon band, SCREEN-blended
  // so the highlight asymptotes toward (but never reaches) white — the gradient
  // detail underneath survives and there is no flat blown-out blob.
  float core = exp(-sunDist * sunDist * mix(95.0, 34.0, u_lightDiffusion));
  float halo = exp(-sunDist * mix(10.0, 5.5, u_lightDiffusion));
  float band = exp(-pow((y - hb) * mix(8.0, 3.5, u_lightDiffusion), 2.0));
  vec3 hl = clamp(u_sunColor * (core * 0.7 + halo * 0.34 + band * 0.12) * u_sunIntensity, 0.0, 0.82);
  sky = 1.0 - (1.0 - sky) * (1.0 - hl);

  // distant city lights at dusk, sitting along the ridge line
  float dusk = clamp(1.0 - u_sunIntensity * 1.7, 0.0, 1.0);
  float cityCells = hash(vec2(floor(uv.x * 220.0), 3.0));
  float cityLights = step(0.93, cityCells) * smoothstep(0.010, 0.0, abs(y - ridgeY));
  sky += u_sunColor * cityLights * dusk * 0.4;

  // a whisper of the weather accent
  sky = mix(sky, sky * (0.62 + u_accent * 0.7) + u_accent * 0.04, 0.09);

  // warm / cool tint balance
  sky *= mix(vec3(0.95, 1.0, 1.05), vec3(1.06, 1.0, 0.94), u_warmth);

  // slow bright snow
  if(u_snow > 0.001){
    sky += vec3(0.95, 0.97, 1.0) * snowField(uv, aspect) * u_snow;
  }

  // vertical rain streaks running down the glass + reflected light near the base
  if(u_rain > 0.001){
    float colp = fract(uv.x * 200.0);
    float line = smoothstep(0.0, 0.06, colp) * (1.0 - smoothstep(0.06, 0.12, colp));
    float fall = fract(uv.y * 1.6 + u_time * 1.8 + hash(vec2(floor(uv.x * 200.0), 1.0)));
    float drop = smoothstep(0.55, 1.0, fall);
    sky -= line * drop * 0.10 * u_rain;
    sky += u_sunColor * band * u_rain * 0.05 * smoothstep(0.35, 0.0, y);
  }

  // settle the very bottom into a calm dark foreground (grounds the composition)
  sky *= mix(0.74, 1.0, smoothstep(0.0, 0.16, y));

  // depth / contrast around mid grey
  sky = (sky - 0.5) * mix(0.94, 1.16, u_contrast) + 0.5;

  // gentle vignette to settle the edges
  float vig = smoothstep(1.32, 0.42, length((uv - 0.5) * vec2(aspect, 1.0)));
  sky *= mix(0.82, 1.0, vig);

  // fine film grain
  float g = hash(uv * u_res + fract(u_time) * 97.0) - 0.5;
  sky += g * u_grain;

  // === TEMP DEBUG (task 1.1) — REMOVE in task 1.2 ==========================
  // Wiring check only: proves the damped u_scroll uniform reaches the shader.
  // Pushes a magenta cast in proportionally as you descend (0 at the top, so
  // the field is unchanged at altitude 0). The real altitude palette ramp
  // replaces this entirely in task 1.2.
  sky = mix(sky, vec3(0.9, 0.1, 0.7), u_scroll * 0.35);
  // =========================================================================

  gl_FragColor = vec4(clamp(sky, 0.0, 1.0), 1.0);
}
`;

const UNIFORMS = [
  "u_res", "u_time", "u_pointer",
  "u_skyTop", "u_skyHorizon", "u_skyBottom", "u_sunColor", "u_accent",
  "u_sunPos", "u_windDir",
  "u_horizonY", "u_sunIntensity", "u_warmth", "u_haze", "u_cloudShadow",
  "u_windSpeed", "u_rain", "u_snow", "u_lightDiffusion", "u_contrast", "u_grain",
  "u_scroll",
] as const;

type UniformMap = Partial<Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>>;

function tierDefines(tier: QualitySettings["tier"]): { octaves: number; snow: number } {
  if (tier === "high") return { octaves: 5, snow: 3 };
  if (tier === "balanced") return { octaves: 4, snow: 3 };
  return { octaves: 3, snow: 2 };
}

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader alloc failed");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`shader compile failed: ${log}`);
  }
  return sh;
}

interface LoopControl {
  startLoop: () => void;
  stop: () => void;
  clearStatic: () => void;
}

export interface AtmosphericFieldBackgroundProps {
  target: VisualConfig;
  quality: QualitySettings;
  reducedMotion: boolean;
  paused: boolean;
  pointerEnabled: boolean;
}

export default function AtmosphericFieldBackground({
  target,
  quality,
  reducedMotion,
  paused,
  pointerEnabled,
}: AtmosphericFieldBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const targetRef = useRef<VisualConfig>(target);
  const reducedRef = useRef(reducedMotion);
  const pausedRef = useRef(paused);
  const pointerEnabledRef = useRef(pointerEnabled);
  const loopRef = useRef<LoopControl | null>(null);
  // Normalized page scroll (0..1), written by a passive listener, read by the
  // rAF loop. The loop lerps toward it so the descent is damped, never raw.
  const scrollTargetRef = useRef(0);

  // One persistent "live" config, lazily initialised (canonical ref pattern).
  const liveRef = useRef<VisualConfig | null>(null);
  if (liveRef.current === null) liveRef.current = cloneVisualConfig(target);

  // Keep refs fresh without restarting the GL loop.
  targetRef.current = target;
  reducedRef.current = reducedMotion;
  pausedRef.current = paused;
  pointerEnabledRef.current = pointerEnabled;

  // Flip the discrete (non-lerped) fields instantly when the target changes.
  useEffect(() => {
    if (liveRef.current) copyDiscrete(liveRef.current, target);
  }, [target]);

  // Build the GL pipeline. Recreated only when the quality tier changes (the
  // octave/snow-layer defines bake into the compiled shader).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = (canvas.getContext("webgl2", { antialias: false, alpha: false }) ||
      canvas.getContext("webgl", { antialias: false, alpha: false })) as WebGLRenderingContext | null;
    if (!gl) throw new Error("WebGL unavailable");

    const { octaves, snow } = tierDefines(quality.tier);
    const frag = FRAG.replace("__OCTAVES__", String(octaves)).replace("__SNOW__", String(snow));
    const program = gl.createProgram();
    if (!program) throw new Error("program alloc failed");
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, frag);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`program link failed: ${gl.getProgramInfoLog(program)}`);
    }
    gl.useProgram(program);

    // fullscreen triangle
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const u: UniformMap = {};
    for (const name of UNIFORMS) u[name] = gl.getUniformLocation(program, name);

    const live = liveRef.current!;
    const dprCap = Math.min(window.devicePixelRatio || 1, reducedRef.current ? 1.25 : quality.dpr[1], 2);
    let width = 0;
    let height = 0;
    const resize = () => {
      const w = Math.max(1, Math.round(canvas.clientWidth * dprCap));
      const h = Math.max(1, Math.round(canvas.clientHeight * dprCap));
      if (w === width && h === height) return false;
      width = w;
      height = h;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      return true;
    };
    resize();

    // pointer (desktop only), smoothed in the loop
    const pointerTarget = { x: 0, y: 0 };
    const pointerSmooth = { x: 0, y: 0 };
    const onPointer = (e: PointerEvent) => {
      if (!pointerEnabledRef.current) return;
      pointerTarget.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointerTarget.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    // scroll → altitude (task 1.1): a passive listener writes the normalized
    // page scroll into a ref; the loop lerps `scrollSmooth` toward it so the
    // descent is damped, never a raw 1:1 scrollTop. Held steady under reduced
    // motion (renderStatic leaves scrollSmooth untouched).
    const readScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      scrollTargetRef.current = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    };
    readScroll();
    window.addEventListener("scroll", readScroll, { passive: true });
    let scrollSmooth = scrollTargetRef.current;

    const setUniforms = (time: number) => {
      gl.uniform2f(u.u_res!, width, height);
      gl.uniform1f(u.u_time!, time);
      gl.uniform2f(u.u_pointer!, pointerSmooth.x, pointerSmooth.y);
      gl.uniform3f(u.u_skyTop!, live.skyTop[0], live.skyTop[1], live.skyTop[2]);
      gl.uniform3f(u.u_skyHorizon!, live.skyHorizon[0], live.skyHorizon[1], live.skyHorizon[2]);
      gl.uniform3f(u.u_skyBottom!, live.skyBottom[0], live.skyBottom[1], live.skyBottom[2]);
      gl.uniform3f(u.u_sunColor!, live.sunColor[0], live.sunColor[1], live.sunColor[2]);
      gl.uniform3f(u.u_accent!, live.accent[0], live.accent[1], live.accent[2]);
      gl.uniform2f(u.u_sunPos!, live.sunPos[0], live.sunPos[1]);
      gl.uniform2f(u.u_windDir!, live.windDir[0], live.windDir[1]);
      gl.uniform1f(u.u_horizonY!, live.horizonY);
      gl.uniform1f(u.u_sunIntensity!, live.sunIntensity);
      gl.uniform1f(u.u_warmth!, live.skyWarmth);
      gl.uniform1f(u.u_haze!, live.hazeDensity);
      gl.uniform1f(u.u_cloudShadow!, live.cloudShadowStrength);
      gl.uniform1f(u.u_windSpeed!, live.windDriftSpeed);
      gl.uniform1f(u.u_rain!, live.rainDistortion);
      gl.uniform1f(u.u_snow!, live.snowDensity);
      gl.uniform1f(u.u_lightDiffusion!, live.lightDiffusion);
      gl.uniform1f(u.u_contrast!, live.backgroundContrast);
      gl.uniform1f(u.u_grain!, live.grain);
      gl.uniform1f(u.u_scroll!, scrollSmooth);
    };

    let raf = 0;
    let last = performance.now() / 1000;
    const start = last;

    const frame = () => {
      const now = performance.now() / 1000;
      const dt = Math.min(now - last, 0.05);
      last = now;
      resize();
      lerpVisualConfig(live, targetRef.current, 1 - Math.exp(-dt * 2.2));
      if (pointerEnabledRef.current) {
        const k = 1 - Math.exp(-dt * 4);
        pointerSmooth.x += (pointerTarget.x - pointerSmooth.x) * k;
        pointerSmooth.y += (pointerTarget.y - pointerSmooth.y) * k;
      }
      // Damped descent: ease toward the scroll ref each frame (never raw).
      scrollSmooth += (scrollTargetRef.current - scrollSmooth) * (1 - Math.exp(-dt * 6));
      setUniforms(now - start);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    };

    // Reduced motion: snap to the data target and draw one frozen, gorgeous frame.
    // `scrollSmooth` is intentionally left untouched here so uScroll holds steady
    // (no scroll-driven descent) under prefers-reduced-motion.
    const renderStatic = () => {
      lerpVisualConfig(live, targetRef.current, 1);
      copyDiscrete(live, targetRef.current);
      pointerSmooth.x = 0;
      pointerSmooth.y = 0;
      setUniforms(8.0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    let staticTimer = 0;
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    const clearStatic = () => window.clearTimeout(staticTimer);
    const startLoop = () => {
      if (raf || pausedRef.current) return;
      if (reducedRef.current) {
        // Re-snap a few times so a freshly-mounted target settles, then idle.
        let n = 0;
        const tick = () => {
          renderStatic();
          if (++n < 24) staticTimer = window.setTimeout(tick, 90);
        };
        tick();
        return;
      }
      last = performance.now() / 1000;
      raf = requestAnimationFrame(frame);
    };

    const ro = new ResizeObserver(() => {
      if (resize() && (reducedRef.current || pausedRef.current)) renderStatic();
    });
    ro.observe(canvas);

    loopRef.current = { startLoop, stop, clearStatic };
    startLoop();

    return () => {
      stop();
      clearStatic();
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", readScroll);
      ro.disconnect();
      gl.deleteBuffer(buf);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      // NB: do NOT call WEBGL_lose_context.loseContext() here. React (StrictMode
      // in dev, and any quality-tier remount) re-runs this effect on the SAME
      // canvas, and getContext() hands back the same context — losing it would
      // poison every later compile. The context is freed on unmount GC.
      loopRef.current = null;
    };
  }, [quality.tier, quality.dpr]);

  // Start/stop without rebuilding GL when paused or reduced-motion toggles.
  useEffect(() => {
    const c = loopRef.current;
    if (!c) return;
    c.stop();
    c.clearStatic();
    if (!paused) c.startLoop();
  }, [paused, reducedMotion]);

  return <canvas ref={canvasRef} className="h-full w-full" aria-hidden />;
}
