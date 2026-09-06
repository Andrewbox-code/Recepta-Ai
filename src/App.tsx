import FoundingPartners from './components/FoundingPartners'
import Footer from './components/Footer'
import Header from './components/Header'
import Hero from './components/Hero'
import HowItWorks from './components/HowItWorks'
import Industries from './components/Industries'
import LiveDemo from './components/LiveDemo'
import Pricing from './components/Pricing'
import Problem from './components/Problem'
import WaitlistForm from './components/WaitlistForm'

function App() {
  return (
    <div className="min-h-screen bg-navy-950 font-sans text-ink-50">
      <Header />
      <main>
        <Hero />
        <Problem />
        <LiveDemo />
        <HowItWorks />
        <Industries />
        <Pricing />
        <FoundingPartners />
        <WaitlistForm />
      </main>
      <Footer />
    </div>
  )
}

export default App
