import { Effect } from "@babylonjs/core/Materials/effect.js";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess.js";

const SHADER_NAME = "retroCrt";

Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform vec2 screenSize;
uniform float time;
uniform float scanlineIntensity;
uniform float noiseIntensity;
uniform float vignette;
uniform float curvature;
uniform float ditherScale;

float rand(vec2 co) {
  return fract(sin(dot(co.xy, vec2(12.9898, 78.233)) + time) * 43758.5453);
}

void main(void) {
  vec2 uv = vUV;
  vec2 centered = uv * 2.0 - 1.0;
  float r2 = dot(centered, centered);
  vec2 warped = centered + centered * r2 * curvature;
  vec2 uvWarped = warped * 0.5 + 0.5;
  float edge = smoothstep(0.75, 1.0, max(abs(centered.x), abs(centered.y)));
  uv = mix(uvWarped, uv, edge);
  uv = clamp(uv, vec2(0.0), vec2(1.0));

  vec4 color = texture2D(textureSampler, uv);

  float scan = sin(uv.y * screenSize.y * 3.14159);
  color.rgb *= 1.0 - scanlineIntensity * (0.5 + 0.5 * scan);

  float dist = distance(uv, vec2(0.5));
  float vig = smoothstep(0.45, 0.85, dist);
  color.rgb *= 1.0 - vignette * vig;

  vec2 pixel = floor(uv * screenSize / max(ditherScale, 1.0));
  float dither = (rand(pixel) - 0.5) * 0.04;
  color.rgb += dither;

  float noise = (rand(uv * screenSize * 0.25) - 0.5) * noiseIntensity;
  color.rgb += noise;

  gl_FragColor = vec4(clamp(color.rgb, 0.0, 1.0), color.a);
}
`;

export function applyRetroPipeline(scene, camera, options = {}) {
  const settings = {
    scanlineIntensity: 0.15,
    noiseIntensity: 0.02,
    vignette: 0.15,
    curvature: 0.12,
    ditherScale: 1.0,
    ...options,
  };

  const postProcess = new PostProcess(
    "retro-crt",
    SHADER_NAME,
    ["screenSize", "time", "scanlineIntensity", "noiseIntensity", "vignette", "curvature", "ditherScale"],
    null,
    1.0,
    camera,
  );

  postProcess.onApply = (effect) => {
    const engine = scene.getEngine();
    const width = engine.getRenderWidth(true);
    const height = engine.getRenderHeight(true);
    effect.setFloat2("screenSize", width, height);
    effect.setFloat("time", performance.now() / 1000);
    effect.setFloat("scanlineIntensity", settings.scanlineIntensity);
    effect.setFloat("noiseIntensity", settings.noiseIntensity);
    effect.setFloat("vignette", settings.vignette);
    effect.setFloat("curvature", settings.curvature);
    effect.setFloat("ditherScale", settings.ditherScale);
  };

  return postProcess;
}
