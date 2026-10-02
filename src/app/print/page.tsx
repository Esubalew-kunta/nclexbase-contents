import { Suspense } from "react";
import PrintClient from "./PrintClient";

export const dynamic = "force-dynamic";

export default function PrintPage() {
  return (
    <Suspense fallback={null}>
      <PrintClient />
    </Suspense>
  );
}
