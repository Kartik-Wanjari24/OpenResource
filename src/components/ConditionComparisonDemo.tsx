/**
 * Condition Comparison Studio Demo Page
 * Demonstrates the before/after image comparison interface
 */

import { useState, useEffect } from 'react';
import { ConditionComparisonStudio } from './ConditionComparisonStudio';
import { inspectionApi, type Inspection, type InspectionListItem } from '../lib/inspectionApi';
import styles from './ConditionComparisonDemo.module.css';

export function ConditionComparisonDemo() {
  const [inspections, setInspections] = useState<InspectionListItem[]>([]);
  const [selectedInspection, setSelectedInspection] = useState<Inspection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadInspectionList();
  }, []);

  async function loadInspectionList() {
    try {
      const list = await inspectionApi.getResourceInspections('demo_resource_001');
      setInspections(list);

      // Auto-load first inspection
      if (list.length > 0) {
        loadInspection(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load inspections:', err);
    }
  }

  async function loadInspection(inspectionId: string) {
    setLoading(true);
    setError(null);

    try {
      const inspection = await inspectionApi.getInspection(inspectionId);
      setSelectedInspection(inspection);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inspection');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Condition Comparison Studio</h1>
        <p className={styles.subtitle}>
          Phase 7: Interactive before/after image comparison with damage highlighting
        </p>
      </div>

      <div className={styles.content}>
        <aside className={styles.sidebar}>
          <h2 className={styles.sidebarTitle}>Inspection History</h2>
          <div className={styles.inspectionList}>
            {inspections.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`${styles.inspectionItem} ${
                  selectedInspection?.id === item.id ? styles.inspectionItemActive : ''
                }`}
                onClick={() => loadInspection(item.id)}
              >
                <div className={styles.inspectionItemHeader}>
                  <span className={styles.inspectionItemTitle}>{item.resourceName}</span>
                  <span
                    className={`${styles.inspectionCondition} ${
                      item.overallCondition === 'EXCELLENT'
                        ? styles.conditionExcellent
                        : item.overallCondition === 'GOOD'
                          ? styles.conditionGood
                          : item.overallCondition === 'FAIR'
                            ? styles.conditionFair
                            : styles.conditionPoor
                    }`}
                  >
                    {item.overallCondition}
                  </span>
                </div>
                <div className={styles.inspectionItemMeta}>
                  <span>{new Date(item.timestamp).toLocaleDateString()}</span>
                  <span>{item.damageCount} issues</span>
                </div>
              </button>
            ))}
          </div>

          <div className={styles.sidebarInfo}>
            <h3 className={styles.sidebarInfoTitle}>Integration Status</h3>
            <p className={styles.sidebarInfoText}>
              Inspection API endpoint from Member 4 is not yet available. Currently displaying
              demo fixture data.
            </p>
            <div className={styles.apiStatus}>
              <div className={styles.apiStatusItem}>
                <span className={styles.apiStatusLabel}>Expected Endpoint:</span>
                <code className={styles.apiStatusValue}>GET /api/inspections/:id</code>
              </div>
              <div className={styles.apiStatusItem}>
                <span className={styles.apiStatusLabel}>Status:</span>
                <span className={`${styles.badge} ${styles.badgeWarning}`}>Pending</span>
              </div>
            </div>
          </div>
        </aside>

        <main className={styles.main}>
          <ConditionComparisonStudio
            inspection={selectedInspection}
            loading={loading}
            error={error}
          />

          <div className={styles.features}>
            <h3 className={styles.featuresTitle}>Features</h3>
            <div className={styles.featureGrid}>
              <div className={styles.featureItem}>
                <div className={styles.featureIcon}>🖱️</div>
                <h4 className={styles.featureItemTitle}>Interactive Slider</h4>
                <p className={styles.featureItemText}>
                  Drag the slider or use arrow keys to compare before/after images
                </p>
              </div>
              <div className={styles.featureItem}>
                <div className={styles.featureIcon}>📦</div>
                <h4 className={styles.featureItemTitle}>Damage Markers</h4>
                <p className={styles.featureItemText}>
                  Bounding boxes highlight damage areas with severity indicators
                </p>
              </div>
              <div className={styles.featureItem}>
                <div className={styles.featureIcon}>🔍</div>
                <h4 className={styles.featureItemTitle}>Zoom Controls</h4>
                <p className={styles.featureItemText}>
                  Fit-to-view or fill-view modes for optimal image inspection
                </p>
              </div>
              <div className={styles.featureItem}>
                <div className={styles.featureIcon}>📊</div>
                <h4 className={styles.featureItemTitle}>Damage Report</h4>
                <p className={styles.featureItemText}>
                  Detailed breakdown of all identified issues with repair costs
                </p>
              </div>
              <div className={styles.featureItem}>
                <div className={styles.featureIcon}>♿</div>
                <h4 className={styles.featureItemTitle}>Accessible</h4>
                <p className={styles.featureItemText}>
                  Full keyboard navigation and screen reader support
                </p>
              </div>
              <div className={styles.featureItem}>
                <div className={styles.featureIcon}>📱</div>
                <h4 className={styles.featureItemTitle}>Responsive</h4>
                <p className={styles.featureItemText}>
                  Works seamlessly on desktop, tablet, and mobile devices
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
