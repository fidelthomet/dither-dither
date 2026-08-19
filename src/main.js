import vs from "./dither.vert?raw";
import fs from "./dither.frag?raw";
import thresholdMap from "./BlueNoise.png";

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (success) {
    return shader;
  }
  console.log(gl.getShaderInfoLog(shader));
  gl.deleteShader(shader);
}

function createProgram(gl, vs, fs) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vs);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fs);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  const success = gl.getProgramParameter(program, gl.LINK_STATUS);
  if (success) {
    return program;
  }
  console.log(gl.getProgramInfoLog(program));
  gl.deleteProgram(program);
}

function createTexture(gl, { nearest } = {}) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, nearest ? gl.NEAREST : gl.LINEAR);
  return texture;
}

function parseColor(colorString) {
  if (colorString.startsWith("#")) {
    let hex = colorString.slice(1);
    if (hex.length === 3) {
      hex = hex.split("").map(c => c + c).join("");
    }
    const bigint = parseInt(hex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return [r / 255, g / 255, b / 255];
  }

  if (colorString.includes(",")) {
    return colorString.split(",").map(Number);
  }
  return [0.0, 0.0, 0.0];
}

class DitherRenderer {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.gl = this.canvas.getContext("webgl", { preserveDrawingBuffer: true });
    this.program = null;
    this.positionBuffer = null;
    this.texcoordBuffer = null;
    this.mediaTexture = null;
    this.thresholdTexture = null;
    this.locations = {};

    if (this.gl) this.init();

    this.canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
    });
    this.canvas.addEventListener("webglcontextrestored", () => {
      this.init();
    });
  }

  init() {
    const gl = this.gl;
    this.program = createProgram(gl, vs, fs);
    gl.useProgram(this.program);

    this.positionBuffer = gl.createBuffer();
    this.texcoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texcoordBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        0.0, 0.0,
        1.0, 0.0,
        0.0, 1.0,
        0.0, 1.0,
        1.0, 0.0,
        1.0, 1.0
      ]),
      gl.STATIC_DRAW
    );

    this.mediaTexture = createTexture(gl);
    this.thresholdTexture = createTexture(gl, { nearest: true });

    this.locations = {
      position: gl.getAttribLocation(this.program, "a_position"),
      texcoord: gl.getAttribLocation(this.program, "a_texCoord"),
      resolution: gl.getUniformLocation(this.program, "u_resolution"),
      image: gl.getUniformLocation(this.program, "image"),
      threshold: gl.getUniformLocation(this.program, "threshold"),
      resolutionThreshold: gl.getUniformLocation(this.program, "resolution"),
      darkColor: gl.getUniformLocation(this.program, "darkColor"),
      lightColor: gl.getUniformLocation(this.program, "lightColor"),
    };
  }

  render({ media, threshold, width, height, renderWidth, renderHeight, darkColor, lightColor, destCtx }) {
    const gl = this.gl;
    if (!gl || gl.isContextLost() || !width || !height) return false;

    this.canvas.width = width;
    this.canvas.height = height;
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);

    const xOffset = (renderWidth - width) / 2.0;
    const yOffset = (renderHeight - height) / 2.0;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -xOffset, -yOffset,
        renderWidth - xOffset, -yOffset,
        -xOffset, renderHeight - yOffset,
        -xOffset, renderHeight - yOffset,
        renderWidth - xOffset, -yOffset,
        renderWidth - xOffset, renderHeight - yOffset
      ]),
      gl.DYNAMIC_DRAW
    );
    gl.enableVertexAttribArray(this.locations.position);
    gl.vertexAttribPointer(this.locations.position, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.texcoordBuffer);
    gl.enableVertexAttribArray(this.locations.texcoord);
    gl.vertexAttribPointer(this.locations.texcoord, 2, gl.FLOAT, false, 0, 0);

    gl.uniform2f(this.locations.resolution, width, height);
    gl.uniform2f(this.locations.resolutionThreshold, threshold.width, threshold.height);
    gl.uniform3fv(this.locations.darkColor, darkColor);
    gl.uniform3fv(this.locations.lightColor, lightColor);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.mediaTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, media);
    gl.uniform1i(this.locations.image, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.thresholdTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, threshold);
    gl.uniform1i(this.locations.threshold, 1);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    destCtx.clearRect(0, 0, width, height);
    destCtx.drawImage(this.canvas, 0, 0);
    return true;
  }
}

const renderer = typeof window !== "undefined" ? new DitherRenderer() : null;

class DitherDither extends HTMLElement {
  constructor() {
    super();
    this.root = null;
    this.canvas = null;
    this.ctx2d = null;
    this.media = null;
    this.threshold = null;
    this.initialized = null;
    this.observer = null;
    this.width = 0;
    this.height = 0;
    this.restore = true;
    this.intersecting = false;
    this.rafId = null;
  }
  static observedAttributes = ["src", "threshold-map", "dark", "light"];

  async attributeChangedCallback(name, oldValue, newValue) {
    if (!this.initialized) return;
    switch (name) {
      case "src":
        this.mediaSrc = newValue;
        await this.initMedia();
        this.img?.remove?.();
        if (!this.canvas) {
          this.initCanvas();
        } else this.resizeCanvas();
        this.initRender();
        break;
      case "threshold-map":
        this.thresholdSrc = newValue;
        await this.initThreshold();
        this.img?.remove?.();
        if (!this.canvas) {
          this.initCanvas();
        }
        this.initRender();
        break;
      case "dark":
      case "light":
        if (this.initialized) {
          this.draw();
        }
        break;
      default:
        break;
    }
  }

  async connectedCallback() {
    this.crossOrigin = this.getAttribute("cross-origin");
    this.mediaSrc = this.getAttribute("src");
    this.thresholdSrc = this.getAttribute("threshold-map");
    this.immediate = this.getAttribute("immediate") != null;
    this.restore = this.getAttribute("restore") !== "false";

    this.root = this.attachShadow({ mode: "closed" });
    this.initCanvas();
    await Promise.all([this.initMedia(), this.initThreshold()]);
    this.resizeCanvas();

    this.initObserver();
    if (this.immediate) {
      this.initRender();
    }
  }

  disconnectedCallback() {
    this.destroyObserver();
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  initCanvas() {
    this.canvas = document.createElement("canvas");
    this.canvas.style = "display: block; image-rendering: pixelated;";
    this.root.appendChild(this.canvas);

    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", this.getAttribute("alt"));

    this.ctx2d = this.canvas.getContext("2d");

    this.resizeCanvas();
  }

  loadMedia(url, isVideo) {
    return new Promise((resolve) => {
      const el = isVideo ? document.createElement("video") : new Image();
      el.src = url;
      el.crossOrigin = this.crossOrigin;
      if (isVideo) {
        el.playsInline = true;
        el.muted = true;
        el.loop = true;
        el.play().catch(() => {});
        el.addEventListener("playing", () => resolve(el), { once: true });
      } else {
        el.addEventListener("load", () => resolve(el), { once: true });
      }
    });
  }
  isVideo() {
    return (
      this.getAttribute("type") === "video" ||
      (this.getAttribute("type") == null &&
        ["mp4", "webm", "ogg"].includes(this.mediaSrc.match(/[^.]+$/)[0]))
    );
  }
  isFrozen() {
    const freeze = this.getAttribute("freeze");
    if (freeze != null) return freeze !== "false";
    return !this.isVideo();
  }
  async initMedia() {
    this.media = await this.loadMedia(this.mediaSrc, this.isVideo());
    this.width = this.media.videoWidth ?? this.media.width;
    this.height = this.media.videoHeight ?? this.media.height;
  }
  async initThreshold() {
    this.threshold = await this.loadMedia(this.thresholdSrc ?? thresholdMap);
  }
  async resizeCanvas() {
    const customWidth = this.getAttribute("width") ? parseInt(this.getAttribute("width")) : null;
    const customHeight = this.getAttribute("height") ? parseInt(this.getAttribute("height")) : null;
    const ObjectFitType = this.getAttribute("object-fit") || "contain";

    const mediaObjectFit = this.width / this.height;
    let canvasWidth, canvasHeight;

    if (customWidth && customHeight) {
      canvasWidth = customWidth;
      canvasHeight = customHeight;
    }
    else if (customWidth) {
      canvasWidth = customWidth;
      canvasHeight = customWidth / mediaObjectFit;
    }
    else if (customHeight) {
      canvasHeight = customHeight;
      canvasWidth = customHeight * mediaObjectFit;
    }
    else {
      canvasWidth = this.width;
      canvasHeight = this.height;
    }

    let renderWidth, renderHeight;
    if (ObjectFitType === "contain") {
      const scale = Math.min(canvasWidth / this.width, canvasHeight / this.height);
      renderWidth = this.width * scale;
      renderHeight = this.height * scale;
    } else if (ObjectFitType === "cover") {
      const scale = Math.max(canvasWidth / this.width, canvasHeight / this.height);
      renderWidth = this.width * scale;
      renderHeight = this.height * scale;
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
    if (!renderer || !this.canvas || !this.ctx2d || !this.media || !this.threshold) return;

    const darkColor = this.getAttribute("dark")
      ? parseColor(this.getAttribute("dark"))
      : [0.0, 0.0, 0.0];
    const lightColor = this.getAttribute("light")
      ? parseColor(this.getAttribute("light"))
      : [1.0, 1.0, 1.0];

    renderer.render({
      media: this.media,
      threshold: this.threshold,
      width: this.canvas.width,
      height: this.canvas.height,
      renderWidth: this.renderWidth,
      renderHeight: this.renderHeight,
      darkColor,
      lightColor,
      destCtx: this.ctx2d,
    });
  }

  restoreContext() {
    if (!renderer?.gl?.isContextLost()) return;
    this.draw();
  }

  removeCanvas() {
    this.canvas.remove();
    this.canvas = null;
    this.ctx2d = null;
  }

  async initRender() {
    if (!renderer) return;

    const loop = () => {
      this.draw();
      if (this.isVideo()) {
        this.rafId = requestAnimationFrame(loop);
      }
    };
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    loop();

    if (this.isFrozen()) {
      this.freezeCanvas();
    }

    this.initialized = true;
  }

  freezeCanvas() {
    this.canvas.toBlob((blob) => {
      this.img = document.createElement("img");
      this.img.style = "display: block; image-rendering: pixelated;";
      const url = URL.createObjectURL(blob);

      this.img.onload = () => {
        URL.revokeObjectURL(url);
      };

      this.img.src = url;
      this.removeCanvas();
      this.root.appendChild(this.img);
    });
  }

  initObserver() {
    if (this.immediate || !this.restore) return;
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        this.intersecting = entry.isIntersecting;
        if (entry.isIntersecting) {
          if (!this.immediate && !this.initialized) {
            this.initRender();
          } else if (this.restore && !this.isFrozen()) {
            this.restoreContext();
          }
        }
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
