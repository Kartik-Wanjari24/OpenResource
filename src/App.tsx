import { useState } from 'react';
import { JudgeTelemetryBar } from './components/JudgeTelemetryBar';
import { ResourceMarketplace } from './components/ResourceMarketplace';
import { ResourceTimeline } from './components/ResourceTimeline';
import { ConditionComparisonDemo } from './components/ConditionComparisonDemo';
import type { Persona, Resource } from './lib/api';
import './App.css';

function App() {
  const [currentPersona, setCurrentPersona] = useState<Persona | null>(null);
  const [userHeaders, setUserHeaders] = useState<Record<string, string> | undefined>(undefined);
  const [challengeProgress, setChallengeProgress] = useState(0);
  const [selectedResources, setSelectedResources] = useState<Resource[]>([]);
  const [showTimeline, setShowTimeline] = useState(false);

  const handlePersonaChange = (persona: Persona, headers: Record<string, string>) => {
    setCurrentPersona(persona);
    setUserHeaders(headers);
    // Increment challenge progress when switching personas
    setChallengeProgress((prev) => Math.min(prev + 1, 10));
  };

  const handleResourceSelect = (resources: Resource[]) => {
    setSelectedResources(resources);
    if (resources.length > 0) {
      setShowTimeline(true);
      // Increment challenge progress when viewing timeline
      setChallengeProgress((prev) => Math.min(prev + 1, 10));
    }
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
              bookings={[]} // Will be populated when booking API is available
              onSlotClick={(resourceId, startTime, endTime) => {
                console.log('Slot clicked:', { resourceId, startTime, endTime });
                // TODO: Open booking modal
              }}
            />
          </div>
        )}

        <div className="comparison-section">
          <ConditionComparisonDemo />
        </div>
      </main>
    </>
  );
}

export default App;
