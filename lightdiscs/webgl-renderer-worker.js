// Copyright (C) 2026 Pelagic Games

let gl;
let outlineProgram;
let outlineUniforms;
let sceneProgram;
let sceneTexture;
let sceneUniforms;
let failed = false;
let frameRequest = null;
let pendingRender = null;

const vertexShaderSource = `#version 300 es
in vec2 a_position;
uniform vec2 u_center;
uniform vec2 u_resolution;
uniform float u_radius;
out vec2 v_offset;

void main() {
  v_offset = a_position * u_radius;
  vec2 board = u_center + v_offset;
  vec2 clip = vec2(
    board.x / u_resolution.x * 2.0 - 1.0,
    1.0 - board.y / u_resolution.y * 2.0
  );
  gl_Position = vec4(clip, 0.0, 1.0);
}`;

const fragmentShaderSource = `#version 300 es
precision highp float;

in vec2 v_offset;
uniform float u_angle;
uniform vec3 u_background;
uniform vec3 u_foreground;
uniform int u_shape;
uniform float u_radius;
out vec4 outputColour;

const float squareHalfSize = 21.0;
const float triangleRadius = 28.0;
const float triangleHalfWidth = 24.24871130596428;
const float triangleBaseY = 14.0;
const float largeShapeRadius = 30.0;
const float smallShapeRadius = 12.0;

vec2 rotatePoint(vec2 point, float angle) {
  float sine = sin(angle);
  float cosine = cos(angle);
  return vec2(
    point.x * cosine - point.y * sine,
    point.x * sine + point.y * cosine
  );
}

bool insideSquare(vec2 point) {
  return abs(point.x) <= squareHalfSize
    && abs(point.y) <= squareHalfSize;
}

float edgeSign(vec2 point, vec2 left, vec2 right) {
  return (point.x - right.x) * (left.y - right.y)
    - (left.x - right.x) * (point.y - right.y);
}

bool insideTriangle(vec2 point, bool reflected) {
  if (reflected) point.y = -point.y;
  vec2 top = vec2(0.0, -triangleRadius);
  vec2 left = vec2(-triangleHalfWidth, triangleBaseY);
  vec2 right = vec2(triangleHalfWidth, triangleBaseY);
  float first = edgeSign(point, top, left);
  float second = edgeSign(point, left, right);
  float third = edgeSign(point, right, top);
  bool hasNegative = first < 0.0 || second < 0.0 || third < 0.0;
  bool hasPositive = first > 0.0 || second > 0.0 || third > 0.0;
  return !(hasNegative && hasPositive);
}

bool insideShape(vec2 point) {
  if (u_shape == 0) return false;
  if (u_shape == 1) return insideSquare(point);
  if (u_shape == 2) {
    return insideSquare(point)
      || insideSquare(rotatePoint(point, -1.0471975511965976))
      || insideSquare(rotatePoint(point, -2.0943951023931953));
  }
  if (u_shape == 3) return insideTriangle(point, false);
  if (u_shape == 4) {
    return insideTriangle(point, false)
      || insideTriangle(point, true);
  }
  float distanceSquared = dot(point, point);
  if (u_shape == 5) {
    return distanceSquared <= largeShapeRadius * largeShapeRadius;
  }
  if (u_shape == 6) {
    return distanceSquared <= smallShapeRadius * smallShapeRadius;
  }
  return distanceSquared <= largeShapeRadius * largeShapeRadius
    && distanceSquared >= smallShapeRadius * smallShapeRadius;
}

void main() {
  if (dot(v_offset, v_offset) > u_radius * u_radius) discard;
  vec2 local = rotatePoint(v_offset, -u_angle);
  vec3 colour = insideShape(local) ? u_foreground : u_background;
  outputColour = vec4(colour, 1.0);
}`;

const outlineVertexShaderSource = `#version 300 es
in vec2 a_position;
out vec2 v_textureCoordinate;

void main() {
  v_textureCoordinate = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const outlineFragmentShaderSource = `#version 300 es
precision highp float;

in vec2 v_textureCoordinate;
uniform sampler2D u_scene;
uniform vec2 u_texel;
uniform float u_outlineWidth;
out vec4 outputColour;

int bitDifference(vec3 left, vec3 right) {
  int difference = 0;
  if ((left.r > 0.5) != (right.r > 0.5)) difference += 1;
  if ((left.g > 0.5) != (right.g > 0.5)) difference += 1;
  if ((left.b > 0.5) != (right.b > 0.5)) difference += 1;
  return difference;
}

bool needsOutline(vec4 centre, vec4 neighbour) {
  return centre.a > 0.5
    && neighbour.a > 0.5
    && bitDifference(centre.rgb, neighbour.rgb) == 1;
}

float luminance(vec3 colour) {
  return dot(colour, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec4 centre = texture(u_scene, v_textureCoordinate);
  vec2 distance = u_texel * u_outlineWidth;
  vec2 offsets[8] = vec2[](
    vec2(-distance.x, 0.0),
    vec2(distance.x, 0.0),
    vec2(0.0, -distance.y),
    vec2(0.0, distance.y),
    vec2(-distance.x, -distance.y),
    vec2(distance.x, -distance.y),
    vec2(-distance.x, distance.y),
    vec2(distance.x, distance.y)
  );
  for (int index = 0; index < 8; index += 1) {
    vec4 neighbour = texture(
      u_scene,
      clamp(v_textureCoordinate + offsets[index], vec2(0.0), vec2(1.0))
    );
    if (needsOutline(centre, neighbour)) {
      float averageLuminance = (
        luminance(centre.rgb) + luminance(neighbour.rgb)
      ) * 0.5;
      vec3 outline = averageLuminance > 0.35
        ? vec3(0.0)
        : vec3(1.0);
      outputColour = vec4(outline, centre.a);
      return;
    }
  }
  outputColour = centre;
}`;

const shapeCodes = {
  none: 0,
  square: 1,
  "square-star": 2,
  triangle: 3,
  "triangle-star": 4,
  "large-disc": 5,
  "small-disc": 6,
  annulus: 7
};

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`WebGL shader compilation failed: ${message}`);
  }
  return shader;
}

function createProgram(vertexSource, fragmentSource) {
  const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(
    gl.FRAGMENT_SHADER,
    fragmentSource
  );
  const nextProgram = gl.createProgram();
  gl.attachShader(nextProgram, vertexShader);
  gl.attachShader(nextProgram, fragmentShader);
  gl.bindAttribLocation(nextProgram, 0, "a_position");
  gl.linkProgram(nextProgram);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(nextProgram, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(nextProgram);
    gl.deleteProgram(nextProgram);
    throw new Error(`WebGL program linking failed: ${message}`);
  }
  return nextProgram;
}

function initialise(canvas, width, height, boardWidth, boardHeight) {
  gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: false
  });
  if (!gl) throw new Error("WebGL2 is unavailable in this browser.");
  sceneProgram = createProgram(vertexShaderSource, fragmentShaderSource);
  outlineProgram = createProgram(
    outlineVertexShaderSource,
    outlineFragmentShaderSource
  );
  gl.useProgram(sceneProgram);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
    1, -1,
    -1, 1,
    -1, 1,
    1, -1,
    1, 1
  ]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  sceneUniforms = {
    angle: gl.getUniformLocation(sceneProgram, "u_angle"),
    background: gl.getUniformLocation(sceneProgram, "u_background"),
    center: gl.getUniformLocation(sceneProgram, "u_center"),
    foreground: gl.getUniformLocation(sceneProgram, "u_foreground"),
    radius: gl.getUniformLocation(sceneProgram, "u_radius"),
    resolution: gl.getUniformLocation(sceneProgram, "u_resolution"),
    shape: gl.getUniformLocation(sceneProgram, "u_shape")
  };
  outlineUniforms = {
    outlineWidth: gl.getUniformLocation(outlineProgram, "u_outlineWidth"),
    scene: gl.getUniformLocation(outlineProgram, "u_scene"),
    texel: gl.getUniformLocation(outlineProgram, "u_texel")
  };
  gl.uniform2f(sceneUniforms.resolution, boardWidth, boardHeight);
  gl.viewport(0, 0, width, height);
  sceneTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    width,
    height,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null
  );
  gl.clearColor(1, 1, 1, 0);
  gl.enable(gl.BLEND);
  gl.blendEquationSeparate(gl.FUNC_ADD, gl.MAX);
  gl.blendFuncSeparate(gl.ZERO, gl.SRC_COLOR, gl.ONE, gl.ONE);
  self.postMessage({ type: "ready" });
}

function maskColour(mask) {
  return [
    mask & 4 ? 1 : 0,
    mask & 2 ? 1 : 0,
    mask & 1 ? 1 : 0
  ];
}

function render(layers, contrast) {
  gl.useProgram(sceneProgram);
  gl.enable(gl.BLEND);
  gl.blendEquationSeparate(gl.FUNC_ADD, gl.MAX);
  gl.blendFuncSeparate(gl.ZERO, gl.SRC_COLOR, gl.ONE, gl.ONE);
  gl.clear(gl.COLOR_BUFFER_BIT);
  layers.forEach((layer) => {
    const background = maskColour(layer.backgroundMask);
    const foreground = maskColour(layer.foregroundMask);
    gl.uniform2f(sceneUniforms.center, layer.x, layer.y);
    gl.uniform1f(sceneUniforms.angle, layer.angle * Math.PI / 180);
    gl.uniform1f(sceneUniforms.radius, layer.radius);
    gl.uniform3fv(sceneUniforms.background, background);
    gl.uniform3fv(sceneUniforms.foreground, foreground);
    gl.uniform1i(sceneUniforms.shape, shapeCodes[layer.shape]);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  });
  if (contrast) renderContrastOutlines();
  gl.flush();
}

function renderContrastOutlines() {
  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
  gl.copyTexSubImage2D(
    gl.TEXTURE_2D,
    0,
    0,
    0,
    0,
    0,
    width,
    height
  );
  gl.disable(gl.BLEND);
  gl.useProgram(outlineProgram);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sceneTexture);
  gl.uniform1i(outlineUniforms.scene, 0);
  gl.uniform2f(outlineUniforms.texel, 1 / width, 1 / height);
  gl.uniform1f(
    outlineUniforms.outlineWidth,
    Math.max(1, width / 1000 * 0.75)
  );
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function scheduleRender(layers, contrast) {
  pendingRender = { layers, contrast };
  if (frameRequest !== null) return;
  const requestFrame = self.requestAnimationFrame
    ? self.requestAnimationFrame.bind(self)
    : (callback) => self.setTimeout(callback, 0);
  frameRequest = requestFrame(() => {
    frameRequest = null;
    const nextRender = pendingRender;
    pendingRender = null;
    render(nextRender.layers, nextRender.contrast);
  });
}

self.addEventListener("message", (event) => {
  try {
    if (event.data.type === "init") {
      initialise(
        event.data.canvas,
        event.data.width,
        event.data.height,
        event.data.boardWidth,
        event.data.boardHeight
      );
    } else if (event.data.type === "render") {
      if (failed) return;
      scheduleRender(event.data.layers, event.data.contrast);
    }
  } catch (error) {
    failed = true;
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});
