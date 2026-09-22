import vs from "./dither.vert?raw";
import fs from "./dither.frag?raw";
import fallbackThreshold from "./BlueNoise.png";

const sharedCanvas = new OffscreenCanvas(1, 1);
const gl = sharedCanvas.getContext("webgl2");

const colorCanvas = new OffscreenCanvas(1, 1);
const colorCtx = colorCanvas.getContext("2d", { willReadFrequently: true });

let locations, texcoordBuffer, positionBuffer, mediaTexture;

const thresholdCache = new Map();

function compile(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

function createProgram() {
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(log);
  }

  gl.useProgram(program);
  return program;
}

function createTexture() {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  return texture;
}

function uploadTexture(texture, image) {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
}

async function createThresholdTexture(src) {
  const thresholdTexture = createTexture();
  const thresholdMap = await loadMedia(src);
  uploadTexture(thresholdTexture, thresholdMap);
  thresholdCache.set(src, { thresholdTexture, thresholdMap });
}

async function initShared() {
  const program = createProgram();

  locations = {
    position: gl.getAttribLocation(program, "a_position"),
    texcoord: gl.getAttribLocation(program, "a_texCoord"),
    resolution: gl.getUniformLocation(program, "u_resolution"),
    threshold: gl.getUniformLocation(program, "threshold"),
    thresholdSize: gl.getUniformLocation(program, "resolution"),
    image: gl.getUniformLocation(program, "image"),
    darkColor: gl.getUniformLocation(program, "darkColor"),
    lightColor: gl.getUniformLocation(program, "lightColor"),
  };

  positionBuffer = gl.createBuffer();
  texcoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);

  mediaTexture = createTexture();
  await createThresholdTexture(fallbackThreshold);

  gl.enableVertexAttribArray(locations.position);
  gl.enableVertexAttribArray(locations.texcoord);
  gl.uniform1i(locations.image, 0);
  gl.uniform1i(locations.threshold, 1);
}

await initShared();
sharedCanvas.addEventListener("webglcontextlost", (e) => e.preventDefault());
sharedCanvas.addEventListener("webglcontextrestored", initShared);

function loadMedia(url, isVideo, crossOrigin) {
  return new Promise((resolve) => {
    const el = isVideo ? document.createElement("video") : new Image();
    el.src = url;
    el.crossOrigin = crossOrigin;
    if (isVideo) {
      el.playsInline = true;
      el.muted = true;
      el.loop = true;
      el.play();
      el.addEventListener("playing", () => resolve(el), { once: true });
    } else {
      el.addEventListener("load", () => resolve(el), { once: true });
    }
  });
}

function parseColor(color) {
  colorCtx.clearRect(0, 0, 1, 1);
  colorCtx.fillStyle = color;
  colorCtx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = colorCtx.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255, a / 255];
}

class DitherDither extends HTMLElement {
  constructor() {
    super();
    this.intersecting = false;
  }
  static observedAttributes = ["src", "threshold-map", "dark", "light"];

  async attributeChangedCallback(name, _, value) {
    if (!this.initialized) return;
    switch (name) {
      case "src":
        this.mediaSrc = value;
        await this.initMedia();
        this.resizeCanvas();
        this.draw();
        this.sync();
        break;
      case "threshold-map":
        this.thresholdSrc = value;
        await this.initThreshold();
        this.draw();
        break;
      case "dark":
        this.darkColor = parseColor(value);
        this.draw();
        break;
      case "light":
        this.lightColor = parseColor(value);
        this.draw();
        break;
    }
  }

  async connectedCallback() {
    this.crossOrigin = this.getAttribute("cross-origin");
    this.mediaSrc = this.getAttribute("src");
    this.thresholdSrc = this.getAttribute("threshold-map");
    this.immediate = this.getAttribute("immediate") != null;

    this.darkColor = this.getAttribute("dark") ? parseColor(this.getAttribute("dark")) : [0, 0, 0, 1];
    this.lightColor = this.getAttribute("light") ? parseColor(this.getAttribute("light")) : [1, 1, 1, 1];

    this.root = this.attachShadow({ mode: "closed" });
    this.initCanvas();

    await Promise.all([this.initMedia(), this.initThreshold()]);

    this.resizeCanvas();
    this.initObserver();

    if (this.immediate) {
      this.initialized = true;
      this.draw();
      this.sync();
    }
  }

  disconnectedCallback() {
    this.stop();
    this.destroyObserver();
    this.media?.pause?.();
  }

  initCanvas() {
    this.canvas = document.createElement("canvas");
    this.canvas.style.display = "block";
    this.canvas.style.imageRendering = "pixelated";
    this.root.appendChild(this.canvas);

    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", this.getAttribute("alt") ?? "");

    this.ctx = this.canvas.getContext("2d");
  }
  isVideo() {
    return (
      this.getAttribute("type") === "video" ||
      (this.getAttribute("type") == null && ["mp4", "webm", "ogg"].includes(this.mediaSrc.match(/[^.]+$/)[0]))
    );
  }
  async initMedia() {
    this.stop();
    this.media?.pause?.();
    this.media = await loadMedia(this.mediaSrc, this.isVideo(), this.crossOrigin);
  }
  async initThreshold() {
    const src = this.thresholdSrc ?? fallbackThreshold;

    if (!thresholdCache.has(src)) {
      await createThresholdTexture(src);
    }

    const { thresholdTexture, thresholdMap } = thresholdCache.get(src);
    this.threshold = thresholdTexture;
    this.thresholdMap = thresholdMap;
  }
  async resizeCanvas() {
    const mediaWidth = this.media.videoWidth ?? this.media.width;
    const mediaHeight = this.media.videoHeight ?? this.media.height;

    const customWidth = this.getAttribute("width") ? parseInt(this.getAttribute("width")) : null;
    const customHeight = this.getAttribute("height") ? parseInt(this.getAttribute("height")) : null;
    const ObjectFitType = this.getAttribute("object-fit") || "contain";

    const mediaObjectFit = mediaWidth / mediaHeight;
    let canvasWidth, canvasHeight;

    if (customWidth && customHeight) {
      canvasWidth = customWidth;
      canvasHeight = customHeight;
    } else if (customWidth) {
      canvasWidth = customWidth;
      canvasHeight = customWidth / mediaObjectFit;
    } else if (customHeight) {
      canvasHeight = customHeight;
      canvasWidth = customHeight * mediaObjectFit;
    } else {
      canvasWidth = mediaWidth;
      canvasHeight = mediaHeight;
    }

    let renderWidth, renderHeight;
    if (ObjectFitType === "contain") {
      const scale = Math.min(canvasWidth / mediaWidth, canvasHeight / mediaHeight);
      renderWidth = mediaWidth * scale;
      renderHeight = mediaHeight * scale;
    } else if (ObjectFitType === "cover") {
      const scale = Math.max(canvasWidth / mediaWidth, canvasHeight / mediaHeight);
      renderWidth = mediaWidth * scale;
      renderHeight = mediaHeight * scale;
    } else {
      renderWidth = canvasWidth;
      renderHeight = canvasHeight;
    }

    this.canvas.width = canvasWidth;
    this.canvas.height = canvasHeight;

    this.renderWidth = renderWidth;
    this.renderHeight = renderHeight;
  }

  draw() {
    if (gl.isContextLost()) return;

    const { width, height } = this.canvas;
    if (sharedCanvas.width < width) sharedCanvas.width = width;
    if (sharedCanvas.height < height) sharedCanvas.height = height;

    gl.viewport(0, 0, width, height);

    const xOffset = (this.renderWidth - width) / 2;
    const yOffset = (this.renderHeight - height) / 2;
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -xOffset,
        -yOffset,
        this.renderWidth - xOffset,
        -yOffset,
        -xOffset,
        this.renderHeight - yOffset,
        -xOffset,
        this.renderHeight - yOffset,
        this.renderWidth - xOffset,
        -yOffset,
        this.renderWidth - xOffset,
        this.renderHeight - yOffset,
      ]),
      gl.DYNAMIC_DRAW,
    );

    gl.vertexAttribPointer(locations.position, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);
    gl.vertexAttribPointer(locations.texcoord, 2, gl.FLOAT, false, 0, 0);

    gl.uniform2f(locations.resolution, width, height);
    gl.uniform2f(locations.thresholdSize, this.thresholdMap.width, this.thresholdMap.height);
    gl.uniform4fv(locations.darkColor, this.darkColor);
    gl.uniform4fv(locations.lightColor, this.lightColor);

    gl.activeTexture(gl.TEXTURE0);
    uploadTexture(mediaTexture, this.media);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.threshold);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    this.ctx.clearRect(0, 0, width, height);
    this.ctx.drawImage(sharedCanvas, 0, sharedCanvas.height - height, width, height, 0, 0, width, height);
  }

  sync() {
    if (!this.media) return;
    if (this.isVideo() && this.intersecting) {
      this.media.play().catch(() => {});
      this.start();
    } else {
      if (this.isVideo()) this.media.pause();
      this.stop();
    }
  }

  start() {
    if (this.frame != null) return;
    const video = this.media;
    const tick = () => {
      this.frame = video.requestVideoFrameCallback(tick);
      this.draw();
    };
    this.frame = video.requestVideoFrameCallback(tick);
    this.frameVideo = video;
  }

  stop() {
    if (this.frame == null) return;
    this.frameVideo.cancelVideoFrameCallback(this.frame);
    this.frame = null;
  }

  initObserver() {
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        this.intersecting = entry.isIntersecting;
        if (entry.isIntersecting && !this.initialized) {
          this.initialized = true;
          this.draw();
        }
        this.sync();
      });
    });
    this.observer.observe(this);
  }

  destroyObserver() {
    if (this.observer?.unobserve) this.observer.unobserve(this);
  }
}

customElements.define("dither-dither", DitherDither);
export default DitherDither;
