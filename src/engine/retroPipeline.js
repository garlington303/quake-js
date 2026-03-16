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
uniform float chromaticAberration;
uniform float bloomStrength;
uniform float colorTint;

float rand(vec2 co) {
  return fract(sin(dot(co.xy, vec2(12.9898, 78.233)) + time) * 43758.5453);
}

// Soft glow approximation — samples in a cross pattern
vec3 softBloom(sampler2D tex, vec2 uv, vec2 texelSize) {
  vec3 sum = vec3(0.0);
  float weights = 0.0;
  for (int i = -3; i <= 3; i++) {
    for (int j = -3; j <= 3; j++) {
      float w = 1.0 / (1.0 + float(abs(i) + abs(j)));
      vec3 s = texture2D(tex, uv + vec2(float(i), float(j)) * texelSize * 3.0).rgb;
      // Only bloom bright areas
      float lum = dot(s, vec3(0.299, 0.587, 0.114));
      float brightPass = smoothstep(0.45, 1.0, lum);
      sum += s * brightPass * w;
      weights += w;
    }
  }
  return sum / weights;
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

  // Chromatic aberration — offset R and B channels
  vec2 caOffset = (uv - 0.5) * chromaticAberration;
  float cr = texture2D(textureSampler, uv + caOffset).r;
  float cg = texture2D(textureSampler, uv).g;
  float cb = texture2D(textureSampler, uv - caOffset).b;
  vec3 color = vec3(cr, cg, cb);

  // Soft bloom overlay
  vec2 texelSize = 1.0 / screenSize;
  vec3 bloom = softBloom(textureSampler, uv, texelSize);
  color += bloom * bloomStrength;

  // Scanlines
  float scan = sin(uv.y * screenSize.y * 3.14159);
  color *= 1.0 - scanlineIntensity * (0.5 + 0.5 * scan);

  // Vignette — stronger falloff for cinematic feel
  float dist = distance(uv, vec2(0.5));
  float vig = smoothstep(0.35, 0.95, dist);
  color *= 1.0 - vignette * vig;

  // Subtle color tint — push shadows toward cool blue, highlights toward warm
  color.r *= 1.0 + colorTint * 0.04;
  color.b *= 1.0 + colorTint * 0.08;

  // Dither
  vec2 pixel = floor(uv * screenSize / max(ditherScale, 1.0));
  float dither = (rand(pixel) - 0.5) * 0.035;
  color += dither;

  // Film grain
  float noise = (rand(uv * screenSize * 0.25) - 0.5) * noiseIntensity;
  color += noise;

  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

export function applyRetroPipeline(scene, camera, options = {}) {
  const settings = {
    scanlineIntensity: 0.15,
    noiseIntensity: 0.02,
    vignette: 0.15,
    curvature: 0.12,
    ditherScale: 1.0,
    chromaticAberration: 0.003,
    bloomStrength: 0.35,
    colorTint: 1.0,
    ...options,
  };

  const postProcess = new PostProcess(
    "retro-crt",
    SHADER_NAME,
    ["screenSize", "time", "scanlineIntensity", "noiseIntensity", "vignette", "curvature", "ditherScale", "chromaticAberration", "bloomStrength", "colorTint"],
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
    effect.setFloat("chromaticAberration", settings.chromaticAberration);
    effect.setFloat("bloomStrength", settings.bloomStrength);
    effect.setFloat("colorTint", settings.colorTint);
  };

  return postProcess;
}
