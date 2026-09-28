import type { CourseSummary } from "@/lib/integrate/provider/student/lectures";

/**
 * Courses kept off the student lectures page for now.
 * Matching ignores case, punctuation, and hyphen style.
 */
const HIDDEN_COURSE_TITLES = [
  "PEG MGF",
  "Pinealon",
  "HGH Fragment 176-191",
  "Colostrum",
  "SLU-PP-332",
  "Survodutide",
  "Humanin",
  "Pancragen",
  "Bronchogen",
  "5-Amino-1MQ",
  "TRH Thyrotropin",
  "Cortagen",
  "PNC-27",
  "Vesugen",
  "Vilon",
  "Tesofensine",
  "VIP",
  "B7-33",
  "Dihexa",
  "Chonluten",
  "MK-677",
  "IGF-1 DES",
  "Mazdutide",
  "Ovangen",
  "Livagen",
  "MGF (IGF-1Ec)",
  "HCG",
  "Bacteriostatic Water",
  "HGH",
] as const;

const HIDDEN_COURSE_IDS = new Set<string>([]);

function normalizeCourseTitle(title: string) {
  return title
    .replace(/^Peptide University:\s*/i, "")
    .toLowerCase()
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const HIDDEN_TITLE_KEYS = new Set(HIDDEN_COURSE_TITLES.map((title) => normalizeCourseTitle(title)));

export function isHiddenLectureCourse(course: Pick<CourseSummary, "course_id" | "title">) {
  if (HIDDEN_COURSE_IDS.has(course.course_id)) return true;
  return HIDDEN_TITLE_KEYS.has(normalizeCourseTitle(course.title ?? ""));
}

export function filterVisibleLectureCourses<T extends Pick<CourseSummary, "course_id" | "title">>(
  courses: T[],
) {
  return courses.filter((course) => !isHiddenLectureCourse(course));
}
