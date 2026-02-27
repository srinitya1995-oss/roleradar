/**
 * Bucket assignment from resume_match (0-100) and final_fit_score (0-100).
 * Source of truth for display; store bucket on job row.
 */

export type Bucket = "APPLY_NOW" | "STRONG_FIT" | "NEAR_MATCH" | "REVIEW" | "HIDE";

/**
 * Compute bucket from resume match and fit score.
 * Calibrated so PM roles at top companies (OpenAI, Adobe, Uber) surface to Apply now / Strong fit
 * even when descriptions are short or title-heavy (e.g. "Product Manager, API Agents").
 */
export function computeBucket(resumeMatch: number, finalFitScore: number): Bucket {
  if (resumeMatch >= 55 && finalFitScore >= 55) return "APPLY_NOW";
  if (resumeMatch >= 45 && finalFitScore >= 45) return "STRONG_FIT";
  if (resumeMatch >= 35 && finalFitScore >= 35) return "NEAR_MATCH";
  if (resumeMatch >= 25) return "REVIEW";
  return "HIDE";
}

export const BUCKET_LABELS: Record<Bucket, string> = {
  APPLY_NOW: "Apply now",
  STRONG_FIT: "Strong fit",
  NEAR_MATCH: "Near match",
  REVIEW: "Review",
  HIDE: "Hidden",
};
