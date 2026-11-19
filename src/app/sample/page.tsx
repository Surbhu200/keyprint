import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function SamplePage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-5">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sample apartment</CardTitle>
          <CardDescription>
            The read-only sealed apartment walkthrough is wired once the 3D viewer and escrow contracts are deployed.
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
