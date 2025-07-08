import { Meeting } from './components/meeting'

/**
 * Demo App showcasing the Apple HIG-inspired meeting UI components
 * 
 * To use this demo, replace the import in main.tsx:
 * import App from './DemoApp'
 */
function DemoApp() {
  // In a real app, this would come from URL params or routing
  const meetingId = 'ABC-123-XYZ'

  return <Meeting meetingId={meetingId} />
}

export default DemoApp