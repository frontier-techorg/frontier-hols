/**
 * Deterministic cover styling for lecture/course cards.
 * Assets live under /assets/lectures:
 *   lecture_book/{slug}-light|dark.png  — book covers (theme-specific)
 *   lecture_vial/{slug}.png             — transparent product vials (shared)
 *   mode/light|dark.png                 — studio backgrounds behind vials
 */

/** Theme studio backgrounds for product-vial covers. */
export const MODE_PHOTO_LIGHT = "/assets/lectures/mode/light.png";
export const MODE_PHOTO_DARK = "/assets/lectures/mode/dark.png";

/** @deprecated Prefer MODE_PHOTO_LIGHT / MODE_PHOTO_DARK */
export const VIAL_PHOTO_LIGHT = MODE_PHOTO_LIGHT;
/** @deprecated Prefer MODE_PHOTO_LIGHT / MODE_PHOTO_DARK */
export const VIAL_PHOTO_DARK = MODE_PHOTO_DARK;
/** @deprecated Use MODE_PHOTO_LIGHT */
export const VIAL_PHOTO_SRC = MODE_PHOTO_LIGHT;

export type CourseCoverPhotos = {
  light: string;
  dark: string;
};

export type CourseCoverLayout = "product" | "book";

export type ResolvedCourseCover = {
  photos: CourseCoverPhotos;
  /** Transparent vial overlay for product covers (same file in light + dark). */
  vialSrc?: string;
  isCustom: boolean;
  coverId?: string;
  /** CSS object-position for full-bleed book art. */
  objectPosition?: string;
  layout?: CourseCoverLayout;
  /** Custom art already includes the course title — suppress UI title overlays. */
  titleInArt?: boolean;
};

/** Strip Peptide University prefix for display + matching. */
export function tidyCoverTitle(title: string): string {
  return title.replace(/^Peptide University:\s*/i, "").trim() || title;
}

/** Peptide name for vial label overlay — no dose / measurement suffix. */
export function coverPeptideName(title: string): string {
  return tidyCoverTitle(title)
    .replace(/\s*[-–—]\s*\d+(?:\.\d+)?\s*(?:mg|mcg|µg|ug|iu|ml|g)\b/gi, "")
    .replace(/\s+\d+(?:\.\d+)?\s*(?:mg|mcg|µg|ug|iu|ml|g)\b/gi, "")
    .trim();
}

function slugifyCoverTitle(title: string): string {
  return tidyCoverTitle(title)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u2018\u2019\u201B\u2032\u0060\u00B4']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

type BookCoverEntry = {
  id: string;
  bookFile: string;
  slugs?: string[];
  keywords?: string[][];
  courseIds?: string[];
  objectPosition?: string;
};

/** Book / manual covers — light + dark theme art in lecture_book/. */
const BOOK_COVER_ENTRIES: BookCoverEntry[] = [
  {
    id: "peptide-dosing-guide",
    bookFile: "peptide-dosing-guide",
    slugs: ["peptide-dosing-guide", "dosing-guide"],
    keywords: [["peptide", "dosing", "guide"]],
    objectPosition: "82% 46%",
  },
  {
    id: "frontier-biomed-sales-training",
    bookFile: "alpha-biomed-sales-training",
    courseIds: ["18e729a6-7061-48cf-9d51-a04ffa77124a"],
    slugs: ["frontier-biomed-sales-training", "alpha-biomed-sales-training"],
    keywords: [
      ["frontier", "biomed", "sales", "training"],
      ["alpha", "biomed", "sales", "training"],
      ["biomed", "sales", "training"],
    ],
    objectPosition: "82% 46%",
  },
  {
    id: "frontier-biomed-sales-dos-and-donts",
    bookFile: "alpha-biomed-sales-dos-and-donts",
    courseIds: ["0eed2662-8a08-443b-8146-357b3f51232e"],
    slugs: ["frontier-biomed-sales-dos-and-donts", "alpha-biomed-sales-dos-and-donts"],
    keywords: [
      ["frontier", "biomed", "sales", "dos"],
      ["frontier", "biomed", "sales", "dont"],
      ["biomed", "sales", "dos"],
      ["biomed", "sales", "dont"],
    ],
    objectPosition: "68% 48%",
  },
  {
    id: "frontier-biomed-sales-faq",
    bookFile: "alpha-biomed-sales-faq",
    courseIds: ["d8868e43-43fc-426f-9ab2-9c26e72bc567"],
    slugs: ["frontier-biomed-sales-faq", "alpha-biomed-sales-faq"],
    keywords: [
      ["frontier", "biomed", "sales", "faq"],
      ["alpha", "biomed", "sales", "faq"],
      ["biomed", "sales", "faq"],
    ],
    objectPosition: "70% 48%",
  },
];

/**
 * Title-slug → vial filename (without .png) when slugify does not match the file.
 * Files live in /assets/lectures/lecture_vial/.
 */
const VIAL_SLUG_ALIASES: Record<string, string> = {
  epithalon: "epitalon",
  nad: "nad-plus",
  "nad-": "nad-plus",
  "fox04-dri": "foxo4-dri",
  "cjc-1295-n0-dac": "cjc-1295-no-dac",
  "cjc-1295-no-dac": "cjc-1295-no-dac",
  "melanotan-i-mt-1": "melanotan-i",
  "melanotan-ii-mt-ii": "melanotan-ii",
  "semaglutide-glp-1-s": "semaglutide",
  "retatrutide-glp-1-r": "retatrutide",
  "tirzepatide-glp-1-t": "tirzepatide",
  "n-acetyl-epitalon-amidate": "n-acetyl-epithalon-amidate",
  ovagen: "ovangen",
  "mgf-igf-1ec": "mgf-igf-1ec",
  mgf: "mgf-igf-1ec",
};

/** Known vial asset stems present under lecture_vial/. */
const VIAL_ASSET_SLUGS = new Set<string>([
  "5-amino-1mq",
  "aod-9604",
  "ara-290",
  "b7-33",
  "bacteriostatic-water",
  "bdnf",
  "bpc-157",
  "bronchogen",
  "cagrilintide",
  "cardiogen",
  "cartalax",
  "chonluten",
  "cjc-1295-no-dac",
  "cjc-1295-with-dac",
  "colostrum",
  "cortagen",
  "curcumin",
  "dihexa",
  "dsip",
  "epitalon",
  "follistatin-344",
  "foxo4-dri",
  "ghk-cu",
  "ghrp-2",
  "ghrp-6",
  "glp-1",
  "gonadorelin",
  "hcg",
  "hexarelin",
  "hgh",
  "hgh-fragment-176-191",
  "humanin",
  "igf-1-des",
  "igf-1-lr3",
  "ipamorelin",
  "kisspeptin-10",
  "kpv",
  "livagen",
  "ll-37",
  "mazdutide",
  "melanotan-i",
  "melanotan-ii",
  "mgf-igf-1ec",
  "mk-677",
  "mots-c",
  "n-acetyl-epithalon-amidate",
  "nad-plus",
  "ovangen",
  "oxytocin",
  "pancragen",
  "pe-22-28",
  "peg-mgf",
  "pinealon",
  "pnc-27",
  "pnc-28",
  "prostamax",
  "pt-141",
  "retatrutide",
  "selank",
  "semaglutide",
  "semax",
  "sermorelin",
  "slu-pp-332",
  "ss-31",
  "survodutide",
  "tb-500",
  "tesamorelin",
  "tesofensine",
  "thymagen",
  "thymalin",
  "thymosin-alpha-1",
  "thymulin",
  "tirzepatide",
  "trh-thyrotropin",
  "vesugen",
  "vilon",
  "vip",
]);

const MODE_PHOTOS: CourseCoverPhotos = {
  light: MODE_PHOTO_LIGHT,
  dark: MODE_PHOTO_DARK,
};

function bookPhotos(bookFile: string): CourseCoverPhotos {
  return {
    light: `/assets/lectures/lecture_book/${bookFile}-light.png`,
    dark: `/assets/lectures/lecture_book/${bookFile}-dark.png`,
  };
}

function vialAssetPath(slug: string): string {
  return `/assets/lectures/lecture_vial/${slug}.png`;
}

/** Lecture product photo for a peptide name, when that file exists. */
export function lectureVialSrc(title: string): string | null {
  const slug = resolveVialSlug(title);
  return slug ? vialAssetPath(slug) : null;
}

function matchesBookEntry(slug: string, normalizedTitle: string, entry: BookCoverEntry): boolean {
  if (entry.slugs?.some((alias) => slug === alias || slug.startsWith(`${alias}-`))) {
    return true;
  }
  if (entry.keywords?.some((group) => group.every((token) => normalizedTitle.includes(token)))) {
    return true;
  }
  return false;
}

function resolveVialSlug(title: string): string | undefined {
  const slug = slugifyCoverTitle(title);
  const candidates = [
    VIAL_SLUG_ALIASES[slug],
    slug,
    slug.replace(/-glp-1-[srt]$/, ""),
    slug.replace(/-mt-1$/, ""),
    slug.replace(/-mt-ii$/, ""),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (VIAL_ASSET_SLUGS.has(candidate)) return candidate;
  }
  return undefined;
}

function resolveBookCover(courseId: string, title?: string): ResolvedCourseCover | null {
  if (courseId) {
    for (const entry of BOOK_COVER_ENTRIES) {
      if (entry.courseIds?.includes(courseId)) {
        return {
          photos: bookPhotos(entry.bookFile),
          isCustom: true,
          coverId: entry.id,
          objectPosition: entry.objectPosition ?? "82% 46%",
          layout: "book",
          titleInArt: true,
        };
      }
    }
  }

  if (!title) return null;
  const slug = slugifyCoverTitle(title);
  const normalizedTitle = tidyCoverTitle(title).toLowerCase();
  for (const entry of BOOK_COVER_ENTRIES) {
    if (matchesBookEntry(slug, normalizedTitle, entry)) {
      return {
        photos: bookPhotos(entry.bookFile),
        isCustom: true,
        coverId: entry.id,
        objectPosition: entry.objectPosition ?? "82% 46%",
        layout: "book",
        titleInArt: true,
      };
    }
  }
  return null;
}

/** Nudge Magnific vial art right on the volume front cover so the left title column stays clear. */
export function shiftCoverObjectPositionForPanel(
  objectPosition: string,
  shiftPercent = 12,
): string {
  const match = objectPosition.match(/^([\d.]+)%\s+([\d.]+)%$/);
  if (!match) {
    return objectPosition;
  }

  const x = Math.min(parseFloat(match[1]) + shiftPercent, 72);
  return `${x}% ${match[2]}%`;
}

/** Resolve light/dark cover photos + optional transparent vial overlay. */
export function resolveCourseCover(courseId: string, title?: string): ResolvedCourseCover {
  const book = resolveBookCover(courseId, title);
  if (book) return book;

  if (!title) {
    return { photos: MODE_PHOTOS, isCustom: false, layout: "product" };
  }

  const vialSlug = resolveVialSlug(title);
  if (vialSlug) {
    return {
      photos: MODE_PHOTOS,
      vialSrc: vialAssetPath(vialSlug),
      isCustom: true,
      coverId: vialSlug,
      objectPosition: "50% 50%",
      layout: "product",
      // Title is overlaid on overview / card capsule — not baked into the photo.
      titleInArt: false,
    };
  }

  return { photos: MODE_PHOTOS, isCustom: false, layout: "product" };
}

/** @deprecated Use resolveCourseCover */
export function getCourseCoverPhotos(title?: string): CourseCoverPhotos {
  return resolveCourseCover("", title).photos;
}

/** @deprecated Use resolveCourseCover */
export function hasCustomCourseCover(courseId: string, title?: string): boolean {
  return resolveCourseCover(courseId, title).isCustom;
}

export function courseCoverTitleInArt(courseId: string, title?: string): boolean {
  return Boolean(resolveCourseCover(courseId, title).titleInArt);
}

export type CourseCoverPalette = {
  navy: string;
  mid: string;
  lime: string;
  sky: string;
  ink: string;
  glow: string;
};

export type CourseCoverSpec = {
  /** Stable index for soft brand glow placement */
  pattern: number;
  palette: CourseCoverPalette;
};

/**
 * Premium close product-shot framing — oversized contain stage + scale so the vial
 * dominates the media. Soft studio-edge bleed via overflow is intentional; avoid
 * mid-glyph chops by keeping the product silhouette mostly intact.
 */
export type VialCompositionRecipe = {
  id: string;
  name: string;
  /** Stage width as % of media box (often 85–110% for close framing) */
  width: string;
  /** Stage height as % of media box (often 95–120%) */
  height: string;
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  objectPosition: string;
  /** Contain keeps silhouette coherent; closeness comes from stage size + scale */
  objectFit: "contain";
  /** Extra spin magnitude for product tilt (always applied clockwise / lean right) */
  rotate: number;
  /** Aggressive close-up scale (≈1.35…1.75) — editorial bleed OK */
  scale: number;
  opacity: number;
  /** 0–1 — separate aura layer intensity behind vial (not img blur) */
  glowIntensity: number;
  transformOrigin: string;
  /** 0–1 — stronger left scrim when vial sits closer to center */
  textScrimStrength: number;
};

export type CoverAccentLayout = VialCompositionRecipe & {
  transform: string;
  recipeId: string;
  recipeName: string;
};

/** @deprecated Use CoverAccentLayout */
export type CoverVialLayout = CoverAccentLayout;

/** HOLS brand-forward palettes (Prussian / Dusk / Lemon Lime / Baby Blue). */
const PALETTES: CourseCoverPalette[] = [
  {
    navy: "#142644",
    mid: "#1a2f55",
    lime: "#DDE466",
    sky: "#8DC3E1",
    ink: "#F4F7FB",
    glow: "rgba(221, 228, 102, 0.28)",
  },
  {
    navy: "#101b30",
    mid: "#3853A4",
    lime: "#DDE466",
    sky: "#8DC3E1",
    ink: "#EEF3FA",
    glow: "rgba(141, 195, 225, 0.32)",
  },
  {
    navy: "#0d1626",
    mid: "#152744",
    lime: "#E2EB6E",
    sky: "#A8D4EC",
    ink: "#F7FAFC",
    glow: "rgba(221, 228, 102, 0.22)",
  },
  {
    navy: "#142644",
    mid: "#243d66",
    lime: "#D4DE58",
    sky: "#79B8D8",
    ink: "#F0F4F9",
    glow: "rgba(56, 83, 164, 0.45)",
  },
  {
    navy: "#0e1830",
    mid: "#1c3558",
    lime: "#DDE466",
    sky: "#95C8E4",
    ink: "#F5F8FC",
    glow: "rgba(141, 195, 225, 0.26)",
  },
  {
    navy: "#0b1528",
    mid: "#1f3a60",
    lime: "#CFDC4C",
    sky: "#8DC3E1",
    ink: "#EEF2F8",
    glow: "rgba(221, 228, 102, 0.3)",
  },
];

/**
 * 10 close product-shot stages — oversized contain + aggressive scale.
 * Vial dominates the media (~editorial close-up); soft studio edges may bleed
 * past the card crop. Left title zone kept readable via scrim strength.
 */
export const VIAL_COMPOSITION_RECIPES: VialCompositionRecipe[] = [
  {
    id: "hero-right",
    name: "Hero right",
    top: "-4%",
    right: "-6%",
    width: "96%",
    height: "112%",
    objectPosition: "54% 50%",
    objectFit: "contain",
    rotate: 5,
    scale: 1.55,
    opacity: 1,
    glowIntensity: 0.34,
    transformOrigin: "58% 50%",
    textScrimStrength: 0.52,
  },
  {
    id: "soft-offset",
    name: "Soft offset",
    top: "-2%",
    right: "-2%",
    width: "90%",
    height: "108%",
    objectPosition: "52% 48%",
    objectFit: "contain",
    rotate: 4,
    scale: 1.48,
    opacity: 1,
    glowIntensity: 0.3,
    transformOrigin: "55% 50%",
    textScrimStrength: 0.5,
  },
  {
    id: "high-right",
    name: "High right",
    top: "-10%",
    right: "-8%",
    width: "98%",
    height: "118%",
    objectPosition: "56% 44%",
    objectFit: "contain",
    rotate: 5,
    scale: 1.62,
    opacity: 1,
    glowIntensity: 0.36,
    transformOrigin: "60% 40%",
    textScrimStrength: 0.54,
  },
  {
    id: "low-settle",
    name: "Low settle",
    bottom: "-8%",
    right: "-4%",
    width: "94%",
    height: "114%",
    objectPosition: "53% 56%",
    objectFit: "contain",
    rotate: 4,
    scale: 1.58,
    opacity: 1,
    glowIntensity: 0.32,
    transformOrigin: "56% 62%",
    textScrimStrength: 0.55,
  },
  {
    id: "far-right",
    name: "Far right",
    top: "-3%",
    right: "-12%",
    width: "88%",
    height: "110%",
    objectPosition: "58% 50%",
    objectFit: "contain",
    rotate: 5,
    scale: 1.42,
    opacity: 1,
    glowIntensity: 0.32,
    transformOrigin: "62% 50%",
    textScrimStrength: 0.48,
  },
  {
    id: "center-bias",
    name: "Center bias",
    top: "-2%",
    right: "0%",
    width: "102%",
    height: "112%",
    objectPosition: "48% 50%",
    objectFit: "contain",
    rotate: 5,
    scale: 1.52,
    opacity: 1,
    glowIntensity: 0.35,
    transformOrigin: "50% 50%",
    textScrimStrength: 0.6,
  },
  {
    id: "gentle-tilt",
    name: "Gentle tilt",
    top: "-6%",
    right: "-5%",
    width: "94%",
    height: "116%",
    objectPosition: "54% 50%",
    objectFit: "contain",
    rotate: 5,
    scale: 1.5,
    opacity: 1,
    glowIntensity: 0.33,
    transformOrigin: "56% 50%",
    textScrimStrength: 0.53,
  },
  {
    id: "soft-tilt",
    name: "Soft tilt",
    top: "-5%",
    right: "-4%",
    width: "92%",
    height: "114%",
    objectPosition: "53% 50%",
    objectFit: "contain",
    rotate: 4,
    scale: 1.54,
    opacity: 1,
    glowIntensity: 0.34,
    transformOrigin: "55% 50%",
    textScrimStrength: 0.54,
  },
  {
    id: "generous",
    name: "Generous",
    top: "-8%",
    right: "-8%",
    width: "108%",
    height: "120%",
    objectPosition: "52% 50%",
    objectFit: "contain",
    rotate: 5,
    scale: 1.68,
    opacity: 1,
    glowIntensity: 0.31,
    transformOrigin: "55% 50%",
    textScrimStrength: 0.56,
  },
  {
    id: "intimate",
    name: "Intimate",
    top: "-6%",
    right: "-2%",
    width: "100%",
    height: "118%",
    objectPosition: "50% 46%",
    objectFit: "contain",
    rotate: 5,
    scale: 1.72,
    opacity: 1,
    glowIntensity: 0.38,
    transformOrigin: "52% 46%",
    textScrimStrength: 0.58,
  },
];

const PANEL_SCALE = 0.85;

function scalePercent(value: string | undefined, factor: number): string | undefined {
  if (value === undefined) return undefined;
  const match = /^(-?\d+(?:\.\d+)?)%$/.exec(value);
  if (!match) return value;
  const scaled = Math.round(parseFloat(match[1]!) * factor * 10) / 10;
  return `${scaled}%`;
}

function toPanelRecipe(recipe: VialCompositionRecipe): VialCompositionRecipe {
  return {
    ...recipe,
    width: scalePercent(recipe.width, PANEL_SCALE) ?? recipe.width,
    height: scalePercent(recipe.height, PANEL_SCALE) ?? recipe.height,
    top: scalePercent(recipe.top, PANEL_SCALE),
    right: scalePercent(recipe.right, PANEL_SCALE),
    bottom: scalePercent(recipe.bottom, PANEL_SCALE),
    left: scalePercent(recipe.left, PANEL_SCALE),
    scale: Math.round(recipe.scale * 0.96 * 100) / 100,
  };
}

/** FNV-1a style hash — stable across sessions. */
export function hashCourseId(courseId: string): number {
  let h = 2166136261;
  for (let i = 0; i < courseId.length; i += 1) {
    h ^= courseId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function getCourseCoverSpec(courseId: string): CourseCoverSpec {
  const hash = hashCourseId(courseId);
  return {
    pattern: hash % 8,
    palette: PALETTES[(hash >>> 12) % PALETTES.length]!,
  };
}

/** Display title for book-cover typography (lecture heading above vial). */
export function getCoverDisplayTitle(title: string): string {
  return (
    tidyCoverTitle(title)
      // Keep numeric ranges on one line (e.g. 176-191 / 176–191)
      .replace(/(\d)\s*[-–—]\s*(\d)/g, "$1\u2011$2")
  );
}

/** All lecture covers use the HOLS vial photo. Kept for API compatibility. */
export function courseNeedsVial(_title?: string): boolean {
  return true;
}

/** Resolve the raw recipe for a course (before panel scaling). */
export function getVialCompositionRecipe(courseId: string): VialCompositionRecipe {
  const hash = hashCourseId(courseId);
  const slot = (hash >>> 3) % VIAL_COMPOSITION_RECIPES.length;
  return VIAL_COMPOSITION_RECIPES[slot]!;
}

function recipeToLayout(recipe: VialCompositionRecipe): CoverAccentLayout {
  return {
    ...recipe,
    recipeId: recipe.id,
    recipeName: recipe.name,
    transform: `rotate(${recipe.rotate}deg) scale(${recipe.scale})`,
  };
}

/**
 * Position + scale for cover vial — close product hero, unique per course_id.
 * 10 named recipes hashed deterministically from course_id.
 */
export function getCoverVialLayout(
  courseId: string,
  variant: "card" | "panel",
): CoverAccentLayout {
  const base = getVialCompositionRecipe(courseId);
  const recipe = variant === "panel" ? toPanelRecipe(base) : base;
  return recipeToLayout(recipe);
}

/** @deprecated Covers always use vial — retained for decor component if reused elsewhere. */
export function getCoverDecorLayout(
  spec: CourseCoverSpec,
  variant: "card" | "panel",
): CoverAccentLayout {
  return getCoverVialLayout(String(spec.pattern), variant);
}

export function courseCoverCssVars(spec: CourseCoverSpec): Record<string, string> {
  return {
    "--cover-art-navy": spec.palette.navy,
    "--cover-art-mid": spec.palette.mid,
    "--cover-art-lime": spec.palette.lime,
    "--cover-art-sky": spec.palette.sky,
    "--cover-art-ink": spec.palette.ink,
    "--cover-art-glow": spec.palette.glow,
  };
}

/** Deterministic particle positions for cover atmosphere layers. */
export function coverAtmosphereParticles(
  seed: number,
): Array<{ x: number; y: number; size: number; opacity: number }> {
  const particles: Array<{ x: number; y: number; size: number; opacity: number }> = [];
  let s = seed;
  for (let i = 0; i < 10; i += 1) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    particles.push({
      x: 6 + (s % 880) / 10,
      y: 4 + ((s >> 8) % 320) / 10,
      size: 1.5 + (s % 3),
      opacity: 0.1 + (s % 16) / 100,
    });
  }
  return particles;
}
