/**
 * Bucket assignment from resume_match (0-100) and final_fit_score (0-100).
 * Source of truth for display; store bucket on job row.
 */

export type Bucket = "APPLY_NOW" | "STRONG_FIT" | "NEAR_MATCH" | "REVIEW" | "HIDE";

/**
 * Compute bucket from resume match and fit score.
 * Recalibrated for keyword-based matcher (JDs often shorter than resume).
 * APPLY_NOW: resume >= 80 AND fit >= 80
 * STRONG_FIT: resume >= 70 AND fit >= 75
 * NEAR_MATCH: resume >= 60 AND fit >= 65
 * REVIEW: resume >= 50
 * HIDE: < 50 or fails gates
 */
export function computeBucket(resumeMatch: number, finalFitScore: number): Bucket {
  if (resumeMatch >= 80 && finalFitScore >= 80) return "APPLY_NOW";
  if (resumeMatch >= 70 && finalFitScore >= 75) return "STRONG_FIT";
  if (resumeMatch >= 60 && finalFitScore >= 65) return "NEAR_MATCH";
  if (resumeMatch >= 50) return "REVIEW";
  return "HIDE";
}

export const BUCKET_LABELS: Record<Bucket, string> = {
  APPLY_NOW: "Apply now",
  STRONG_FIT: "Strong fit",
  NEAR_MATCH: "Near match",
  REVIEW: "Review",
  HIDE: "Hidden",
};
