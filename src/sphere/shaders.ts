// GLSL for the Bloch sphere.
//
// The glass shell is one sphere drawn twice (back faces, then front faces),
// and everything on it is computed per pixel from the fragment's position on
// the unit sphere: the three great circles, a faint graticule, the dashed
// rings that show each qubit's odds, the glow from each hand, the wave that
// spreads out when a qubit is measured, and a slow interference pattern
// between the two hands. Nothing on the shell is a texture or a line mesh, so
// it stays sharp at any size and costs one draw call per side.

export const shellVertex = /* glsl */ `
  varying vec3 vBloch;     // position on the unit sphere, Bloch frame (z = |0⟩)
  varying vec3 vNormalV;   // normal in view space
  varying vec3 vViewDir;   // from the surface toward the camera, view space

  void main() {
    vBloch = normalize(position);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormalV = normalize(normalMatrix * normal);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

export const shellFragment = /* glsl */ `
  #define PI 3.141592653589793

  uniform vec3 uInk;
  uniform vec3 uRule;
  uniform vec3 uDate;
  uniform vec3 uTimeDir;      // unit Bloch vector of the time hand
  uniform vec3 uDateDir;      // unit Bloch vector of the date hand
  uniform vec3 uPulseOrigin;  // where the last measurement started
  uniform float uPulse;       // 0..1 progress of that wave, < 0 when idle
  uniform vec3 uPulseColor;
  uniform float uClock;       // seconds, drives the ambient motion
  uniform float uMotion;      // 0 when the viewer prefers reduced motion
  uniform float uBack;        // 1 for the back-face pass
  uniform float uDark;        // 1 in dark mode, softens the glow

  varying vec3 vBloch;
  varying vec3 vNormalV;
  varying vec3 vViewDir;

  // Anti-aliased line: 1 on the line, fading to 0 over about one pixel.
  float lineAA(float d, float halfWidth) {
    float fw = max(fwidth(d), 1e-5);
    return 1.0 - smoothstep(halfWidth - fw, halfWidth + fw, d);
  }

  // Angle between two unit vectors, stable near 0 and π.
  float arc(vec3 a, vec3 b) {
    return atan(length(cross(a, b)), dot(a, b));
  }

  // Rings spaced 0.28 rad apart, moving outward from dir over time.
  float ripple(vec3 p, vec3 dir) {
    float a = arc(p, dir);
    float spacing = 0.28;
    float d = abs(fract(a / spacing - uClock * 0.22) - 0.5) * spacing;
    float fade = exp(-a * 2.4) * smoothstep(0.05, 0.2, a);
    return lineAA(d, 0.0025) * fade;
  }

  // "Over" compositing into a premultiplied accumulator.
  void over(inout vec4 acc, vec3 c, float a) {
    acc = vec4(c * a, a) + acc * (1.0 - a);
  }

  void main() {
    vec3 p = normalize(vBloch);
    float lat = acos(clamp(p.z, -1.0, 1.0));   // 0 at |0⟩, π at |1⟩
    float lon = atan(p.y, p.x);

    vec3 n = normalize(vNormalV);
    float facing = abs(dot(n, normalize(vViewDir)));
    float fresnel = pow(1.0 - facing, 3.0);

    vec4 acc = vec4(0.0);

    // Glass body: a soft rim so the sphere reads as a solid.
    over(acc, uInk, 0.035 + 0.16 * fresnel);

    // Graticule every 15°, fading toward the poles where meridians bunch up.
    float step15 = PI / 12.0;
    float latLine = abs(fract(lat / step15 + 0.5) - 0.5) * step15;
    float lonLine = abs(fract(lon / step15 + 0.5) - 0.5) * step15 * sin(lat);
    float grid = max(lineAA(latLine, 0.0015), lineAA(lonLine, 0.0015) * smoothstep(0.05, 0.4, sin(lat)));
    over(acc, uRule, grid * 0.55);

    // Great circles: the equator (the clock face) and the two meridians.
    float gc = max(lineAA(abs(p.z), 0.004), max(lineAA(abs(p.x), 0.003), lineAA(abs(p.y), 0.003)));
    over(acc, mix(uRule, uInk, 0.25), gc * 0.95);

    // Odds rings: every point at the same latitude as a hand has the same
    // chance of reading 0, so a dashed ring at that latitude shows the odds.
    float dashes = step(0.5, fract(lon * 24.0 / (2.0 * PI)));
    float tLat = acos(clamp(uTimeDir.z, -1.0, 1.0));
    float dLat = acos(clamp(uDateDir.z, -1.0, 1.0));
    over(acc, uInk,  lineAA(abs(lat - tLat), 0.004) * dashes * 0.8);
    over(acc, uDate, lineAA(abs(lat - dLat), 0.004) * dashes * 0.9);

    // Glow where each hand meets the glass.
    float glowK = mix(140.0, 200.0, uDark);
    float gt = exp(-pow(arc(p, uTimeDir), 2.0) * glowK);
    float gd = exp(-pow(arc(p, uDateDir), 2.0) * glowK);
    over(acc, uInk, gt * 0.35);
    over(acc, uDate, gd * 0.45);

    // Ambient motion: thin ripples drift outward from each hand tip across the
    // glass and fade with distance. Switched off for reduced motion.
    over(acc, uInk,  ripple(p, uTimeDir) * 0.45 * uMotion);
    over(acc, uDate, ripple(p, uDateDir) * 0.55 * uMotion);

    // Measurement: a ring spreads from the hand to the far side of the sphere.
    if (uPulse >= 0.0) {
      float a = arc(p, uPulseOrigin);
      float front = uPulse * PI;
      float ring = lineAA(abs(a - front), 0.012);
      float wake = smoothstep(front, front - 0.35, a) * step(a, front) * 0.05;
      float fade = 1.0 - smoothstep(0.25, 1.0, uPulse);
      // where the ring runs edge-on to the camera it bunches up, so thin it there
      float edgeOn = mix(0.35, 1.0, facing);
      over(acc, uPulseColor, (ring * 0.75 + wake) * fade * edgeOn);
    }

    // The back of the sphere is seen through the glass, so it is dimmer.
    float alpha = acc.a * mix(1.0, 0.38, uBack);
    vec3 color = acc.a > 0.0 ? acc.rgb / acc.a : vec3(0.0);
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`;

// The hands and pole markers: flat colour with a little shading so they read
// as solid rods, plus a rim that keeps them visible against the glass.
export const solidVertex = /* glsl */ `
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormalV = normalize(normalMatrix * normal);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

export const solidFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  void main() {
    vec3 n = normalize(vNormalV);
    float light = 0.78 + 0.22 * max(dot(n, normalize(vec3(-0.4, 0.7, 0.6))), 0.0);
    float rim = pow(1.0 - abs(dot(n, normalize(vViewDir))), 2.0);
    vec3 c = uColor * light + rim * 0.12;
    gl_FragColor = vec4(c, uOpacity);
    #include <colorspace_fragment>
  }
`;
