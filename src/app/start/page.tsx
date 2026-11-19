import Link from "next/link";
import { ArrowLeft, Fingerprint } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function StartPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-5">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent mb-2">
            <Fingerprint className="h-5 w-5" />
          </div>
          <CardTitle>Sign in with a passkey</CardTitle>
          <CardDescription>
            Passkey sign-in will be enabled in the next checkpoint.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/"
            className={cn(buttonVariants({ variant: "secondary" }), "w-full")}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
