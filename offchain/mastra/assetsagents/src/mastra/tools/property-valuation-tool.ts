import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const valuationInputSchema = z.object({
  area_sqm: z.number().describe('Property area in square meters'),
  ndvi: z.number().describe('Normalized Difference Vegetation Index (0-1)'),
  cloud_coverage: z.number().describe('Cloud coverage percentage'),
  document_count: z.number().describe('Number of submitted documents'),
  mode: z.enum(['agent2', 'agent3']).default('agent2').describe('Valuation model to use'),
});

export const propertyValuationTool = createTool({
  id: 'property-valuation',
  description:
    'Calculate property valuation based on satellite data (area, NDVI, cloud coverage) and document count. Returns estimated valuation in USD and confidence score.',
  inputSchema: valuationInputSchema,
  execute: async ({ context }) => {
    const { area_sqm, ndvi, cloud_coverage, document_count, mode } = context;

    let base_price: number;
    let area_factor: number;
    let doc_factor: number;
    let confidence: number;

    if (mode === 'agent3') {
      // Agent 3 (Llama surveyor) pricing model
      if (ndvi > 0.65) base_price = 2700;
      else if (ndvi > 0.5) base_price = 2400;
      else if (ndvi > 0.3) base_price = 2000;
      else base_price = 1700;

      area_factor = area_sqm < 500 ? 1.0 : area_sqm < 1000 ? 0.93 : 0.88;
      doc_factor = Math.min(1.0, 0.65 + document_count * 0.175);

      confidence = 82;
      if (cloud_coverage > 15) confidence -= 8;
      if (document_count < 2) confidence -= 12;
      if (ndvi < 0.25) confidence -= 7;
    } else {
      // Agent 2 (GPT-4o-mini) pricing model
      if (ndvi > 0.6) base_price = 2500;
      else if (ndvi > 0.4) base_price = 2200;
      else base_price = 1800;

      area_factor = area_sqm < 500 ? 1.0 : area_sqm < 1000 ? 0.95 : 0.9;
      doc_factor = Math.min(1.0, 0.7 + document_count * 0.15);

      confidence = 85;
      if (cloud_coverage > 10) confidence -= 5;
      if (document_count < 2) confidence -= 10;
      if (ndvi < 0.3) confidence -= 5;
    }

    const valuation = Math.floor(area_sqm * base_price * area_factor * doc_factor);
    const clampedConfidence = Math.max(mode === 'agent3' ? 55 : 60, Math.min(95, confidence));

    return {
      valuation,
      confidence: clampedConfidence,
      factors: {
        base_price_per_sqm: base_price,
        area_factor,
        doc_factor,
        ndvi_quality: ndvi > 0.6 ? 'high' : ndvi > 0.4 ? 'moderate' : 'low',
      },
    };
  },
});
