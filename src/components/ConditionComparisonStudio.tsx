/**
 * Condition Comparison Studio
 * Before/after image comparison with interactive slider and damage highlighting
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { Inspection, BoundingBox } from '../lib/inspectionApi';
import styles from './ConditionComparisonStudio.module.css';

interface ConditionComparisonStudioProps {
  inspection: Inspection | null;
  loading?: boolean;
  error?: string | null;
}

export function ConditionComparisonStudio({
  inspection,
  loading = false,
  error = null,
}: ConditionComparisonStudioProps) {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(true);
  const [imageScale, setImageScale] = useState<'fit' | 'fill'>('fit');
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setSliderPosition(percentage);
    },
    [isDragging]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!isDragging || !containerRef.current) return;

      const touch = e.touches[0];
      const rect = containerRef.current.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setSliderPosition(percentage);
    },
    [isDragging]
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') {
      setSliderPosition((prev) => Math.max(0, prev - 5));
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      setSliderPosition((prev) => Math.min(100, prev + 5));
      e.preventDefault();
    }
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleMouseUp);

      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>
          <div className={styles.spinner} aria-label="Loading inspection" />
          <p>Loading inspection data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.errorState}>
          <h3 className={styles.errorStateTitle}>Error Loading Inspection</h3>
          <p className={styles.errorStateText}>{error}</p>
        </div>
      </div>
    );
  }

  if (!inspection) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <div className={styles.emptyStateIcon}>🔍</div>
          <p className={styles.emptyStateText}>No inspection selected</p>
          <p className={styles.emptyStateSubtext}>
            Select an inspection to view before/after comparison
          </p>
        </div>
      </div>
    );
  }

  const conditionClass = {
    EXCELLENT: styles.conditionExcellent,
    GOOD: styles.conditionGood,
    FAIR: styles.conditionFair,
    POOR: styles.conditionPoor,
  }[inspection.overallCondition];

  const totalCost = inspection.damageReport.reduce(
    (sum, item) => sum + item.repairCost,
    0
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerInfo}>
          <h2 className={styles.title}>Condition Comparison</h2>
          <div className={styles.meta}>
            <div className={styles.metaItem}>
              <span>Inspector:</span>
              <strong>{inspection.inspectorName}</strong>
            </div>
            <div className={styles.metaItem}>
              <span>Date:</span>
              <strong>
                {new Date(inspection.timestamp).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </strong>
            </div>
            <div className={styles.metaItem}>
              <span>Condition:</span>
              <span className={`${styles.conditionBadge} ${conditionClass}`}>
                {inspection.overallCondition}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.demoDataBanner} role="alert">
        ⚠️ DEMO DATA: Using placeholder inspection data. Real inspection API from Member 4
        is not yet available.
      </div>

      <div className={styles.comparisonContainer}>
        <div
          ref={containerRef}
          className={styles.comparisonWrapper}
          role="region"
          aria-label="Image comparison slider"
        >
          <div
            className={styles.comparisonInner}
            style={{ paddingBottom: '75%' }}
          >
            {/* Before Image Layer */}
            <div
              className={`${styles.imageLayer} ${styles.beforeLayer}`}
              style={{
                clipPath: `inset(0 ${100 - sliderPosition}% 0 0)`,
              }}
            >
              <img
                src={inspection.beforeImage.url}
                alt="Before inspection"
                style={{ objectFit: imageScale === 'fit' ? 'contain' : 'cover' }}
              />
              <div className={`${styles.label} ${styles.labelBefore}`}>Before</div>
              {showBoundingBoxes &&
                inspection.beforeImage.boundingBoxes.map((box, index) => (
                  <BoundingBoxOverlay
                    key={`before-${index}`}
                    box={box}
                    imageWidth={inspection.beforeImage.width}
                    imageHeight={inspection.beforeImage.height}
                  />
                ))}
            </div>

            {/* After Image Layer */}
            <div
              className={`${styles.imageLayer} ${styles.afterLayer}`}
              style={{
                clipPath: `inset(0 0 0 ${sliderPosition}%)`,
              }}
            >
              <img
                src={inspection.afterImage.url}
                alt="After inspection"
                style={{ objectFit: imageScale === 'fit' ? 'contain' : 'cover' }}
              />
              <div className={`${styles.label} ${styles.labelAfter}`}>After</div>
              {showBoundingBoxes &&
                inspection.afterImage.boundingBoxes.map((box, index) => (
                  <BoundingBoxOverlay
                    key={`after-${index}`}
                    box={box}
                    imageWidth={inspection.afterImage.width}
                    imageHeight={inspection.afterImage.height}
                  />
                ))}
            </div>

            {/* Slider */}
            <div
              className={styles.slider}
              style={{ left: `${sliderPosition}%` }}
              onMouseDown={handleMouseDown}
              onTouchStart={handleMouseDown}
              onKeyDown={handleKeyDown}
              role="slider"
              aria-label="Comparison slider position"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(sliderPosition)}
              tabIndex={0}
            >
              <div className={styles.sliderHandle} />
            </div>
          </div>
        </div>

        <div className={styles.controls}>
          <button
            type="button"
            className={`${styles.controlButton} ${
              showBoundingBoxes ? styles.active : ''
            }`}
            onClick={() => setShowBoundingBoxes(!showBoundingBoxes)}
            aria-pressed={showBoundingBoxes}
          >
            {showBoundingBoxes ? 'Hide' : 'Show'} Damage Markers
          </button>
          <button
            type="button"
            className={`${styles.controlButton} ${
              imageScale === 'fit' ? styles.active : ''
            }`}
            onClick={() => setImageScale('fit')}
            aria-pressed={imageScale === 'fit'}
          >
            Fit to View
          </button>
          <button
            type="button"
            className={`${styles.controlButton} ${
              imageScale === 'fill' ? styles.active : ''
            }`}
            onClick={() => setImageScale('fill')}
            aria-pressed={imageScale === 'fill'}
          >
            Fill View
          </button>
        </div>

        {inspection.damageReport.length > 0 && (
          <div className={styles.damageReport}>
            <h3 className={styles.damageReportTitle}>
              Damage Report ({inspection.damageReport.length} items)
            </h3>
            <div className={styles.damageList}>
              {inspection.damageReport.map((item, index) => (
                <div key={index} className={styles.damageItem}>
                  <div className={styles.damageItemInfo}>
                    <p className={styles.damageItemDescription}>{item.description}</p>
                    <div className={styles.damageItemMeta}>
                      <span
                        className={`${styles.severityBadge} ${
                          item.severity === 'MINOR'
                            ? styles.severityMinor
                            : item.severity === 'MODERATE'
                              ? styles.severityModerate
                              : styles.severitySevere
                        }`}
                      >
                        {item.severity}
                      </span>
                    </div>
                  </div>
                  <div className={styles.damageItemCost}>
                    {item.repairCost > 0
                      ? `$${item.repairCost.toFixed(2)}`
                      : 'No cost'}
                  </div>
                </div>
              ))}
              <div className={styles.damageItem}>
                <div className={styles.damageItemInfo}>
                  <strong>Total Repair Cost</strong>
                </div>
                <div className={styles.damageItemCost}>
                  ${totalCost.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface BoundingBoxOverlayProps {
  box: BoundingBox;
  imageWidth: number;
  imageHeight: number;
}

function BoundingBoxOverlay({ box, imageWidth, imageHeight }: BoundingBoxOverlayProps) {
  const severityClass = {
    MINOR: styles.minor,
    MODERATE: styles.moderate,
    SEVERE: styles.severe,
  }[box.severity];

  return (
    <div
      className={`${styles.boundingBox} ${severityClass}`}
      style={{
        left: `${(box.x / imageWidth) * 100}%`,
        top: `${(box.y / imageHeight) * 100}%`,
        width: `${(box.width / imageWidth) * 100}%`,
        height: `${(box.height / imageHeight) * 100}%`,
      }}
      aria-label={`${box.severity} damage: ${box.label}`}
    >
      <div className={styles.boundingBoxLabel}>{box.label}</div>
    </div>
  );
}
