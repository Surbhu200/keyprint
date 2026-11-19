import Link from "next/link";
import { ArrowRight, CheckCircle2, MapPin, ShieldCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const COMPARISON_ROWS = [
  {
    question: "Who holds the deposit",
    today: "The landlord",
    keyprint: "Protected escrow that neither side controls",
  },
  {
    question: "Who holds the evidence",
    today: "The landlord's phone",
    keyprint:
      "Both sides; each file's fingerprint is sealed the moment it's added, and the landlord co-signs or contests it",
  },
  {
    question: "Who has to prove damage",
    today: "The renter must prove they didn't do it",
    keyprint: "The landlord must pin each claim to a spot in the 3D record and price it",
  },
  {
    question: "If nobody does anything",
    today: "The landlord keeps the money",
    keyprint: "Once the deadline passes, the full deposit comes back to you",
  },
] as const;

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="w-full border-b border-border/70 bg-background/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="mx-auto max-w-5xl px-5 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 font-semibold tracking-tight text-foreground"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="text-base">Keyprint</span>
          </Link>

          <nav className="flex items-center gap-3">
            <Link
              href="/verify"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              Verify a record
            </Link>
            <Link
              href="/start"
              className={cn(buttonVariants({ variant: "default", size: "sm" }))}
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-5xl px-5 py-16 sm:py-24">
        <section className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-sealed/20 bg-sealed/10 px-3 py-1 text-xs font-medium text-sealed mb-6">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Every dollar claimed needs a pin and a price</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-foreground leading-[1.1]">
            Your apartment. Its history. Your proof.
          </h1>

          <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
            Today your landlord holds your deposit and the evidence, and you have
            to sue to get it back. With Keyprint, your deposit stays protected,
            every dollar claimed has to be pinned to a spot in your apartment&apos;s
            3D record, and if they don&apos;t claim in time, it comes back to you.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <Link
              href="/start"
              className={cn(buttonVariants({ variant: "default", size: "lg" }))}
            >
              Protect my deposit
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/sample"
              className={cn(buttonVariants({ variant: "secondary", size: "lg" }))}
            >
              See a sample apartment
            </Link>
          </div>
        </section>

        <section className="mt-16 sm:mt-20">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="py-4 px-6 w-1/4"></th>
                    <th className="py-4 px-6 w-1/3">Today</th>
                    <th className="py-4 px-6 text-foreground">With Keyprint</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-sm">
                  {COMPARISON_ROWS.map((row) => (
                    <tr key={row.question}>
                      <td className="py-4 px-6 font-medium text-foreground align-top">
                        {row.question}
                      </td>
                      <td className="py-4 px-6 text-muted-foreground align-top">
                        {row.today}
                      </td>
                      <td className="py-4 px-6 text-foreground font-medium align-top">
                        {row.keyprint}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </section>

        <section className="mt-12 grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-6">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent mb-4">
                <MapPin className="h-4 w-4" />
              </div>
              <h2 className="font-semibold text-base">Pin what&apos;s already there</h2>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                Tap any scratch or scuff in your 3D room on move-in day, attach a
                photo, and seal the record in one touch.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-sealed/10 text-sealed mb-4">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <h2 className="font-semibold text-base">Proof anyone can verify</h2>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                Drop any scan or photo into Verify to confirm it matches the sealed
                move-in record. Change one byte and it fails.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent mb-4">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <h2 className="font-semibold text-base">Deadlines that protect you</h2>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
                Approved claims settle in seconds. If your landlord files nothing by
                the deadline, your full deposit comes back.
              </p>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t border-border/70 py-6">
        <div className="mx-auto max-w-5xl px-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Keyprint — Your apartment. Its history. Your proof.</span>
          <Link href="/verify" className="hover:text-foreground underline-offset-4 hover:underline">
            Verify a sealed file
          </Link>
        </div>
      </footer>
    </div>
  );
}
