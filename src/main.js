import vs from "./dither.vert?raw";
import fs from "./dither.frag?raw";
import thresholdMap from "./BlueNoise.png";

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
  static observedAttributes = ["src", "threshold-map"];
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
        this.initGL();
        break;
      case "threshold-map":
        this.thresholdSrc = newValue;
        await this.initThreshold();
        this.img?.remove?.();
        if (!this.canvas) {
          this.initCanvas();
        }
        this.initGL();
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
      this.initGL();
    }
  }

  initCanvas() {
    this.canvas = document.createElement("canvas");
    this.canvas.style = "display: block; image-rendering: pixelated;";
    this.root.appendChild(this.canvas);

    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", this.getAttribute("alt"));

    this.resizeCanvas();

    // if (this.restore) {
    //   this.canvas.addEventListener("webglcontextlost", (e) => {
    //     e.preventDefault();
    //     if (this.intersecting) {
    //       this.restoreContext();
    //     }
    //   });
    //   this.canvas.addEventListener("webglcontextrestored", (e) => {
    //     if (this.gl.isContextLost()) this.restoreContext();
    //   });
    // }
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
    const customWidth = this.getAttribute('width') ? parseInt(this.getAttribute('width')) : this.clientWidth;
    const customHeight = this.getAttribute('height') ? parseInt(this.getAttribute('height')) : this.clientHeight;

    const mediaAspectRatio = this.width / this.height;
    const canvasAspectRatio = customWidth / customHeight;

    let renderWidth, renderHeight;

    if (mediaAspectRatio > canvasAspectRatio) {
      renderWidth = customHeight * mediaAspectRatio;
      renderHeight = customHeight;
    } else {
      renderWidth = customWidth;
      renderHeight = customWidth / mediaAspectRatio;
    }

    this.canvas.width = customWidth;
    this.canvas.height = customHeight;

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
    this.initGL();
  }
  removeCanvas() {
    this.canvas.remove();
    this.canvas = null;
  }
  async initGL() {
    const gl = (this.gl = this.canvas.getContext("webgl"));

    const program = createProgram(gl, vs, fs);
    gl.useProgram(program);

    const mediaTexture = createTexture(gl, this.media);
    const thresholdTexture = createTexture(gl, this.threshold);
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    const xOffset = (this.renderWidth - this.canvas.width) / 2;
    const yOffset = (this.renderHeight - this.canvas.height) / 2;

    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -xOffset, -yOffset,
        this.renderWidth - xOffset, -yOffset,
        -xOffset, this.renderHeight - yOffset,
        -xOffset, this.renderHeight - yOffset,
        this.renderWidth - xOffset, -yOffset,
        this.renderWidth - xOffset, this.renderHeight - yOffset
      ]),
      gl.STATIC_DRAW
    );

    const texcoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0]),
      gl.STATIC_DRAW
    );

    const positionLocation = gl.getAttribLocation(program, "a_position");
    const texcoordLocation = gl.getAttribLocation(program, "a_texCoord");
    const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
    const imageLocation = gl.getUniformLocation(program, "image");
    const thresholdLocation = gl.getUniformLocation(program, "threshold");
    const resolutionThresholdLocation = gl.getUniformLocation(program, "resolution");

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.useProgram(program);
    gl.enableVertexAttribArray(positionLocation);
    gl.enableVertexAttribArray(texcoordLocation);

    gl.uniform2f(resolutionLocation, gl.canvas.width, gl.canvas.height);
    gl.uniform2f(resolutionThresholdLocation, this.threshold.width, this.threshold.height);

    gl.uniform1i(imageLocation, 0);
    gl.uniform1i(thresholdLocation, 1);

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

    function createTexture(gl, image) {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);

      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

      return texture;
    }

    function updateTexture(gl, texture, image) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    }

    this.render = () => {
      if (this.isVideo()) {
        updateTexture(gl, mediaTexture, this.media);
        requestAnimationFrame(this.render);
      }

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);
      gl.vertexAttribPointer(texcoordLocation, 2, gl.FLOAT, false, 0, 0);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, mediaTexture);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, thresholdTexture);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    this.render();

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
      this.gl.getExtension("WEBGL_lose_context").loseContext();
    });
  }

  initObserver() {
    if (this.immediate || !this.restore) return;
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        this.intersecting = entry.isIntersecting;
        if (entry.isIntersecting) {
          if (!this.immediate && !this.initialized) {
            this.initGL();
          }
          if (this.restore && !this.isFrozen() && this.gl.isContextLost()) {
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
