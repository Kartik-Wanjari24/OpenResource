import React from 'react';
import { createRoot } from 'react-dom/client';
import { Member2Workbench } from './Member2Workbench.tsx';

const container = document.getElementById('workbench-root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <Member2Workbench />
    </React.StrictMode>
  );
}
