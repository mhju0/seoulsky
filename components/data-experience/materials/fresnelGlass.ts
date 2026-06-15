import * as THREE from "three";

/**
 * A cheap translucent "glass shell" material. Instead of real transmission
 * (which needs a render target and is heavy on mobile), it fakes glass with a
 * view-dependent Fresnel rim: nearly invisible facing the camera, brightening to
 * an accent-tinted edge glow at grazing angles. The result reads as a luminous
 * observation dome that thickens with humidity (driven via `uOpacity`).
 *
 * All look parameters are uniforms so the scene can update them every frame
 * without recompiling the shader. Rendered transparent, depthWrite off.
 */
export function createFresnelGlassMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.NormalBlending,
    uniforms: {
      uColor: { value: new THREE.Color(0.6, 0.7, 0.86) },
      uAccent: { value: new THREE.Color(0.46, 0.83, 0.95) },
      uOpacity: { value: 0.3 },
      uFresnelPower: { value: 2.4 },
      uRimStrength: { value: 1.4 },
      uReveal: { value: 1 }, // 0..1 assembly fade-in (chapter 1)
      uScan: { value: 0 }, // scan-band Y in local geometry units
      uScanAmp: { value: 0 }, // 0..1 scan intensity
      uScanWidth: { value: 0.22 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      varying float vLocalY;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        vLocalY = position.y;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform vec3 uAccent;
      uniform float uOpacity;
      uniform float uFresnelPower;
      uniform float uRimStrength;
      uniform float uReveal;
      uniform float uScan;
      uniform float uScanAmp;
      uniform float uScanWidth;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      varying float vLocalY;
      void main() {
        float f = pow(1.0 - max(dot(normalize(vNormalW), normalize(vViewDir)), 0.0), uFresnelPower);
        vec3 col = mix(uColor, uAccent, clamp(f * 1.15, 0.0, 1.0));
        float alpha = uOpacity * (0.18 + f * uRimStrength);
        // Horizontal scanning light sweeping vertically across the shell.
        float band = exp(-pow((vLocalY - uScan) / uScanWidth, 2.0)) * uScanAmp;
        col += uAccent * band * 0.7;
        alpha += band * 0.3;
        gl_FragColor = vec4(col, clamp(alpha * uReveal, 0.0, 1.0));
      }
    `,
  });
}
