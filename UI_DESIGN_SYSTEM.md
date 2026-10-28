# UI Design System

## Overview
OpenResource's visual identity is inspired by a clean, professional clinical dashboard aesthetic, adapted for a resource-booking platform. The design emphasizes clarity, trustworthiness, and smooth interactions.

## Color Palette

### Primary Colors
Inspired by the clinical dashboard reference, using royal blue as the foundation.

#### Royal Blue (Primary)
```css
--color-primary-900: #1e3a8a;      /* Dark royal blue - headers, emphasis */
--color-primary-700: #2563eb;      /* Royal blue - primary actions, links */
--color-primary-600: #3b82f6;      /* Medium blue - hover states */
--color-primary-500: #60a5fa;      /* Light royal blue - active states */
--color-primary-100: #dbeafe;      /* Very light blue - backgrounds */
--color-primary-50:  #eff6ff;      /* Pale blue - highlighted panels */
```

**Usage**:
- Navigation active states
- Primary buttons
- Important CTAs
- Active selection indicators
- Links and interactive text

#### Lavender & Purple (Secondary)
```css
--color-secondary-900: #4c1d95;    /* Deep purple - dark accents */
--color-secondary-700: #7c3aed;    /* Purple - secondary actions */
--color-secondary-500: #a78bfa;    /* Soft purple - highlights */
--color-secondary-300: #c4b5fd;    /* Light lavender - supporting info */
--color-secondary-100: #ede9fe;    /* Pale lavender - panel backgrounds */
--color-secondary-50:  #f5f3ff;    /* Very pale lavender - subtle backgrounds */
```

**Usage**:
- Secondary panels and cards
- Supporting information sections
- Badges and tags
- Subtle gradients with primary colors

### Neutral Colors
```css
--color-neutral-900: #0f172a;      /* Dark navy - primary text, headings */
--color-neutral-700: #334155;      /* Slate - body text */
--color-neutral-500: #64748b;      /* Blue-gray - secondary text, metadata */
--color-neutral-400: #94a3b8;      /* Light blue-gray - borders, dividers */
--color-neutral-200: #e2e8f0;      /* Very light gray - subtle borders */
--color-neutral-100: #f1f5f9;      /* Off-white - card backgrounds */
--color-neutral-50:  #f8fafc;      /* Almost white - page backgrounds */
--color-white:       #ffffff;      /* Pure white - cards, forms */
```

### Semantic Colors
```css
/* Success - Green for eligible, available, confirmed */
--color-success-700: #15803d;      /* Dark green */
--color-success-600: #16a34a;      /* Green */
--color-success-100: #dcfce7;      /* Light green background */

/* Warning - Amber for pending, quota concerns */
--color-warning-700: #b45309;      /* Dark amber */
--color-warning-600: #d97706;      /* Amber */
--color-warning-100: #fef3c7;      /* Light amber background */

/* Danger - Red for critical, unavailable, errors */
--color-danger-700:  #b91c1c;      /* Dark red */
--color-danger-600:  #dc2626;      /* Red */
--color-danger-100:  #fee2e2;      /* Light red background */

/* Info - Cyan for informational states */
--color-info-700:    #0e7490;      /* Dark cyan */
--color-info-600:    #0891b2;      /* Cyan */
--color-info-100:    #cffafe;      /* Light cyan background */
```

### Gradient Accents (Use Sparingly)
```css
--gradient-primary: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
--gradient-subtle:  linear-gradient(180deg, #eff6ff 0%, #f5f3ff 100%);
--gradient-card:    linear-gradient(145deg, #ffffff 0%, #f8fafc 100%);
```

**Usage**:
- Hero sections
- Feature highlights
- Premium resource cards
- Subtle card backgrounds

---

## Typography

### Font Families
```css
--font-sans: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
--font-mono: ui-monospace, 'SF Mono', 'Cascadia Code', 'Roboto Mono', Consolas, monospace;
```

### Font Sizes
```css
--text-xs:   0.75rem;    /* 12px - tiny labels, metadata */
--text-sm:   0.875rem;   /* 14px - secondary text, captions */
--text-base: 1rem;       /* 16px - body text */
--text-lg:   1.125rem;   /* 18px - emphasized text */
--text-xl:   1.25rem;    /* 20px - subheadings */
--text-2xl:  1.5rem;     /* 24px - section headings */
--text-3xl:  1.875rem;   /* 30px - page headings */
--text-4xl:  2.25rem;    /* 36px - hero text */
```

### Font Weights
```css
--font-normal:    400;
--font-medium:    500;
--font-semibold:  600;
--font-bold:      700;
```

### Line Heights
```css
--leading-tight:  1.25;   /* Headings */
--leading-normal: 1.5;    /* Body text */
--leading-relaxed: 1.75;  /* Long-form content */
```

### Heading Styles
```css
h1 {
  font-size: var(--text-3xl);
  font-weight: var(--font-bold);
  color: var(--color-neutral-900);
  line-height: var(--leading-tight);
  letter-spacing: -0.025em;
}

h2 {
  font-size: var(--text-2xl);
  font-weight: var(--font-semibold);
  color: var(--color-neutral-900);
  line-height: var(--leading-tight);
}

h3 {
  font-size: var(--text-xl);
  font-weight: var(--font-semibold);
  color: var(--color-neutral-900);
  line-height: var(--leading-normal);
}
```

---

## Spacing System

### Base Unit: 4px
```css
--space-0:  0;
--space-1:  0.25rem;  /* 4px */
--space-2:  0.5rem;   /* 8px */
--space-3:  0.75rem;  /* 12px */
--space-4:  1rem;     /* 16px */
--space-5:  1.25rem;  /* 20px */
--space-6:  1.5rem;   /* 24px */
--space-8:  2rem;     /* 32px */
--space-10: 2.5rem;   /* 40px */
--space-12: 3rem;     /* 48px */
--space-16: 4rem;     /* 64px */
--space-20: 5rem;     /* 80px */
```

### Common Patterns
- **Card padding**: `--space-6` (24px)
- **Section spacing**: `--space-12` (48px)
- **Component gap**: `--space-4` (16px)
- **Button padding**: `--space-3` × `--space-6` (12px × 24px)

---

## Border Radius

```css
--radius-none: 0;
--radius-sm:   0.25rem;  /* 4px - small badges */
--radius-md:   0.5rem;   /* 8px - buttons, inputs */
--radius-lg:   0.75rem;  /* 12px - cards */
--radius-xl:   1rem;     /* 16px - large cards, modals */
--radius-full: 9999px;   /* Fully rounded - pills, avatars */
```

---

## Shadows

### Elevation System
```css
--shadow-xs: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
--shadow-sm: 0 1px 3px 0 rgba(0, 0, 0, 0.1),
             0 1px 2px -1px rgba(0, 0, 0, 0.1);
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1),
             0 2px 4px -2px rgba(0, 0, 0, 0.1);
--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1),
             0 4px 6px -4px rgba(0, 0, 0, 0.1);
--shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1),
             0 8px 10px -6px rgba(0, 0, 0, 0.1);
```

**Usage**:
- `shadow-sm` - Default cards at rest
- `shadow-md` - Hover state elevation
- `shadow-lg` - Modals, dropdowns
- `shadow-xl` - Important overlays

---

## Interactions & Animations

### Timing
```css
--duration-fast: 150ms;     /* Quick feedbacks */
--duration-base: 200ms;     /* Default transitions */
--duration-slow: 300ms;     /* Complex animations */
--duration-slower: 500ms;   /* Page transitions */

--easing-standard: cubic-bezier(0.4, 0.0, 0.2, 1);  /* Default */
--easing-decelerate: cubic-bezier(0.0, 0.0, 0.2, 1); /* Exit */
--easing-accelerate: cubic-bezier(0.4, 0.0, 1, 1);   /* Enter */
```

### Button States
```css
.button {
  transition: all var(--duration-base) var(--easing-standard);
}

.button:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.button:active {
  transform: translateY(0);
  box-shadow: var(--shadow-sm);
}

.button:focus-visible {
  outline: 2px solid var(--color-primary-600);
  outline-offset: 2px;
}
```

### Card Hover
```css
.card {
  transition: 
    box-shadow var(--duration-base) var(--easing-standard),
    transform var(--duration-base) var(--easing-standard);
}

.card:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
}
```

### Focus Rings
```css
:focus-visible {
  outline: 2px solid var(--color-primary-600);
  outline-offset: 2px;
  border-radius: var(--radius-md);
}
```

### Reduced Motion
```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Component Patterns

### Buttons

#### Primary Button
```css
.button-primary {
  background: var(--color-primary-700);
  color: var(--color-white);
  padding: var(--space-3) var(--space-6);
  border-radius: var(--radius-md);
  font-weight: var(--font-medium);
  box-shadow: var(--shadow-sm);
  transition: all var(--duration-base) var(--easing-standard);
}

.button-primary:hover {
  background: var(--color-primary-600);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}
```

#### Secondary Button
```css
.button-secondary {
  background: var(--color-white);
  color: var(--color-primary-700);
  border: 1px solid var(--color-neutral-400);
  padding: var(--space-3) var(--space-6);
  border-radius: var(--radius-md);
  font-weight: var(--font-medium);
}

.button-secondary:hover {
  background: var(--color-neutral-50);
  border-color: var(--color-primary-700);
}
```

#### Ghost Button
```css
.button-ghost {
  background: transparent;
  color: var(--color-neutral-700);
  padding: var(--space-3) var(--space-6);
  border-radius: var(--radius-md);
}

.button-ghost:hover {
  background: var(--color-neutral-100);
}
```

### Cards

#### Standard Card
```css
.card {
  background: var(--color-white);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--color-neutral-200);
}
```

#### Highlighted Panel
```css
.panel-highlight {
  background: var(--color-primary-50);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  border: 1px solid var(--color-primary-100);
}
```

#### Secondary Panel
```css
.panel-secondary {
  background: var(--color-secondary-50);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  border: 1px solid var(--color-secondary-100);
}
```

### Badges

#### Success Badge (READY_TO_BOOK)
```css
.badge-success {
  background: var(--color-success-100);
  color: var(--color-success-700);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-full);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
}
```

#### Warning Badge (QUOTA_EXCEEDED)
```css
.badge-warning {
  background: var(--color-warning-100);
  color: var(--color-warning-700);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-full);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
}
```

#### Danger Badge (MISSING_PREREQUISITE)
```css
.badge-danger {
  background: var(--color-danger-100);
  color: var(--color-danger-700);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-full);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
}
```

### Form Inputs

```css
.input {
  background: var(--color-white);
  border: 1px solid var(--color-neutral-400);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  font-size: var(--text-base);
  color: var(--color-neutral-900);
  transition: border-color var(--duration-base) var(--easing-standard);
}

.input:hover {
  border-color: var(--color-neutral-500);
}

.input:focus {
  outline: none;
  border-color: var(--color-primary-600);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.input::placeholder {
  color: var(--color-neutral-500);
}
```

### Navigation

#### Sidebar Item
```css
.nav-item {
  display: flex;
  align-items: center;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  color: var(--color-neutral-700);
  transition: all var(--duration-fast) var(--easing-standard);
}

.nav-item:hover {
  background: var(--color-neutral-100);
  color: var(--color-neutral-900);
}

.nav-item.active {
  background: var(--color-primary-100);
  color: var(--color-primary-700);
  font-weight: var(--font-medium);
}
```

---

## Layout Patterns

### Container Widths
```css
--container-sm:  640px;
--container-md:  768px;
--container-lg:  1024px;
--container-xl:  1280px;
--container-2xl: 1536px;
```

### Grid System
```css
.grid-2-cols { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-6); }
.grid-3-cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-6); }
.grid-4-cols { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-6); }
```

### Sidebar Layout
```css
.layout-with-sidebar {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: var(--space-8);
  min-height: 100vh;
}
```

---

## Responsive Breakpoints

```css
--breakpoint-sm: 640px;   /* Small tablets */
--breakpoint-md: 768px;   /* Tablets */
--breakpoint-lg: 1024px;  /* Small desktops */
--breakpoint-xl: 1280px;  /* Desktops */
--breakpoint-2xl: 1536px; /* Large desktops */
```

### Mobile-First Approach
```css
/* Mobile (default) */
.resource-grid { grid-template-columns: 1fr; }

/* Tablet and up */
@media (min-width: 768px) {
  .resource-grid { grid-template-columns: repeat(2, 1fr); }
}

/* Desktop and up */
@media (min-width: 1024px) {
  .resource-grid { grid-template-columns: repeat(3, 1fr); }
}
```

---

## Accessibility

### Color Contrast
All text meets WCAG AA standards:
- **Normal text**: Minimum 4.5:1 contrast ratio
- **Large text**: Minimum 3:1 contrast ratio
- **Interactive elements**: Clear focus indicators

### Keyboard Navigation
- Visible focus rings on all interactive elements
- Logical tab order
- Skip-to-main-content link
- Escape key closes modals

### Screen Reader Support
- Semantic HTML elements
- ARIA labels where needed
- Alt text for all images
- Status announcements for dynamic content

---

## Dark Mode (Future Enhancement)

### Color Palette Adjustments
```css
@media (prefers-color-scheme: dark) {
  :root {
    --color-neutral-900: #f8fafc;
    --color-neutral-700: #e2e8f0;
    --color-neutral-50:  #0f172a;
    --color-white:       #1e293b;
    /* ... additional dark mode overrides */
  }
}
```

---

## Implementation Notes

1. **CSS Custom Properties**: All design tokens defined as CSS variables for easy theming
2. **Component Library**: Build reusable React components following these patterns
3. **Consistency**: Use design tokens, never hard-coded values
4. **Performance**: Keep transitions under 300ms for responsiveness
5. **Accessibility**: Test with keyboard, screen readers, and color contrast tools
6. **Responsive**: Mobile-first approach with progressive enhancement

---

## Phase 1 Status
✅ Design system documented  
✅ Color palette established (royal blue, lavender, white)  
✅ Typography scale defined  
✅ Interaction patterns specified  
⏳ Component implementation planned for Phase 2+
