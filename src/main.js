import vs from "./dither.vert?raw";
import fs from "./dither.frag?raw";
import thresholdMap from "./BlueNoise.png";

const sharedCanvas = new OffscreenCanvas(1, 1);
const gl = sharedCanvas.getContext("webgl2");

let locations, texcoordBuffer, positionBuffer, mediaTexture;
const thresholdTextures = new Map();

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

function uploadTexture(gl, texture, image) {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
}

function initShared() {
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
  thresholdTextures.clear();

  gl.enableVertexAttribArray(locations.position);
  gl.enableVertexAttribArray(locations.texcoord);
  gl.uniform1i(locations.image, 0);
  gl.uniform1i(locations.threshold, 1);
}

initShared();

sharedCanvas.addEventListener("webglcontextlost", (e) => e.preventDefault());
sharedCanvas.addEventListener("webglcontextrestored", initShared);

function thresholdTexture(el) {
  const key = el.thresholdSrc ?? thresholdMap;
  if (!thresholdTextures.has(key)) {
    const texture = createTexture(gl);
    uploadTexture(gl, texture, el.threshold);
    thresholdTextures.set(key, texture);
  }
  return thresholdTextures.get(key);
}

function initGL(el) {
  el.initialized = true;
  el.draw();
}

class DitherDither extends HTMLElement {
  constructor() {
    super();
    this.root = null;
    this.canvas = null;
    this.media = null;
    this.threshold = null;
    this.initialized = null;
    this.observer = null;
    this.width = 0;
    this.height = 0;
    this.restore = true;
    this.intersecting = false;
    this.lastRestore = 0;
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
        initGL(this);
        break;
      case "threshold-map":
        this.thresholdSrc = newValue;
        await this.initThreshold();
        this.img?.remove?.();
        if (!this.canvas) {
          this.initCanvas();
        }
        initGL(this);
        break;
      case "dark":
      case "light":
        if (this.initialized) {
          initGL(this);
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
      initGL(this);
    }
  }

  initCanvas() {
    this.canvas = document.createElement("canvas");
    this.canvas.style = "display: block; image-rendering: pixelated;";
    this.root.appendChild(this.canvas);

    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", this.getAttribute("alt"));

    this.ctx = this.canvas.getContext("2d");
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
        el.play();
        el.addEventListener("playing", () => resolve(el), { once: true });
      } else {
        el.addEventListener("load", () => resolve(el), { once: true });
      }
    });
  }
  isVideo() {
    return (
      this.getAttribute("type") === "video" ||
      (this.getAttribute("type") == null && ["mp4", "webm", "ogg"].includes(this.mediaSrc.match(/[^.]+$/)[0]))
    );
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
    } else if (customWidth) {
      canvasWidth = customWidth;
      canvasHeight = customWidth / mediaObjectFit;
    } else if (customHeight) {
      canvasHeight = customHeight;
      canvasWidth = customHeight * mediaObjectFit;
    } else {
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

  restoreContext() {
    if (gl.isContextLost()) return;
    const time = new Date().getTime();
    if (this.lastRestore + 750 > time) return;
    this.lastRestore = time;
    this.removeCanvas();
    this.initCanvas();
    initGL(this);
  }
  removeCanvas() {
    this.canvas.remove();
    this.canvas = null;
  }

  draw() {
    if (this.isVideo()) requestAnimationFrame(() => this.draw());
    if (gl.isContextLost()) return;

    const { width, height } = this.canvas;
    sharedCanvas.width = Math.max(sharedCanvas.width, width);
    sharedCanvas.height = Math.max(sharedCanvas.height, height);

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
    gl.uniform2f(locations.thresholdSize, this.threshold.width, this.threshold.height);
    gl.uniform3fv(locations.darkColor, [0, 0, 0]);
    gl.uniform3fv(locations.lightColor, [1, 1, 1]);

    gl.activeTexture(gl.TEXTURE0);
    uploadTexture(gl, mediaTexture, this.media); // every draw, images included
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, thresholdTexture(this));

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    this.ctx.clearRect(0, 0, width, height);
    this.ctx.drawImage(sharedCanvas, 0, sharedCanvas.height - height, width, height, 0, 0, width, height);
  }

  initObserver() {
    if (this.immediate || !this.restore) return;
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        this.intersecting = entry.isIntersecting;
        if (entry.isIntersecting) {
          if (!this.immediate && !this.initialized) {
            initGL(this);
          }
          if (this.restore && gl.isContextLost()) {
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
