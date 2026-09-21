import vs from "./dither.vert?raw";
import fs from "./dither.frag?raw";
import thresholdMap from "./BlueNoise.png";

let locations;

function compile(gl, type, source) {
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

function createProgram(gl, vs, fs) {
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(log);
  }

  gl.useProgram(program);
  return program;
}

function createTexture(gl) {
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

function initGL(el) {
  const gl = (el.gl = el.canvas.getContext("webgl2"));
  // if (!gl) return;

  const program = createProgram(gl, vs, fs);

  const mediaTexture = createTexture(gl);
  uploadTexture(gl, mediaTexture, el.media);
  const thresholdTexture = createTexture(gl);
  uploadTexture(gl, thresholdTexture, el.threshold);

  const positionBuffer = gl.createBuffer();

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  const xOffset = (el.renderWidth - el.canvas.width) / 2.0;
  const yOffset = (el.renderHeight - el.canvas.height) / 2.0;
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -xOffset,
      -yOffset,
      el.renderWidth - xOffset,
      -yOffset,
      -xOffset,
      el.renderHeight - yOffset,
      -xOffset,
      el.renderHeight - yOffset,
      el.renderWidth - xOffset,
      -yOffset,
      el.renderWidth - xOffset,
      el.renderHeight - yOffset,
    ]),
    gl.STATIC_DRAW,
  );

  const texcoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);

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

  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.useProgram(program);
  gl.enableVertexAttribArray(locations.position);
  gl.enableVertexAttribArray(locations.texcoord);

  gl.uniform2f(locations.resolution, gl.canvas.width, gl.canvas.height);
  gl.uniform2f(locations.thresholdSize, el.threshold.width, el.threshold.height);

  gl.uniform1i(locations.image, 0);
  gl.uniform1i(locations.threshold, 1);
  gl.uniform3fv(locations.darkColor, [0.0, 0.0, 0.0]);
  gl.uniform3fv(locations.lightColor, [1.0, 1.0, 1.0]);

  el.draw(gl, mediaTexture, thresholdTexture, positionBuffer, texcoordBuffer);

  el.initialized = true;
}

class DitherDither extends HTMLElement {
  constructor() {
    super();
    this.root = null;
    this.canvas = null;
    this.media = null;
    this.threshold = null;
    this.initialized = null;
    this.gl = null;
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
    if (!this.gl.isContextLost()) return;
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

  draw(gl, mediaTexture, thresholdTexture, positionBuffer, texcoordBuffer) {
    if (this.isVideo()) {
      uploadTexture(gl, mediaTexture, this.media);
      requestAnimationFrame(() => this.draw(gl, mediaTexture, thresholdTexture, positionBuffer, texcoordBuffer));
    }

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(locations.position, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);
    gl.vertexAttribPointer(locations.texcoord, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, mediaTexture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, thresholdTexture);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
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
          if (this.restore && this.gl.isContextLost()) {
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
