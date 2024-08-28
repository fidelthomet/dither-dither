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
  }
  static observedAttributes = ["src", "thresholdSrc"];
  async attributeChangedCallback(name, oldValue, newValue) {
    if (!this.initialized) return;
    switch (name) {
      case "src":
        this.mediaSrc = newValue;
        await this.initMedia();
        this.resizeCanvas();
        this.initGL();
        break;
      case "thresholdSrc":
        this.thresholdSrc = newValue;
        await this.initThreshold();
        this.initGL();
        break;
      // case "lazy":
      //   if (newValue != null && newValue !== false) {
      //     this.initObserver();
      //   } else {
      //     this.destroyObserver();
      //   }
      //   this.initGL();
      //   break;
      default:
        break;
    }
  }

  async connectedCallback() {
    this.crossOrigin = this.getAttribute("cross-origin");
    this.mediaSrc = this.getAttribute("src");
    this.immediate = this.getAttribute("immediate");

    this.root = this.attachShadow({ mode: "closed" });
    this.initCanvas();
    await Promise.all([this.initMedia(), this.initThreshold()]);
    this.resizeCanvas();

    if (this.immediate) {
      this.initGL();
    } else {
      this.initObserver();
    }
  }

  initCanvas() {
    // if (this.canvas) this.resetCanvas();
    this.canvas = document.createElement("canvas");
    this.canvas.style = "display: block; image-rendering: pixelated;";
    this.root.appendChild(this.canvas);

    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", this.getAttribute("alt"));

    this.resizeCanvas();

    this.canvas.addEventListener("webglcontextlost", (e) => {
      console.log("losing context");
      e.preventDefault();
    });
    this.canvas.addEventListener("webglcontextrestored", (e) => {
      console.log("attempting restore");
    });
  }
  resetCanvas() {
    if (this.canvas) {
      this.canvas.remove();
      this.initCanvas();
    }
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
  async initMedia() {
    this.media = await this.loadMedia(this.mediaSrc, this.isVideo());

    this.width = this.media.videoWidth ?? this.media.width;
    this.height = this.media.videoHeight ?? this.media.height;
  }
  async initThreshold() {
    this.threshold = await this.loadMedia(this.thresholdSrc ?? thresholdMap);
  }
  async resizeCanvas() {
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    console.log(this.canvas.width, this.width, this.canvas.height, this.height);
  }
  async initGL() {
    // const root = this.attachShadow({ mode: "closed" });

    const gl = (this.gl = this.canvas.getContext("webgl"));

    // this.gl?.getExtension("WEBGL_lose_context").restoreContext();

    // console.log(this.canvas.getContext("webgl"));

    const program = createProgram(gl, vs, fs);
    gl.useProgram(program);

    this.mediaTexture = createTexture(gl, this.media);
    this.thresholdTexture = createTexture(gl, this.threshold);

    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        0,
        0,
        this.width,
        0,
        0,
        this.height,
        0,
        this.height,
        this.width,
        0,
        this.width,
        this.height,
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
        updateTexture(gl, this.mediaTexture, this.media);
        requestAnimationFrame(this.render);
      }

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);
      gl.vertexAttribPointer(texcoordLocation, 2, gl.FLOAT, false, 0, 0);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.mediaTexture);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.thresholdTexture);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    this.render();
    this.initialized = true;
  }

  initObserver() {
    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          if (!this.immediate && !this.initialized) {
            this.initGL();
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
