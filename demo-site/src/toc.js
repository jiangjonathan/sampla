const SELECTORS = [
  "#sec-intro",
  "#sec-capture",
  "#sec-deck",
  "#sec-wave",
  "#sec-library",
  "#sec-jam",
  "#sec-load",
  "#sec-tokens",
];

export function initToc() {
  const links = [...document.querySelectorAll(".toc-link")];
  if (!links.length) return;

  const sections = SELECTORS.map((sel) => document.querySelector(sel)).filter(Boolean);

  const io = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      const id = visible[0]?.target.id;
      if (!id) return;
      links.forEach((link) => {
        const active = link.getAttribute("href") === `#${id}`;
        link.classList.toggle("active", active);
        if (active) link.setAttribute("aria-current", "true");
        else link.removeAttribute("aria-current");
      });
    },
    { rootMargin: "-20% 0px -65% 0px", threshold: [0, 0.2, 0.6, 1] },
  );

  sections.forEach((section) => io.observe(section));
  links[0]?.classList.add("active");
}
