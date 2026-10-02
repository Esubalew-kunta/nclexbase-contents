import type { TemplateModule } from "@/lib/slides/registry";
import type { TemplateId } from "@/lib/slides/types";
import cleanClinical from "./clean-clinical/CleanClinical";
import premiumEditorial from "./premium-editorial/PremiumEditorial";
import modernStudy from "./modern-study/ModernStudy";

export const TEMPLATE_MODULES: Record<TemplateId, TemplateModule> = {
  "clean-clinical": cleanClinical,
  "premium-editorial": premiumEditorial,
  "modern-study": modernStudy,
};

export const DEFAULT_TEMPLATE_ID: TemplateId = "modern-study";
