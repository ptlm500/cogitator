import { Badge } from '@/components/ui/badge/badge'
import { Button } from '@/components/ui/button/button'
import {
  Panel,
  PanelContent,
  PanelHeader,
  PanelTitle,
} from '@/components/ui/panel/panel'

function App() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="font-mono text-2xl uppercase tracking-widest text-[var(--color-green)]">
          Cogitator
        </h1>
        <Badge>10th Edition</Badge>
      </header>
      <Panel>
        <PanelHeader>
          <PanelTitle>Combat Analysis</PanelTitle>
        </PanelHeader>
        <PanelContent>
          <p className="mb-4 text-[var(--text-muted)]">
            Attacker and defender selection coming in phase 4.
          </p>
          <Button>Initiate Calculation</Button>
        </PanelContent>
      </Panel>
    </main>
  )
}

export default App
