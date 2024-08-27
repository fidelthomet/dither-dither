import vs from "./dither.vert?raw";
import fs from "./dither.frag?raw";
import thresholdMap from "./BlueNoise.png";

class DitherDither extends HTMLElement {
  constructor() {
    super();
    this.canvas = undefined;
    this.media = undefined;
    this.threshold = undefined;
    this.initialized = undefined;
    this.gl = undefined;
  }
  static observedAttributes = ["src", "type", "thresholdSrc"];
  async attributeChangedCallback(name, oldValue, newValue) {
    if (!this.initialized) return;
    switch (name) {
      case "src":
      case "type":
      case "thresholdSrc":
        this.init();
        break;

      default:
        break;
    }
  }
  connectedCallback() {
    const root = this.attachShadow({ mode: "closed" });
    this.canvas = document.createElement("canvas");
    this.canvas.style = "display: block; image-rendering: pixelated;";
    root.appendChild(this.canvas);
    this.init();
  }
  async init() {
    this.loadMedia = (url, crossOrigin, isVideo) => {
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
    };

    const crossOrigin = this.getAttribute("cross-origin");
    const mediaSrc = this.getAttribute("src");
    const isVideo =
      this.getAttribute("type") === "video" ||
      (this.getAttribute("type") == null &&
        ["mp4", "webm", "ogg"].includes(mediaSrc.match(/[^.]+$/)[0]));

    const thresholdSrc = this.getAttribute("threshold-map") ?? thresholdMap;
    // const root = this.attachShadow({ mode: "closed" });

    const loadingMedia = this.loadMedia(mediaSrc, crossOrigin, isVideo);
    const loadingThreshold = this.loadMedia(thresholdSrc, crossOrigin);

    this.canvas.setAttribute("role", isVideo ? "video" : "image");
    this.canvas.setAttribute("aria-label", this.getAttribute("alt"));

    await Promise.all([loadingMedia, loadingThreshold]).then((res) => {
      this.media = res[0];
      this.threshold = res[1];
    });

    const width = this.media.videoWidth ?? this.media.width;
    const height = this.media.videoHeight ?? this.media.height;

    this.canvas.width = width;
    this.canvas.height = height;

    const gl = (this.gl = this.canvas.getContext("webgl"));

    const program = createProgram(gl, vs, fs);
    gl.useProgram(program);

    this.mediaTexture = createTexture(gl, this.media);
    this.thresholdTexture = createTexture(gl, this.threshold);

    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, width, 0, 0, height, 0, height, width, 0, width, height]),
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
      if (isVideo) {
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

      if (!isVideo) {
        // console.log("lose context");
        // gl.getExtension("WEBGL_lose_context").loseContext();
      }
    };
    this.render();
    this.initialized = true;
  }
}

customElements.define("dither-dither", DitherDither);
export default DitherDither;
