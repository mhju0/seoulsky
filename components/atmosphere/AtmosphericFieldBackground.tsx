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
  vec2 par = u_pointer * 0.014;                 // subtle pointer depth

  // wind drift (flow direction over time)
  vec2 drift = u_windDir * u_time * (0.004 + u_windSpeed * 0.022);

  // wet-glass refraction warp when raining
  vec2 warp = vec2(0.0);
  if(u_rain > 0.001){
    float streak = sin(uv.y * 38.0 - u_time * 2.0 + fbm(vec2(uv.x * 7.0, u_time * 0.3)) * 6.0);
    warp.x += streak * 0.006 * u_rain;
    float rivulet = fbm(vec2(uv.x * 24.0, uv.y * 3.0 - u_time * 0.7));
    warp.x += (rivulet - 0.5) * 0.02 * u_rain;
  }

  vec2 p = vec2(uv.x * aspect, uv.y) + par + warp;
  float hb = u_horizonY;

  // base vertical gradient with a bright horizon band
  float y = uv.y + warp.y;
  vec3 sky = y < hb
    ? mix(u_skyBottom, u_skyHorizon, smoothstep(0.0, hb, y))
    : mix(u_skyHorizon, u_skyTop, smoothstep(hb, 1.0, y));

  // drifting cloud shadows
  float clouds = fbm(p * 1.4 + drift);
  clouds = smoothstep(0.38, 0.82, clouds);
  sky *= 1.0 - clouds * u_cloudShadow * 0.55;

  // haze / fog — low-freq lift toward pale grey, denser near the horizon band
  float hazeN = fbm(p * 0.8 - drift * 0.6);
  vec3 fogCol = mix(vec3(0.62, 0.66, 0.72), u_skyHorizon, 0.4);
  float hazeAmt = u_haze * (0.45 + 0.55 * hazeN) * mix(0.85, 1.4, 1.0 - abs(y - hb));
  sky = mix(sky, fogCol, clamp(hazeAmt * 0.6, 0.0, 0.85));

  // sun / atmospheric light diffusion (wider with diffusion, but never blown out)
  vec2 sd = (uv - u_sunPos);
  sd.x *= aspect;
  float glow = exp(-dot(sd, sd) * mix(11.0, 3.0, u_lightDiffusion));
  sky += u_sunColor * glow * u_sunIntensity * 0.5;

  // horizontal scatter band along the horizon
  float band = exp(-pow((y - hb) * mix(7.0, 3.0, u_lightDiffusion), 2.0));
  sky += u_sunColor * band * u_sunIntensity * 0.16;

  // a whisper of the weather accent
  sky = mix(sky, sky * (0.6 + u_accent * 0.7) + u_accent * 0.05, 0.1);

  // warm / cool tint balance
  sky *= mix(vec3(0.95, 1.0, 1.05), vec3(1.05, 1.0, 0.95), u_warmth);

  // slow bright snow
  if(u_snow > 0.001){
    sky += vec3(0.95, 0.97, 1.0) * snowField(uv, aspect) * u_snow;
  }

  // vertical rain streaks running down the glass
  if(u_rain > 0.001){
    float col = fract(uv.x * 200.0);
    float line = smoothstep(0.0, 0.06, col) * (1.0 - smoothstep(0.06, 0.12, col));
    float fall = fract(uv.y * 1.6 + u_time * 1.8 + hash(vec2(floor(uv.x * 200.0), 1.0)));
    float drop = smoothstep(0.55, 1.0, fall);
    sky -= line * drop * 0.11 * u_rain;
  }

  // depth / contrast around mid grey
  sky = (sky - 0.5) * mix(0.92, 1.16, u_contrast) + 0.5;

  // gentle vignette to settle the edges
  float vig = smoothstep(1.3, 0.45, length((uv - 0.5) * vec2(aspect, 1.0)));
  sky *= mix(0.84, 1.0, vig);

  // fine film grain
  float g = hash(uv * u_res + fract(u_time) * 97.0) - 0.5;
  sky += g * u_grain;

  gl_FragColor = vec4(clamp(sky, 0.0, 1.0), 1.0);
}
`;

const UNIFORMS = [
  "u_res", "u_time", "u_pointer",
  "u_skyTop", "u_skyHorizon", "u_skyBottom", "u_sunColor", "u_accent",
  "u_sunPos", "u_windDir",
  "u_horizonY", "u_sunIntensity", "u_warmth", "u_haze", "u_cloudShadow",
  "u_windSpeed", "u_rain", "u_snow", "u_lightDiffusion", "u_contrast", "u_grain",
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
      setUniforms(now - start);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(frame);
    };

    // Reduced motion: snap to the data target and draw one frozen, gorgeous frame.
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
