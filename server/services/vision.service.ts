import { GoogleGenerativeAI } from '@google/generative-ai';
import { AppError, ErrorCode } from '../utils/errors.js';
import type { DetectedAnomaly } from '../types/trust.js';

export interface VisionAnalysisResult {
  match_score: number;
  detected_anomalies: DetectedAnomaly[];
  severity: 'NONE' | 'MINOR' | 'MODERATE' | 'SEVERE';
  provider_metadata: {
    provider: string;
    model: string;
    response_time_ms: number;
  };
}

/**
 * Vision Service using Google Gemini Vision API
 * Compares before/after images to detect condition changes
 */
export class VisionService {
  private genAI: GoogleGenerativeAI | null = null;
  private model: any = null;
  private apiKey: string | null = null;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || null;

    if (this.apiKey) {
      try {
        this.genAI = new GoogleGenerativeAI(this.apiKey);
        this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      } catch (err) {
        console.error('Failed to initialize Google Gemini AI:', err);
        this.genAI = null;
        this.model = null;
      }
    }
  }

  /**
   * Check if the vision provider is properly configured
   */
  public isAvailable(): boolean {
    return this.model !== null && this.apiKey !== null;
  }

  /**
   * Compare check-in and check-out images to detect condition changes
   */
  public async compareCondition(
    checkInImage: Buffer,
    checkInMimeType: string,
    checkOutImage: Buffer,
    checkOutMimeType: string
  ): Promise<VisionAnalysisResult> {
    if (!this.isAvailable()) {
      throw new AppError(
        503,
        ErrorCode.SERVICE_UNAVAILABLE,
        'Vision analysis service is not configured. Please set GEMINI_API_KEY environment variable. ' +
          'Obtain an API key from https://aistudio.google.com/apikey'
      );
    }

    const startTime = Date.now();

    try {
      // Convert image buffers to base64 for Gemini API
      const checkInBase64 = checkInImage.toString('base64');
      const checkOutBase64 = checkOutImage.toString('base64');

      // Construct prompt for condition comparison
      const prompt = `You are an expert equipment inspector analyzing before and after images of shared laboratory equipment.

TASK: Compare these two images and identify any condition changes between check-in (before) and check-out (after).

FOCUS ON:
1. Missing accessories or components (cables, attachments, tools)
2. New physical damage (scratches, dents, cracks, broken parts)
3. Cleanliness changes (dirt, debris, spills, clutter)
4. Operational indicator changes (warning lights, error displays)

IMPORTANT INSTRUCTIONS:
- Only report changes that are clearly visible and attributable to use between check-in and check-out
- If both images look identical or nearly identical, report high match score (90-100) and no anomalies
- Distinguish pre-existing damage from newly observed damage when evidence supports it
- Represent uncertainty honestly - if you cannot determine whether damage is new, state that
- Do NOT fabricate findings or claim certainty where evidence is ambiguous

RESPONSE FORMAT (JSON only, no markdown):
{
  "match_score": <0-100 integer, where 100 = identical condition>,
  "detected_anomalies": [
    {
      "type": "<category: missing_item | physical_damage | cleanliness | display_indicator | other>",
      "description": "<specific, factual description of what changed>",
      "severity": "<MINOR | MODERATE | SEVERE>",
      "confidence": <0.0-1.0, your confidence this is a real new issue>
    }
  ],
  "overall_severity": "<NONE | MINOR | MODERATE | SEVERE>",
  "analysis_notes": "<brief explanation of your assessment>"
}

Provide ONLY the JSON response, no other text.`;

      const result = await this.model.generateContent([
        prompt,
        {
          inlineData: {
            mimeType: checkInMimeType,
            data: checkInBase64,
          },
        },
        {
          inlineData: {
            mimeType: checkOutMimeType,
            data: checkOutBase64,
          },
        },
      ]);

      const response = await result.response;
      const text = response.text();
      const responseTime = Date.now() - startTime;

      // Parse JSON response
      let analysis: any;
      try {
        // Remove markdown code blocks if present
        const cleanedText = text.replace(/```json\n?|\n?```/g, '').trim();
        analysis = JSON.parse(cleanedText);
      } catch (parseErr) {
        console.error('Failed to parse Gemini response as JSON:', text);
        throw new AppError(
          500,
          ErrorCode.EXTERNAL_SERVICE_ERROR,
          'Vision provider returned invalid response format'
        );
      }

      // Validate and normalize response
      const matchScore = Math.min(100, Math.max(0, parseInt(analysis.match_score) || 0));
      const anomalies: DetectedAnomaly[] = Array.isArray(analysis.detected_anomalies)
        ? analysis.detected_anomalies.map((a: any) => ({
            type: String(a.type || 'other'),
            description: String(a.description || 'Unspecified change'),
            severity: this.normalizeSeverity(a.severity),
            confidence: typeof a.confidence === 'number' ? a.confidence : undefined,
          }))
        : [];

      const overallSeverity = this.normalizeSeverity(
        analysis.overall_severity || this.calculateOverallSeverity(anomalies)
      );

      return {
        match_score: matchScore,
        detected_anomalies: anomalies,
        severity: overallSeverity,
        provider_metadata: {
          provider: 'google-gemini',
          model: 'gemini-1.5-flash',
          response_time_ms: responseTime,
        },
      };
    } catch (err: any) {
      const responseTime = Date.now() - startTime;

      // Handle specific Gemini API errors
      if (err.message?.includes('API_KEY_INVALID') || err.message?.includes('API key')) {
        throw new AppError(
          503,
          ErrorCode.SERVICE_UNAVAILABLE,
          'Invalid Google Gemini API key. Please verify GEMINI_API_KEY in environment configuration.'
        );
      }

      if (err.message?.includes('quota') || err.message?.includes('rate limit')) {
        throw new AppError(
          503,
          ErrorCode.SERVICE_UNAVAILABLE,
          'Vision provider rate limit exceeded. Please try again later.'
        );
      }

      if (err instanceof AppError) {
        throw err;
      }

      console.error('Vision analysis failed:', err);
      throw new AppError(
        503,
        ErrorCode.EXTERNAL_SERVICE_ERROR,
        `Vision analysis failed: ${err.message || 'Unknown error'}`,
        undefined,
        { response_time_ms: responseTime }
      );
    }
  }

  /**
   * Normalize severity values to expected enum
   */
  private normalizeSeverity(value: any): 'NONE' | 'MINOR' | 'MODERATE' | 'SEVERE' {
    const normalized = String(value || '').toUpperCase();
    if (['NONE', 'MINOR', 'MODERATE', 'SEVERE'].includes(normalized)) {
      return normalized as 'NONE' | 'MINOR' | 'MODERATE' | 'SEVERE';
    }
    return 'NONE';
  }

  /**
   * Calculate overall severity from anomalies list
   */
  private calculateOverallSeverity(
    anomalies: DetectedAnomaly[]
  ): 'NONE' | 'MINOR' | 'MODERATE' | 'SEVERE' {
    if (anomalies.length === 0) return 'NONE';

    const severities = anomalies.map((a) => a.severity);
    if (severities.includes('SEVERE')) return 'SEVERE';
    if (severities.includes('MODERATE')) return 'MODERATE';
    if (severities.includes('MINOR')) return 'MINOR';
    return 'NONE';
  }
}
