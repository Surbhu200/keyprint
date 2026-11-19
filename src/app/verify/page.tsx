import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function VerifyPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-5">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sealed/10 text-sealed mb-2">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <CardTitle>Verify a record</CardTitle>
          <CardDescription>
            Client-side file verification against sealed records will be enabled once the registry contract is deployed.
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
