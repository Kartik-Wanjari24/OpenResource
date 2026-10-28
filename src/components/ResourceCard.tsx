import type { DiscoveryResult, Alternative } from '../lib/api';
import styles from './ResourceCard.module.css';

interface ResourceCardProps {
  result: DiscoveryResult;
  alternatives?: Alternative[];
  onViewDetails?: (resourceId: string) => void;
}

export function ResourceCard({ result, alternatives, onViewDetails }: ResourceCardProps) {
  const { resource, eligibility, matchScore } = result;

  const eligibilityClass =
    eligibility.status === 'READY_TO_BOOK'
      ? styles.statusReady
      : eligibility.status === 'QUOTA_EXCEEDED'
      ? styles.statusQuota
      : styles.statusMissing;

  const eligibilityLabel =
    eligibility.status === 'READY_TO_BOOK'
      ? 'Ready to Book'
      : eligibility.status === 'QUOTA_EXCEEDED'
      ? 'Quota Exceeded'
      : 'Missing Requirements';

  return (
    <article className={styles.card}>
      {/* Resource Header */}
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <h3 className={styles.title}>{resource.name}</h3>
          <div className={`${styles.badge} ${eligibilityClass}`}>{eligibilityLabel}</div>
        </div>
        <p className={styles.category}>{formatCategory(resource.category)}</p>
      </div>

      {/* Resource Details */}
      <div className={styles.details}>
        <p className={styles.description}>{resource.description}</p>

        <div className={styles.metaGrid}>
          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Location:</span>
            <span className={styles.metaValue}>{resource.location}</span>
          </div>

          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Condition:</span>
            <span className={styles.metaValue}>{formatCondition(resource.currentCondition)}</span>
          </div>

          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Deposit:</span>
            <span className={styles.metaValue}>
              {resource.securityDeposit > 0
                ? `$${resource.securityDeposit.toFixed(2)}`
                : 'None'}
            </span>
          </div>

          <div className={styles.metaItem}>
            <span className={styles.metaLabel}>Weekly Cap:</span>
            <span className={styles.metaValue}>{resource.weeklyUsageCap} hours</span>
          </div>
        </div>

        {/* Supervision Notice */}
        {resource.requiresSupervision && (
          <div className={styles.notice}>
            <span className={styles.noticeIcon}>⚠️</span>
            <span className={styles.noticeText}>Requires supervision</span>
          </div>
        )}

        {/* Availability */}
        <div className={styles.availability}>
          <span className={styles.availLabel}>Available:</span>
          <div className={styles.scheduleDays}>
            {resource.availability.schedule.map((slot, idx) => (
              <span key={idx} className={styles.day}>
                {formatDay(slot.dayOfWeek)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Eligibility Details */}
      {eligibility.reasons.length > 0 && (
        <div className={styles.eligibilitySection}>
          <h4 className={styles.eligibilityTitle}>Why you can't book:</h4>
          <ul className={styles.reasonsList}>
            {eligibility.reasons.map((reason, idx) => (
              <li key={idx} className={styles.reason}>
                <span className={styles.reasonIcon}>•</span>
                <div className={styles.reasonContent}>
                  <p className={styles.reasonMessage}>{reason.message}</p>
                  {reason.badgeName && (
                    <p className={styles.reasonDetail}>
                      Missing badge: <strong>{reason.badgeName}</strong>
                    </p>
                  )}
                  {reason.currentUsage !== undefined && reason.weeklyLimit !== undefined && (
                    <p className={styles.reasonDetail}>
                      Current usage: {reason.currentUsage}/{reason.weeklyLimit} hours this week
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Alternatives */}
      {alternatives && alternatives.length > 0 && (
        <div className={styles.alternativesSection}>
          <h4 className={styles.alternativesTitle}>Consider these alternatives:</h4>
          <ul className={styles.alternativesList}>
            {alternatives.map((alt) => (
              <li key={alt.resourceId} className={styles.alternative}>
                <strong>{alt.name}</strong>
                <span className={styles.altReason}>{alt.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Match Score (for debugging/judging) */}
      {matchScore > 0 && (
        <div className={styles.footer}>
          <span className={styles.matchScore}>Match: {(matchScore * 100).toFixed(0)}%</span>
        </div>
      )}

      {/* Action Button */}
      {onViewDetails && (
        <button
          type="button"
          className={styles.detailsButton}
          onClick={() => onViewDetails(resource.id)}
          aria-label={`View details for ${resource.name}`}
        >
          View Details
        </button>
      )}
    </article>
  );
}

// Utility functions
function formatCategory(category: string): string {
  return category
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

function formatCondition(condition: string): string {
  return condition
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

function formatDay(day: string): string {
  const days: Record<string, string> = {
    MONDAY: 'Mon',
    TUESDAY: 'Tue',
    WEDNESDAY: 'Wed',
    THURSDAY: 'Thu',
    FRIDAY: 'Fri',
    SATURDAY: 'Sat',
    SUNDAY: 'Sun',
  };
  return days[day] || day;
}
