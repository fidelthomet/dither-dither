const stage = document.getElementById("stage");
const scrollHint = document.getElementById("scrollHint");

const COLUMNS = [...document.querySelectorAll(".video")].map((media) => ({
  media,
  dither: media.querySelector("dither-dither"),
  dark: media.dataset.dark.split(",").map(Number),
  light: media.dataset.light.split(",").map(Number),
}));

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

const mix = (a, b, t) =>
  `rgb(${a.map((c, i) => Math.round(c + (b[i] - c) * t)).join(", ")})`;

function update() {
  const rect = stage.getBoundingClientRect();
  const progress = clamp(-rect.top / (rect.height - window.innerHeight), 0, 1);

  const maxSize = Math.min(window.innerWidth * 0.28, window.innerHeight * 0.5);
  const size = Math.round(50 + (maxSize - 50) * progress);

  // duotone intensity
  const duotone = clamp(
    Math.min((progress - 0.2) / 0.25, (1 - progress) / 0.25),
    0,
    1,
  );

  for (const { media, dither, dark, light } of COLUMNS) {
    media.style.width = media.style.height = `${size}px`;
    dither.setAttribute("width", size);
    dither.setAttribute("dark", mix([0, 0, 0], dark, duotone));
    dither.setAttribute("light", mix([255, 255, 255], light, duotone));
  }

  scrollHint.style.opacity = progress > 0 ? 0 : 1;
}

let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    update();
  });
}

window.addEventListener("scroll", onScroll, { passive: true });
window.addEventListener("resize", onScroll);
update();
