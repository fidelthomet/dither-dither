import vs from "./dither.vert?raw";
import fs from "./dither.frag?raw";
import thresholdMap from "./BlueNoise.png";

class DitherDither extends HTMLElement {
  constructor() {
    super();
    this.init();
  }
  async init() {
    const crossOrigin = this.getAttribute("cross-origin");
    const shadowMode = this.getAttribute("shadow-mode") ?? "closed";
    const mediaSrc = this.getAttribute("src");
    const isVideo =
      this.getAttribute("type") === "video" ||
      ["mp4", "webm", "ogg"].includes(mediaSrc.match(/[^.]+$/)[0]);
    const thresholdSrc = this.getAttribute("threshold-map") ?? thresholdMap;
    const root = this.attachShadow({ mode: shadowMode });

    const loadingMedia = loadMedia(mediaSrc, crossOrigin, isVideo);
    const loadingThreshold = loadMedia(thresholdSrc, crossOrigin);

    const { media, threshold } = await Promise.all([loadingMedia, loadingThreshold]).then(
      (res) => ({
        media: res[0],
        threshold: res[1],
      })
    );

    const width = media.videoWidth ?? media.width;
    const height = media.videoHeight ?? media.height;

    const canvas = document.createElement("canvas");
    canvas.style = "display: block; image-rendering: pixelated;";
    canvas.width = width;
    canvas.height = height;

    root.appendChild(canvas);
    const gl = canvas.getContext("webgl");

    const program = createProgram(gl, vs, fs);
    gl.useProgram(program);

    const mediaTexture = createTexture(gl, media);
    const thresholdTexture = createTexture(gl, threshold);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
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
    gl.uniform2f(resolutionThresholdLocation, threshold.width, threshold.height);

    gl.uniform1i(imageLocation, 0);
    gl.uniform1i(thresholdLocation, 1);

    function loadMedia(url, crossOrigin, isVideo) {
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

    function render() {
      if (isVideo) {
        updateTexture(gl, mediaTexture, media);
        requestAnimationFrame(render);
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
    }
    render();
  }
}

customElements.define("dither-dither", DitherDither);
export default DitherDither;
