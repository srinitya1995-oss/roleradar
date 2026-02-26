import { describe, it, expect } from "vitest";
import {
  scoreCpi,
  scoreCpiBreakdown,
  isPmEligible,
  roleFitScore,
  aiDepthScore,
  cpiTier,
} from "./cpi";

describe("CPI scoring", () => {
  describe("PM eligibility and OpenAI role", () => {
    it("Product Manager, API Model Behavior is PM-eligible and does not get CPI=0", () => {
      const title = "Product Manager, API Model Behavior";
      expect(isPmEligible(title)).toBe(true);
      const description =
        "You will own the API product roadmap and work on model behavior, alignment, and evaluation methodology.";
      const cpi = scoreCpi(title, description);
      expect(cpi).not.toBe(0);
      expect(cpi).not.toBe(null);
    });

    it("Product Manager, API Model Behavior returns breakdown with matched_phrases", () => {
      const title = "Product Manager, API Model Behavior";
      const description =
        "You will own the API product roadmap and work on model behavior, alignment, and evaluation methodology. Partner with engineering.";
      const b = scoreCpiBreakdown(title, description);
      expect(b.cpi).not.toBe(null);
      expect(b.role_fit).toBeGreaterThanOrEqual(0);
      expect(b.ai_depth).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(b.matched_phrases)).toBe(true);
      expect(b.matched_phrases.length).toBeGreaterThan(0);
      expect(b.matched_phrases).toContain("model behavior");
      expect(b.matched_phrases.some((p) => p.includes("roadmap") || p.includes("api"))).toBe(true);
    });
  });

  describe("PM-aware exclusion", () => {
    it("excludes non-PM title with engineer", () => {
      expect(isPmEligible("Software Engineer")).toBe(false);
      expect(scoreCpi("Software Engineer", "roadmap and product")).toBe(null);
    });

    it("does not exclude PM title that contains model/research", () => {
      expect(isPmEligible("Product Manager, API Model Behavior")).toBe(true);
      expect(isPmEligible("Technical Product Manager, Research")).toBe(true);
    });

    it("excludes product marketing (explicit non-PM)", () => {
      expect(isPmEligible("Product Marketing Manager")).toBe(false);
      expect(scoreCpi("Product Marketing Manager", "roadmap")).toBe(null);
    });
  });

  describe("Role Fit and AI Depth expansion", () => {
    it("scores strategy/vision and platform/API in role fit", () => {
      const desc =
        "Set vision and strategy for the platform. Own API and developer experience. Roadmap and KPIs.";
      const fit = roleFitScore(desc);
      expect(fit).toBeGreaterThanOrEqual(3);
    });

    it("scores model behavior and alignment in AI depth", () => {
      const desc =
        "Work on model behavior, frontier model, alignment, red teaming, and evaluation methodology.";
      const depth = aiDepthScore(desc);
      expect(depth).toBeGreaterThanOrEqual(3);
    });
  });

  describe("No Role Fit < 3 => CPI=0", () => {
    it("computes CPI even when Role Fit is 1–2", () => {
      const title = "Product Manager";
      const description = "Only one signal: roadmap.";
      const b = scoreCpiBreakdown(title, description);
      expect(b.cpi).not.toBe(null);
      expect(typeof b.cpi).toBe("number");
      expect(b.cpi).toBeGreaterThanOrEqual(0);
      expect(b.role_fit).toBeLessThan(3);
    });
  });

  describe("cpiTier", () => {
    it("returns Top 5% for 9–10", () => {
      expect(cpiTier(9)).toBe("Top 5%");
      expect(cpiTier(10)).toBe("Top 5%");
    });
    it("returns Top 20% for 7–8", () => {
      expect(cpiTier(7)).toBe("Top 20%");
      expect(cpiTier(8)).toBe("Top 20%");
    });
    it("returns Reject for <7", () => {
      expect(cpiTier(6)).toBe("Reject");
      expect(cpiTier(0)).toBe("Reject");
    });
  });
});
