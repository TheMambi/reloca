import { z } from "zod";

export const RentBracketSchema = z.object({
  unit: z.enum(["studio", "1br", "2br", "3br"]),
  median: z.number().int().positive(),
});

export const TestimonialSchema = z.object({
  author: z.string(),
  role: z.string(),
  neighborhood: z.string(),
  quote: z.string().min(20).max(500),
});

export const CityCommunitySchema = z.object({
  city: z.string(), // city slug — keyed to data/cities.json
  avgRent: z.array(RentBracketSchema).length(4),
  weatherSummary: z.string(),
  vibeTags: z.array(z.string()).min(2).max(6),
  testimonials: z.array(TestimonialSchema).min(2).max(4),
  source: z.string().optional(), // DataSource id — keyed to data/data-sources.json
});

export const CommunityInsightFileSchema = z.array(CityCommunitySchema);

export type RentBracket = z.infer<typeof RentBracketSchema>;
export type Testimonial = z.infer<typeof TestimonialSchema>;
export type CityCommunity = z.infer<typeof CityCommunitySchema>;
