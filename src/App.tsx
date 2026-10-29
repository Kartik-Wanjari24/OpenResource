import { useRef, useState } from 'react';
import { JudgeTelemetryBar } from './components/JudgeTelemetryBar';
import { ResourceMarketplace } from './components/ResourceMarketplace';
import { ResourceTimeline } from './components/ResourceTimeline';
import { FairShareAllocationStudio } from './components/FairShareAllocationStudio';
import { ConditionComparisonDemo } from './components/ConditionComparisonDemo';
import { Member2Workbench } from './components/member2';
import type { Persona, Resource } from './lib/api';
import './App.css';

function App() {
  const [currentPersona, setCurrentPersona] = useState<Persona | null>(null);
  const [userHeaders, setUserHeaders] = useState<Record<string, string> | undefined>(undefined);
  const [challengeProgress, setChallengeProgress] = useState(0);
  const [selectedResources, setSelectedResources] = useState<Resource[]>([]);
  const [showTimeline, setShowTimeline] = useState(false);
  const fairnessSectionRef = useRef<HTMLDivElement | null>(null);

  const handlePersonaChange = (persona: Persona, headers: Record<string, string>) => {
    setCurrentPersona(persona);
    const normalizedHeaders = {
      ...headers,
      'x-test-user-id': headers['X-Test-User-Id'] || headers['x-test-user-id'] || persona.id,
      'x-test-user-role': headers['X-Test-User-Role'] || headers['x-test-user-role'] || persona.role,
      'x-user-id': headers['X-User-Id'] || headers['x-user-id'] || persona.id,
      'x-user-role': headers['X-User-Role'] || headers['x-user-role'] || persona.role,
    };
    setUserHeaders(normalizedHeaders);
    setChallengeProgress((prev) => Math.min(prev + 1, 10));
  };

  const handleResourceSelect = (resources: Resource[]) => {
    setSelectedResources(resources);
    if (resources.length > 0) {
      setShowTimeline(true);
      setChallengeProgress((prev) => Math.min(prev + 1, 10));
    }
  };

  const handleTimelineSlotClick = (resourceId: string, startTime: Date, endTime: Date) => {
    console.log('Slot clicked:', { resourceId, startTime, endTime });
    setChallengeProgress((prev) => Math.min(prev + 1, 10));

    fairnessSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <JudgeTelemetryBar
        currentPersona={currentPersona}
        onPersonaChange={handlePersonaChange}
        challengeProgress={challengeProgress}
        maxSteps={10}
      />

      <main className="app-main">
        <ResourceMarketplace
          userHeaders={userHeaders}
          onResourceSelect={handleResourceSelect}
        />

        {showTimeline && selectedResources.length > 0 && (
          <div className="timeline-section">
            <ResourceTimeline
              resources={selectedResources}
              bookings={[]}
              onSlotClick={handleTimelineSlotClick}
            />
          </div>
        )}

        <div
          ref={fairnessSectionRef}
          className="fairness-section"
          onClickCapture={() => setChallengeProgress((prev) => Math.min(prev + 1, 10))}
        >
          <FairShareAllocationStudio />
        </div>

        <div className="member2-section">
          <Member2Workbench />
        </div>

        <div className="comparison-section">
          <ConditionComparisonDemo />
        </div>
      </main>
    </>
  );
}

export default App;
