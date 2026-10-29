import { Router, Request, Response } from 'express';
import { FairnessService } from '../services/fairnessService.js';

const router = Router();

router.post('/rank', (req: Request, res: Response) => {
  const { candidates } = req.body || {};
  const safeCandidates = Array.isArray(candidates) && candidates.length > 0 ? candidates : FairnessService.getSimulatedClashScenario().rankings;
  const rankings = FairnessService.rankCompetingRequests(safeCandidates);
  return res.json({ success: true, rankings });
});

router.post('/simulate-clash', (req: Request, res: Response) => {
  const { resourceName, slot } = req.body || {};
  const simulation = FairnessService.getSimulatedClashScenario(resourceName, slot);
  return res.json({ success: true, ...simulation });
});

router.post('/resolve', (req: Request, res: Response) => {
  const { userId, decision, auditReason } = req.body || {};
  const chosenDecision = decision || 'APPROVED';
  const targetUser = userId || 'usr_fair_aarav';
  const decisionLetter = auditReason ? `approved after audit review: ${auditReason}` : `approved by custodian in live review`;

  res.json({
    success: true,
    resolution: {
      id: `audit_${Date.now()}`,
      userId: targetUser,
      decision: chosenDecision,
      status: 'CONFIRMED',
      receipt: `Audit log recorded • ${decisionLetter}`,
      lifecycleProgress: 'Resolution complete',
    },
  });
});

export default router;