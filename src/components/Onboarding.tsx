import { useEffect, useState } from 'react';
import { ArrowRight, Utensils, Users, Star, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const steps = [
  { title: 'A table for everyone', text: 'Start a room and invite your friends. A nickname is all anyone needs.', icon: Users },
  { title: 'Find your kind of food', text: 'The host sets the area and budget. Everyone can suggest one extra restaurant.', icon: Utensils },
  { title: 'Two picks. One winner.', text: 'Choose a Want for 2 points and a different Could for 1 point. The host reveals the result.', icon: Star },
];
export function Onboarding() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  useEffect(() => { setOpen(!localStorage.getItem('groupgrub:onboarded')); }, []);
  const finish = () => { localStorage.setItem('groupgrub:onboarded', '1'); setOpen(false); };
  const item = steps[step];
  if (!open || !item) return <Button variant="link" onClick={() => { setStep(0); setOpen(true); }}>Quick walkthrough</Button>;
  const Icon = item.icon;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-5" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
    <div className="relative w-full max-w-md rounded-lg bg-card p-8 chunky">
      <Button variant="ghost" size="icon" aria-label="Skip walkthrough" className="absolute right-3 top-3" onClick={finish}><X /></Button>
      <Icon className="mb-5 size-10 text-primary" />
      <p className="text-sm font-bold text-muted-foreground">{step + 1} of 3</p>
      <h2 id="onboarding-title" className="mt-2 text-3xl font-extrabold">{item.title}</h2>
      <p className="mt-3 text-muted-foreground">{item.text}</p>
      <div className="mt-7 flex justify-between gap-3"><Button variant="ghost" onClick={finish}>Skip</Button><Button onClick={() => step === 2 ? finish() : setStep(step + 1)}>{step === 2 ? 'Let’s eat' : 'Next'}<ArrowRight /></Button></div>
    </div>
  </div>;
}