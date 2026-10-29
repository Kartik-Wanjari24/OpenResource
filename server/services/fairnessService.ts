// server/services/fairnessService.ts

export interface CompetingCandidate {
  userId: string;
  userName: string;
  department: string;
  role: string;
  projectUrgency: "ACADEMIC_DEADLINE" | "RESEARCH_GRANT" | "PERSONAL_EXPLORATION";
  rolling14DayHoursUsed: number;
  resourceWeeklyMaxHours: number;
  pastWaitlistDenials: number;
  trustScore: number;
  hasRequiredBadges: boolean;
  requestedSlot: string;
}

export interface RankedAllocationResult extends CompetingCandidate {
  rank: number;
  recommendedAction: "APPROVE_PRIMARY" | "WAITLIST_PRIORITY" | "WAITLIST_DEPLETED_QUOTA" | "REJECT_INELIGIBLE";
  priorityScore: number;
  scoreBreakdown: {
    urgencyPoints: number;
    usageDecayPenalty: number;
    waitlistStarvationBonus: number;
    trustReliabilityBonus: number;
  };
  explainableReason: string;
}

const URGENCY_WEIGHTS = {
  ACADEMIC_DEADLINE: 40,
  RESEARCH_GRANT: 35,
  PERSONAL_EXPLORATION: 20,
};

export class FairnessService {
  static rankCompetingRequests(candidates: CompetingCandidate[]): RankedAllocationResult[] {
    const scored = candidates.map((c) => {
      const urgencyPoints = URGENCY_WEIGHTS[c.projectUrgency] || 20;
      const utilizationRatio = c.rolling14DayHoursUsed / Math.max(1, c.resourceWeeklyMaxHours);
      const usageDecayPenalty = Math.round(utilizationRatio * 45);
      const waitlistStarvationBonus = c.pastWaitlistDenials * 12;
      const trustReliabilityBonus = Math.round((c.trustScore / 100) * 15);

      const rawScore = urgencyPoints - usageDecayPenalty + waitlistStarvationBonus + trustReliabilityBonus;
      const priorityScore = c.hasRequiredBadges ? Math.max(0, rawScore) : -100;

      return {
        ...c,
        priorityScore,
        scoreBreakdown: {
          urgencyPoints,
          usageDecayPenalty: -usageDecayPenalty,
          waitlistStarvationBonus,
          trustReliabilityBonus,
        },
      };
    });

    scored.sort((a, b) => b.priorityScore - a.priorityScore);

    return scored.map((item, index) => {
      const rank = index + 1;
      let recommendedAction: RankedAllocationResult["recommendedAction"] = "WAITLIST_PRIORITY";
      let explainableReason = "";

      if (!item.hasRequiredBadges) {
        recommendedAction = "REJECT_INELIGIBLE";
        explainableReason = `Blocked: Missing mandatory safety certification.`;
      } else if (rank === 1) {
        recommendedAction = "APPROVE_PRIMARY";
        explainableReason = `Ranked #1 (${item.priorityScore} pts): Optimal fair-share balance (${item.rolling14DayHoursUsed}/${item.resourceWeeklyMaxHours}h used).`;
      } else if (item.rolling14DayHoursUsed >= item.resourceWeeklyMaxHours * 0.85) {
        recommendedAction = "WAITLIST_DEPLETED_QUOTA";
        explainableReason = `Waitlisted #${rank} (${item.priorityScore} pts): Anti-monopolization throttle active (${item.rolling14DayHoursUsed}h quota consumed).`;
      } else {
        recommendedAction = "WAITLIST_PRIORITY";
        explainableReason = `Waitlisted #${rank} (${item.priorityScore} pts): Outranked by ${scored[0].userName}.`;
      }

      return { ...item, rank, recommendedAction, explainableReason };
    });
  }

  static getSimulatedClashScenario(resourceName = "Prusa MK4S 3D Printer", slot = "Today 14:00 - 17:00") {
    const mockContenders: CompetingCandidate[] = [
      {
        userId: "usr_hog_kabir",
        userName: "Kabir Verma (Lab Monopolizer)",
        department: "Mechanical Engineering",
        role: "STUDENT",
        projectUrgency: "ACADEMIC_DEADLINE",
        rolling14DayHoursUsed: 11.5,
        resourceWeeklyMaxHours: 12,
        pastWaitlistDenials: 0,
        trustScore: 82,
        hasRequiredBadges: true,
        requestedSlot: slot,
      },
      {
        userId: "usr_fair_aarav",
        userName: "Aarav Mehta (First-Time Researcher)",
        department: "Data Science & Robotics",
        role: "STUDENT",
        projectUrgency: "RESEARCH_GRANT",
        rolling14DayHoursUsed: 0,
        resourceWeeklyMaxHours: 12,
        pastWaitlistDenials: 2,
        trustScore: 98,
        hasRequiredBadges: true,
        requestedSlot: slot,
      },
      {
        userId: "usr_unqualified_neha",
        userName: "Neha Joshi (Unverified Freshman)",
        department: "Industrial Design",
        role: "STUDENT",
        projectUrgency: "PERSONAL_EXPLORATION",
        rolling14DayHoursUsed: 1,
        resourceWeeklyMaxHours: 12,
        pastWaitlistDenials: 0,
        trustScore: 90,
        hasRequiredBadges: false,
        requestedSlot: slot,
      },
    ];

    return {
      resourceName,
      contestedSlot: slot,
      algorithm: "Deficit Round-Robin with Rolling 14-Day Quota Decay",
      humanReviewRequired: true, // Complies with Rule 12
      rankings: this.rankCompetingRequests(mockContenders),
    };
  }
}