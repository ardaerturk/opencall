# OpenCall Meeting UI Components

Apple Human Interface Guidelines-inspired meeting UI components for OpenCall video conferencing.

## Components Overview

### 1. MeetingLobby
Pre-join screen with device selection and preview.

**Features:**
- Video preview with mirror effect
- Audio/video toggle before joining
- Device selection UI
- Name input with validation
- Responsive design

### 2. VideoGrid
Responsive layout for displaying multiple video streams.

**Features:**
- Adaptive grid layouts (1-4+ participants)
- Mobile-first responsive design
- Speaking indicators
- Connection quality badges
- Hover effects with participant info

**Layout Modes:**
- Single: Full-screen for one participant
- Two: Side-by-side layout
- Three: Grid with adaptive sizing
- Four: 2x2 grid
- Many: Auto-fit grid for 5+ participants

### 3. MediaControls
Bottom control bar for meeting actions.

**Features:**
- Audio/video mute toggles
- Screen share button
- End call button
- Quick device switching
- Settings dropdown

### 4. ConnectionStatus
Real-time connection quality indicator.

**Features:**
- Visual quality indicators (Excellent/Good/Poor)
- Latency display
- Connection state animations
- Hover tooltips

### 5. MeetingInfo
Meeting details and invite functionality.

**Features:**
- Meeting ID display with copy function
- Participant count
- Meeting duration timer
- Invite others button

## Design Principles

### Apple HIG Implementation:
1. **Clarity**: Clean typography and intuitive icons
2. **Deference**: Content-first approach with subtle UI
3. **Depth**: Layered interface with smooth transitions

### Accessibility:
- ARIA labels on all interactive elements
- Keyboard navigation support
- Screen reader compatibility
- High contrast mode support

### Responsive Design:
- **Mobile**: Stacked layouts, full-width controls
- **Tablet**: Adaptive grids, optimized spacing
- **Desktop**: Multi-column layouts, hover interactions

## Usage Example

```tsx
import { Meeting } from './components/meeting'

function App() {
  return <Meeting meetingId="ABC-123-XYZ" />
}
```

## Styling

Uses CSS Modules with:
- CSS Variables for theming
- Automatic dark mode support
- Smooth animations (respects prefers-reduced-motion)
- Glassmorphism effects

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Android)