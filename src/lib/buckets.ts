/**
 * Bucket assignment from resume_match (0-100) and final_fit_score (0-100).
 * Source of truth for display; store bucket on job row.
 */

export type Bucket = "APPLY_NOW" | "STRONG_FIT" | "NEAR_MATCH" | "REVIEW" | "HIDE";

/**
 * Compute bucket from resume match and fit score.
 * APPLY_NOW: resume >= 95 AND fit >= 85
 * STRONG_FIT: resume 90-94 AND fit >= 80
 * NEAR_MATCH: resume 80-89 AND fit >= 70
 * REVIEW: resume 70-79 (optional; hidden by default in UI)
 * HIDE: < 70 or fails gates
 */
export function computeBucket(resumeMatch: number, finalFitScore: number): Bucket {
  if (resumeMatch >= 95 && finalFitScore >= 85) return "APPLY_NOW";
  if (resumeMatch >= 90 && resumeMatch <= 94 && finalFitScore >= 80) return "STRONG_FIT";
  if (resumeMatch >= 80 && resumeMatch <= 89 && finalFitScore >= 70) return "NEAR_MATCH";
  if (resumeMatch >= 70 && resumeMatch <= 79) return "REVIEW";
  return "HIDE";
}

export const BUCKET_LABELS: Record<Bucket, string> = {
  APPLY_NOW: "Apply now",
  STRONG_FIT: "Strong fit",
  NEAR_MATCH: "Near match",
  REVIEW: "Review",
  HIDE: "Hidden",
};
