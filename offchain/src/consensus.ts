/**
 * Consensus Engine
 * Aggregates responses from multiple AI agents
 */
interface AgentResponse {
  valuation: number;
  confidence: number;
  reasoning: string;
  risk_factors: string[];
  agent: string;
}

interface ConsensusResult {
  finalValuation: number;
  finalConfidence: number;
  consensusScore: number;
  isValid: boolean;
  statistics: {
    averageValuation: number;
    weightedValuation: number;
    standardDeviation: number;
    minValuation: number;
    maxValuation: number;
    averageConfidence: number;
  };
  outliers: Array<{
    agent: string;
    valuation: number;
    deviation: number;
  }>;
  riskFactors: string[];
  nodeResponses: Array<{
    agent: string;
    valuation: number;
    confidence: number;
  }>;
}

/**
 * Calculate consensus from multiple AI agent responses
 */
export function calculateConsensus(responses: AgentResponse[]): ConsensusResult {
  if (responses.length < 2) {
    throw new Error('Need at least 2 valid responses for consensus');
  }
  
  // Extract valuations and confidences
  const valuations = responses.map(r => r.valuation);
  const confidences = responses.map(r => r.confidence);
  
  // Calculate statistics
  const avgValuation = mean(valuations);
  const stdValuation = standardDeviation(valuations);
  const avgConfidence = mean(confidences);
  
  // Weighted average (weight by confidence)
  const totalWeight = confidences.reduce((a, b) => a + b, 0);
  const weightedValuation = responses.reduce(
    (sum, r) => sum + r.valuation * r.confidence,
    0
  ) / totalWeight;
  
  // Detect outliers (values more than 2 standard deviations away)
  const outliers = responses
    .map((r, i) => ({
      agent: r.agent,
      valuation: r.valuation,
      deviation: Math.abs(r.valuation - avgValuation)
    }))
    .filter(o => stdValuation > 0 && o.deviation > 2 * stdValuation);
  
  // Calculate consensus score (0-100)
  // Higher score = more agreement between nodes
  const variationCoefficient = avgValuation > 0 ? (stdValuation / avgValuation) * 100 : 0;
  const consensusScore = Math.max(0, Math.round(100 - variationCoefficient));
  
  // Final confidence: Use weighted average of agent confidences
  // Don't penalize for valuation disagreement - just use average confidence
  const finalConfidence = Math.round(avgConfidence);
  
  // Check if meets threshold (80% default)
  const confidenceThreshold = parseInt(process.env.CONFIDENCE_THRESHOLD || '80');
  const isValid = finalConfidence >= confidenceThreshold;
  
  // Collect all risk factors
  const allRisks = responses.flatMap(r => r.risk_factors);
  const uniqueRisks = Array.from(new Set(allRisks));
  
  return {
    finalValuation: Math.round(weightedValuation),
    finalConfidence,
    consensusScore,
    isValid,
    statistics: {
      averageValuation: Math.round(avgValuation),
      weightedValuation: Math.round(weightedValuation),
      standardDeviation: Math.round(stdValuation),
      minValuation: Math.min(...valuations),
      maxValuation: Math.max(...valuations),
      averageConfidence: Math.round(avgConfidence)
    },
    outliers,
    riskFactors: uniqueRisks,
    nodeResponses: responses.map(r => ({
      agent: r.agent,
      valuation: r.valuation,
      confidence: r.confidence
    }))
  };
}

/**
 * Calculate mean of array
 */
function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Calculate standard deviation
 */
function standardDeviation(arr: number[]): number {
  if (arr.length <= 1) return 0;
  const avg = mean(arr);
  const squareDiffs = arr.map(value => Math.pow(value - avg, 2));
  const avgSquareDiff = mean(squareDiffs);
  return Math.sqrt(avgSquareDiff);
}
